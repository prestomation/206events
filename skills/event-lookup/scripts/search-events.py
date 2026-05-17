#!/usr/bin/env python3
"""Fuzzy event search against 206.events production data.

Reads cached events-index.json / manifest.json / venues.json from
$EVENT_LOOKUP_CACHE_DIR (default /tmp/206events), runs a deliberately
wide fuzzy search across title queries, venue/org queries, optional
date, and optional URL hostname, then prints structured JSON with the
top candidates and a per-dimension score breakdown.

The script does not decide what is a match. It surfaces candidates and
explains why each one scored. The caller (an LLM agent) reasons over
the output to determine whether anything is actually the same event.

Usage:
    search-events.py \
        --title "phoebe bridgers" \
        --title "isolation tour" \
        --venue "the showbox" \
        --date 2026-06-12 \
        --url "https://example.com/event/123" \
        --org "kexp"

All arguments are optional except that at least one of --title / --venue
/ --url / --org must be supplied. --title and --org may be repeated.
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable
from urllib.parse import urlparse

CACHE_DIR = os.environ.get("EVENT_LOOKUP_CACHE_DIR", "/tmp/206events")

# Boilerplate words that show up on posters or in event titles but carry
# almost no matching signal. Stripped before tokenisation; they still
# stay in the displayed `summary` field, only the comparison form drops
# them.
STOP_WORDS = {
    "a", "an", "the", "and", "or", "of", "at", "in", "on", "with",
    "feat", "ft", "featuring", "presents", "present", "presented",
    "live", "tour", "show", "concert", "concerts", "night", "nights",
    "evening", "an evening with", "vs", "v",
}

PUNCT_RE = re.compile(r"[^\w\s]+", re.UNICODE)
CAMEL_RE = re.compile(r"(?<=[a-z])(?=[A-Z])")

TOP_EVENT_CANDIDATES = 30
TOP_TITLE_ONLY = 10
TOP_SOURCE_VENUE = 8


def normalize(text: str) -> str:
    """Lowercase, strip diacritics, strip punctuation, split camelCase."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = CAMEL_RE.sub(" ", text)
    text = text.lower()
    text = PUNCT_RE.sub(" ", text)
    return " ".join(text.split())


def tokens(text: str) -> set[str]:
    norm = normalize(text)
    return {t for t in norm.split() if t and t not in STOP_WORDS}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def reverse_substring_score(query: str, target: str) -> float:
    """Return 1.0 if all non-stop tokens of either side are present in the
    other. This catches asymmetric overlaps like
    'phoebe bridgers isolation tour' vs 'phoebe bridgers'.
    """
    qt = tokens(query)
    tt = tokens(target)
    if not qt or not tt:
        return 0.0
    if qt.issubset(tt) or tt.issubset(qt):
        # full containment of the smaller side in the larger side
        return 1.0
    # partial: how much of the smaller side is in the larger side
    smaller, larger = (qt, tt) if len(qt) <= len(tt) else (tt, qt)
    if not smaller:
        return 0.0
    return len(smaller & larger) / len(smaller)


def hostname(url: str) -> str:
    if not url:
        return ""
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return ""
    return host.lower().removeprefix("www.")


def slug_tokens_from_url(url: str) -> set[str]:
    """Tokens extracted from the path of an event URL ("slug" form).
    Many sources put the headliner name in the URL slug."""
    if not url:
        return set()
    try:
        path = urlparse(url).path or ""
    except Exception:
        return set()
    return tokens(path.replace("/", " ").replace("-", " ").replace("_", " "))


# --- data loading ------------------------------------------------------


def load_cache() -> tuple[list[dict], dict, dict]:
    def read(name: str):
        path = os.path.join(CACHE_DIR, name)
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    events = read("events-index.json")
    manifest = read("manifest.json")
    venues = read("venues.json")
    return events, manifest, venues


