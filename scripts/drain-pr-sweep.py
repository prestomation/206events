#!/usr/bin/env python3
"""Decide whether an open queue-drain PR is already superseded by `main`.

Every drain run rewrites `event-uncertainty-cache.json` /
`event-duplicate-cache.json`, so a drain PR that doesn't merge quickly is both
conflicted (a content conflict in a 9,000-entry JSON) and pointless (a later run
already resolved the same keys). This script tells the two apart mechanically,
so Step 0 of AGENTS.md's "Queue Draining" is a check rather than a judgement
call over an unreadable diff.

Usage:
    drain-pr-sweep.py <base-sha> <head-ref> [--cache uncertainty|duplicate|both]
                      [--main <ref>] [--today YYYY-MM-DD] [--list N]

    <base-sha>  the PR's merge-base with main. Get it with
                `git merge-base main <head-ref>`; if the repo is shallow, deepen
                first (`git fetch --deepen=400 origin main`) or pass the PR's
                recorded base sha and confirm the script's own base-sanity note.
    <head-ref>  the PR branch (fetch it first: `git fetch origin <branch>`).

For each cache it reports what the PR *itself* changed (branch vs base), then
how much of that `main` already carries, and how much of the remainder is
past-dated and therefore worthless. Ends with a verdict:

    SUPERSEDED      — close the PR; nothing is lost.
    HAS-NOVEL-WORK  — close it too, but read the listed keys and carry that
                      investigation into the current run's batch.

Exit status: 0 = SUPERSEDED, 1 = HAS-NOVEL-WORK, 2 = usage/git error.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import date

CACHES = {
    "uncertainty": ("event-uncertainty-cache.json", "entries"),
    "duplicate": ("event-duplicate-cache.json", "resolutions"),
}

# Drain-cache keys embed the event's date, either as an ISO date
# (`...-2026-08-27-...`) or as a compact suffix on an upstream id, optionally
# carrying a 4-digit time: `charlies-queer-books-5774020260827` and
# `cidbia-6a8f6f4ce446bb188d5cb0de-202608280230`. A key whose date has passed is
# dead weight no matter what it resolves, so it never counts as novel work.
#
# The compact form anchors on the trailing end of a digit run rather than its
# start, because the date is glued onto an id of arbitrary length (`57740` +
# `20260827`). Month/day are validated below, so a random digit run only
# registers as a date if it genuinely looks like one.
_ISO_DATE = re.compile(r"(20\d\d)-(\d\d)-(\d\d)")
_COMPACT_DATE = re.compile(r"(20\d\d)(\d\d)(\d\d)(?:\d{4})?(?!\d)")


def key_date(key):
    """Return the last date embedded in a cache key, or None."""
    best = None
    for pattern in (_ISO_DATE, _COMPACT_DATE):
        for m in pattern.finditer(key):
            y, mo, d = m.groups()
            if not ("01" <= mo <= "12" and "01" <= d <= "31"):
                continue
            best = f"{y}-{mo}-{d}"
    return best


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
        sys.exit(f"error: {path} at {ref} is not valid JSON: {exc}")


def rev_parse(ref):
    try:
        return subprocess.run(
            ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        sys.exit(f"error: cannot resolve git ref '{ref}' — fetch it first "
                 f"(git fetch origin <branch>)")


def sweep_one(name, base, head, main, today, list_n):
    """Report one cache. Returns the list of novel, still-live keys."""
    path, container = CACHES[name]
    b, h, m = (read_cache(r, path, container) for r in (base, head, main))

    if not h and not b:
        print(f"\n{path}: not present on this branch — nothing to check.")
        return []

    added = set(h) - set(b)
    pruned = set(b) - set(h)
    modified = {k for k in set(h) & set(b) if h[k] != b[k]}

    # A modification only matters if main disagrees with the PR's value.
    changed_vs_main = {k for k in modified if m.get(k) != h[k]}
    novel = (added - set(m)) | changed_vs_main
    live = sorted(k for k in novel if (key_date(k) or "9999") >= today)
    past = len(novel) - len(live)
    pruned_still_on_main = pruned & set(m)

    print(f"\n{path}")
    print(f"  PR changes vs its base : {len(added)} added, "
          f"{len(modified)} modified, {len(pruned)} pruned")
    print(f"  already on main        : {len(added & set(m))} of the adds, "
          f"{len(modified) - len(changed_vs_main)} of the modifications")
    print(f"  prunes still un-applied: {len(pruned_still_on_main)}")
    print(f"  novel                  : {len(novel)} "
          f"({past} past-dated / worthless, {len(live)} still live)")

    for k in live[:list_n]:
        print(f"      + {k}")
    if len(live) > list_n:
        print(f"      … {len(live) - list_n} more (raise --list to see them)")

    return live


def main():
    ap = argparse.ArgumentParser(
        description="Check whether a queue-drain PR is superseded by main.")
    ap.add_argument("base", help="the PR's merge-base with main")
    ap.add_argument("head", help="the PR's branch/head ref")
    ap.add_argument("--cache", choices=["uncertainty", "duplicate", "both"],
                    default="both", help="which cache(s) to check (default both)")
    ap.add_argument("--main", default="main",
                    help="ref to treat as the current baseline (default main)")
    ap.add_argument("--today", default=date.today().isoformat(),
                    help="date used to judge a key past-dated (default today)")
    ap.add_argument("--list", type=int, default=20, metavar="N",
                    help="how many novel keys to print per cache (default 20)")
    args = ap.parse_args()

    base, head, mainref = (rev_parse(r) for r in (args.base, args.head, args.main))

    # A stale local `main` understates how much of the PR already landed, which
    # is the one direction of error that matters here (it makes a superseded PR
    # look like it still has novel work). Web sessions in particular check out a
    # detached snapshot and leave `main` behind, so compare against the remote.
    stale_note = None
    remote = f"origin/{args.main}" if "/" not in args.main else None
    if remote:
        try:
            remote_sha = rev_parse(remote)
            behind = subprocess.run(
                ["git", "rev-list", "--count", f"{mainref}..{remote_sha}"],
                capture_output=True, text=True, check=True).stdout.strip()
            if behind != "0":
                stale_note = (f"'{args.main}' was {behind} commit(s) behind "
                              f"{remote}; used {remote} instead so supersession "
                              f"isn't understated.")
                mainref = remote_sha
        except SystemExit:
            pass  # no remote-tracking ref — use the local one as given

    # A base that is already an ancestor of main's tip is expected. A base that
    # *isn't* means the caller passed the wrong sha (GitHub's `base.sha` is the
    # base branch's tip, not the merge-base) and every count below would be
    # inflated by unrelated main commits.
    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", base, mainref]).returncode == 0
    print(f"base {base[:8]}  head {head[:8]}  main {mainref[:8]}")
    if stale_note:
        print(f"  NOTE: {stale_note}")
    if not ancestor:
        print("  WARNING: base is not an ancestor of main — this is probably not "
              "the true merge-base. Re-derive it with "
              f"`git merge-base {args.main} {args.head}` (deepen a shallow "
              "clone first) and re-run; the counts below are unreliable.")

    names = list(CACHES) if args.cache == "both" else [args.cache]
    live = []
    for name in names:
        live += sweep_one(name, base, head, mainref, args.today, args.list)

    print()
    if live:
        print(f"VERDICT: HAS-NOVEL-WORK — {len(live)} unlanded, still-live key(s).")
        print("Close the PR anyway (its branch conflicts in the cache), but read")
        print("those entries' resolutions and evidence first and carry them into")
        print("this run's batch. Also check by grep whether any non-cache change")
        print("in the PR (ripper fix, KNOWN_VENUE_COORDS entry, YAML imageUrl:)")
        print("landed on main; if not, port it fresh rather than reviving the branch.")
        return 1

    print("VERDICT: SUPERSEDED — every change this PR carries is already on main,")
    print("or is past-dated. Close it, naming what superseded it. Nothing is lost:")
    print("the queue re-surfaces anything genuinely outstanding.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
