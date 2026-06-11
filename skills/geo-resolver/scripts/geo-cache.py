#!/usr/bin/env python3
"""206.events geo-cache operations.

Usage:
    geo-cache.py stats           — print geo coverage and error list from build-errors.json
    geo-cache.py analyze         — fetch the published geo-cache and categorize unresolvable entries
    geo-cache.py coverage URL    — print geo coverage from a build-errors.json URL

The geo-cache lives in the GitHub Actions Cache (persisted per build) and
is published read-only at https://206.events/geo-cache.json. There is no
S3 and no agent-writable store: fix a miss by adding the venue to
KNOWN_VENUE_COORDS in lib/geocoder.ts (a code change, committed via PR).
Stale unresolvable entries self-heal — a cold Actions cache re-geocodes
every location with the current normalization logic, so legacy dirty keys
do not carry forward. See docs/github-native-caches.md.
"""

import json
import sys

DEFAULT_ERRORS_URL = "https://206.events/build-errors.json"
DEFAULT_GEOCACHE_URL = "https://206.events/geo-cache.json"


def fetch_json(url):
    """Fetch JSON from a URL, exiting with a friendly message on failure.

    The published site sits behind Cloudflare, which can 403 some IPs (e.g.
    cloud sandboxes) or be transiently unreachable. Surface that as a clear
    one-line error rather than an unhandled urllib traceback.
    """
    import urllib.request
    import urllib.error
    try:
        with urllib.request.urlopen(url) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, ValueError) as e:
        print(f"Failed to fetch {url}: {e}", file=sys.stderr)
        sys.exit(1)


def get_build_errors(url=None):
    """Fetch build-errors.json from the live site or a custom URL."""
    return fetch_json(url or DEFAULT_ERRORS_URL)


def cmd_stats():
    """Print geo coverage and geocode error list."""
    d = get_build_errors()
    gs = d.get("geoStats", {})
    errs = d.get("geocodeErrors", [])
    total = gs.get("totalEvents", 0)
    with_geo = gs.get("eventsWithGeo", 0)
    pct = round(with_geo / total * 100) if total else 0
    print(f"Geo coverage: {with_geo} / {total} events ({pct}%)")
    print(f"Geocode errors: {len(errs)}")
    for e in errs:
        print(f"  [{e['source']}] {e['location']} — {e['reason']}")


def cmd_analyze():
    """Fetch the published geo-cache and categorize unresolvable entries.

    Read-only inspection of https://206.events/geo-cache.json (the build
    mirrors the GitHub Actions Cache copy into the published site). There is
    no purge step: stale unresolvable entries self-heal on a cold Actions
    cache, and named-venue misses are fixed in code via KNOWN_VENUE_COORDS.
    """
    cache = fetch_json(DEFAULT_GEOCACHE_URL)

    unresolvable = {k: v for k, v in cache["entries"].items() if v.get("unresolvable")}
    print(f"Total unresolvable: {len(unresolvable)}")

    # Group by likely cause
    virtual = [k for k in unresolvable if any(x in k for x in ["zoom", "online", "virtual", "tba", "tbd", "webinar", "http"])]
    dirty = [k for k in unresolvable if any(x in k for x in ["\\,", "\\;", "<br", "&amp", "&#"])]
    truncated = [k for k in unresolvable if len(k) > 40 and k[-1].isalpha() and k[-2].isalpha()]
    has_address = [k for k in unresolvable if any(c.isdigit() for c in k[:8]) and k not in virtual]
    venue_only = [k for k in unresolvable if not any(c.isdigit() for c in k) and k not in virtual + dirty]

    print(f"  Virtual/TBA (correct): {len(virtual)}")
    print(f"  Dirty keys (legacy — self-heal on cold cache): {len(dirty)}")
    print(f"  Truncated strings (legacy — self-heal on cold cache): {len(truncated)}")
    print(f"  Has street address (fixable?): {len(has_address)}")
    print(f"  Venue name only (add to KNOWN_VENUE_COORDS?): {len(venue_only)}")

    print("\nVenue-only sample:")
    for k in sorted(venue_only)[:20]:
        print(f"  {k!r}")


def cmd_coverage(url):
    """Print geo coverage from a build-errors.json URL."""
    d = fetch_json(url)
    gs = d.get("geoStats", {})
    total = gs.get("totalEvents", 0)
    with_geo = gs.get("eventsWithGeo", 0)
    pct = round(with_geo / total * 100) if total else 0
    print(f"{with_geo} / {total} ({pct}%)")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "stats":
        cmd_stats()
    elif cmd == "analyze":
        cmd_analyze()
    elif cmd == "coverage":
        url = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_ERRORS_URL
        cmd_coverage(url)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()