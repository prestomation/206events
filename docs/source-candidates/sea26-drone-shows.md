---
status: added
firstSeen: 2026-06-06
lastChecked: 2026-06-06
pr: 509
---

## SEA 26 Drone Shows

Source discovered from a poster/email by a resident of Escala: Visit Seattle is running free
drone shows at Seattle Center following each of Seattle's 6 FIFA World Cup 26™ matches.

- **URL:** https://www.visitseattle.org/sea26/drone-show/
- **Type:** Custom HTML ripper (IRipper)
- **Platform:** WordPress / custom Visit Seattle page
- **Tags:** Events, QueenAnne, Sports
- **Geo:** International Fountain, Seattle Center

### Schedule (as of 2026-06-06)

- Monday, June 15 at 10pm (Belgium vs. Egypt)
- Friday, June 19 – showtime TBD (USA vs. Australia)
- Wednesday, June 24 at 10pm (Bosnia-Herzegovina vs. Qatar)
- Friday, June 26 after 11pm (Egypt vs. IR Iran)
- Wednesday, July 1 at 11:30pm (Match 82)
- Monday, July 6 – showtime TBD (Match 94)

### Implementation notes

- HTML structure: `<ul><li><strong>date/time</strong> (match)</li></ul>` under an `<h3>Drone Show Times</h3>` heading
- TBD times emit `UncertaintyError` via the event-uncertainty system
- "show after 11pm" treated as approximate (11pm start, flagged in description)
- Events expire naturally as match dates pass
