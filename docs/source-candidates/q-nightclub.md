---
name: "Q Nightclub"
status: blocked
platform: AXS (built-in `axs` type)
url: https://www.axs.com/venues/125609/q-nightclub-seattle-tickets
tags: [Nightlife, Capitol Hill]
firstSeen: 2026-08-19
lastChecked: 2026-08-19
pr:
---

21+ multilevel lounge/nightclub at 1426 Broadway, Capitol Hill. Ticketing
for headliner DJ nights runs through AXS (`venues/125609/q-nightclub-seattle-tickets`),
which is one of the built-in ripper types.

Investigated 2026-08-19: the AXS venue page returns **HTTP 403** both with a
plain `curl` and with full browser-spoofed headers (Chrome UA, `Accept`,
`Accept-Language`) — Cloudflare-style bot-protection challenge page, not a
transient block.

This matches the existing `sources/5thavenue/ripper.yaml` note: `disabled:
true # AXS/AMC bot protection blocks residential IP + Chrome OOM on 4GB
server`. Since AXS already blocks even a residential/out-of-band fetch for
another venue on this platform, this isn't a case where staging for
`requires-proxy-testing` would help — per the skill's "fetch fails locally
too" rule, recording as `blocked` rather than staging or implementing.
Revisit if AXS's bot protection changes or if a non-AXS feed for Q
Nightclub (e.g. a future ICS/API) surfaces.

Prior finding (2026-07-21, retained for history): primary ticketing also
appears on Tixr (`tixr.com/groups/qnightclub`), which is JS-rendered with no
public API and no visible calendar on qnightclub.com itself — also not
scrapeable without browser automation.
