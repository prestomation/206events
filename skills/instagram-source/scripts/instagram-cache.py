#!/usr/bin/env python3
"""206.events instagram-cache operations.

The `instagram` ripper type (lib/config/instagram.ts) is a pure reader of
instagram-cache.json. This script is how the instagram-source skill writes into
that cache after reading a post's flyer image + caption. It mirrors
skills/event-uncertainty-resolver/scripts/uncertainty-cache.py: stdlib-only,
S3-backed, with a committed-file fallback for sessions without S3 access.

Usage:
    instagram-cache.py list-sources [--repo-root PATH]
        Print every `type: instagram` source (name, username, disabled).

    instagram-cache.py list --username U [--committed PATH]
        Print the cache entries already recorded for a username (postId,
        isEvent, title, date) — never dumps the whole file into context.

    instagram-cache.py write --username U --post-id ID
        # event form:
        [--title T --date YYYY-MM-DD [--start-time HH:MM] [--duration SECONDS]
         [--location STR] [--description STR] [--image-url URL]]
        # OR non-event form:
        [--not-event [--reason STR]]
        [--permalink URL] [--fingerprint FP] [--committed PATH] [--force]
        Upsert one post's extraction result. Writes to S3 by default, or to a
        local committed instagram-cache.json with --committed. Refuses to
        overwrite an existing entry without --force.

    instagram-cache.py prune [--older-than DAYS] [--orphan-usernames]
                             [--repo-root PATH] [--committed PATH] [--dry-run]
        Drop entries for events whose date is older than DAYS, or whose
        username has no `type: instagram` source. Additive flags.

Environment:
    AWS credentials for S3 access (omit --committed). The S3 bucket/key match
    the other 206.events caches.
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile
from datetime import date, timedelta

BUCKET = "calendar-ripper-outofband-220483515252"
KEY = "latest/instagram-cache.json"
REGION = "us-west-2"

S3_CACHE_PATH = os.path.join(tempfile.gettempdir(), "instagram-cache.json")


def load_cache(committed):
    """Load the cache from a committed file path, or from S3 when committed is None."""
    if committed:
        if os.path.exists(committed):
            with open(committed) as f:
                return json.load(f)
        return {"version": 1, "entries": {}}
    subprocess.run(
        ["aws", "s3", "cp", f"s3://{BUCKET}/{KEY}", S3_CACHE_PATH, "--region", REGION],
        check=False,  # OK if the cache doesn't exist yet — start fresh
    )
    if os.path.exists(S3_CACHE_PATH):
        with open(S3_CACHE_PATH) as f:
            return json.load(f)
    return {"version": 1, "entries": {}}


def save_cache(cache, committed):
    if committed:
        with open(committed, "w") as f:
            json.dump(cache, f, indent=2)
            f.write("\n")
        print(f"Wrote {committed}")
        return
    with open(S3_CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)
    subprocess.run(
        ["aws", "s3", "cp", S3_CACHE_PATH, f"s3://{BUCKET}/{KEY}", "--region", REGION],
        check=True,
    )
    print(f"Uploaded to s3://{BUCKET}/{KEY}")


def cache_key(username, post_id):
    return f"{username}:{post_id}"


def iter_instagram_sources(repo_root):
    """Yield (name, username, disabled) for each `type: instagram` ripper.yaml.

    Line-scan rather than importing PyYAML, matching uncertainty-cache.py — the
    only guaranteed dependency in these environments is the stdlib.
    """
    for path in sorted(glob.glob(os.path.join(repo_root, "sources", "*", "ripper.yaml"))):
        name = None
        is_instagram = False
        disabled = False
        username = None
        try:
            with open(path) as f:
                for line in f:
                    s = line.strip()
                    if s.startswith("name:") and name is None:
                        name = s.split(":", 1)[1].strip().strip("'\"")
                    elif s.startswith("type:") and s.split(":", 1)[1].strip().strip("'\"") == "instagram":
                        is_instagram = True
                    elif s.startswith("disabled:") and s.split(":", 1)[1].strip().lower() == "true":
                        disabled = True
                    elif s.startswith("username:"):
                        username = s.split(":", 1)[1].strip().strip("'\"")
        except OSError:
            continue
        if is_instagram:
            yield name, username, disabled


def cmd_list_sources(args):
    found = list(iter_instagram_sources(args.repo_root))
    if not found:
        print("No `type: instagram` sources found.")
        return
    for name, username, disabled in found:
        flag = " (disabled)" if disabled else ""
        print(f"{name}: username={username}{flag}")


def cmd_list(args):
    cache = load_cache(args.committed)
    prefix = f"{args.username}:"
    rows = sorted(k for k in cache.get("entries", {}) if k.startswith(prefix))
    if not rows:
        print(f"No cache entries for {args.username!r}.")
        return
    for k in rows:
        e = cache["entries"][k]
        post_id = k[len(prefix):]
        if e.get("isEvent"):
            print(f"[{post_id}] EVENT  {e.get('date', '?')} {e.get('startTime', '')}  {e.get('title', '?')}")
        else:
            print(f"[{post_id}] not-event  ({e.get('reason', 'no reason')})")


def cmd_write(args):
    if not args.not_event and not args.title:
        print("Provide event fields (--title/--date) or --not-event.", file=sys.stderr)
        sys.exit(2)
    if not args.not_event and not args.date:
        print("--date (YYYY-MM-DD) is required for an event.", file=sys.stderr)
        sys.exit(2)

    cache = load_cache(args.committed)
    cache.setdefault("entries", {})
    key = cache_key(args.username, args.post_id)
    if key in cache["entries"] and not args.force:
        print(f"Entry {key!r} already exists. Use --force to overwrite.", file=sys.stderr)
        print(json.dumps(cache["entries"][key], indent=2), file=sys.stderr)
        sys.exit(1)

    today = date.today().isoformat()
    if args.not_event:
        entry = {"isEvent": False, "readAt": today, "source": "agent"}
        if args.reason:
            entry["reason"] = args.reason
    else:
        entry = {"isEvent": True, "title": args.title, "date": args.date, "readAt": today, "source": "agent"}
        if args.start_time:
            entry["startTime"] = args.start_time
        if args.duration is not None:
            entry["durationSeconds"] = args.duration
        if args.location:
            entry["location"] = args.location
        if args.description:
            entry["description"] = args.description
        if args.image_url:
            entry["imageUrl"] = args.image_url
    if args.permalink:
        entry["permalink"] = args.permalink
    if args.fingerprint:
        entry["postFingerprint"] = args.fingerprint

    cache["entries"][key] = entry
    save_cache(cache, args.committed)
    print(f"Recorded {key} →")
    print(json.dumps(entry, indent=2))


def cmd_prune(args):
    if args.older_than is None and not args.orphan_usernames:
        print("Pass --older-than DAYS and/or --orphan-usernames.", file=sys.stderr)
        sys.exit(2)
    cache = load_cache(args.committed)
    entries = cache.get("entries", {})
    before = len(entries)
    to_remove = {}

    if args.orphan_usernames:
        usernames = {u for _, u, _ in iter_instagram_sources(args.repo_root) if u}
        for key in entries:
            if key.split(":", 1)[0] not in usernames:
                to_remove[key] = "orphan_username"

    if args.older_than is not None:
        cutoff = (date.today() - timedelta(days=args.older_than)).isoformat()
        for key, e in entries.items():
            if key in to_remove:
                continue
            d = e.get("date")
            if e.get("isEvent") and d and d < cutoff:
                to_remove[key] = "event_past"

    print(f"Entries before: {before}; marked for removal: {len(to_remove)}")
    for key, reason in sorted(to_remove.items()):
        print(f"  [{reason}] {key}")
    if args.dry_run:
        print("(dry-run — no write)")
        return
    for key in to_remove:
        del entries[key]
    save_cache(cache, args.committed)
    print(f"Entries after: {len(entries)}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    ls = sub.add_parser("list-sources")
    ls.add_argument("--repo-root", default=".")
    ls.set_defaults(func=cmd_list_sources)

    li = sub.add_parser("list")
    li.add_argument("--username", required=True)
    li.add_argument("--committed", help="Read a local committed cache file instead of S3")
    li.set_defaults(func=cmd_list)

    w = sub.add_parser("write")
    w.add_argument("--username", required=True)
    w.add_argument("--post-id", required=True, help="Instagram post shortcode (from the permalink)")
    w.add_argument("--title")
    w.add_argument("--date", help="Event date YYYY-MM-DD (local)")
    w.add_argument("--start-time", help="Local HH:MM or HH:MM:SS")
    w.add_argument("--duration", type=int, help="Duration in seconds")
    w.add_argument("--location")
    w.add_argument("--description")
    w.add_argument("--image-url")
    w.add_argument("--permalink")
    w.add_argument("--not-event", action="store_true")
    w.add_argument("--reason")
    w.add_argument("--fingerprint", help="Hash of caption+image so edits trigger a re-read")
    w.add_argument("--committed", help="Write to a local committed cache file instead of S3")
    w.add_argument("--force", action="store_true")
    w.set_defaults(func=cmd_write)

    pr = sub.add_parser("prune")
    pr.add_argument("--older-than", type=int, help="Drop events whose date is older than DAYS days.")
    pr.add_argument("--orphan-usernames", action="store_true")
    pr.add_argument("--repo-root", default=".")
    pr.add_argument("--committed", help="Operate on a local committed cache file instead of S3")
    pr.add_argument("--dry-run", action="store_true")
    pr.set_defaults(func=cmd_prune)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