def build_ics_to_source(manifest: dict) -> dict[str, dict]:
    """icsUrl -> {name, friendly, kind} for rippers, recurring entries
    and external feeds. The kind discriminates so the agent knows what
    *type* of source covers an event."""
    out: dict[str, dict] = {}
    for ripper in manifest.get("rippers", []):
        rname = ripper.get("name", "")
        rfriendly = ripper.get("description", "") or rname
        for cal in ripper.get("calendars", []):
            ics = cal.get("icsUrl")
            if ics:
                out[ics] = {
                    "name": rname,
                    "friendly": cal.get("friendlyName") or rfriendly,
                    "kind": "ripper",
                }
    for rec in manifest.get("recurringCalendars", []):
        ics = rec.get("icsUrl")
        if ics:
            out[ics] = {
                "name": rec.get("name", ""),
                "friendly": rec.get("friendlyName") or rec.get("name", ""),
                "kind": "recurring",
            }
    for ext in manifest.get("externalCalendars", []):
        ics = ext.get("icsUrl")
        if ics:
            out[ics] = {
                "name": ext.get("name", ""),
                "friendly": ext.get("friendlyName") or ext.get("name", ""),
                "kind": "external",
            }
    return out


# --- title scoring -----------------------------------------------------


@dataclass
class TitleScore:
    score: float
    matched_query: str
    via: str  # which sub-fn produced the max


def best_title_score(queries: list[str], event: dict) -> TitleScore:
    """Score the event title against every poster-extracted title query
    and return the best (score, query, via) tuple. Multiple sub-fns are
    tried per (query, target) pair and the max wins."""
    if not queries:
        return TitleScore(0.0, "", "")

    summary = event.get("summary") or ""
    description = (event.get("description") or "")[:300]
    url_slug_tokens = slug_tokens_from_url(event.get("url") or "")

    best = TitleScore(0.0, "", "")

    for q in queries:
        if not q:
            continue
        qt = tokens(q)

        candidates: list[tuple[float, str]] = [
            (ratio(q, summary), "ratio:summary"),
            (ratio(q, description), "ratio:description"),
            (jaccard(qt, tokens(summary)), "jaccard:summary"),
            (jaccard(qt, tokens(description)), "jaccard:description"),
            (reverse_substring_score(q, summary), "reverse_substring:summary"),
            (reverse_substring_score(q, description), "reverse_substring:description"),
            (jaccard(qt, url_slug_tokens) if url_slug_tokens else 0.0, "jaccard:url_slug"),
        ]
        s, via = max(candidates, key=lambda t: t[0])
        if s > best.score:
            best = TitleScore(s, q, via)

    return best


# --- venue scoring -----------------------------------------------------


@dataclass
class VenueScore:
    score: float
    matched_query: str
    via: str


def best_venue_score(
    venue_queries: list[str],
    event: dict,
    ripper_friendly_by_ics: dict[str, str],
    poster_host: str,
) -> VenueScore:
    if not venue_queries and not poster_host:
        return VenueScore(0.0, "", "")

    location = event.get("location") or ""
    ev_host = hostname(event.get("url") or "")
    ics = event.get("icsUrl") or ""
    ripper_friendly = ripper_friendly_by_ics.get(ics, "")

    best = VenueScore(0.0, "", "")

    # poster URL host vs event URL host — high-precision signal
    if poster_host and ev_host:
        if poster_host == ev_host:
            best = VenueScore(1.0, poster_host, "host:exact")
        elif poster_host.endswith("." + ev_host) or ev_host.endswith("." + poster_host):
            best = VenueScore(0.9, poster_host, "host:subdomain")

    for vq in venue_queries:
        if not vq:
            continue
        vqt = tokens(vq)

        candidates: list[tuple[float, str]] = [
            (ratio(vq, location), "ratio:location"),
            (jaccard(vqt, tokens(location)), "jaccard:location"),
            (reverse_substring_score(vq, location), "reverse_substring:location"),
        ]
        if ripper_friendly:
            candidates.append((ratio(vq, ripper_friendly), "ratio:ripper_friendly"))
            candidates.append(
                (jaccard(vqt, tokens(ripper_friendly)), "jaccard:ripper_friendly")
            )
            candidates.append(
                (reverse_substring_score(vq, ripper_friendly), "reverse_substring:ripper_friendly")
            )

        s, via = max(candidates, key=lambda t: t[0])
        if s > best.score:
            best = VenueScore(s, vq, via)

    return best


