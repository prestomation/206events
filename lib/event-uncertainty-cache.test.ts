import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadUncertaintyCache } from "./event-uncertainty-cache.js";

describe("loadUncertaintyCache", () => {
    let dir: string;

    afterEach(async () => {
        if (dir) await rm(dir, { recursive: true, force: true });
    });

    it("returns an empty cache when the file doesn't exist (cold start)", async () => {
        dir = await mkdtemp(join(tmpdir(), "uncertainty-cache-"));
        const cache = await loadUncertaintyCache(join(dir, "does-not-exist.json"));
        expect(cache).toEqual({ version: 1, entries: {} });
    });

    it("loads a well-formed cache file", async () => {
        dir = await mkdtemp(join(tmpdir(), "uncertainty-cache-"));
        const file = join(dir, "cache.json");
        await writeFile(file, JSON.stringify({
            version: 1,
            entries: { "source:id": { unresolvable: true, reason: "test", resolvedAt: "2026-01-01", source: "manual" } },
        }));
        const cache = await loadUncertaintyCache(file);
        expect(cache.version).toBe(1);
        expect(cache.entries["source:id"].unresolvable).toBe(true);
    });

    // Regression test for the actual incident: event-uncertainty-cache.json
    // was missing its top-level "version" field, so this function's old
    // behavior (warn-and-fall-back-to-empty) silently discarded all 10,688
    // committed resolutions on every build for days, with nothing surfacing
    // the loss beyond a console.warn nobody was reading. It must now throw
    // on anything other than a missing file, so a broken committed cache
    // fails the build (index.ts sets process.exitCode = 1 on any uncaught
    // error from main()) and therefore the PR check, instead of silently
    // degrading.
    it("throws (does not silently fall back) when the version field is missing", async () => {
        dir = await mkdtemp(join(tmpdir(), "uncertainty-cache-"));
        const file = join(dir, "cache.json");
        await writeFile(file, JSON.stringify({ entries: { "source:id": { resolvedAt: "2026-01-01", source: "manual" } } }));
        await expect(loadUncertaintyCache(file)).rejects.toThrow(/unexpected shape/);
    });

    it("throws (does not silently fall back) on malformed JSON", async () => {
        dir = await mkdtemp(join(tmpdir(), "uncertainty-cache-"));
        const file = join(dir, "cache.json");
        await writeFile(file, "{ not valid json");
        await expect(loadUncertaintyCache(file)).rejects.toThrow(/not valid JSON/);
    });

    it("throws (does not silently fall back) when entries is the wrong type", async () => {
        dir = await mkdtemp(join(tmpdir(), "uncertainty-cache-"));
        const file = join(dir, "cache.json");
        await writeFile(file, JSON.stringify({ version: 1, entries: "not-an-object" }));
        await expect(loadUncertaintyCache(file)).rejects.toThrow(/unexpected shape/);
    });
});
