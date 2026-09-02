import { describe, it, expect } from 'vitest';
import { LocationParser } from '../src/location-parser.js';

describe('LocationParser', () => {
  describe('parse — US locations', () => {
    it('parses "San Francisco, CA"', () => {
      const result = LocationParser.parse('San Francisco, CA');
      expect(result.city).toBe('San Francisco');
      expect(result.region).toBe('California');
      expect(result.country).toBe('United States');
      expect(result.isRemote).toBe(false);
    });

    it('parses "New York, New York, United States"', () => {
      const result = LocationParser.parse('New York, New York, United States');
      expect(result.city).toBe('New York');
      expect(result.region).toBe('New York');
      expect(result.country).toBe('United States');
    });

    it('parses "Austin, TX"', () => {
      const result = LocationParser.parse('Austin, TX');
      expect(result.city).toBe('Austin');
      expect(result.region).toBe('Texas');
      expect(result.country).toBe('United States');
    });

    it('parses "California" as US state', () => {
      const result = LocationParser.parse('California');
      expect(result.region).toBe('California');
      expect(result.country).toBe('United States');
      expect(result.city).toBeNull();
    });
  });

  describe('parse — Canadian locations', () => {
    it('parses "Toronto, Ontario, Canada"', () => {
      const result = LocationParser.parse('Toronto, Ontario, Canada');
      expect(result.city).toBe('Toronto');
      expect(result.region).toBe('Ontario');
      expect(result.country).toBe('Canada');
    });

    it('parses "Vancouver, British Columbia"', () => {
      const result = LocationParser.parse('Vancouver, British Columbia');
      expect(result.city).toBe('Vancouver');
      expect(result.region).toBe('British Columbia');
      expect(result.country).toBe('Canada');
    });
  });

  describe('parse — Nigerian locations', () => {
    it('parses "Lagos, Nigeria"', () => {
      const result = LocationParser.parse('Lagos, Nigeria');
      expect(result.city).toBe('Lagos');
      expect(result.country).toBe('Nigeria');
    });

    it('parses "Abuja, Federal Capital Territory"', () => {
      const result = LocationParser.parse('Abuja, Federal Capital Territory');
      expect(result.city).toBe('Abuja');
      expect(result.region).toBe('Federal Capital Territory');
      expect(result.country).toBe('Nigeria');
    });
  });

  describe('parse — European locations', () => {
    it('parses "Berlin, Germany"', () => {
      const result = LocationParser.parse('Berlin, Germany');
      expect(result.city).toBe('Berlin');
      expect(result.country).toBe('Germany');
    });

    it('parses "London, United Kingdom"', () => {
      const result = LocationParser.parse('London, United Kingdom');
      expect(result.city).toBe('London');
      expect(result.country).toBe('United Kingdom');
    });

    it('parses "London, UK"', () => {
      const result = LocationParser.parse('London, UK');
      expect(result.city).toBe('London');
      expect(result.country).toBe('United Kingdom');
    });
  });

  describe('parse — Remote locations', () => {
    it('parses "Remote"', () => {
      const result = LocationParser.parse('Remote');
      expect(result.isRemote).toBe(true);
      expect(result.country).toBeNull();
      expect(result.city).toBeNull();
    });

    it('parses "Remote — United States"', () => {
      const result = LocationParser.parse('Remote — United States');
      expect(result.isRemote).toBe(true);
      expect(result.country).toBe('United States');
    });

    it('parses "Remote - US"', () => {
      const result = LocationParser.parse('Remote - US');
      expect(result.isRemote).toBe(true);
      expect(result.country).toBe('United States');
    });

    it('parses "Work from home"', () => {
      const result = LocationParser.parse('Work from home');
      expect(result.isRemote).toBe(true);
    });

    it('parses "Anywhere"', () => {
      const result = LocationParser.parse('Anywhere');
      expect(result.isRemote).toBe(true);
    });

    it('parses "Worldwide"', () => {
      const result = LocationParser.parse('Worldwide');
      expect(result.isRemote).toBe(true);
    });
  });

  describe('parse — Country-only', () => {
    it('parses "United States"', () => {
      const result = LocationParser.parse('United States');
      expect(result.country).toBe('United States');
      expect(result.city).toBeNull();
    });

    it('parses "Nigeria"', () => {
      const result = LocationParser.parse('Nigeria');
      expect(result.country).toBe('Nigeria');
    });

    it('parses "Singapore"', () => {
      const result = LocationParser.parse('Singapore');
      expect(result.country).toBe('Singapore');
    });
  });

  describe('parse — Edge cases', () => {
    it('handles empty string', () => {
      const result = LocationParser.parse('');
      expect(result.country).toBeNull();
      expect(result.city).toBeNull();
      expect(result.isRemote).toBe(false);
    });

    it('handles "Unspecified"', () => {
      const result = LocationParser.parse('Unspecified');
      expect(result.country).toBeNull();
      expect(result.city).toBeNull();
    });

    it('preserves raw location', () => {
      const result = LocationParser.parse('San Francisco, CA');
      expect(result.raw).toBe('San Francisco, CA');
    });
  });

  describe('parseMultiple', () => {
    it('extracts best result from multiple locations', () => {
      const result = LocationParser.parseMultiple([
        'San Francisco, CA',
        'Remote',
        'New York, NY',
      ]);
      expect(result.country).toBe('United States');
      expect(result.city).toBe('San Francisco');
      expect(result.isRemote).toBe(true);
    });

    it('detects remote from any location entry', () => {
      const result = LocationParser.parseMultiple([
        'Berlin, Germany',
        'Remote',
      ]);
      expect(result.isRemote).toBe(true);
      expect(result.country).toBe('Germany');
    });
  });

  describe('normalizeCountry & expandCountryFilters', () => {
    const countryEquivalents: [string, string, string][] = [
      ['United States', 'United States', 'US'],
      ['united states', 'United States', 'US'],
      ['UNITED STATES', 'United States', 'US'],
      ['US', 'United States', 'US'],
      ['usa', 'United States', 'US'],
      ['Canada', 'Canada', 'CA'],
      ['CA', 'Canada', 'CA'],
      ['can', 'Canada', 'CA'],
      ['Nigeria', 'Nigeria', 'NG'],
      ['NG', 'Nigeria', 'NG'],
      ['United Kingdom', 'United Kingdom', 'GB'],
      ['GB', 'United Kingdom', 'GB'],
      ['uk', 'United Kingdom', 'GB'],
      ['Germany', 'Germany', 'DE'],
      ['DE', 'Germany', 'DE'],
    ];

    for (const [input, expectedCanonical, expectedIso2] of countryEquivalents) {
      it(`normalizes "${input}" to canonical "${expectedCanonical}" (${expectedIso2})`, () => {
        const norm = LocationParser.normalizeCountry(input);
        expect(norm).not.toBeNull();
        expect(norm?.canonicalName).toBe(expectedCanonical);
        expect(norm?.iso2).toBe(expectedIso2);
      });
    }

    it('expands country filter tokens to match database representations', () => {
      const expandedUS = LocationParser.expandCountryFilters(['US']);
      expect(expandedUS).toContain('United States');
      expect(expandedUS).toContain('US');

      const expandedMulti = LocationParser.expandCountryFilters(['ca', 'Nigeria', 'GB']);
      expect(expandedMulti).toContain('Canada');
      expect(expandedMulti).toContain('CA');
      expect(expandedMulti).toContain('Nigeria');
      expect(expandedMulti).toContain('NG');
      expect(expandedMulti).toContain('United Kingdom');
      expect(expandedMulti).toContain('GB');
    });
  });

  describe('complex location patterns (Section 7 verification)', () => {
    it('parses "London, England"', () => {
      const res = LocationParser.parse('London, England');
      expect(res.city).toBe('London');
      expect(res.country).toBe('United Kingdom');
    });

    it('parses "Greater London"', () => {
      const res = LocationParser.parse('Greater London');
      expect(res.country).toBe('United Kingdom');
    });

    it('parses "Remote - United States"', () => {
      const res = LocationParser.parse('Remote - United States');
      expect(res.country).toBe('United States');
      expect(res.isRemote).toBe(true);
    });

    it('parses "US - Remote"', () => {
      const res = LocationParser.parse('US - Remote');
      expect(res.country).toBe('United States');
      expect(res.isRemote).toBe(true);
    });

    it('parses "United States - Remote"', () => {
      const res = LocationParser.parse('United States - Remote');
      expect(res.country).toBe('United States');
      expect(res.isRemote).toBe(true);
    });

    it('parses "Remote, Canada"', () => {
      const res = LocationParser.parse('Remote, Canada');
      expect(res.country).toBe('Canada');
      expect(res.isRemote).toBe(true);
    });

    it('parses "Toronto / Remote"', () => {
      const res = LocationParser.parse('Toronto / Remote');
      expect(res.city).toBe('Toronto');
      expect(res.isRemote).toBe(true);
    });

    it('parses "Hybrid - London"', () => {
      const res = LocationParser.parse('Hybrid - London');
      expect(res.city).toBe('London');
      expect(res.country).toBe('United Kingdom');
    });

    it('parses "EMEA", "Europe", "Americas"', () => {
      expect(LocationParser.parse('EMEA').region).toBe('EMEA');
      expect(LocationParser.parse('Europe').region).toBe('EUROPE');
      expect(LocationParser.parse('Americas').region).toBe('AMERICAS');
    });

    it('parses "New York Metropolitan Area"', () => {
      const res = LocationParser.parse('New York Metropolitan Area');
      expect(res.country).toBe('United States');
      expect(res.region).toBe('New York Metropolitan Area');
    });

    it('parses "San Francisco Bay Area"', () => {
      const res = LocationParser.parse('San Francisco Bay Area');
      expect(res.country).toBe('United States');
      expect(res.region).toBe('San Francisco Bay Area');
    });
  });
});
