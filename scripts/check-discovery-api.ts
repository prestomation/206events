/**
 * Post-build validator for the HATEOAS discovery API.
 *
 * Runs after `generate-calendars` to assert that every file referenced by
 * `output/index.json` exists on disk, that every doc parses against its
 * Zod schema, that hrefs are relative, and that tag slugs are consistent
 * with `lib/tag_aggregator.ts`.
 *
 * Usage:
 *   tsx scripts/check-discovery-api.ts [output-dir]
 *
 * Default output-dir is `output`.
 */

import { readFile, stat } from "fs/promises";
import { join } from "path";
import {
  indexDocSchema,
  tagsDocSchema,
  venuesDocSchema,
  tagSlug,
} from "../lib/discovery.js";
import { categoryFor } from "../lib/config/tags.js";
import { CITY } from "../lib/config/city.js";

// Generous regional bounding box — a venue coordinate outside it is a
// geocoding bug. Configured per city in city.config.ts.
const VENUE_BBOX = CITY.venueSanityBbox;

const VENUES_JSON_MAX_KB = 500;

// Every doc in the index links directly to other files. All of these are
// required to exist on disk for the discovery API to be usable.
const REQUIRED_LINK_TARGETS = [
  "self",
  "llms",
  "tags",
  "venues",
  "calendars",
  "events",
  "buildErrors",
  "geoCache",
] as const;

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function fail(errors: string[], msg: string) {
  errors.push(msg);
}