# --- date scoring ------------------------------------------------------


def parse_event_date(raw: str) -> dt.date | None:
    if not raw:
        return None
    # events-index dates look like "2026-06-12T20:00-07:00[America/Los_Angeles]"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if not m:
        return None
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def date_score(poster_date: dt.date | None, event: dict, window_days: int = 14) -> float:
    if not poster_date:
        return 0.0
    ev_date = parse_event_date(event.get("date") or "")
    if not ev_date:
        return 0.0
    delta = abs((poster_date - ev_date).days)
    if delta == 0:
        return 1.0
    if delta > window_days:
        return 0.0
    return max(0.0, 1.0 - (delta / window_days))


# --- org/performer scoring --------------------------------------------


def best_org_score(org_queries: list[str], event: dict) -> tuple[float, str]:
    if not org_queries:
        return 0.0, ""
    haystack = " ".join(filter(None, [event.get("summary"), event.get("description")]))[:600]
    if not haystack:
        return 0.0, ""
    haystack_tokens = tokens(haystack)
    best = (0.0, "")
    for q in org_queries:
        if not q:
            continue
        qt = tokens(q)
        substring = 1.0 if normalize(q) and normalize(q) in normalize(haystack) else 0.0
        jc = jaccard(qt, haystack_tokens)
        rt = ratio(q, haystack[:200])
        s = max(substring, jc, rt)
        if s > best[0]:
            best = (s, q)
    return best


# --- source/venue lookup (independent of events) ----------------------


def _score_friendly(
    friendly: str, name: str, link: str, venue_queries: list[str], poster_host: str
) -> tuple[float, str]:
    score = 0.0
    via = ""
    for vq in venue_queries:
        if not vq:
            continue
        candidates: list[tuple[float, str]] = [
            (ratio(vq, friendly), "ratio:friendly"),
            (jaccard(tokens(vq), tokens(friendly)), "jaccard:friendly"),
            (reverse_substring_score(vq, friendly), "reverse_substring:friendly"),
            (ratio(vq, name), "ratio:name"),
        ]
        s, v = max(candidates, key=lambda t: t[0])
        if s > score:
            score, via = s, v

    rhost = hostname(link)
    if poster_host and rhost:
        if poster_host == rhost and 1.0 > score:
            score, via = 1.0, "host:exact"
        elif (poster_host.endswith("." + rhost) or rhost.endswith("." + poster_host)) and 0.9 > score:
            score, via = 0.9, "host:subdomain"

    return score, via


def source_candidates(
    manifest: dict, venue_queries: list[str], poster_host: str, n: int = TOP_SOURCE_VENUE
) -> list[dict]:
    results: list[dict] = []

    for ripper in manifest.get("rippers", []):
        rname = ripper.get("name", "")
        friendly = ripper.get("description", "") or rname
        link = ripper.get("friendlyLink", "") or ""
        score, via = _score_friendly(friendly, rname, link, venue_queries, poster_host)
        if score > 0:
            results.append({
                "name": rname,
                "kind": "ripper",
                "friendly": friendly,
                "link": link,
                "score": round(score, 3),
                "matched_on": via,
                "tags": sorted({t for c in ripper.get("calendars", []) for t in (c.get("tags") or [])}),
            })

    for rec in manifest.get("recurringCalendars", []):
        rname = rec.get("name", "")
        friendly = rec.get("friendlyName") or rname
        score, via = _score_friendly(friendly, rname, "", venue_queries, poster_host)
        if score > 0:
            results.append({
                "name": rname,
                "kind": "recurring",
                "friendly": friendly,
                "link": "",
                "score": round(score, 3),
                "matched_on": via,
                "tags": rec.get("tags", []),
            })

    for ext in manifest.get("externalCalendars", []):
        ename = ext.get("name", "")
        friendly = ext.get("friendlyName") or ename
        link = ext.get("infoUrl") or ""
        score, via = _score_friendly(friendly, ename, link, venue_queries, poster_host)
        if score > 0:
            results.append({
                "name": ename,
                "kind": "external",
                "friendly": friendly,
                "link": link,
                "score": round(score, 3),
                "matched_on": via,
                "tags": ext.get("tags", []),
            })

    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:n]


