/**
 * probe-proxy-sources.mjs — TEMPORARY diagnostic (not part of the build).
 *
 * Runs from a GitHub Actions runner (a real CI IP) to answer the question:
 * for each currently-proxied source, does a plain `fetch` succeed, and if not,
 * does a headless-browser fetch (the engine crawl4ai wraps) clear the block?
 *
 * This distinguishes:
 *   - JS-gated (sgcaptcha / JS challenge)  → browser clears it → crawl4ai in CI works
 *   - hard IP block (403 WAF page, no JS)  → browser can't help → needs residential
 *   - not blocked from CI at all           → could drop the proxy entirely
 *
 * The local dev environment can't reproduce this because its egress IP isn't a
 * GHA IP and SiteGround's response varies by IP reputation. Hence: run in CI.
 *
 * Output: a Markdown matrix to $GITHUB_STEP_SUMMARY and full JSON to stdout.
 */

import { chromium } from "playwright";
import { appendFileSync } from "fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Snapshot of every source currently carrying a proxy (kind: external ICS or ripper HTML page).
const SOURCES = [
  ["browserbase", "capitol-hill-seattle", "external", "https://www.capitolhillseattle.com/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "el-centro-de-la-raza", "external", "https://www.elcentrodelaraza.org/events/?ical=1"],
  ["browserbase", "seattledances", "external", "https://seattledances.com/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "earshot-jazz", "external", "https://www.earshot.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "urban-league-seattle", "external", "https://urbanleague.org/events-calendar/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "shunpike", "external", "https://shunpike.org/events/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "seattle-childrens-museum", "external", "https://seattlechildrensmuseum.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "woodland-park-zoo", "external", "https://zoo.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "langston", "external", "https://www.langstonseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "populus-seattle", "external", "https://populusseattle.com/events-calendar/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "early-music-seattle", "external", "https://earlymusicseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["browserbase", "hugo-house", "external", "https://hugohouse.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["outofband", "seattle-city-of-lit", "external", "https://tockify.com/api/feeds/ics/scolcalendar"],
  ["outofband", "impact-raves", "external", "https://impactraves.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["outofband", "go-latin-dance-seattle", "external", "https://golatindance.com/events/category/seattle/?ical=1"],
  ["outofband", "united-indians-daybreak-star", "external", "https://unitedindians.org/?post_type=tribe_events&ical=1"],
  ["outofband", "worksource-north-seattle", "external", "https://www.trumba.com/calendars/worksource-north-seattle.ics"],
  ["outofband", "seattle-dsa", "external", "https://seattledsa.org/?post_type=tribe_events&ical=1&eventDisplay=list"],
  ["outofband", "worksource-downtown-seattle", "external", "https://www.trumba.com/calendars/worksource-downtown-seattle.ics"],
  ["outofband", "wayward-music", "ripper", "https://www.waywardmusic.org/"],
  ["outofband", "flying-lion-brewing", "ripper", "https://flyinglionbrewing.com/events.html"],
];

function classify(body, kind) {
  const head = (body || "").slice(0, 2000);
  if (/^﻿?BEGIN:VCALENDAR/.test(head)) {
    const n = (body.match(/BEGIN:VEVENT/g) || []).length;
    return { verdict: "ICS", vevents: n };
  }
  if (/sgcaptcha|window\.location\.reload|challenge-platform|Just a moment|_Incapsula_|__cf_chl/i.test(head)) {
    return { verdict: "JS-CHALLENGE" };
  }
  if (/40[03]\s*[-–]?\s*Forbidden|Access Denied|Error 403|not authorized/i.test(head)) {
    return { verdict: "HARD-403" };
  }
  if (kind === "ripper" && /<html/i.test(head)) {
    return { verdict: "HTML-OK" };
  }
  return { verdict: "OTHER", snippet: head.replace(/\s+/g, " ").slice(0, 60) };
}

function originOf(u) {
  const x = new URL(u);
  return x.protocol + "//" + x.host + "/";
}

async function plainFetch(url, kind) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/calendar,text/html,*/*" }, signal: AbortSignal.timeout(30000) });
    const body = await r.text();
    return { status: r.status, ...classify(body, kind) };
  } catch (e) {
    return { status: "ERR", verdict: "ERROR", snippet: String(e).slice(0, 80) };
  }
}

async function browserFetch(browser, url, kind) {
  const ctx = await browser.newContext({ userAgent: UA });
  try {
    const page = await ctx.newPage();
    // Load origin root first to trigger + clear any JS bot-challenge (sets clearance cookie).
    let rootStatus;
    try {
      const resp = await page.goto(originOf(url), { waitUntil: "domcontentloaded", timeout: 45000 });
      rootStatus = resp?.status();
      await page.waitForTimeout(5000); // let challenge JS run + reload
    } catch (e) {
      rootStatus = "goto-err:" + String(e).slice(0, 40);
    }
    if (kind === "ripper") {
      // For rippers success = we can load the events page HTML (not a block page).
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2000);
        const html = await page.content();
        return { status: resp?.status(), rootStatus, ...classify(html, kind) };
      } catch (e) {
        return { status: "ERR", rootStatus, verdict: "ERROR", snippet: String(e).slice(0, 80) };
      }
    }
    // External ICS: fetch raw body via the context request client (shares cleared cookies).
    const r = await ctx.request.get(url, { headers: { "User-Agent": UA, Accept: "text/calendar,*/*" }, timeout: 45000 });
    const body = await r.text();
    return { status: r.status(), rootStatus, ...classify(body, kind) };
  } catch (e) {
    return { status: "ERR", verdict: "ERROR", snippet: String(e).slice(0, 80) };
  } finally {
    await ctx.close();
  }
}

const results = [];
const browser = await chromium.launch({ args: ["--no-sandbox"] });
console.log(`browser ${browser.version()} — probing ${SOURCES.length} sources from CI IP\n`);

for (const [proxy, name, kind, url] of SOURCES) {
  const plain = await plainFetch(url, kind);
  const browserRes = await browserFetch(browser, url, kind);
  const row = { proxy, name, kind, plain, browser: browserRes };
  results.push(row);
  console.log(JSON.stringify(row));
}
await browser.close();

// Build a verdict per source: does the browser rescue a plain-fetch failure?
function ok(v) { return v === "ICS" || v === "HTML-OK"; }
function summarize(r) {
  const p = ok(r.plain.verdict), b = ok(r.browser.verdict);
  if (p && b) return "✅ works direct (drop proxy?)";
  if (!p && b) return "🟡 browser rescues → **crawl4ai-in-CI**";
  if (!p && !b) return "🔴 browser can't clear → residential/retire";
  return "⚠️ plain-ok/browser-fail (noise)";
}

let md = "## 🧪 crawl4ai / browser proxy probe (from GHA IP)\n\n";
md += "| Source | Cur. proxy | Kind | Plain fetch | Browser fetch | Verdict |\n|---|---|---|---|---|---|\n";
for (const r of results) {
  const pv = `${r.plain.status} ${r.plain.verdict}${r.plain.vevents != null ? `(${r.plain.vevents})` : ""}`;
  const bv = `${r.browser.status} ${r.browser.verdict}${r.browser.vevents != null ? `(${r.browser.vevents})` : ""}`;
  md += `| \`${r.name}\` | ${r.proxy} | ${r.kind} | ${pv} | ${bv} | ${summarize(r)} |\n`;
}
md += "\nLegend: ICS=valid calendar, HTML-OK=ripper page loaded, JS-CHALLENGE=sgcaptcha/JS wall, HARD-403=static WAF block, ERROR=fetch threw.\n";

console.log("\n" + md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
