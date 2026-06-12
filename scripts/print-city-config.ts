/**
 * Print values from the validated city config, for shell scripts and skill
 * helpers that can't import TypeScript directly.
 *
 * Usage:
 *   tsx scripts/print-city-config.ts                  # full config as JSON
 *   tsx scripts/print-city-config.ts site.productionUrl
 *   tsx scripts/print-city-config.ts city.name
 *
 * A dotted key prints the value at that path (strings raw, everything else
 * as JSON). An unknown path exits 1.
 */
import { CITY } from "../lib/config/city.js";

const key = process.argv[2];

if (!key) {
    console.log(JSON.stringify(CITY, null, 2));
    process.exit(0);
}

let value: unknown = CITY;
for (const part of key.split(".")) {
    if (value !== null && typeof value === "object" && part in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[part];
    } else {
        console.error(`Unknown city config path: ${key}`);
        process.exit(1);
    }
}

console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