def venue_candidates(
    venues_data: dict, venue_queries: list[str], poster_host: str, n: int = TOP_SOURCE_VENUE
) -> list[dict]:
    results: list[dict] = []
    for v in venues_data.get("venues", []):
        friendly = v.get("friendlyName", "") or v.get("name", "")
        link = v.get("url", "") or ""
        vhost = hostname(link)
        score = 0.0
        via = ""

        for vq in venue_queries:
            if not vq:
                continue
            candidates: list[tuple[float, str]] = [
                (ratio(vq, friendly), "ratio:friendly"),
                (jaccard(tokens(vq), tokens(friendly)), "jaccard:friendly"),
                (reverse_substring_score(vq, friendly), "reverse_substring:friendly"),
            ]
            geo_label = (v.get("geo") or {}).get("label", "")
            if geo_label:
                candidates.append((jaccard(tokens(vq), tokens(geo_label)), "jaccard:geo_label"))
            s, vi = max(candidates, key=lambda t: t[0])
            if s > score:
                score, via = s, vi

        if poster_host and vhost and poster_host == vhost and 1.0 > score:
            score, via = 1.0, "host:exact"

        if score > 0:
            results.append(
                {
                    "venue": v.get("name", ""),
                    "friendlyName": friendly,
                    "url": link,
                    "tags": v.get("tags", []),
                    "score": round(score, 3),
                    "matched_on": via,
                }
            )

    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:n]


# --- main scoring loop -------------------------------------------------


@dataclass
class ScoredEvent:
    score: float
    title: TitleScore
    venue: VenueScore
    date_s: float
    org_s: float
    org_query: str
    event: dict

    def to_dict(self, ics_to_source: dict[str, dict]) -> dict:
        ev = self.event
        ics = ev.get("icsUrl") or ""
        src = ics_to_source.get(ics, {})
        breakdown = {
            "title": round(self.title.score, 3),
            "venue": round(self.venue.score, 3),
            "date": round(self.date_s, 3),
            "org": round(self.org_s, 3),
        }
        reasons = []
        if self.title.score > 0:
            reasons.append(f"title({self.title.via}|q={self.title.matched_query!r})={self.title.score:.2f}")
        if self.venue.score > 0:
            reasons.append(f"venue({self.venue.via}|q={self.venue.matched_query!r})={self.venue.score:.2f}")
        if self.date_s > 0:
            reasons.append(f"date={self.date_s:.2f}")
        if self.org_s > 0:
            reasons.append(f"org(q={self.org_query!r})={self.org_s:.2f}")

        return {
            "score": round(self.score, 3),
            "summary": ev.get("summary"),
            "date": ev.get("date"),
            "location": ev.get("location"),
            "url": ev.get("url"),
            "icsUrl": ics,
            "source": {
                "name": src.get("name", ""),
                "friendly": src.get("friendly", ""),
                "kind": src.get("kind", ""),
            },
            "breakdown": breakdown,
            "matched_on": reasons,
        }


