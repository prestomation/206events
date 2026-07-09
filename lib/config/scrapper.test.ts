import { describe, it, expect, vi } from 'vitest';
import { HTMLRipper } from './htmlscrapper.js';
import { JSONRipper } from './jsonscrapper.js';
import { ZonedDateTime, Duration, ZoneRegion } from '@js-joda/core';
import { HTMLElement } from 'node-html-parser';
import { RipperEvent, Ripper } from './schema.js';
import '@js-joda/timezone';

// Mock implementations for testing
class TestHTMLRipper extends HTMLRipper {
  async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
    return [{
      id: 'test-event',
      ripped: new Date(),
      date: date,
      duration: Duration.ofHours(2),
      summary: 'Test Event',
      description: 'Test Description',
      location: 'Test Location',
      url: 'https://example.com'
    }];
  }
}

class TestJSONRipper extends JSONRipper {
  async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
    return [{
      id: 'json-event',
      ripped: new Date(),
      date: date,
      duration: Duration.ofHours(1),
      summary: jsonData.title || 'JSON Event',
      description: 'JSON Description',
      location: 'JSON Location',
      url: 'https://json.example.com'
    }];
  }
}

describe('HTMLRipper', () => {
  it('should process ripper configuration and generate calendars', async () => {
    const ripper = new TestHTMLRipper();
    
    const config: Ripper = {
      name: 'test-ripper',
      description: 'Test Ripper',
      config: {
        url: 'https://example.com',
        calendars: [{
          name: 'test-calendar',
          friendlyname: 'Test Calendar',
          timezone: ZoneRegion.of('America/Los_Angeles'),
          tags: ['test'],
          config: {}
        }]
      }
    };

    // Mock fetch to return HTML
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body>Test HTML</body></html>')
    });

    const calendars = await ripper.rip(config);
    
    expect(calendars).toHaveLength(1);
    expect(calendars[0].name).toBe('test-calendar');
    expect(calendars[0].friendlyname).toBe('Test Calendar');
    expect(calendars[0].events.length).toBeGreaterThan(0);
  });
});

describe('JSONRipper', () => {
  it('should process JSON data and generate calendars', async () => {
    const ripper = new TestJSONRipper();
    
    const config: Ripper = {
      name: 'json-ripper',
      description: 'JSON Test Ripper',
      config: {
        url: 'https://api.example.com/events',
        calendars: [{
          name: 'json-calendar',
          friendlyname: 'JSON Calendar',
          timezone: ZoneRegion.of('America/New_York'),
          tags: ['json'],
          config: {}
        }]
      }
    };

    // Mock fetch to return JSON
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ title: 'API Event', events: [] }))
    });

    const calendars = await ripper.rip(config);

    expect(calendars).toHaveLength(1);
    expect(calendars[0].name).toBe('json-calendar');
    expect(calendars[0].friendlyname).toBe('JSON Calendar');
    expect(calendars[0].events.length).toBeGreaterThan(0);
  });

  it('throws a diagnosable error when the response is not JSON', async () => {
    const ripper = new TestJSONRipper();

    const config: Ripper = {
      name: 'json-ripper',
      description: 'JSON Test Ripper',
      config: {
        url: 'https://api.example.com/events',
        calendars: [{
          name: 'json-calendar',
          friendlyname: 'JSON Calendar',
          timezone: ZoneRegion.of('America/New_York'),
          tags: ['json'],
          config: {}
        }]
      }
    };

    // A blocked/broken API returning a 200 HTML error page instead of JSON
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: () => Promise.resolve('<!DOCTYPE html><html><title>Error Page</title></html>')
    });

    await expect(ripper.rip(config)).rejects.toThrow(/Expected JSON but got content-type "text\/html/);
  });
});
