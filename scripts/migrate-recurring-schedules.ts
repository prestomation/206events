/**
 * One-off migrator: rewrite every `sources/recurring/*.yaml` from the old
 * top-level `schedule`/`start_time`/`duration`/`months`/`seasonal` shape into
 * the new required `schedules:` list, where each entry is self-contained.
 *
 * Uses the yaml package's Document API so leading `# verified: …` header
 * comments and field formatting are preserved. Run once:
 *
 *   tsx scripts/migrate-recurring-schedules.ts
 *
 * Then eyeball `git diff sources/recurring/` and hand-merge the Georgetown
 * Saturday/Sunday pair into a single multi-schedule file. Safe to delete this
 * script afterwards.
 */
import * as fs from "fs";
import * as path from "path";
import { parseDocument, YAMLMap, YAMLSeq } from "yaml";

const TIMING_KEYS = ["schedule", "start_time", "duration", "seasonal", "months"] as const;

const dir = path.join("sources", "recurring");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));

let migrated = 0;
let skipped = 0;

for (const file of files) {
    const full = path.join(dir, file);
    const text = fs.readFileSync(full, "utf8");
    const doc = parseDocument(text);
    // Loosely typed: parsed maps key on ParsedNode, but we address fields by
    // plain string here. This is a throwaway one-off migrator.
    const root: any = doc.contents;

    if (!(root instanceof YAMLMap)) {
        console.warn(`skip (not a map): ${file}`);
        skipped++;
        continue;
    }

    if (root.has("schedules")) {
        console.log(`skip (already migrated): ${file}`);
        skipped++;
        continue;
    }

    // Pull the timing key nodes off the top-level map, preserving their parsed
    // node form (so quoting/scalars/sequences are kept verbatim).
    const entry = new YAMLMap();
    for (const key of TIMING_KEYS) {
        if (root.has(key)) {
            const node = root.get(key, true); // keepScalar: keep the node, not the JS value
            entry.set(key, node);
            root.delete(key);
        }
    }

    if (!entry.has("schedule")) {
        console.warn(`skip (no schedule field): ${file}`);
        skipped++;
        continue;
    }

    // Append `schedules:` as a one-element sequence at the end of the map.
    const seq = new YAMLSeq();
    seq.add(entry);
    root.set("schedules", seq);

    // lineWidth: 0 disables line-wrapping so long descriptions stay on one line.
    fs.writeFileSync(full, doc.toString({ lineWidth: 0 }), "utf8");
    migrated++;
}

console.log(`\nmigrated ${migrated}, skipped ${skipped}, total ${files.length}`);
