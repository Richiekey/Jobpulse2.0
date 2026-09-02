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
});
