import { describe, expect, test } from 'vitest';
import { extractJsonAfterMarker, extractNextFlightData, parseHoursRange, to24Hour } from './rsc-flight.js';

describe('extractNextFlightData / extractJsonAfterMarker', () => {
    test('reassembles a JSON array split across multiple __next_f.push chunks', () => {
        const html = [
            '<script>self.__next_f.push([1,"5:{\\"a\\":[{\\"id\\":1,"])</script>',
            '<script>self.__next_f.push([1,"\\"name\\":\\"Foo\\"}]}"])</script>',
        ].join('\n');
        const full = extractNextFlightData(html);
        const arr = extractJsonAfterMarker(full, '"a":[', '[', ']');
        expect(arr).toBeDefined();
        expect(JSON.parse(arr!)).toEqual([{ id: 1, name: 'Foo' }]);
    });

    test('ignores brackets inside quoted strings when bracket-matching', () => {
        const html = '<script>self.__next_f.push([1,"5:{\\"a\\":[{\\"name\\":\\"[bracket] in title\\"}]}"])</script>';
        const full = extractNextFlightData(html);
        const arr = extractJsonAfterMarker(full, '"a":[', '[', ']');
        expect(JSON.parse(arr!)).toEqual([{ name: '[bracket] in title' }]);
    });

    test('returns undefined when the marker is not present', () => {
        const full = extractNextFlightData('<script>self.__next_f.push([1,"5:{}"])</script>');
        expect(extractJsonAfterMarker(full, '"initialEvents":[', '[', ']')).toBeUndefined();
    });
});

describe('to24Hour', () => {
    test('converts 12-hour clock strings to 24-hour', () => {
        expect(to24Hour('12', 'AM')).toBe(0);
        expect(to24Hour('12', 'PM')).toBe(12);
        expect(to24Hour('1', 'PM')).toBe(13);
        expect(to24Hour('11', 'AM')).toBe(11);
    });
});

describe('parseHoursRange', () => {
    test('parses a compact single-meridiem range like "5-9pm"', () => {
        expect(parseHoursRange('5-9pm')).toEqual({ startHour: 17, startMinute: 0, endHour: 21, endMinute: 0 });
    });

    test('parses a compact range with minutes on one side, e.g. "5:30-9pm"', () => {
        expect(parseHoursRange('5:30-9pm')).toEqual({ startHour: 17, startMinute: 30, endHour: 21, endMinute: 0 });
    });

    test('still parses the full two-meridiem format', () => {
        expect(parseHoursRange('4:00 PM - 7:00 PM')).toEqual({ startHour: 16, startMinute: 0, endHour: 19, endMinute: 0 });
    });

    test('infers AM for the start of a compact range that crosses noon, e.g. "9-5pm"', () => {
        expect(parseHoursRange('9-5pm')).toEqual({ startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 });
    });

    test('returns null for an unrecognized format', () => {
        expect(parseHoursRange('TBD')).toBeNull();
    });
});
