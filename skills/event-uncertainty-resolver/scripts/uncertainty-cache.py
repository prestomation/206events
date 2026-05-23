#!/usr/bin/env python3
"""206.events event-uncertainty-cache operations.

Usage:
    uncertainty-cache.py stats
        Print outstanding / resolved / unresolvable counts from the
        live build-errors.json.

    uncertainty-cache.py outstanding [--limit N]
        Print the work queue (uncertainEvents) with source, title, date,
        missing fields, and URL.

    uncertainty-cache.py resolve --key KEY [--start-time HH:MM]
                                 [--duration SECONDS] [--location STR]
                                 [--image URL] [--evidence URL]
                                 [--unresolvable [--reason STR]]
                                 [--force]
        Resolve a single cache entry. Downloads the cache from S3,
        applies the entry, and uploads back. Refuses to overwrite an
        existing entry unless --force.

    uncertainty-cache.py prune [--lastseen-older-than DAYS]
                               [--date-in-key-older-than DAYS]
                               [--orphan-prefixes]
                               [--repo-root PATH]
                               [--dry-run]
        Drop stale entries. Flags are independent and additive — pass
        any combination. With no flags, prints help and exits. Always
        prints a per-reason breakdown; uploads only when not --dry-run.

Environment:
    AWS credentials for S3 access (profile / role / env vars).
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from datetime import date, timedelta

BUCKET = "calendar-ripper-outofband-220483515252"
KEY = "latest/event-uncertainty-cache.json"
REGION = "us-west-2"
DEFAULT_ERRORS_URL = "https://206.events/build-errors.json"

CACHE_PATH = os.path.join(tempfile.gettempdir(), "event-uncertainty-cache.json")


def fetch_json(url):
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def download_cache():
    subprocess.run(
        ["aws", "s3", "cp", f"s3://{BUCKET}/{KEY}", CACHE_PATH, "--region", REGION],
        check=False,  # OK if the cache doesn't exist yet — start fresh
    )
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH) as f:
            return json.load(f)
    return {"version": 1, "entries": {}}


def upload_cache(cache):
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)
    subprocess.run(
        ["aws", "s3", "cp", CACHE_PATH, f"s3://{BUCKET}/{KEY}", "--region", REGION],
        check=True,
    )


def cmd_stats(args):
    errors = fetch_json(args.url or DEFAULT_ERRORS_URL)
    s = errors.get("uncertaintyStats", {})
    outstanding = s.get("outstanding", 0)
    resolved = s.get("resolvedFromCache", 0)
    unresolvable = s.get("acknowledgedUnresolvable", 0)
    queue = errors.get("uncertainEvents", [])
    print(f"Uncertain events outstanding: {outstanding}")
    print(f"Resolved from cache this build: {resolved}")
    print(f"Marked unresolvable: {unresolvable}")
    print(f"Work queue size (uncertainEvents): {len(queue)}")
    by_source = {}
    for u in queue:
        by_source.setdefault(u["source"], 0)
        by_source[u["source"]] += 1
    if by_source:
        print("\nBreakdown by source:")
        for src, n in sorted(by_source.items(), key=lambda x: -x[1]):
            print(f"  {src}: {n}")


def cmd_outstanding(args):
    errors = fetch_json(args.url or DEFAULT_ERRORS_URL)
    queue = errors.get("uncertainEvents", [])
    if not queue:
        print("No outstanding uncertain events.")
        return
    limit = args.limit or len(queue)
    for u in queue[:limit]:
        ev = u.get("event", {})
        key = f"{u['source']}:{ev.get('id', '?')}"
        print(f"[{key}]")
        print(f"  title:   {ev.get('summary', '?')}")
        print(f"  date:    {ev.get('date', '?')}")
        print(f"  missing: {', '.join(u.get('unknownFields', []))}")
        print(f"  url:     {ev.get('url', '(none)')}")
        if u.get("partialFingerprint"):
            print(f"  fp:      {u['partialFingerprint']}")
        print()
    if len(queue) > limit:
        print(f"... and {len(queue) - limit} more (use --limit to show more)")


def cmd_resolve(args):
    if not args.key:
        print("--key is required", file=sys.stderr)
        sys.exit(2)

    cache = download_cache()
    existing = cache["entries"].get(args.key)
    if existing and not args.force:
        print(f"Entry {args.key!r} already exists. Use --force to overwrite.", file=sys.stderr)
        print(json.dumps(existing, indent=2), file=sys.stderr)
        sys.exit(1)

    today = date.today().isoformat()

    if args.unresolvable:
        entry = {
            "unresolvable": True,
            "resolvedAt": today,
            "source": "agent",
        }
        if args.reason:
            entry["reason"] = args.reason
    else:
        fields = {}
        if args.start_time:
            fields["startTime"] = args.start_time
        if args.duration is not None:
            fields["duration"] = args.duration
        if args.location is not None:
            fields["location"] = args.location
        if args.image is not None:
            fields["image"] = args.image
        if not fields:
            print("Need at least one field (or --unresolvable).", file=sys.stderr)
            sys.exit(2)
        entry = {
            "fields": fields,
            "resolvedAt": today,
            "source": "agent",
        }
        if args.evidence:
            entry["evidence"] = args.evidence

    if args.fingerprint:
        entry["partialFingerprint"] = args.fingerprint

    cache["entries"][args.key] = entry
    upload_cache(cache)
    print(f"Resolved {args.key} →")
    print(json.dumps(entry, indent=2))


DATE_REGEXES = [
    re.compile(r"(\d{4})-(\d{2})-(\d{2})"),
    re.compile(r"(\d{4})/(\d{2})/(\d{2})"),
    re.compile(r"(\d{4})(\d{2})(\d{2})"),
]


def extract_date_from_key(key):
    """Return a YYYY-MM-DD string if the key embeds a parseable date, else None."""
    for r in DATE_REGEXES:
        m = r.search(key)
        if m:
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return None


def collect_canonical_source_names(repo_root):
    """Read sources/*/ripper.yaml and external/*.yaml; return the set of canonical
    source-name prefixes (the `name:` field). External calendars are addressed by
    their own name as well, so we include both.

    Intentionally parses by line scan instead of importing PyYAML — this script
    runs in environments where the only guaranteed dependency is the Python
    stdlib (boto3 via aws-cli subprocess, urllib for HTTP). The `name:` field
    is always at the top of each YAML doc in this repo, so a line-level grep
    is robust enough; if the convention ever drifts, this function will return
    a smaller set and the dry-run breakdown will surface the regression.
    """
    names = set()
    for path in glob.glob(os.path.join(repo_root, "sources", "*", "ripper.yaml")):
        try:
            with open(path) as f:
                for line in f:
                    line = line.rstrip("\n")
                    if line.startswith("name:"):
                        name = line.split(":", 1)[1].strip().strip("'\"")
                        if name:
                            names.add(name)
                        break
        except OSError:
            continue
    # External calendars: each YAML can list multiple entries, each with a name.
    for path in glob.glob(os.path.join(repo_root, "sources", "external", "*.yaml")):
        try:
            with open(path) as f:
                for line in f:
                    stripped = line.strip()
                    if stripped.startswith("- name:") or stripped.startswith("name:"):
                        _, _, value = stripped.partition("name:")
                        value = value.strip().strip("'\"")
                        if value:
                            names.add(value)
        except OSError:
            continue
    return names


def cmd_prune(args):
    flags_active = (
        args.lastseen_older_than is not None
        or args.date_in_key_older_than is not None
        or args.orphan_prefixes
    )
    if not flags_active:
        print(
            "No prune flag passed. Use at least one of "
            "--lastseen-older-than, --date-in-key-older-than, --orphan-prefixes.",
            file=sys.stderr,
        )
        sys.exit(2)

    cache = download_cache()
    entries = cache.get("entries", {})
    total_before = len(entries)
    print(f"Entries before prune: {total_before}")

    today = date.today()
    to_remove = {}  # key -> reason

    if args.orphan_prefixes:
        names = collect_canonical_source_names(args.repo_root)
        if not names:
            print(
                f"No canonical source names found under {args.repo_root}/sources. "
                "Run this from the repo root or pass --repo-root.",
                file=sys.stderr,
            )
            sys.exit(2)
        print(f"Loaded {len(names)} canonical source name(s) for orphan-prefix check.")
        for key in entries:
            prefix = key.split(":", 1)[0]
            if prefix not in names and key not in to_remove:
                to_remove[key] = "orphan_prefix"

    if args.date_in_key_older_than is not None:
        cutoff = today - timedelta(days=args.date_in_key_older_than)
        cutoff_s = cutoff.isoformat()
        for key in entries:
            if key in to_remove:
                continue
            d = extract_date_from_key(key)
            if d is not None and d < cutoff_s:
                to_remove[key] = "date_in_key_stale"

    if args.lastseen_older_than is not None:
        cutoff = today - timedelta(days=args.lastseen_older_than)
        cutoff_s = cutoff.isoformat()
        for key, entry in entries.items():
            if key in to_remove:
                continue
            # Fall back to resolvedAt when lastSeen is absent — this is the
            # implicit backfill for entries that predate the lastSeen field.
            stamp = entry.get("lastSeen") or entry.get("resolvedAt")
            if stamp is not None and stamp < cutoff_s:
                to_remove[key] = "lastseen_stale"

    by_reason = {}
    for reason in to_remove.values():
        by_reason[reason] = by_reason.get(reason, 0) + 1

    label = "Entries marked for removal (dry-run)" if args.dry_run else "Entries to remove"
    print(f"\n{label} ({len(to_remove)}):")
    for reason, n in sorted(by_reason.items(), key=lambda x: -x[1]):
        print(f"  - {reason}: {n}")

    sample = list(to_remove.items())
    if len(sample) <= 30:
        for k, r in sample:
            print(f"  [{r}] {k}")
    else:
        for k, r in sample[:20]:
            print(f"  [{r}] {k}")
        print(f"  ... ({len(sample) - 30} more) ...")
        for k, r in sample[-10:]:
            print(f"  [{r}] {k}")

    if args.dry_run:
        print("\n(dry-run — no upload)")
        return

    for key in to_remove:
        del entries[key]
    print(f"\nEntries after prune: {len(entries)}")
    upload_cache(cache)
    print(f"Done. Removed {len(to_remove)} entries from S3.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_stats = sub.add_parser("stats")
    p_stats.add_argument("--url", help="Override build-errors.json URL (default: live site)")
    p_stats.set_defaults(func=cmd_stats)

    p_out = sub.add_parser("outstanding")
    p_out.add_argument("--url", help="Override build-errors.json URL (default: live site)")
    p_out.add_argument("--limit", type=int, help="Max entries to print")
    p_out.set_defaults(func=cmd_outstanding)

    p_res = sub.add_parser("resolve")
    p_res.add_argument("--key", required=True, help="Cache key, e.g. events12:family-christmas-2025-12-01")
    p_res.add_argument("--start-time", help="HH:MM or HH:MM:SS in the event's local timezone")
    p_res.add_argument("--duration", type=int, help="Duration in seconds")
    p_res.add_argument("--location", help="Location string")
    p_res.add_argument("--image", help="Image URL")
    p_res.add_argument("--evidence", help="URL the resolver verified against")
    p_res.add_argument("--unresolvable", action="store_true", help="Mark as unresolvable")
    p_res.add_argument("--reason", help="Reason text (only with --unresolvable)")
    p_res.add_argument("--fingerprint", help="partialFingerprint to record (copy from outstanding listing)")
    p_res.add_argument("--force", action="store_true", help="Overwrite existing entry")
    p_res.set_defaults(func=cmd_resolve)

    p_pr = sub.add_parser("prune", help="Drop stale entries from the cache.")
    p_pr.add_argument(
        "--lastseen-older-than",
        type=int,
        help="Drop entries whose lastSeen (or resolvedAt fallback) is older than DAYS days.",
    )
    p_pr.add_argument(
        "--date-in-key-older-than",
        type=int,
        help="Drop entries whose key contains a parseable date older than DAYS days.",
    )
    p_pr.add_argument(
        "--orphan-prefixes",
        action="store_true",
        help="Drop entries whose source prefix isn't in sources/*/ripper.yaml or external/*.yaml.",
    )
    p_pr.add_argument(
        "--repo-root",
        default=".",
        help="Path to the repo root for --orphan-prefixes (default: current directory).",
    )
    p_pr.add_argument("--dry-run", action="store_true", help="Print what would be removed without uploading.")
    p_pr.set_defaults(func=cmd_prune)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
