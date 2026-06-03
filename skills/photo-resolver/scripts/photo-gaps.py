#!/usr/bin/env python3
"""206.events photo-gap queue inspector.

Reads the `photoGaps` / `photoStats` section of the published (or local)
build-errors.json so the photo-resolver skill has a deterministic work queue.

Usage:
    photo-gaps.py stats [--url URL]
        Print photo coverage (events + venues) and the gap counts.

    photo-gaps.py venues [--url URL] [--limit N]
        Print venue gaps (no imageUrl) — fixable by adding `imageUrl:` to the
        source YAML.

    photo-gaps.py events [--url URL] [--limit N]
        Print event gaps (no imageUrl) — fixable via the event-uncertainty
        cache: `uncertainty-cache.py resolve --key <source:eventId> --image-url`.

--url defaults to the live site. Pass a local path or a PR-preview URL to
inspect a specific build, e.g.
    photo-gaps.py stats --url output/build-errors.json
    photo-gaps.py stats --url https://206.events/preview/123/build-errors.json
"""

import argparse
import json
import sys
import urllib.request

DEFAULT_ERRORS_URL = "https://206.events/build-errors.json"


def load(url):
    if url.startswith("http://") or url.startswith("https://"):
        with urllib.request.urlopen(url) as resp:
            return json.loads(resp.read())
    with open(url) as f:
        return json.load(f)


def cmd_stats(args):
    d = load(args.url or DEFAULT_ERRORS_URL)
    s = d.get("photoStats", {})
    gaps = d.get("photoGaps", {})
    total_ev = s.get("totalEvents", 0)
    with_ev = s.get("eventsWithImage", 0)
    total_vn = s.get("totalVenues", 0)
    with_vn = s.get("venuesWithImage", 0)
    ev_pct = round(with_ev / total_ev * 100) if total_ev else 0
    vn_pct = round(with_vn / total_vn * 100) if total_vn else 0
    print(f"Photo coverage (events): {with_ev} / {total_ev} ({ev_pct}%)")
    print(f"Photo coverage (venues): {with_vn} / {total_vn} ({vn_pct}%)")
    print(f"Venue gaps: {len(gaps.get('venueGaps', []))}")
    print(f"Event gaps: {len(gaps.get('eventGaps', []))}")
    print(f"Confirmed unresolvable (events): {s.get('unresolvable', 0)}")


def cmd_venues(args):
    d = load(args.url or DEFAULT_ERRORS_URL)
    venue_gaps = d.get("photoGaps", {}).get("venueGaps", [])
    if not venue_gaps:
        print("No venue photo gaps.")
        return
    limit = args.limit or len(venue_gaps)
    for v in venue_gaps[:limit]:
        print(f"[{v.get('source')}] {v.get('name')}")
        if v.get("label"):
            print(f"  where: {v['label']}")
        if v.get("url"):
            print(f"  url:   {v['url']}")
        if v.get("mapUrl"):
            print(f"  map:   {v['mapUrl']}")
        print()
    if len(venue_gaps) > limit:
        print(f"... and {len(venue_gaps) - limit} more (use --limit to show more)")


def cmd_events(args):
    d = load(args.url or DEFAULT_ERRORS_URL)
    event_gaps = d.get("photoGaps", {}).get("eventGaps", [])
    if not event_gaps:
        print("No event photo gaps.")
        return
    limit = args.limit or len(event_gaps)
    for e in event_gaps[:limit]:
        key = f"{e['source']}:{e['eventId']}"
        print(f"[{key}]")
        print(f"  title: {e.get('summary', '?')}")
        print(f"  date:  {e.get('date', '?')}")
        print(f"  url:   {e.get('url', '(none)')}")
        print()
    if len(event_gaps) > limit:
        print(f"... and {len(event_gaps) - limit} more (use --limit to show more)")


def main():
    p = argparse.ArgumentParser(description="206.events photo-gap queue inspector")
    sub = p.add_subparsers(dest="cmd", required=True)

    for name in ("stats", "venues", "events"):
        sp = sub.add_parser(name)
        sp.add_argument("--url", help="build-errors.json URL or local path")
        if name != "stats":
            sp.add_argument("--limit", type=int, help="max entries to show")

    args = p.parse_args()
    {"stats": cmd_stats, "venues": cmd_venues, "events": cmd_events}[args.cmd](args)


if __name__ == "__main__":
    main()
