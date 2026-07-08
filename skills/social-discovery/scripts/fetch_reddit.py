#!/usr/bin/env python3
"""
Fetch r/SeattleEvents RSS feed, extract external URLs from posts,
dedup against already-covered sources, and output new candidate URLs.

Usage:
    python3 skills/reddit-discovery/scripts/fetch_reddit.py [--state .reddit-discovery-state.json]

Outputs JSON to stdout with:
  - total_posts: number of entries in the feed
  - new_posts: posts not seen in previous runs (by post ID)
  - candidates: list of {title, date, url, post_id, post_url} for new posts with external URLs
  - skipped: count of already-seen posts
  - errors: any errors encountered
"""

import argparse
import json
import os
import re
import sys
import html
import subprocess
import urllib.parse
from datetime import datetime, timezone

SUBREDDIT_RSS_URL = "https://old.reddit.com/r/seattleevents/.rss"
USER_AGENT = "Mozilla/5.0 (compatible; calendar-ripper/1.0; +https://206.events)"
STATE_FILE_DEFAULT = ".social-discovery-state.json"

# Domains to skip (reddit internals, image CDNs, social media that won't be event sources)
SKIP_DOMAINS = {
    "reddit.com", "old.reddit.com", "www.reddit.com",
    "preview.redd.it", "i.redd.it", "external-preview.redd.it",
    "redditstatic.com",
    "imgur.com",
}

# Social media domains — unlikely to be a dedicated event source
SOCIAL_DOMAINS = {
    "facebook.com", "www.facebook.com", "m.facebook.com",
    "instagram.com", "www.instagram.com",
    "twitter.com", "x.com",
    "tiktok.com", "www.tiktok.com",
    "youtube.com", "www.youtube.com",
}


def fetch_rss(url: str) -> str:
    """Fetch the RSS feed via curl (handles rate limiting better than urllib)."""
    result = subprocess.run(
        ["curl", "-s", "--max-time", "30",
         "-H", f"User-Agent: {USER_AGENT}",
         "-w", "\nHTTP_STATUS:%{http_code}",
         url],
        capture_output=True, text=True, timeout=45
    )
    output = result.stdout
    # Check for HTTP status
    status_match = re.search(r"HTTP_STATUS:(\d+)$", output)
    if status_match:
        status = int(status_match.group(1))
        content = output[:status_match.start()].rstrip()
        if status != 200:
            print(f"ERROR: HTTP {status} from Reddit (rate limited?)", file=sys.stderr)
            sys.exit(1)
        if not content.strip():
            print("ERROR: Empty response body", file=sys.stderr)
            sys.exit(1)
        return content
    return output


def parse_entries(rss_xml: str) -> list:
    """Parse Atom XML entries from the RSS feed."""
    entries = []
    # Match <entry>...</entry> blocks
    raw_entries = re.findall(r"<entry>(.*?)</entry>", rss_xml, re.DOTALL)
    for raw in raw_entries:
        entry = {}
        # Title
        title_m = re.search(r"<title>(.*?)</title>", raw, re.DOTALL)
        entry["title"] = html.unescape(title_m.group(1)) if title_m else ""
        # Post ID (e.g. t3_1uqwqij)
        id_m = re.search(r"<id>(.*?)</id>", raw, re.DOTALL)
        entry["id"] = id_m.group(1) if id_m else ""
        # Published date
        pub_m = re.search(r"<published>(.*?)</published>", raw, re.DOTALL)
        entry["published"] = pub_m.group(1) if pub_m else ""
        # Link (post URL)
        link_m = re.search(r'<link[^>]*href="([^"]+)"[^>]*/>', raw)
        entry["link"] = link_m.group(1) if link_m else ""
        # Content HTML
        content_m = re.search(r"<content[^>]*>(.*?)</content>", raw, re.DOTALL)
        content_html = html.unescape(content_m.group(1)) if content_m else ""
        entry["content"] = content_html
        # Extract all href URLs from content
        all_urls = re.findall(r'href="([^"]+)"', content_html)
        # Also find bare URLs in text (not in href attributes)
        text_urls = re.findall(r'(?:^|[^"])(https?://[^\s<>&"]+)', html.unescape(content_html))
        # Combine and dedupe
        all_urls = list(dict.fromkeys(all_urls + text_urls))
        # Filter out reddit-internal and image CDN URLs
        external_urls = []
        for url in all_urls:
            # Unescape HTML entities
            url = html.unescape(url)
            # Strip trailing punctuation
            url = url.rstrip(".,;:!?")
            # Parse domain
            try:
                parsed = urllib.parse.urlparse(url)
                domain = parsed.netloc.lower()
            except Exception:
                continue
            # Skip empty
            if not domain:
                continue
            # Skip reddit internals and image CDNs
            if any(domain == d or domain.endswith("." + d) for d in SKIP_DOMAINS):
                continue
            # Skip relative reddit links (e.g. /r/SeattleWA/...)
            if url.startswith("/"):
                continue
            external_urls.append(url)
        entry["external_urls"] = list(dict.fromkeys(external_urls))
        entries.append(entry)
    return entries


