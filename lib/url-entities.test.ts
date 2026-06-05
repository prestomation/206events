import { describe, it, expect } from "vitest";
import {
    findHtmlEntities,
    containsHtmlEntity,
    decodeUrlEntities,
    checkUrlField,
    formatUrlEntityError,
} from "./url-entities.js";

describe("findHtmlEntities", () => {
    it("flags named entities", () => {
        expect(findHtmlEntities("https://x.com/?a=1&amp;b=2")).toEqual(["&amp;"]);
        expect(findHtmlEntities("a&lt;b&gt;c")).toEqual(["&lt;", "&gt;"]);
        expect(findHtmlEntities("say &quot;hi&quot; &apos;yo&apos;")).toEqual(["&quot;", "&apos;"]);
        expect(findHtmlEntities("foo&nbsp;bar")).toEqual(["&nbsp;"]);
    });

    it("flags decimal and hex numeric references", () => {
        expect(findHtmlEntities("https://x.com/?q&#38;r")).toEqual(["&#38;"]);
        expect(findHtmlEntities("https://x.com/?q&#x26;r")).toEqual(["&#x26;"]);
    });

    it("is case-insensitive and de-duplicates", () => {
        expect(findHtmlEntities("a&amp;b&AMP;c&amp;d")).toEqual(["&amp;"]);
        expect(findHtmlEntities("&#X26;&#x26;")).toEqual(["&#X26;"]);
    });

    it("does NOT flag a bare ampersand (legitimate query separator)", () => {
        expect(findHtmlEntities("https://x.com/?a=1&b=2&c=3")).toEqual([]);
        expect(containsHtmlEntity("https://x.com/?a=1&b=2")).toBe(false);
    });

    it("does NOT flag ampersand-word that is not a known entity", () => {
        // `&band` and `&section` are not in the known set, and have no `;`.
        expect(findHtmlEntities("https://x.com/?genre=r&band=foo")).toEqual([]);
    });

    it("returns [] for non-strings and empty strings", () => {
        expect(findHtmlEntities(undefined)).toEqual([]);
        expect(findHtmlEntities(null)).toEqual([]);
        expect(findHtmlEntities(123)).toEqual([]);
        expect(findHtmlEntities("")).toEqual([]);
    });
});

describe("decodeUrlEntities", () => {
    it("decodes entities to literal characters", () => {
        expect(decodeUrlEntities("https://x.com/?a=1&amp;b=2")).toBe("https://x.com/?a=1&b=2");
        expect(decodeUrlEntities("https://x.com/?q&#38;r")).toBe("https://x.com/?q&r");
    });

    it("leaves clean URLs untouched", () => {
        const clean = "https://x.com/?a=1&b=2";
        expect(decodeUrlEntities(clean)).toBe(clean);
    });
});

describe("checkUrlField", () => {
    it("returns an error record for an offending value", () => {
        const err = checkUrlField("event", "nectar", "all-events", "event.url", "https://x.com/?a=1&amp;b=2");
        expect(err).not.toBeNull();
        expect(err).toMatchObject({
            scope: "event",
            source: "nectar",
            calendar: "all-events",
            field: "event.url",
            entities: ["&amp;"],
        });
    });

    it("returns null for clean / empty / non-string values", () => {
        expect(checkUrlField("ripper", "x", undefined, "url", "https://x.com/?a=1&b=2")).toBeNull();
        expect(checkUrlField("ripper", "x", undefined, "imageUrl", "")).toBeNull();
        expect(checkUrlField("ripper", "x", undefined, "imageUrl", undefined)).toBeNull();
    });
});

describe("formatUrlEntityError", () => {
    it("produces an actionable one-liner", () => {
        const msg = formatUrlEntityError({
            scope: "ripper",
            source: "foo",
            calendar: undefined,
            field: "friendlyLink",
            value: "https://foo.com/?a=1&amp;b=2",
            entities: ["&amp;"],
        });
        expect(msg).toContain("&amp;");
        expect(msg).toContain('ripper "foo"');
        expect(msg).toContain("friendlyLink");
        expect(msg).toContain("decode");
    });
});
