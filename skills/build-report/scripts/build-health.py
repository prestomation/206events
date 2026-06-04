#!/usr/bin/env python3
"""206.events build health check.

Usage:
    build-health.py [URL]   — fetch build-errors.json and print a health summary

Defaults to https://206.events/build-errors.json
"""

import json
import sys
import urllib.request

DEFAULT_URL = "https://206.events/build-errors.json"


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    with urllib.request.urlopen(url) as resp:
        d = json.loads(resp.read())

    config_errors = d.get("configErrors", [])
    ext_failures = d.get("externalCalendarFailures", [])
    zero_event = d.get("zeroEventCalendars", [])
    expected_empty = d.get("expectedEmptyCalendars", [])
    event_counts_raw = d.get("eventCounts", [])
    # eventCounts may be a list of {name, events, ...} objects or a plain dict
    if isinstance(event_counts_raw, list):
        event_counts = {e["name"]: e["events"] for e in event_counts_raw if "name" in e}
    else:
        event_counts = event_counts_raw
    geo_stats = d.get("geoStats", {})
    geo_errors = d.get("geocodeErrors", [])
    photo_stats = d.get("photoStats", {})
    photo_gaps = d.get("photoGaps", {})
    pending_proxy = d.get("pendingProxyVerification", [])
    timestamp = d.get("buildTimestamp", "unknown")

    total_errors = len(config_errors) + len(ext_failures) + len(geo_errors)

    print(f"Total errors: {total_errors}")
    print()

    if config_errors:
        print(f"Config errors ({len(config_errors)}):")
        for e in config_errors:
            print(f"  {e}")
        print()

    if ext_failures:
        print(f"External failures ({len(ext_failures)}):")
        for f in ext_failures:
            print(f"  {f['name']}: {f['error']}")
        print()

    if zero_event:
        print(f"Zero-event calendars ({len(zero_event)}):")
        for z in zero_event:
            print(f"  {z}")
        print()

    # expectedEmpty cross-check
    for cal in expected_empty:
        count = event_counts.get(cal, 0)
        if count > 0:
            print(f"⚠️  {cal} is marked expectEmpty but has {count} events — consider removing the expectEmpty flag")

    # Geo stats
    total_events = geo_stats.get("totalEvents", 0)
    with_geo = geo_stats.get("eventsWithGeo", 0)
    pct = round(with_geo / total_events * 100) if total_events else 0
    print(f"🗺️  Geo coverage: {with_geo} / {total_events} events ({pct}%)")
    if geo_errors:
        print(f"Geocode errors: {len(geo_errors)}")
        for e in geo_errors[:10]:
            print(f"  [{e['source']}] {e['location']} — {e['reason']}")
        if len(geo_errors) > 10:
            print(f"  ... and {len(geo_errors) - 10} more")
    else:
        print("No geocode errors ✅")

    # Photo coverage (non-fatal). Gaps feed the photo-resolver skill.
    print()
    p_total_ev = photo_stats.get("totalEvents", 0)
    p_with_ev = photo_stats.get("eventsWithImage", 0)
    p_total_vn = photo_stats.get("totalVenues", 0)
    p_with_vn = photo_stats.get("venuesWithImage", 0)
    ev_pct = round(p_with_ev / p_total_ev * 100) if p_total_ev else 0
    vn_pct = round(p_with_vn / p_total_vn * 100) if p_total_vn else 0
    venue_gaps = photo_gaps.get("venueGaps", [])
    event_gaps = photo_gaps.get("eventGaps", [])
    gap_count = len(venue_gaps) + len(event_gaps)
    print(f"🖼️  Photo coverage: {p_with_ev} / {p_total_ev} events ({ev_pct}%), "
          f"{p_with_vn} / {p_total_vn} venues ({vn_pct}%)")
    if gap_count:
        print(f"Missing photos: {gap_count} ({len(venue_gaps)} venues, {len(event_gaps)} events)")
        for v in venue_gaps[:10]:
            print(f"  [venue/{v.get('source')}] {v.get('name')}")
        for e in event_gaps[:10]:
            print(f"  [{e.get('source')}] {e.get('summary')} ({e.get('date')})")
        if gap_count > 20:
            print(f"  ... and {gap_count - 20} more")
        print("  → run skills/photo-resolver/SKILL.md to backfill photos")
    else:
        print("No missing photos ✅")

    # Proxy escalation-ladder verification queue (non-fatal)
    print()
    if pending_proxy:
        actionable = [p for p in pending_proxy
                      if p.get("recommendation") in ("promote-to-browserbase", "retire")]
        print(f"🪜 Proxy verification: {len(pending_proxy)} pending — {len(actionable)} ready to escalate")
        for p in pending_proxy:
            print(f"  {p.get('name')} ({p.get('rung')}, {p.get('consecutiveFailures')} fails) "
                  f"→ {p.get('recommendation')}"
                  + (f"  [{p.get('lastError')}]" if p.get('lastError') else ""))
        if actionable:
            print("  → run skills/proxy-escalation/SKILL.md to open escalation PR(s)")
    else:
        print("🪜 Proxy verification: 0 pending ✅")

    print(f"\nBuild timestamp: {timestamp}")


if __name__ == "__main__":
    main()