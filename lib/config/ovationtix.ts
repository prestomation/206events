import { ZonedDateTime, Duration, LocalDate, LocalTime, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "./schema.js";
import { getFetchForConfig, FetchFn } from "./proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_LOOKAHEAD_MONTHS = 6;
const DEFAULT_DURATION_MINUTES = 120;

/**
 * Shared ripper for venues that use the OvationTix (AudienceView Professional) ticketing platform.
 *
 * The calendar API requires a `clientId` header and an `Origin` header matching the
 * venue's website to satisfy CORS restrictions. The `url` field in ripper.yaml must
 * be the monthly calendar endpoint: https://api.ovationtix.com/public/calendar/client({clientId})
 *
 * Config fields (per calendar in ripper.yaml):
 *   - clientId:              OvationTix client ID (required)
 *   - clientOrigin:          Origin header value, e.g. https://taproottheatre.org (required)
 *   - venueAddress:          Fixed venue address. Omit for itinerant companies (geo: null sources).
 *                            When set, ticket URL is https://web.ovationtix.com/trs/pe.c/{clientId}.
 *                            When absent, ticket URL is per-production: https://ci.ovationtix.com/{clientId}/production/{productionId}.
 *   - defaultDurationMinutes: Event duration in minutes (optional, default 120)
 *   - lookaheadMonths:       Months ahead to fetch (optional, default 6)
 *
 * Event IDs use the pattern: ovationtix-{sourceName}-{performanceId}
 * where sourceName is the ripper's `name` field (e.g. "taproot", "spectrum-dance").
 */
export class OvationTixRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const sourceName = ripper.config.name;

        const results: RipperCalendar[] = [];

        for (const cal of ripper.config.calendars) {
            const clientId = cal.config?.clientId as number | undefined;
            const clientOrigin = cal.config?.clientOrigin as string | undefined;

            if (!clientId || !clientOrigin) {
                results.push({
                    name: cal.name,
                    friendlyname: cal.friendlyname,
                    events: [],
                    errors: [{
                        type: "ParseError",
                        reason: "Missing required config: clientId and clientOrigin",
                        context: cal.name
                    }],
                    parent: ripper.config,
                    tags: cal.tags || [],
                });
                continue;
            }

            const venueAddress = cal.config?.venueAddress as string | undefined;
            const durationMinutes = (cal.config?.defaultDurationMinutes as number | undefined) ?? DEFAULT_DURATION_MINUTES;
            const lookaheadMonths = (cal.config?.lookaheadMonths as number | undefined) ?? DEFAULT_LOOKAHEAD_MONTHS;

            try {
                const performances = await this.fetchAllPerformances(
                    ripper.config.url.toString(),
                    clientId,
                    clientOrigin,
                    lookaheadMonths,
                    fetchFn
                );
                const events = this.parseEvents(performances, sourceName, clientId, venueAddress, durationMinutes, cal.timezone);
                results.push({
                    name: cal.name,
                    friendlyname: cal.friendlyname,
                    events: events.filter(e => "date" in e) as RipperCalendarEvent[],
                    errors: events.filter(e => "type" in e) as RipperError[],
                    parent: ripper.config,
                    tags: cal.tags || [],
                });
            } catch (error) {
                results.push({
                    name: cal.name,
                    friendlyname: cal.friendlyname,
                    events: [],
                    errors: [{ type: "ParseError", reason: `OvationTix fetch failed: ${error}`, context: undefined }],
                    parent: ripper.config,
                    tags: cal.tags || [],
                });
            }
        }

        return results;
    }

    private async fetchAllPerformances(
        baseUrl: string,
        clientId: number,
        clientOrigin: string,
        lookaheadMonths: number,
        fetchFn: FetchFn
    ): Promise<any[]> {
        const now = LocalDate.now();
        const all: any[] = [];
        const seen = new Set<number>();

        for (let i = 0; i < lookaheadMonths; i++) {
            const target = now.plusMonths(i);
            const url = new URL(baseUrl);
            url.searchParams.set('month', String(target.monthValue()));
            url.searchParams.set('year', String(target.year()));

            const res = await fetchFn(url.toString(), {
                headers: {
                    'clientId': String(clientId),
                    'Origin': clientOrigin,
                    'Accept': 'application/json',
                }
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} for ${target.monthValue()}/${target.year()}`);
            }

            const data = await res.json() as { performancesByDateDisplay?: Record<string, any[]> };
            for (const perfs of Object.values(data.performancesByDateDisplay ?? {})) {
                for (const perf of perfs) {
                    if (typeof perf.performanceId === 'number' && !seen.has(perf.performanceId)) {
                        seen.add(perf.performanceId);
                        all.push(perf);
                    }
                }
            }
        }

        return all;
    }

    public parseEvents(
        performances: any[],
        sourceName: string,
        clientId: number,
        venueAddress: string | undefined,
        durationMinutes: number,
        timezone: any
    ): RipperEvent[] {
        const events: RipperEvent[] = [];
        const today = LocalDate.now();

        for (const perf of performances) {
            try {
                const localDateTime = this.parseDateTime(perf);
                if (!localDateTime) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for performance: ${perf.productionName}`,
                        context: `performanceDate: ${perf.performanceDate}, performanceTime24: ${perf.performanceTime24}`
                    });
                    continue;
                }

                if (localDateTime.toLocalDate().isBefore(today)) continue;

                const zonedDate = ZonedDateTime.of(localDateTime, timezone);
                const productionName = String(perf.productionName ?? '').trim();
                const summary = perf.performanceSuperTitle
                    ? `${productionName}: ${perf.performanceSuperTitle}`
                    : productionName;

                const descParts: string[] = [];
                if (perf.performanceSubTitle) descParts.push(String(perf.performanceSubTitle));
                if (perf.productionDescription) {
                    const stripped = this.stripHtml(String(perf.productionDescription));
                    if (stripped) descParts.push(stripped);
                }
                if (perf.performanceNotes) descParts.push(String(perf.performanceNotes));

                const url = venueAddress
                    ? `https://web.ovationtix.com/trs/pe.c/${clientId}`
                    : perf.productionId
                        ? `https://ci.ovationtix.com/${clientId}/production/${perf.productionId}`
                        : `https://ci.ovationtix.com/${clientId}`;

                events.push({
                    id: `ovationtix-${sourceName}-${perf.performanceId}`,
                    ripped: new Date(),
                    date: zonedDate,
                    duration: Duration.ofMinutes(durationMinutes),
                    summary,
                    description: descParts.length > 0 ? descParts.join('\n\n') : undefined,
                    location: venueAddress,
                    url,
                    imageUrl: perf.productionLogoLink || undefined,
                });
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse OvationTix performance: ${error}`,
                    context: JSON.stringify(perf).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseDateTime(perf: any): LocalDateTime | null {
        if (!perf.performanceDate || !perf.performanceTime24) return null;
        try {
            const [m, d, y] = String(perf.performanceDate).split('/').map(Number);
            if (isNaN(m) || isNaN(d) || isNaN(y)) return null;
            const date = LocalDate.of(y, m, d);
            const [h, min] = String(perf.performanceTime24).split(':').map(Number);
            if (isNaN(h) || isNaN(min)) return null;
            return LocalDateTime.of(date, LocalTime.of(h, min));
        } catch {
            return null;
        }
    }

    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]*>/g, ' ')
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
}
