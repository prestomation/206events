#!/usr/bin/env python3
"""Decide whether an open queue-drain PR is already superseded by `main`.

Every drain run rewrites `event-uncertainty-cache.json` /
`event-duplicate-cache.json`, so a drain PR that doesn't merge quickly is both
conflicted (a content conflict in a 9,000-entry JSON) and pointless (a later run
already resolved the same keys). This script tells the two apart mechanically,
so Step 0 of AGENTS.md's "Queue Draining" is a check rather than a judgement
call over an unreadable diff.

Usage:
    drain-pr-sweep.py <merge-base-sha> <head-ref> [--cache uncertainty|duplicate|both]
                      [--main <ref>] [--today YYYY-MM-DD] [--list N]
    drain-pr-sweep.py --selftest

    <merge-base-sha>  the PR's **merge-base** with main — not GitHub's
                      `base.sha`, which is the base branch's tip and would make
                      every count below meaningless. Derive it with
                      `git merge-base main <head-ref>`, deepening a shallow
                      clone first (`git fetch --deepen=400 origin main`).
    <head-ref>        the PR branch (fetch it first: `git fetch origin <branch>`).

For each cache it reports what the PR *itself* changed (branch vs merge-base),
then how much of that `main` already carries, and how much of the remainder is
past-dated and therefore worthless. Ends with a verdict:

    SUPERSEDED      — close the PR; nothing is lost.
    HAS-NOVEL-WORK  — close it too, but read the listed keys and carry that
                      investigation into the current run's batch.

Exit status: 0 = SUPERSEDED (safe to close), 1 = not superseded — either
HAS-NOVEL-WORK or NOT-APPLICABLE (this PR changes no cache this script reads,
so nothing was examined), 2 = usage/git/JSON error.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import date

EXIT_SUPERSEDED, EXIT_NOT_SUPERSEDED, EXIT_ERROR = 0, 1, 2

CACHES = {
    "uncertainty": ("event-uncertainty-cache.json", "entries"),
    "duplicate": ("event-duplicate-cache.json", "resolutions"),
}

# Drain-cache keys embed the event's date in several shapes, and a single key
# can contain more than one — e.g. a Google Calendar recurrence id carries the
# *series start* while the real event date is appended at the end:
#   tabletop-village_R20220610T220000@google.com-2026-09-11
# So candidates are collected from every pattern and the **last one in the
# string** wins, which is the appended per-occurrence date in every shape we
# see. Month/day are validated, so an arbitrary digit run only registers as a
# date if it genuinely looks like one.
_DATE_PATTERNS = (
    # Month/day may be unpadded in the wild (`…-2026-8-15-rupaul`), so accept
    # 1-2 digits and zero-pad below; without that these read as undated and
    # never age out of the "still live" bucket.
    re.compile(r"(20\d\d)-(\d\d?)-(\d\d?)(?!\d)"),          # 2026-09-11, 2026-8-15
    re.compile(r"(20\d\d)/(\d\d?)/(\d\d?)(?!\d)"),          # 2026/09/04
    # Compact suffix glued onto an upstream id of arbitrary length
    # (`57740` + `20260827`), optionally carrying a 4-digit time
    # (`202608280230`). Anchored on the end of the digit run, not its start.
    re.compile(r"(20\d\d)(\d\d)(\d\d)(?:\d{4})?(?!\d)"),
)


def key_date(key):
    """Return the last date embedded in a cache key, or None."""
    best_pos, best = -1, None
    for pattern in _DATE_PATTERNS:
        for m in pattern.finditer(key):
            y, mo, d = m.groups()
            if not (1 <= int(mo) <= 12 and 1 <= int(d) <= 31):
                continue
            if m.start() > best_pos:
                best_pos, best = m.start(), f"{y}-{int(mo):02d}-{int(d):02d}"
    return best


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(EXIT_ERROR)


def read_cache(ref, path, container):
    """Load one cache file at a git ref. Returns {} when the file is absent."""
    try:
        blob = subprocess.run(
            ["git", "show", f"{ref}:{path}"],
            capture_output=True, text=True, check=True,
        ).stdout
    except subprocess.CalledProcessError:
        return {}
    try:
        return json.loads(blob).get(container, {})
    except json.JSONDecodeError as exc:
        die(f"{path} at {ref} is not valid JSON: {exc}")


def rev_parse(ref, fatal=True):
    try:
        return subprocess.run(
            ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        if not fatal:
            return None
        die(f"cannot resolve git ref '{ref}' — fetch it first "
            f"(git fetch origin <branch>)")


def _norm(v):
    """Normalize for comparison: 10 and 10.0 are the same resolution."""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in sorted(v.items())}
    if isinstance(v, list):
        return [_norm(x) for x in v]
    return v


def unlanded_fields(pr_entry, main_entry, container="entries"):
    """Which of this PR's assertions `main` lacks or contradicts.

    Compares **per field**, not whole entries. Whole-entry equality is far too
    strict: `evidence` prose, `resolvedAt` and `source` differ between runs that
    reached the identical conclusion, and `main` routinely carries a richer
    superset (a later run added `cost` alongside this PR's `imageUrl`). Either
    would drown the report in false positives.

    Presence-only is too loose in the other direction — `main` can hold the same
    key with a weaker or wrong value (`{"paid": true}`, or `{"min": 0}` from a
    ripper that guessed free) where this PR found the real price. Those are the
    entries most worth rescuing, so they must not read as "already on main".
    """
    if main_entry is None:
        return ["<absent>"]
    # The duplicate cache stores a different shape — {decision, resolvedAt,
    # note} — with the whole assertion in `decision`. Without this branch every
    # duplicate key already on main reads as landed no matter what it decided,
    # so a PR flipping a wrong `rejected` to `confirmed` would be closed as
    # superseded and the correction thrown away.
    if container == "resolutions":
        return ([] if pr_entry.get("decision") == main_entry.get("decision")
                else ["decision"])
    # An `unresolvable` verdict only counts as unlanded if main neither shares
    # it nor has since resolved the entry outright.
    # Landed only when main shares the verdict. Main holding *some* field is
    # not enough — it is routinely a value from a different queue (a photo
    # drain's imageUrl) while the uncertainty this entry marks unresolvable is
    # still open, and treating that as landed strands the event in the queue
    # forever. Main having genuinely resolved it instead surfaces here as one
    # key to glance at, which is the cheaper error.
    if pr_entry.get("unresolvable") and not main_entry.get("unresolvable"):
        # Labelled distinctly when main has a real resolution: AGENTS.md's
        # "carry unlanded items into this run's batch" is mechanical, and
        # carrying an `unresolvable` over main's actual answer would be a
        # regression. Listed only so the resolution can be eyeballed.
        return (["<unresolvable-but-main-resolved>"] if main_entry.get("fields")
                else ["<unresolvable>"])
    out = []
    for field, value in (pr_entry.get("fields") or {}).items():
        main_value = (main_entry.get("fields") or {}).get(field, _MISSING)
        if main_value is _MISSING or _norm(main_value) != _norm(value):
            out.append(field)
    return out


_MISSING = object()


def sweep_one(name, base, head, main, today, list_n):
    """Report one cache.

    Returns (live_unlanded_keys, unapplied_prune_count, touched_anything).
    """
    path, container = CACHES[name]
    b, h, m = (read_cache(r, path, container) for r in (base, head, main))

    if not h and not b:
        print(f"\n{path}: not present on this branch — nothing to check.")
        return [], 0, False

    added = set(h) - set(b)
    pruned = set(b) - set(h)
    modified = {k for k in set(h) & set(b) if h[k] != b[k]}
    touched = added | modified

    unlanded = {k: unlanded_fields(h[k], m.get(k), container) for k in touched}
    unlanded = {k: v for k, v in unlanded.items() if v}
    absent = sum(1 for v in unlanded.values() if v == ["<absent>"])

    live = sorted(k for k in unlanded if (key_date(k) or "9999") >= today)
    past = len(unlanded) - len(live)
    unapplied_prunes = len(pruned & set(m))

    print(f"\n{path}")
    print(f"  PR changes vs merge-base : {len(added)} added, "
          f"{len(modified)} modified, {len(pruned)} pruned")
    print(f"  landed on main           : {len(touched) - len(unlanded)} "
          f"of {len(touched)} added/modified")
    print(f"  unlanded                 : {len(unlanded)} "
          f"({absent} absent from main, {len(unlanded) - absent} present but "
          f"contradicted)")
    print(f"    of those, still live   : {len(live)}  ({past} past-dated)")
    print(f"  prunes not applied       : {unapplied_prunes}")

    for k in live[:list_n]:
        print(f"      + [{','.join(unlanded[k])}] {k}")
    if len(live) > list_n:
        print(f"      … {len(live) - list_n} more (raise --list to see them)")

    return live, unapplied_prunes, bool(touched or pruned)


def selftest():
    """Regression checks for the two pieces with real subtlety."""
    date_cases = {
        # trailing ISO date wins over a recurrence-id date earlier in the key
        "tabletop-village:tv_R20220610T220000@google.com-2026-09-11": "2026-09-11",
        "events12:free-things-to-do-119028-2026-08-27": "2026-08-27",
        "foo:bar-2026/09/04": "2026-09-04",
        "charlies-queer-books:charlies-queer-books-5774020260827": "2026-08-27",
        "cidbia:cidbia-6a8f6f4ce446bb188d5cb0de-202608280230": "2026-08-28",
        "seattle-center:seattle-center-sculpture-walk-2026-x46396": None,
        "venue:osm:way:6123058": None,
        "pcnw:pcnw-95578": None,
    }
    cmp_cases = [
        # (label, pr_entry, main_entry, expected unlanded fields)
        ("absent from main", {"fields": {"cost": {"min": 5}}}, None, ["<absent>"]),
        ("int vs float is the same resolution",
         {"fields": {"cost": {"min": 10.0}}}, {"fields": {"cost": {"min": 10}}}, []),
        ("main carries a richer superset",
         {"fields": {"imageUrl": "u"}},
         {"fields": {"imageUrl": "u", "cost": {"min": 15}}}, []),
        ("evidence/resolvedAt differ, verdict identical",
         {"fields": {"cost": {"min": 18}}, "evidence": "a", "resolvedAt": "2026-08-23"},
         {"fields": {"cost": {"min": 18}}, "evidence": "b", "resolvedAt": "2026-09-01"}, []),
        ("main is weaker — paid-unknown vs a real price",
         {"fields": {"cost": {"min": 175}}}, {"fields": {"cost": {"paid": True}}}, ["cost"]),
        ("main guessed free where the PR found a price",
         {"fields": {"cost": {"min": 45, "max": 55}}}, {"fields": {"cost": {"min": 0}}}, ["cost"]),
        # Flagged on purpose: main resolving *a* field doesn't prove it
        # resolved the one this entry gave up on. One key to eyeball beats
        # silently stranding the event.
        ("unresolvable, main has an unrelated field",
         {"unresolvable": True}, {"fields": {"imageUrl": "u"}},
         ["<unresolvable-but-main-resolved>"]),
        ("unresolvable, main lacks any resolution",
         {"unresolvable": True}, {"resolvedAt": "2026-09-01"}, ["<unresolvable>"]),
        ("unresolvable, main marked it unresolvable too plus a photo",
         {"unresolvable": True},
         {"unresolvable": True, "fields": {"imageUrl": "u"}}, []),
        ("unresolvable, main agrees", {"unresolvable": True}, {"unresolvable": True}, []),
    ]
    # The duplicate cache has its own entry shape, checked separately.
    dup_cases = [
        ("duplicate: same decision",
         {"decision": "confirmed"}, {"decision": "confirmed"}, []),
        ("duplicate: PR corrects main's decision",
         {"decision": "confirmed"}, {"decision": "rejected"}, ["decision"]),
        ("duplicate: note differs, decision agrees",
         {"decision": "rejected", "note": "a"}, {"decision": "rejected", "note": "b"}, []),
    ]

    bad = 0
    for key, want in date_cases.items():
        got = key_date(key)
        bad += got != want
        print(f"{'ok  ' if got == want else 'FAIL'} key_date {str(got):12} "
              f"want {str(want):12} {key}")
    for label, pr, main_entry, want in cmp_cases:
        got = unlanded_fields(pr, main_entry)
        bad += got != want
        print(f"{'ok  ' if got == want else 'FAIL'} unlanded {str(got):16} "
              f"want {str(want):16} {label}")
    for label, pr, main_entry, want in dup_cases:
        got = unlanded_fields(pr, main_entry, "resolutions")
        bad += got != want
        print(f"{'ok  ' if got == want else 'FAIL'} unlanded {str(got):16} "
              f"want {str(want):16} {label}")
    for key, want in {"brick-park-psq:brickpark-2026-8-15-rupaul": "2026-08-15",
                      "x:y-2026-09-11": "2026-09-11"}.items():
        got = key_date(key)
        bad += got != want
        print(f"{'ok  ' if got == want else 'FAIL'} key_date {str(got):12} "
              f"want {str(want):12} {key}")
    print("selftest: " + ("PASS" if not bad else f"{bad} FAILURE(S)"))
    return EXIT_SUPERSEDED if not bad else EXIT_ERROR


def main():
    ap = argparse.ArgumentParser(
        description="Check whether a queue-drain PR is superseded by main.")
    ap.add_argument("base", nargs="?", help="the PR's merge-base with main")
    ap.add_argument("head", nargs="?", help="the PR's branch/head ref")
    ap.add_argument("--cache", choices=["uncertainty", "duplicate", "both"],
                    default="both", help="which cache(s) to check (default both)")
    ap.add_argument("--main", default="main",
                    help="ref to treat as the current baseline (default main)")
    ap.add_argument("--today", default=date.today().isoformat(),
                    help="date used to judge a key past-dated (default today)")
    ap.add_argument("--list", type=int, default=20, metavar="N",
                    help="how many novel keys to print per cache (default 20)")
    ap.add_argument("--selftest", action="store_true",
                    help="run key_date regression checks and exit")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    # Compared lexically against ISO key dates, so a non-padded --today
    # (2026-9-7) would silently mark every dated key past and report a
    # queue full of live work as SUPERSEDED.
    try:
        if args.today != date.fromisoformat(args.today).isoformat():
            raise ValueError
    except ValueError:
        die(f"--today must be a zero-padded ISO date (YYYY-MM-DD), got {args.today!r}")
    if not args.base or not args.head:
        ap.print_usage(sys.stderr)
        die("both <merge-base-sha> and <head-ref> are required")

    base, head = rev_parse(args.base), rev_parse(args.head)
    # A detached web-session checkout often has no local `main` at all, only
    # origin/main — resolve that rather than dying with an unhelpful remedy.
    mainref = rev_parse(args.main, fatal=False)
    if mainref is None and "/" not in args.main:
        mainref = rev_parse(f"origin/{args.main}", fatal=False)
        if mainref:
            print(f"NOTE: no local '{args.main}'; using origin/{args.main}.")
    if mainref is None:
        die(f"cannot resolve '{args.main}' or 'origin/{args.main}' — "
            f"fetch it first, or pass --main <ref>")

    # A stale local `main` understates how much of the PR already landed, which
    # is the one direction of error that matters here (it makes a superseded PR
    # look like it still has novel work). Web sessions in particular check out a
    # detached snapshot and leave `main` behind, so compare against the remote.
    stale_note = None
    remote = f"origin/{args.main}" if "/" not in args.main else None
    if remote:
        remote_sha = rev_parse(remote, fatal=False)
        if remote_sha:
            behind = subprocess.run(
                ["git", "rev-list", "--count", f"{mainref}..{remote_sha}"],
                capture_output=True, text=True).stdout.strip()
            if behind and behind != "0":
                stale_note = (f"'{args.main}' was {behind} commit(s) behind "
                              f"{remote}; used {remote} instead so supersession "
                              f"isn't understated.")
                mainref = remote_sha

    # The merge-base is an ancestor of BOTH head and main. Testing only against
    # main cannot catch the documented mistake — GitHub's `base.sha` is the base
    # branch's tip, so it is always an ancestor of main; it is the *head* test
    # that fails for it. Getting this wrong is not a cosmetic miss: with
    # base.sha the diff runs backwards and the "unlanded" keys are main's own
    # newer values, so carrying them into a batch would revert main.
    def is_ancestor(a, b):
        return subprocess.run(["git", "merge-base", "--is-ancestor", a, b],
                              capture_output=True).returncode == 0

    print(f"base {base[:8]}  head {head[:8]}  main {mainref[:8]}")
    if stale_note:
        print(f"  NOTE: {stale_note}")
    for label, ok in (("head", is_ancestor(base, head)),
                      ("main", is_ancestor(base, mainref))):
        if not ok:
            print(f"  WARNING: base is not an ancestor of {label} — this is not "
                  "the true merge-base (GitHub's `base.sha` is the base branch's "
                  "tip, not the merge-base). Re-derive it with "
                  f"`git merge-base origin/{args.main} {args.head}` (deepen a "
                  "shallow clone first) and re-run. Every count below is "
                  "unreliable, and the 'unlanded' keys may be main's own newer "
                  "values seen in reverse — do not carry them into a batch.")

    # Only the cache JSONs are analysed above, so a PR carrying a ripper fix or
    # a YAML edit must not have SUPERSEDED read as "the whole PR is dead".
    # Surface those files explicitly rather than leaving it to a reminder the
    # SUPERSEDED branch never printed.
    names = list(CACHES) if args.cache == "both" else [args.cache]
    analysed_paths = {CACHES[n][0] for n in names}
    diff = subprocess.run(
        ["git", "diff", "--name-only", f"{base}..{head}"],
        capture_output=True, text=True)
    if diff.returncode != 0:
        # Don't let a failed diff silently upgrade the verdict's wording to
        # "every change this PR carries".
        die(f"git diff {base[:8]}..{head[:8]} failed: {diff.stderr.strip()}")
    # splitlines(), not split(): a path containing a space is one file.
    # Anything not analysed above is listed, including the *other* cache when
    # --cache narrowed the run to one.
    other_files = [f for f in diff.stdout.splitlines()
                   if f and f not in analysed_paths]
    live, prunes, touched_any = [], 0, False
    for name in names:
        cache_live, cache_prunes, cache_touched = sweep_one(
            name, base, head, mainref, args.today, args.list)
        live += cache_live
        prunes += cache_prunes
        touched_any = touched_any or cache_touched

    print()
    if other_files:
        print(f"NOT ANALYSED: this PR also touches {len(other_files)} non-cache "
              f"file(s). This script only reads the drain caches, so the verdict")
        print("below says nothing about these. Check each against main by grep,")
        print("and port fresh anything still wanted:")
        for f in other_files[:15]:
            print(f"      {f}")
        if len(other_files) > 15:
            print(f"      … {len(other_files) - 15} more")
        print()

    if prunes:
        # Deliberately does NOT drive the verdict. A key this PR pruned that is
        # back on main usually means a later run re-resolved it on purpose (the
        # u-district-partnership listings are the standing example), so
        # re-pruning would undo real work. The routine prune flags re-derive
        # genuine staleness on their own.
        print(f"NOTE: {prunes} key(s) this PR pruned are present on main again.")
        print("Usually a later run re-resolved them deliberately — verify before")
        print("re-pruning; the routine prune pass re-derives real staleness anyway.")
        print()

    if not touched_any:
        print("VERDICT: NOT-APPLICABLE — this PR changes none of the caches this")
        print("script reads, so nothing here was analysed and none of it is shown")
        print("to be superseded. Several drain PRs are legitimately like this:")
        print("photo-resolver venue photos and cost-resolver uniform prices are")
        print("source-YAML-only, and geo drains edit lib/geocoder.ts. Sweep those")
        print("by grep against main instead — see skills/geo-resolver/SKILL.md")
        print("step 0 for the pattern. Do not close a PR on this verdict.")
        return EXIT_NOT_SUPERSEDED

    if live:
        print(f"VERDICT: HAS-NOVEL-WORK — {len(live)} unlanded, still-live key(s).")
        print("Close the PR anyway (its branch conflicts in the cache), but read")
        print("those entries' resolutions and evidence first and carry them into")
        print("this run's batch. Also check by grep whether any non-cache change")
        print("in the PR (ripper fix, KNOWN_VENUE_COORDS entry, YAML imageUrl:)")
        print("landed on main; if not, port it fresh rather than reviving the branch.")
        return EXIT_NOT_SUPERSEDED

    scope = "every cache change this PR carries is" if other_files else \
            "every change this PR carries is"
    print(f"VERDICT: SUPERSEDED — {scope} already on main, or is")
    print("past-dated. Close it, naming what superseded it. Nothing is lost:")
    print("the queue re-surfaces anything genuinely outstanding.")
    if other_files:
        print("Resolve the NOT ANALYSED files above before you close it.")
    return EXIT_SUPERSEDED


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
