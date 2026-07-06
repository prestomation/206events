#!/usr/bin/env python3
"""206.events cross-source duplicate-resolver cache operations.

Usage:
    duplicate-cache.py stats
        Print merged / candidate counts from the live build-errors.json.

    duplicate-cache.py candidates [--limit N]
        Print the work queue (duplicateCandidates): the two events, their
        feeds, distance, and the pair key used to resolve them.

    duplicate-cache.py resolve --key KEY --decision confirmed|rejected
                               [--note STR] [--repo-root PATH] [--force]
        Resolve a single candidate by editing the committed
        event-duplicate-cache.json in place:
          confirmed → the next build MERGES the pair (collapse + attribute)
          rejected  → the next build keeps them SEPARATE (never re-proposed)
        Refuses to overwrite an existing decision unless --force. Commit the
        file and open a PR — CI reads the committed file directly.

The cache is the committed event-duplicate-cache.json at the repo root
(override with --repo-root). There is no S3 — committed decisions are the
source of truth. See docs/cross-source-event-dedup.md.
"""

import argparse
import json
import os
import sys
import urllib.request
from datetime import date

DEFAULT_ERRORS_URL = "https://206.events/build-errors.json"
CACHE_FILENAME = "event-duplicate-cache.json"


def fetch_json(url):
    # Cloudflare 403s urllib's default User-Agent from cloud sandboxes; send
    # a browser-like one so this works there too.
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; 206events-skill/1.0)"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def cache_path(repo_root):
    return os.path.join(repo_root, CACHE_FILENAME)


def load_cache(repo_root):
    path = cache_path(repo_root)
    if not os.path.exists(path):
        return {"resolutions": {}}
    with open(path) as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get("resolutions"), dict):
        return {"resolutions": {}}
    return data


def save_cache(repo_root, cache):
    path = cache_path(repo_root)
    with open(path, "w") as f:
        # ensure_ascii=False: the committed file stores literal UTF-8 (curly
        # quotes, em-dashes in event titles) — escaping them would rewrite
        # every existing entry and blow up the diff.
        json.dump(cache, f, indent=2, ensure_ascii=False)
        f.write("\n")


def cmd_stats(args):
    errors = fetch_json(args.errors_url)
    s = errors.get("duplicateStats") or {}
    print(f"🔀 Cross-source duplicates: {s.get('merged', 0)} merged across "
          f"{s.get('groups', 0)} event(s); {s.get('candidates', 0)} candidate(s) pending review")


def cmd_candidates(args):
    errors = fetch_json(args.errors_url)
    cands = errors.get("duplicateCandidates") or []
    if not cands:
        print("No duplicate candidates pending. ✅")
        return
    shown = cands[: args.limit] if args.limit else cands
    for c in shown:
        a, b = c["events"]
        dm = c["score"].get("distanceM")
        dist = "no coords" if dm is None else f"{dm}m"
        print(f"- key: {c['key']}")
        print(f"    A [{a['icsUrl']}] {a['summary']!r} @ {a.get('location')!r} {a.get('url') or ''}")
        print(f"    B [{b['icsUrl']}] {b['summary']!r} @ {b.get('location')!r} {b.get('url') or ''}")
        print(f"    title={c['score'].get('title')} dist={dist} locText={c['score'].get('locText')}")
    if args.limit and len(cands) > args.limit:
        print(f"… and {len(cands) - args.limit} more (raise --limit).")


def cmd_resolve(args):
    if args.decision not in ("confirmed", "rejected"):
        sys.exit("--decision must be 'confirmed' or 'rejected'")
    cache = load_cache(args.repo_root)
    existing = cache["resolutions"].get(args.key)
    if existing and not args.force:
        sys.exit(f"Refusing to overwrite existing decision for key (use --force):\n  {existing}")
    entry = {"decision": args.decision, "resolvedAt": date.today().isoformat()}
    if args.note:
        entry["note"] = args.note
    cache["resolutions"][args.key] = entry
    save_cache(args.repo_root, cache)
    print(f"Wrote {args.decision} for key:\n  {args.key}\nCommit {CACHE_FILENAME} and open a PR to publish.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--errors-url", default=DEFAULT_ERRORS_URL)
    p.add_argument("--repo-root", default=os.getcwd())
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("stats")

    pc = sub.add_parser("candidates")
    pc.add_argument("--limit", type=int, default=0)

    pr = sub.add_parser("resolve")
    pr.add_argument("--key", required=True)
    pr.add_argument("--decision", required=True, choices=["confirmed", "rejected"])
    pr.add_argument("--note")
    pr.add_argument("--force", action="store_true")

    args = p.parse_args()
    {"stats": cmd_stats, "candidates": cmd_candidates, "resolve": cmd_resolve}[args.cmd](args)


if __name__ == "__main__":
    main()
