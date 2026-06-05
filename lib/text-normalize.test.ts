import { describe, it, expect } from "vitest";
import { decodeEntities } from "./text-normalize.js";

describe("decodeEntities", () => {
    it("decodes named entities in titles", () => {
        expect(decodeEntities("Greg Hoy &amp; the Boys")).toBe("Greg Hoy & the Boys");
        expect(decodeEntities("&quot;Live&quot; &apos;Show&apos;")).toBe('"Live" \'Show\'');
        expect(decodeEntities("a &lt; b &gt; c")).toBe("a < b > c");
    });

    it("decodes decimal and hex numeric references", () => {
        expect(decodeEntities("Tom &#38; Jerry")).toBe("Tom & Jerry");
        expect(decodeEntities("Tom &#x26; Jerry")).toBe("Tom & Jerry");
    });

    it("leaves bare ampersands untouched (not entities)", () => {
        expect(decodeEntities("AT&T")).toBe("AT&T");
        expect(decodeEntities("Q&A with the band")).toBe("Q&A with the band");
        expect(decodeEntities("Tom & Jerry")).toBe("Tom & Jerry");
    });

    it("is idempotent — decoding already-clean text is a no-op", () => {
        const once = decodeEntities("Greg Hoy &amp; the Boys");
        expect(decodeEntities(once)).toBe(once);
        expect(decodeEntities("Greg Hoy & the Boys")).toBe("Greg Hoy & the Boys");
    });

    it("fully resolves genuinely double-encoded source", () => {
        // A second pass is exactly what double-encoded input needs.
        expect(decodeEntities("Tom &amp;amp; Jerry")).toBe("Tom &amp; Jerry");
        expect(decodeEntities(decodeEntities("Tom &amp;amp; Jerry"))).toBe("Tom & Jerry");
    });

    it("passes through empty and nullish input unchanged", () => {
        expect(decodeEntities("")).toBe("");
        // @ts-expect-error exercising defensive runtime guard
        expect(decodeEntities(undefined)).toBe(undefined);
    });
});
