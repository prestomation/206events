#!/usr/bin/env python3
"""206.events dead source checker.

Usage:
    dead-sources.py [URL]   — check build-errors.json for sources with 0 events or failures

Defaults to https://206.events/build-errors.json
"""

import json
import sys
import urllib.request

DEFAULT_URL = "https://206.events/build-errors.json"


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    # Cloudflare 403s urllib's default User-Agent from cloud sandboxes; send
    # a browser-like one so this works there too.
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; 206events-skill/1.0)"})
    with urllib.request.urlopen(req) as resp:
        d = json.loads(resp.read())

    zero_event = d.get("zeroEventCalendars", [])
    ext_failures = d.get("externalCalendarFailures", [])

    print(f"Zero-event calendars: {len(zero_event)}")
    for z in zero_event:
        print(f"  {z}")

    print(f"\nExternal failures: {len(ext_failures)}")
    for f in ext_failures:
        name = f.get("name", "unknown")
        error = f.get("error", "unknown")
        print(f"  {name}: {error}")


if __name__ == "__main__":
    main()