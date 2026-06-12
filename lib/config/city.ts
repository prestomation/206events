// Node-side loader/validator for the repo-root city.config.ts.
//
// Build code imports the validated `CITY` from this module. Web code (and
// the web-reachable lib/config/tags.ts) must import the raw city.config.ts
// instead, so Zod stays out of the browser bundle. See docs/city-template.md.
import { z } from "zod";
import rawCityConfig from "../../city.config.js";

const latLngSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

const boundsSchema = z
    .object({
        south: z.number().min(-90).max(90),
        west: z.number().min(-180).max(180),
        north: z.number().min(-90).max(90),
        east: z.number().min(-180).max(180),
    })
    .refine(b => b.south < b.north && b.west < b.east, {
        message: "bounds must have south < north and west < east",
    });

const bboxSchema = z
    .object({
        latMin: z.number().min(-90).max(90),
        latMax: z.number().min(-90).max(90),
        lngMin: z.number().min(-180).max(180),
        lngMax: z.number().min(-180).max(180),
    })
    .refine(b => b.latMin < b.latMax && b.lngMin < b.lngMax, {
        message: "bbox must have latMin < latMax and lngMin < lngMax",
    });

export const cityConfigSchema = z
    .object({
        city: z.object({
            name: z.string().min(1),
            state: z.string().min(1),
            timezone: z.string().min(1),
        }),
        site: z.object({
            name: z.string().min(1),
            description: z.string().min(1),
            baseUrl: z
                .string()
                .url()
                .refine(u => u.endsWith("/"), { message: "baseUrl must end with a trailing slash" }),
            productionUrl: z
                .string()
                .url()
                .refine(u => !u.endsWith("/"), { message: "productionUrl must not end with a slash" }),
            repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "repo must be in owner/repo form"),
            bootLogoText: z.string().min(1),
        }),
        ics: z.object({
            prodId: z.string().min(1),
        }),
        geocoder: z.object({
            nominatimUserAgent: z.string().min(1),
            nominatimViewbox: boundsSchema,
        }),
        map: z.object({
            center: latLngSchema,
            defaultZoom: z.number().int().min(1).max(19),
            clampBounds: boundsSchema,
        }),
        venueSanityBbox: bboxSchema,
        neighborhoods: z
            .array(z.string().min(1))
            .min(1)
            .refine(list => new Set(list).size === list.length, {
                message: "neighborhoods must not contain duplicates",
            }),
        analytics: z.object({ goatcounterCode: z.string().min(1) }).nullable(),
    })
    .superRefine((cfg, ctx) => {
        const { center, clampBounds } = cfg.map;
        const bbox = cfg.venueSanityBbox;
        const inBounds =
            center.lat >= clampBounds.south && center.lat <= clampBounds.north &&
            center.lng >= clampBounds.west && center.lng <= clampBounds.east;
        if (!inBounds) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["map", "center"],
                message: "map.center must lie inside map.clampBounds",
            });
        }
        const clampInBbox =
            clampBounds.south >= bbox.latMin && clampBounds.north <= bbox.latMax &&
            clampBounds.west >= bbox.lngMin && clampBounds.east <= bbox.lngMax;
        if (!clampInBbox) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["map", "clampBounds"],
                message: "map.clampBounds must lie inside venueSanityBbox",
            });
        }
    });

export type CityConfig = z.infer<typeof cityConfigSchema>;

/**
 * Validate the committed city.config.ts, throwing a readable error listing
 * every invalid field. Runs once at module load (i.e. at build startup) so a
 * template user's broken edit fails fast instead of mid-build.
 */
export function validateCityConfig(raw: unknown = rawCityConfig): CityConfig {
    const parsed = cityConfigSchema.safeParse(raw);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map(i => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
        throw new Error(`city.config.ts is invalid:\n${issues}`);
    }
    return parsed.data;
}

export const CITY: CityConfig = validateCityConfig();
