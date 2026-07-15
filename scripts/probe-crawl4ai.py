"""
probe-crawl4ai.py — TEMPORARY diagnostic (not part of the build).

Runs the *actual* crawl4ai stealth/undetected browser from a GitHub Actions IP
against the currently-proxied sources whose plain/vanilla-browser probe showed a
JS challenge (sgcaptcha). Question: does crawl4ai's stealth engine clear the
challenge from a CI IP where vanilla headless Chromium could not?

If crawl4ai also fails, the block is definitively IP-reputation-based and no
in-CI browser rung can rescue these — closing the "captcha but not network
restriction" hypothesis. Prints JSON per source + a verdict summary.
"""

import asyncio
import json
import sys

# JS-challenge subset from the vanilla-browser probe, plus 2 hard-403 controls.
SOURCES = [
    ("capitol-hill-seattle", "https://www.capitolhillseattle.com/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("seattledances", "https://seattledances.com/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("earshot-jazz", "https://www.earshot.org/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("urban-league-seattle", "https://urbanleague.org/events-calendar/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("shunpike", "https://shunpike.org/events/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("seattle-childrens-museum", "https://seattlechildrensmuseum.org/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("langston", "https://www.langstonseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("early-music-seattle", "https://earlymusicseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("impact-raves", "https://impactraves.org/?post_type=tribe_events&ical=1&eventDisplay=list"),
    ("seattle-dsa", "https://seattledsa.org/?post_type=tribe_events&ical=1&eventDisplay=list"),
    # hard-403 controls (expected: no browser helps)
    ("el-centro-de-la-raza", "https://www.elcentrodelaraza.org/events/?ical=1"),
    ("hugo-house", "https://hugohouse.org/?post_type=tribe_events&ical=1&eventDisplay=list"),
]


def classify(text: str):
    head = (text or "")[:2000]
    if "BEGIN:VCALENDAR" in head:
        return "ICS", (text or "").count("BEGIN:VEVENT")
    low = head.lower()
    if any(k in low for k in ("sgcaptcha", "window.location.reload", "challenge-platform", "just a moment")):
        return "JS-CHALLENGE", 0
    if "403" in head and "forbidden" in low:
        return "HARD-403", 0
    return "OTHER", 0


def make_browser_config():
    from crawl4ai import BrowserConfig
    # Try the richest stealth config this crawl4ai version supports, degrading
    # gracefully if a kwarg was renamed/removed.
    for kwargs in (
        dict(headless=True, enable_stealth=True, browser_mode="dedicated"),
        dict(headless=True, enable_stealth=True),
        dict(headless=True),
    ):
        try:
            return BrowserConfig(**kwargs), kwargs
        except TypeError:
            continue
    return BrowserConfig(), {}


def make_run_config():
    from crawl4ai import CrawlerRunConfig, CacheMode
    for kwargs in (
        dict(cache_mode=CacheMode.BYPASS, magic=True, simulate_user=True, override_navigator=True, page_timeout=60000),
        dict(cache_mode=CacheMode.BYPASS, magic=True, page_timeout=60000),
        dict(cache_mode=CacheMode.BYPASS),
    ):
        try:
            return CrawlerRunConfig(**kwargs)
        except TypeError:
            continue
    return CrawlerRunConfig()


async def main():
    from crawl4ai import AsyncWebCrawler

    bcfg, bkwargs = make_browser_config()
    rcfg = make_run_config()
    print(f"crawl4ai stealth probe — BrowserConfig kwargs used: {bkwargs}\n", flush=True)

    rows = []
    async with AsyncWebCrawler(config=bcfg) as crawler:
        for name, url in SOURCES:
            row = {"name": name}
            try:
                res = await crawler.arun(url=url, config=rcfg)
                # crawl4ai returns raw page HTML (and cleaned/markdown). For a text/calendar
                # endpoint the ICS body lands in .html; check all candidate fields.
                candidates = [getattr(res, "html", "") or "", getattr(res, "cleaned_html", "") or "",
                              getattr(res, "markdown", "") or "", getattr(res, "extracted_content", "") or ""]
                best = ("OTHER", 0)
                for c in candidates:
                    v = classify(c if isinstance(c, str) else str(c))
                    if v[0] == "ICS":
                        best = v
                        break
                    if v[0] == "JS-CHALLENGE" and best[0] == "OTHER":
                        best = v
                row["status"] = getattr(res, "status_code", None)
                row["success"] = getattr(res, "success", None)
                row["verdict"], row["vevents"] = best
            except Exception as e:  # noqa: BLE001
                row["verdict"] = "ERROR"
                row["error"] = str(e)[:160]
            rows.append(row)
            print(json.dumps(row), flush=True)

    cleared = [r for r in rows if r.get("verdict") == "ICS"]
    print("\n## 🤖 crawl4ai stealth probe (from GHA IP)\n")
    print("| Source | crawl4ai verdict | status |\n|---|---|---|")
    for r in rows:
        print(f"| `{r['name']}` | {r.get('verdict')}{('('+str(r.get('vevents'))+')') if r.get('vevents') else ''} | {r.get('status')} |")
    print(f"\n**crawl4ai cleared {len(cleared)}/{len(rows)} challenge sources from the CI IP.**")
    if not cleared:
        print("\nConclusion: crawl4ai's stealth engine does NOT clear these from a GHA IP — "
              "the block is IP-reputation-based, not a solvable-in-CI JS challenge.")


if __name__ == "__main__":
    asyncio.run(main())
