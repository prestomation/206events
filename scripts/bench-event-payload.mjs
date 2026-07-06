#!/usr/bin/env node
/**
 * Event-payload format & scaling benchmark (see docs/event-payload-scaling.md).
 *
 * Measures, against a real events-index.json:
 *   1. serialized size (raw / gzip / brotli) across candidate formats
 *      (JSON, NDJSON, no-description, columnar, description-dictionary),
 *   2. full-corpus decode time for each,
 *   3. streaming economics: compressed prefix bytes needed to cover the
 *      first K days when the file is date-sorted NDJSON,
 *   4. vertical scaling: size + parse time with the corpus multiplied
 *      2/4/8x (a stand-in for "all events into the future"),
 *   5. a waste audit (past events, dedup-suppressed rows, duplicate
 *      description text).
 *
 * Usage:
 *   node scripts/bench-event-payload.mjs [path-or-url]
 *
 * Default input is https://206.events/events-index.json (downloaded to a
 * temp file). Pass a local path to re-run offline on a saved copy.
 *
 * Optional binary-format comparisons (MessagePack / CBOR) run only when the
 * packages are installed (`npm i --no-save @msgpack/msgpack cbor-x`); they
 * are deliberately not project dependencies. Node-only, no other deps.
 */
import { readFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

const arg = process.argv[2] ?? "https://206.events/events-index.json";
let rawText;
if (/^https?:\/\//.test(arg)) {
  console.log(`Fetching ${arg} ...`);
  const res = await fetch(arg);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${arg}`);
  rawText = await res.text();
} else {
  rawText = readFileSync(arg, "utf8");
}
const events = JSON.parse(rawText);
if (!Array.isArray(events)) throw new Error("input is not an array of events");

// -- helpers ------------------------------------------------------------
// Index dates are js-joda toString() output: `2026-07-06T17:00:00-07:00[America/Los_Angeles]`
// (the bracketed zone is absent on UTC entries). Strip the bracket, parse the rest.
const toMs = (s) => new Date(String(s).replace(/\[.*\]$/, "")).getTime();
const br = (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
const gz = (b) => gzipSync(b, { level: 9 });
const kb = (b) => `${(b.length / 1024).toFixed(0)} KB`.padStart(9);
const ndjson = (arr) => Buffer.from(arr.map((e) => JSON.stringify(e)).join("\n"));
const medianMs = (fn, reps = 7) => {
  const t = [];
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    fn();
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  return t[Math.floor(reps / 2)];
};
const sizeRow = (name, buf) => console.log(name.padEnd(40), kb(buf), kb(gz(buf)), kb(br(buf)));
const timeRow = (name, fn) => console.log(name.padEnd(46), `${medianMs(fn).toFixed(1).padStart(7)} ms`);

// -- variants ------------------------------------------------------------
const sorted = [...events].sort((a, b) => toMs(a.date) - toMs(b.date));
const noDesc = sorted.map(({ description, ...rest }) => rest);
const jsonBuf = Buffer.from(JSON.stringify(sorted));
const ndjsonBuf = ndjson(sorted);
const jsonNoDescBuf = Buffer.from(JSON.stringify(noDesc));
const ndjsonNoDescBuf = ndjson(noDesc);

// columnar (struct-of-arrays)
const keys = [...new Set(events.flatMap((e) => Object.keys(e)))];
const cols = Object.fromEntries(keys.map((k) => [k, sorted.map((e) => e[k] ?? null)]));
const columnarBuf = Buffer.from(JSON.stringify(cols));

// description dictionary: events carry `d` = index into a shared unique-description list
const descDict = [];
const descIdx = new Map();
const withDescRef = sorted.map((e) => {
  const { description, ...rest } = e;
  if (description) {
    if (!descIdx.has(description)) {
      descIdx.set(description, descDict.length);
      descDict.push(description);
    }
    rest.d = descIdx.get(description);
  }
  return rest;
});
const descRefBuf = ndjson(withDescRef);
const descDictBuf = Buffer.from(JSON.stringify(descDict));

console.log(`\n== 1. SIZES (${events.length} events) ==`);
console.log("".padEnd(40), "      raw", "     gzip", " brotli-9");
sizeRow("JSON array (current, date-sorted)", jsonBuf);
sizeRow("NDJSON", ndjsonBuf);
sizeRow("JSON minus description", jsonNoDescBuf);
sizeRow("NDJSON minus description", ndjsonNoDescBuf);
sizeRow("Columnar JSON (struct-of-arrays)", columnarBuf);
sizeRow("NDJSON w/ description ref (core)", descRefBuf);
sizeRow(`Description dictionary (${descDict.length} unique)`, descDictBuf);

// optional binary formats
try {
  const { encode: mpEncode, decode: mpDecode } = await import("@msgpack/msgpack");
  const mpBuf = Buffer.from(mpEncode(sorted));
  sizeRow("MessagePack (rows)", mpBuf);
  globalThis.__mp = { mpBuf, mpDecode };
} catch {
  console.log("(MessagePack skipped — @msgpack/msgpack not installed)");
}
try {
  const { Encoder } = await import("cbor-x");
  const enc = new Encoder({ structuredClone: false });
  const cborBuf = Buffer.from(enc.encode(sorted));
  sizeRow("CBOR (rows)", cborBuf);
  globalThis.__cbor = { cborBuf, enc };
} catch {
  console.log("(CBOR skipped — cbor-x not installed)");
}

console.log("\n== 2. FULL-CORPUS DECODE TIME (median of 7; mobile ~3-5x slower) ==");
const jsonStr = jsonBuf.toString();
const jsonNoDescStr = jsonNoDescBuf.toString();
const ndjsonStr = ndjsonBuf.toString();
const columnarStr = columnarBuf.toString();
timeRow("JSON.parse", () => JSON.parse(jsonStr));
timeRow("NDJSON split + parse per line", () => ndjsonStr.split("\n").map((l) => JSON.parse(l)));
timeRow("JSON.parse minus description", () => JSON.parse(jsonNoDescStr));
timeRow("columnar parse + rehydrate to rows", () => {
  const c = JSON.parse(columnarStr);
  const n = events.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = {};
    for (const k of keys) {
      const v = c[k][i];
      if (v !== null) o[k] = v;
    }
    out[i] = o;
  }
  return out;
});
if (globalThis.__mp) timeRow("MessagePack decode", () => globalThis.__mp.mpDecode(globalThis.__mp.mpBuf));
if (globalThis.__cbor) timeRow("CBOR decode", () => globalThis.__cbor.enc.decode(globalThis.__cbor.cborBuf));

console.log("\n== 3. STREAMING: compressed prefix bytes to cover first K days (date-sorted NDJSON) ==");
const now = Date.now();
for (const days of [2, 7, 14, 30]) {
  const cutoff = now + days * 86400e3;
  let idx = sorted.findIndex((e) => toMs(e.date) > cutoff);
  if (idx === -1) idx = sorted.length;
  const prefix = br(ndjson(sorted.slice(0, idx)));
  const prefixNoDesc = br(ndjson(noDesc.slice(0, idx)));
  console.log(
    `first ${String(days).padStart(2)}d: ${String(idx).padStart(5)} events |` +
      ` br prefix ${kb(prefix)} of ${kb(br(ndjsonBuf))} |` +
      ` no-desc ${kb(prefixNoDesc)} of ${kb(br(ndjsonNoDescBuf))}`,
  );
}

console.log("\n== 4. VERTICAL SCALING (corpus multiplied; summaries perturbed to keep rows distinct) ==");
console.log("events | raw MB | brotli | JSON.parse | parse no-desc");
for (const mult of [1, 2, 4, 8]) {
  const corpus = [];
  for (let i = 0; i < mult; i++) corpus.push(...sorted.map((e) => ({ ...e, summary: e.summary + (i ? ` v${i}` : "") })));
  const buf = Buffer.from(JSON.stringify(corpus));
  const bufND = Buffer.from(JSON.stringify(corpus.map(({ description, ...r }) => r)));
  const s = buf.toString();
  const sND = bufND.toString();
  console.log(
    String(corpus.length).padStart(6),
    "|",
    (buf.length / 1048576).toFixed(1).padStart(6),
    "|",
    kb(br(buf)).trim().padStart(7),
    "|",
    `${medianMs(() => JSON.parse(s), 5).toFixed(0).padStart(7)} ms`,
    "|",
    `${medianMs(() => JSON.parse(sND), 5).toFixed(0).padStart(10)} ms`,
  );
}

console.log("\n== 5. WASTE AUDIT ==");
const past = sorted.filter((e) => toMs(e.endDate ?? e.date) < now - 86400e3);
console.log(`past events (ended >24h ago): ${past.length} rows = ${kb(br(Buffer.from(JSON.stringify(past)))).trim()} brotli`);
const suppressed = sorted.filter((e) => e.duplicateOf);
console.log(`dedup-suppressed rows shipped: ${suppressed.length}`);
const descs = sorted.map((e) => e.description || "");
const unique = new Set(descs);
const dupBytes = Buffer.byteLength(descs.join("")) - [...unique].reduce((a, d) => a + Buffer.byteLength(d), 0);
console.log(
  `descriptions: ${descs.length} total, ${unique.size} unique — ${(dupBytes / 1048576).toFixed(1)} MB raw duplication (brotli mostly absorbs it)`,
);
console.log(`date range: ${sorted[0].date} -> ${sorted[sorted.length - 1].date}`);