def load_state(path: str) -> dict:
    """Load the state file (set of seen post IDs)."""
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {"seen_posts": [], "last_run": None}


def save_state(path: str, state: dict):
    """Save the state file."""
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def classify_url(url: str) -> dict:
    """Classify a URL by platform/type."""
    parsed = urllib.parse.urlparse(url)
    domain = parsed.netloc.lower()
    path = parsed.path.lower()

    # Eventbrite
    if "eventbrite.com" in domain:
        if "/e/" in path:
            return {"platform": "eventbrite", "type": "single_event", "url": url}
        if "organizer" in path or "/o/" in path:
            return {"platform": "eventbrite", "type": "organizer", "url": url}
        return {"platform": "eventbrite", "type": "unknown", "url": url}

    # Ticketmaster / AXS
    if "ticketmaster.com" in domain:
        return {"platform": "ticketmaster", "type": "unknown", "url": url}
    if "axs.com" in domain:
        return {"platform": "axs", "type": "unknown", "url": url}

    # Squarespace
    if "squarespace.com" in domain:
        return {"platform": "squarespace", "type": "site", "url": url}

    # Eventbrite subdomains (e.g. hildegard26.eventbrite.com)
    if domain.endswith(".eventbrite.com"):
        return {"platform": "eventbrite", "type": "organizer_subdomain", "url": url}

    # TicketSpice
    if "ticketspice.com" in domain:
        return {"platform": "ticketspice", "type": "single_event", "url": url}

    # EventBookings
    if "eventbookings.com" in domain:
        return {"platform": "eventbookings", "type": "single_event", "url": url}

    # NeonCRM
    if "neoncrm.com" in domain or "app.neoncrm.com" in domain:
        return {"platform": "neoncrm", "type": "site", "url": url}

    # Rally (shuttle coordination, not event source)
    if "rally.co" in domain:
        return {"platform": "rally", "type": "not_event_source", "url": url}

    # Secret Seattle / Seattle Refined (content sites, not event sources)
    if "secretseattle.co" in domain:
        return {"platform": "content_site", "type": "not_event_source", "url": url}
    if "seattlerefined.com" in domain:
        return {"platform": "content_site", "type": "not_event_source", "url": url}

    # AttendTickets
    if "attendtickets.com" in domain:
        return {"platform": "attendtickets", "type": "site", "url": url}

    # Social media — Facebook events could be sources, but usually not
    if domain in SOCIAL_DOMAINS:
        return {"platform": "social", "type": "social_link", "url": url}

    # Default: unknown website
    return {"platform": "unknown", "type": "website", "url": url}


def main():
    parser = argparse.ArgumentParser(description="Fetch and parse r/SeattleEvents RSS for new event sources")
    parser.add_argument("--state", default=STATE_FILE_DEFAULT, help="Path to state file")
    parser.add_argument("--repo", default=".", help="Repo root path (for source directory listing)")
    args = parser.parse_args()

    repo_root = os.path.abspath(args.repo)
    state_path = os.path.join(repo_root, args.state) if not os.path.isabs(args.state) else args.state

    # Fetch RSS
    try:
        rss_xml = fetch_rss(SUBREDDIT_RSS_URL)
    except Exception as e:
        result = {"total_posts": 0, "new_posts": 0, "candidates": [], "skipped": 0,
                  "errors": [f"Fetch failed: {str(e)}"]}
        print(json.dumps(result, indent=2))
        sys.exit(1)

    # Parse entries
    entries = parse_entries(rss_xml)

    # Load state
    state = load_state(state_path)
    seen = set(state.get("seen_posts", []))

    # Filter to new posts
    new_entries = [e for e in entries if e["id"] and e["id"] not in seen]
    skipped = len(entries) - len(new_entries)

    # Build candidates list — posts with external URLs that aren't social/content sites
    candidates = []
    for entry in new_entries:
        for url in entry["external_urls"]:
            classification = classify_url(url)
            # Skip social links and content sites and rally
            if classification["type"] in ("not_event_source", "social_link"):
                continue
            candidates.append({
                "title": entry["title"],
                "date": entry["published"][:10] if entry["published"] else "",
                "post_id": entry["id"],
                "post_url": entry["link"],
                "url": url,
                "platform": classification["platform"],
                "url_type": classification["type"],
            })

    # Update state
    all_seen = list(seen | {e["id"] for e in new_entries if e["id"]})
    state["seen_posts"] = all_seen[-500:]  # Keep last 500 post IDs
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    save_state(state_path, state)

    # Output
    result = {
        "total_posts": len(entries),
        "new_posts": len(new_entries),
        "skipped": skipped,
        "candidates": candidates,
        "errors": [],
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()