async function main() {
  const outputDir = process.argv[2] ?? "output";
  const errors: string[] = [];

  console.log(`Checking discovery API under ${outputDir}/`);

  // -------------------------------------------------------------------------
  // index.json
  // -------------------------------------------------------------------------
  const indexPath = join(outputDir, "index.json");
  if (!(await fileExists(indexPath))) {
    console.error(`❌ ${indexPath} missing`);
    process.exit(1);
  }

  const indexRaw = await readJson<unknown>(indexPath);
  const indexParsed = indexDocSchema.safeParse(indexRaw);
  if (!indexParsed.success) {
    console.error("❌ index.json failed schema validation:");
    for (const issue of indexParsed.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  const indexDoc = indexParsed.data;
  console.log(`✓ index.json parses (${Object.keys(indexDoc.links).length} links)`);

  // Every link must be relative and point at an existing file.
  for (const key of REQUIRED_LINK_TARGETS) {
    const link = (indexDoc.links as Record<string, { href: string }>)[key];
    if (!link) {
      fail(errors, `index.json is missing required link: ${key}`);
      continue;
    }
    if (/^https?:\/\//i.test(link.href)) {
      fail(errors, `index.json link "${key}" is absolute: ${link.href}`);
      continue;
    }
    const targetPath = join(outputDir, link.href);
    if (!(await fileExists(targetPath))) {
      fail(errors, `index.json link "${key}" → ${link.href} does not exist on disk`);
    }
  }

  // -------------------------------------------------------------------------
  // tags.json
  // -------------------------------------------------------------------------
  const tagsPath = join(outputDir, "tags.json");
  const tagsRaw = await readJson<unknown>(tagsPath);
  const tagsParsed = tagsDocSchema.safeParse(tagsRaw);
  if (!tagsParsed.success) {
    console.error("❌ tags.json failed schema validation:");
    for (const issue of tagsParsed.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  const tagsDoc = tagsParsed.data;
  console.log(`✓ tags.json parses (${tagsDoc.tags.length} tags)`);

  for (const tag of tagsDoc.tags) {
    // Slug parity with tag_aggregator.ts — enforced via shared helper.
    if (tag.slug !== tagSlug(tag.name)) {
      fail(
        errors,
        `tags.json[${tag.name}].slug "${tag.slug}" does not match tagSlug() rule (expected "${tagSlug(tag.name)}")`,
      );
    }

    // Aggregate ICS and RSS must exist on disk.
    const icsPath = join(outputDir, tag.links.ics.href);
    if (!(await fileExists(icsPath))) {
      fail(errors, `tags.json[${tag.name}].links.ics → ${tag.links.ics.href} does not exist`);
    }
    const rssPath = join(outputDir, tag.links.rss.href);
    if (!(await fileExists(rssPath))) {
      fail(errors, `tags.json[${tag.name}].links.rss → ${tag.links.rss.href} does not exist`);
    }

    if (/^https?:\/\//i.test(tag.links.ics.href) || /^https?:\/\//i.test(tag.links.rss.href)) {
      fail(errors, `tags.json[${tag.name}] has absolute link hrefs`);
    }
  }

  // -------------------------------------------------------------------------
  // venues.json
  // -------------------------------------------------------------------------
  const venuesPath = join(outputDir, "venues.json");
  const venuesRawStr = await readFile(venuesPath, "utf8");
  const venuesSizeKB = Buffer.byteLength(venuesRawStr, "utf8") / 1024;
  if (venuesSizeKB > VENUES_JSON_MAX_KB) {
    fail(
      errors,
      `venues.json is ${venuesSizeKB.toFixed(1)} KB (budget: ${VENUES_JSON_MAX_KB} KB). Split or trim venue metadata.`,
    );
  }

  const venuesRaw = JSON.parse(venuesRawStr);
  const venuesParsed = venuesDocSchema.safeParse(venuesRaw);
  if (!venuesParsed.success) {
    console.error("❌ venues.json failed schema validation:");
    for (const issue of venuesParsed.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  const venuesDoc = venuesParsed.data;
  console.log(
    `✓ venues.json parses (${venuesDoc.venues.length} venues, ${venuesSizeKB.toFixed(1)} KB)`,
  );

  for (const venue of venuesDoc.venues) {
    // Bounding-box sanity check — nothing outside the city's region should
    // end up tagged as a local venue, and a wrong-sign longitude would
    // make it past the schema but wreck the map UI.
    const { lat, lng, osmId, osmType } = venue.geo;
    if (
      lat < VENUE_BBOX.latMin ||
      lat > VENUE_BBOX.latMax ||
      lng < VENUE_BBOX.lngMin ||
      lng > VENUE_BBOX.lngMax
    ) {
      fail(
        errors,
        `venues.json[${venue.name}] geo (${lat}, ${lng}) is outside the regional bounding box`,
      );
    }

    // Every venue (a source with a fixed location) must carry at least one
    // registered Neighborhoods tag. The homepage groups venues into area
    // headings purely by neighborhood tag — an untagged venue silently falls
    // into "Citywide" instead of its real neighborhood. Failing here forces a
    // deliberate choice: tag the venue with a registered neighborhood, register
    // a new one in TAG_CATEGORIES.Neighborhoods, or set `geo: null` if the
    // source is genuinely distributed and shouldn't be a venue at all.
    if (!venue.tags.some(t => categoryFor(t) === "Neighborhoods")) {
      fail(
        errors,
        `venues.json[${venue.name}] has a location but no registered neighborhood tag ` +
          `(tags: ${JSON.stringify(venue.tags)}). Add a neighborhood tag from ` +
          `TAG_CATEGORIES.Neighborhoods (lib/config/tags.ts) — register a new one if needed — ` +
          `or set geo: null if the source is distributed (not a single venue).`,
      );
    }

    // osmId/osmType must either both be present or both be absent. The Zod
    // schema enforces this already; this check is a belt-and-suspenders
    // against a future regression that skips the refinement.
    if ((osmId === undefined) !== (osmType === undefined)) {
      fail(
        errors,
        `venues.json[${venue.name}] has mismatched OSM fields (osmId=${osmId}, osmType=${osmType})`,
      );
    }

    // Map links are EXTERNAL absolute URLs (Google Maps / OpenStreetMap), the
    // inverse of the on-disk `links` hrefs — assert they are well-formed http(s)
    // and never crawled as local files.
    if (!/^https?:\/\//i.test(venue.map.web)) {
      fail(errors, `venues.json[${venue.name}].map.web is not an absolute http(s) URL: ${venue.map.web}`);
    }
    if (venue.map.osm !== undefined && !/^https?:\/\/(www\.)?openstreetmap\.org\//i.test(venue.map.osm)) {
      fail(errors, `venues.json[${venue.name}].map.osm is not an OpenStreetMap URL: ${venue.map.osm}`);
    }

    // Venue photo, when present, must be an absolute http(s) link (we store
    // URLs, never image bytes).
    if (venue.imageUrl !== undefined && !/^https?:\/\//i.test(venue.imageUrl)) {
      fail(errors, `venues.json[${venue.name}].imageUrl is not an absolute http(s) URL: ${venue.imageUrl}`);
    }

    for (const calendar of venue.calendars) {
      if (/^https?:\/\//i.test(calendar.links.ics.href) || /^https?:\/\//i.test(calendar.links.rss.href)) {
        fail(errors, `venues.json[${venue.name}] has absolute calendar link hrefs`);
      }
      const icsPath = join(outputDir, calendar.links.ics.href);
      if (!(await fileExists(icsPath))) {
        fail(errors, `venues.json[${venue.name}].calendars[${calendar.name}] → ${calendar.links.ics.href} missing`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // llms.txt
  // -------------------------------------------------------------------------
  const llmsPath = join(outputDir, "llms.txt");
  if (!(await fileExists(llmsPath))) {
    fail(errors, "llms.txt is missing from output/");
  } else {
    const llmsContent = await readFile(llmsPath, "utf8");
    if (!llmsContent.trim().startsWith("#")) {
      fail(errors, "llms.txt must start with an H1 header per llmstxt.org convention");
    }
    if (!/index\.json/.test(llmsContent)) {
      fail(errors, "llms.txt must reference index.json as the discovery entry point");
    }
    console.log(`✓ llms.txt present (${(Buffer.byteLength(llmsContent, "utf8") / 1024).toFixed(1)} KB)`);
  }

  // -------------------------------------------------------------------------
  // sitemap.xml
  // -------------------------------------------------------------------------
  const sitemapPath = join(outputDir, "sitemap.xml");
  if (!(await fileExists(sitemapPath))) {
    fail(errors, "sitemap.xml is missing from output/");
  } else {
    console.log("✓ sitemap.xml present");
  }

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  if (errors.length > 0) {
    console.error(`\n❌ Discovery API check failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`   - ${e}`);
    process.exit(1);
  }

  console.log("\n✓ Discovery API check passed.");
}

main().catch(err => {
  console.error("Discovery API check crashed:", err);
  process.exit(1);
});
