---
name: Secret Garden Books Events
status: candidate
platform: IndieCommerce
url: https://secretgardenbooks.com/upcoming-events
tags: [Literary, Books]
firstSeen: 2026-08-14
lastChecked: 2026-09-04
---

Phinney Ridge independent bookstore hosting author readings, book clubs, and literary events.

Confirmed live: page footer reads "Powered by IndieCommerce" (the American Booksellers
Association's Drupal-based e-commerce platform used by many indie bookstores). Verified
dated events: book club meetings Aug 27, Sep 17, Oct 15, Nov 19, Dec 17 2026, all 7:15pm
at the store. Low volume (mostly a monthly book club) but real and Seattle-focused (Phinney
Ridge). No ICS/JSON feed spotted; other IndieCommerce bookstore sources in this repo (if
any) may share a scraping pattern worth checking — otherwise HTML scraping of the
`/upcoming-events` listing.

Re-checked 2026-09-04: `/upcoming-events` now returns HTTP 403 from this
environment (previously untested with a direct fetch). Per the
"blocked here, don't implement" rule, leaving as `candidate` rather than
implementing or marking `blocked` outright — may be an intermittent WAF
rule rather than a hard block; re-test with a plain fetch next cycle
before staging for proxy testing.