def score_events(
    events: list[dict],
    title_queries: list[str],
    venue_queries: list[str],
    org_queries: list[str],
    poster_date: dt.date | None,
    poster_host: str,
    ics_to_source: dict[str, dict],
) -> list[ScoredEvent]:
    ics_to_friendly: dict[str, str] = {ics: src.get("friendly", "") for ics, src in ics_to_source.items()}

    scored: list[ScoredEvent] = []
    for ev in events:
        ts = best_title_score(title_queries, ev)
        vs = best_venue_score(venue_queries, ev, ics_to_friendly, poster_host)
        ds = date_score(poster_date, ev)
        os_, oq = best_org_score(org_queries, ev)

        combined = (
            0.55 * ts.score
            + 0.25 * vs.score
            + 0.15 * ds
            + 0.05 * os_
        )

        if combined <= 0 and ts.score < 0.5 and vs.score < 0.5:
            continue

        scored.append(ScoredEvent(combined, ts, vs, ds, os_, oq, ev))

    return scored


# --- CLI ---------------------------------------------------------------


def main() -> int:
    global CACHE_DIR  # noqa: PLW0603

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--title", action="append", default=[],
                   help="Title/performer query (repeat for multiple).")
    p.add_argument("--venue", action="append", default=[],
                   help="Venue/promoter query (repeat for multiple).")
    p.add_argument("--org", action="append", default=[],
                   help="Organizer/series query (repeat for multiple).")
    p.add_argument("--date", help="Event date YYYY-MM-DD. Optional.")
    p.add_argument("--url", help="A URL printed on the poster. Optional.")
    p.add_argument("--cache-dir", default=CACHE_DIR,
                   help=f"Directory with cached data files (default {CACHE_DIR}).")
    args = p.parse_args()

    if not (args.title or args.venue or args.org or args.url):
        p.error("supply at least one of --title / --venue / --org / --url")

    CACHE_DIR = args.cache_dir

    poster_date: dt.date | None = None
    if args.date:
        try:
            poster_date = dt.date.fromisoformat(args.date)
        except ValueError:
            p.error(f"--date must be YYYY-MM-DD, got {args.date!r}")

    poster_host = hostname(args.url) if args.url else ""

    try:
        events, manifest, venues = load_cache()
    except FileNotFoundError as e:
        print(f"error: cache file missing ({e}). Run fetch-data.sh first.", file=sys.stderr)
        return 2

    ics_to_source = build_ics_to_source(manifest)

    scored = score_events(
        events,
        title_queries=args.title,
        venue_queries=args.venue,
        org_queries=args.org,
        poster_date=poster_date,
        poster_host=poster_host,
        ics_to_source=ics_to_source,
    )

    # combined-score lane
    combined_top = sorted(scored, key=lambda s: s.score, reverse=True)[:TOP_EVENT_CANDIDATES]
    # title-only lane: events with the best raw title score, regardless of
    # other dimensions. The agent reads this first when a poster has a
    # clear band name but unclear venue/date.
    title_top = sorted(scored, key=lambda s: s.title.score, reverse=True)
    seen_ids: set[str] = set()
    title_only: list[ScoredEvent] = []
    for s in title_top:
        key = (s.event.get("summary") or "") + "|" + (s.event.get("date") or "")
        if key in seen_ids:
            continue
        if s.title.score < 0.3:
            break
        title_only.append(s)
        seen_ids.add(key)
        if len(title_only) >= TOP_TITLE_ONLY:
            break

    out = {
        "queries": {
            "titles": args.title,
            "venues": args.venue,
            "orgs": args.org,
            "date": args.date,
            "url_host": poster_host or None,
        },
        "events_scanned": len(events),
        "title_only_matches": [s.to_dict(ics_to_source) for s in title_only],
        "event_candidates": [s.to_dict(ics_to_source) for s in combined_top],
        "source_candidates": source_candidates(manifest, args.venue, poster_host),
        "venue_candidates": venue_candidates(venues, args.venue, poster_host),
    }

    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
