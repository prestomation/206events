import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseHtml } from 'node-html-parser';
import '@js-joda/timezone';
import { parseArticle } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

const PUBLIC_ARTICLE = `
<article class="aldryn-events-article events-upcoming EventItem u-mb1">
  <div class="EventItem-image">
    <div class="SquareImage">
      <img class="SquareImage-image" src="/media/filer_public_thumbnails/test-band.jpg__400x400.jpg" alt="">
    </div>
    <div class="EventItem-DateTime">
      <h3>May 23rd</h3>
      <h5>3 p.m.</h5>
    </div>
  </div>
  <div class="EventItem-body">
    <h3 class="u-mb0"><a href="/events/kexp-events/test-band-live-on-kexp-kexp_111111/">Test Band LIVE on KEXP (OPEN TO THE PUBLIC)</a></h3>
  </div>
  <div class="EventItem-share">
    <a href="#" class="addeventatc">
      Add to Calendar
      <span class="start">05/23/2026 15:00</span>
      <span class="end">05/23/2026 15:30</span>
      <span class="timezone">America/Los_Angeles</span>
      <span class="title">Test Band LIVE on KEXP (OPEN TO THE PUBLIC)</span>
      <span class="location">KEXP Studio (NW Rooms)</span>
    </a>
  </div>
</article>`;

const PRIVATE_ARTICLE = `
<article class="aldryn-events-article events-upcoming EventItem u-mb1">
  <div class="EventItem-body">
    <h3 class="u-mb0"><a href="/events/kexp-events/private-band-live-on-kexp-kexp_222222/">Private Band LIVE on KEXP</a></h3>
  </div>
  <div class="EventItem-share">
    <a href="#" class="addeventatc">
      <span class="start">05/24/2026 10:00</span>
      <span class="end">05/24/2026 10:30</span>
      <span class="timezone">America/Los_Angeles</span>
    </a>
  </div>
</article>`;

const NO_WIDGET_ARTICLE = `
<article class="aldryn-events-article events-upcoming EventItem u-mb1">
  <div class="EventItem-body">
    <h3 class="u-mb0"><a href="/events/kexp-events/no-widget-kexp_333333/">No Widget LIVE on KEXP (OPEN TO THE PUBLIC)</a></h3>
  </div>
</article>`;

const NO_TITLE_ARTICLE = `
<article class="aldryn-events-article events-upcoming EventItem u-mb1">
  <div class="EventItem-body">
    <p>No title here</p>
  </div>
</article>`;

describe('parseArticle', () => {
    it('parses a public event correctly', () => {
        const article = parseHtml(PUBLIC_ARTICLE).querySelector('article');
        if (!article) throw new Error('Article element not found in PUBLIC_ARTICLE fixture');
        const result = parseArticle(article);

        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.summary).toBe('Test Band LIVE on KEXP (OPEN TO THE PUBLIC)');
            expect(result.id).toBe('kexp-test-band-live-on-kexp-kexp_111111');
            expect(result.url).toBe('https://www.kexp.org/events/kexp-events/test-band-live-on-kexp-kexp_111111/');
            expect(result.location).toContain('472 1st Ave N');
            expect(result.date.monthValue()).toBe(5);
            expect(result.date.dayOfMonth()).toBe(23);
            expect(result.date.hour()).toBe(15);
            expect(result.date.minute()).toBe(0);
            expect(result.duration.toMinutes()).toBe(30);
            expect(result.imageUrl).toBe('https://www.kexp.org/media/filer_public_thumbnails/test-band.jpg__400x400.jpg');
        }
    });

    it('parses a private event (caller decides to exclude it)', () => {
        const article = parseHtml(PRIVATE_ARTICLE).querySelector('article');
        if (!article) throw new Error('Article element not found in PRIVATE_ARTICLE fixture');
        const result = parseArticle(article);

        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.summary).toBe('Private Band LIVE on KEXP');
            expect(result.summary.includes('(OPEN TO THE PUBLIC)')).toBe(false);
        }
    });

    it('returns ParseError when calendar widget is missing', () => {
        const article = parseHtml(NO_WIDGET_ARTICLE).querySelector('article');
        if (!article) throw new Error('Article element not found in NO_WIDGET_ARTICLE fixture');
        const result = parseArticle(article);

        expect('type' in result).toBe(true);
        if ('type' in result) {
            expect(result.type).toBe('ParseError');
            expect(result.reason).toContain('calendar widget');
        }
    });

    it('returns ParseError when title element is missing', () => {
        const article = parseHtml(NO_TITLE_ARTICLE).querySelector('article');
        if (!article) throw new Error('Article element not found in NO_TITLE_ARTICLE fixture');
        const result = parseArticle(article);

        expect('type' in result).toBe(true);
        if ('type' in result) {
            expect(result.type).toBe('ParseError');
        }
    });
});

describe('parseArticle with sample HTML', () => {
    it('processes sample HTML and yields public events', () => {
        const html = loadSampleHtml();
        const root = parseHtml(html);
        const articles = root.querySelectorAll('article.aldryn-events-article');

        expect(articles.length).toBeGreaterThan(0);

        const events = [];
        const errors = [];
        const seen = new Set<string | undefined>();

        for (const article of articles) {
            const result = parseArticle(article);
            if ('date' in result) {
                const key = result.id ?? result.url;
                if (result.summary.includes('(OPEN TO THE PUBLIC)') && !seen.has(key)) {
                    seen.add(key);
                    events.push(result);
                }
            } else {
                errors.push(result);
            }
        }

        // All public events should parse without errors
        expect(errors).toHaveLength(0);
        // Should have multiple public in-studio events
        expect(events.length).toBeGreaterThanOrEqual(1);
        // Every event should have required fields
        for (const event of events) {
            expect(event.id).toMatch(/^kexp-/);
            expect(event.summary).toContain('(OPEN TO THE PUBLIC)');
            expect(event.url).toContain('kexp.org');
            expect(event.location).toContain('472 1st Ave N');
        }
        // At least one real event from the sample carries an absolute image URL
        const withImage = events.filter(e => e.imageUrl);
        expect(withImage.length).toBeGreaterThanOrEqual(1);
        for (const event of withImage) {
            expect(event.imageUrl).toMatch(/^https:\/\/www\.kexp\.org\//);
        }
    });
});
