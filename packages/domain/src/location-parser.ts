/**
 * Location Parser — Structured Location Decomposition
 *
 * Extracts country, region/state, city, and remote indicator
 * from raw ATS location strings.
 *
 * Preserves raw location data — never destroys original values.
 */

export interface ParsedLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  isRemote: boolean;
  raw: string;
}

// US state abbreviation → full name
const US_STATE_ABBR: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

const US_STATE_NAMES = new Set(Object.values(US_STATE_ABBR).map((s) => s.toLowerCase()));

// Canadian provinces
const CA_PROVINCES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};
const CA_PROVINCE_NAMES = new Set(Object.values(CA_PROVINCES).map((s) => s.toLowerCase()));

// Nigerian states (common ones)
const NG_STATES = new Set([
  'lagos', 'abuja', 'rivers', 'oyo', 'kano', 'delta', 'enugu', 'anambra',
  'kaduna', 'ogun', 'edo', 'imo', 'abia', 'benue', 'cross river',
  'fct', 'federal capital territory', 'lagos state',
]);

// Country aliases
const COUNTRY_ALIASES: Record<string, string> = {
  'us': 'United States', 'usa': 'United States', 'u.s.': 'United States',
  'u.s.a.': 'United States', 'united states of america': 'United States',
  'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'britain': 'United Kingdom',
  'great britain': 'United Kingdom', 'england': 'United Kingdom',
  'scotland': 'United Kingdom', 'wales': 'United Kingdom',
  'de': 'Germany', 'deutschland': 'Germany',
  'nl': 'Netherlands', 'holland': 'Netherlands',
  'ch': 'Switzerland',
  'ie': 'Ireland',
  'sg': 'Singapore',
  'jp': 'Japan',
  'kr': 'South Korea',
  'br': 'Brazil',
  'mx': 'Mexico',
  'au': 'Australia',
  'nz': 'New Zealand',
  'in': 'India',
  'ng': 'Nigeria',
  'za': 'South Africa',
  'ke': 'Kenya',
  'gh': 'Ghana',
  'il': 'Israel',
  'se': 'Sweden',
  'no': 'Norway',
  'dk': 'Denmark',
  'fi': 'Finland',
  'pl': 'Poland',
  'fr': 'France',
  'es': 'Spain',
  'it': 'Italy',
  'pt': 'Portugal',
  'at': 'Austria',
  'be': 'Belgium',
  'cz': 'Czech Republic', 'czechia': 'Czech Republic',
  'ro': 'Romania',
  'ua': 'Ukraine',
  'ar': 'Argentina',
  'cl': 'Chile',
  'co': 'Colombia',
  'pe': 'Peru',
  'tw': 'Taiwan',
  'hk': 'Hong Kong',
  'ph': 'Philippines',
  'th': 'Thailand',
  'vn': 'Vietnam',
  'my': 'Malaysia',
  'id': 'Indonesia',
  'eg': 'Egypt',
  'ae': 'United Arab Emirates', 'uae': 'United Arab Emirates',
  'sa': 'Saudi Arabia',
};

// Known country names (for direct match)
const KNOWN_COUNTRIES = new Set([
  'united states', 'united kingdom', 'canada', 'germany', 'france', 'india',
  'australia', 'japan', 'brazil', 'mexico', 'nigeria', 'south africa', 'kenya',
  'ghana', 'singapore', 'ireland', 'israel', 'sweden', 'norway', 'denmark',
  'finland', 'netherlands', 'switzerland', 'spain', 'italy', 'portugal',
  'austria', 'belgium', 'poland', 'czech republic', 'romania', 'ukraine',
  'argentina', 'chile', 'colombia', 'peru', 'taiwan', 'hong kong',
  'south korea', 'philippines', 'thailand', 'vietnam', 'malaysia',
  'indonesia', 'egypt', 'united arab emirates', 'saudi arabia', 'turkey',
  'new zealand', 'china', 'russia', 'pakistan', 'bangladesh', 'ethiopia',
  'tanzania', 'uganda', 'rwanda', 'cameroon', 'senegal',
]);

const REMOTE_PATTERNS = /\b(remote|work\s+from\s+home|wfh|anywhere|distributed|worldwide|global|telecommute)\b/i;

export class LocationParser {
  /**
   * Parses a raw location string into structured components.
   */
  public static parse(rawLocation: string): ParsedLocation {
    const raw = rawLocation.trim();
    if (!raw || raw.toLowerCase() === 'unspecified') {
      return { country: null, region: null, city: null, isRemote: false, raw };
    }

    const isRemote = REMOTE_PATTERNS.test(raw);

    // Strip "Remote" prefix/suffix for location parsing
    // e.g., "Remote — United States" → "United States"
    const cleanedForParse = raw
      .replace(/^remote\s*[-—–:,]\s*/i, '')
      .replace(/\s*[-—–:,]\s*remote$/i, '')
      .replace(/^\(remote\)\s*/i, '')
      .replace(/\s*\(remote\)$/i, '')
      .trim();

    // If only "Remote" with no geographic info
    if (!cleanedForParse || REMOTE_PATTERNS.test(cleanedForParse) && cleanedForParse.replace(REMOTE_PATTERNS, '').trim().length === 0) {
      return { country: null, region: null, city: null, isRemote: true, raw };
    }

    // Split by common delimiters
    const parts = cleanedForParse.split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);

    let country: string | null = null;
    let region: string | null = null;
    let city: string | null = null;

    if (parts.length >= 3) {
      // Pattern: "City, State/Region, Country"
      city = parts[0]!;
      region = parts[1]!;
      country = this.resolveCountry(parts[2]!);
      if (!country) {
        // Maybe "City, State, Abbreviation" (US)
        country = this.resolveCountry(parts[1]!) || this.resolveCountry(parts[2]!);
      }
    } else if (parts.length === 2) {
      // Pattern: "City, State" or "City, Country" or "State, Country"
      const secondResolved = this.resolveCountry(parts[1]!);
      if (secondResolved) {
        // "City, Country" or "State, Country"
        country = secondResolved;
        // Check if first part is a state/region
        if (this.isUSState(parts[0]!)) {
          region = parts[0]!;
          country = 'United States';
        } else if (CA_PROVINCE_NAMES.has(parts[0]!.toLowerCase())) {
          region = parts[0]!;
          country = 'Canada';
        } else {
          city = parts[0]!;
        }
      } else if (this.isUSStateAbbr(parts[1]!)) {
        // "City, ST" (US state abbreviation)
        city = parts[0]!;
        region = US_STATE_ABBR[parts[1]!.toUpperCase()] || parts[1]!;
        country = 'United States';
      } else if (this.isUSState(parts[1]!)) {
        // "City, California"
        city = parts[0]!;
        region = parts[1]!;
        country = 'United States';
      } else if (CA_PROVINCE_NAMES.has(parts[1]!.toLowerCase())) {
        city = parts[0]!;
        region = parts[1]!;
        country = 'Canada';
      } else if (NG_STATES.has(parts[1]!.toLowerCase())) {
        city = parts[0]!;
        region = parts[1]!;
        country = 'Nigeria';
      } else {
        // Unknown — treat as "City, Region"
        city = parts[0]!;
        region = parts[1]!;
      }
    } else {
      // Single value — parts.length === 1, guaranteed by filter(Boolean) above
      const single = parts[0]!;
      const resolved = this.resolveCountry(single);
      if (resolved) {
        country = resolved;
      } else if (this.isUSState(single)) {
        region = single;
        country = 'United States';
      } else if (CA_PROVINCE_NAMES.has(single.toLowerCase())) {
        region = single;
        country = 'Canada';
      } else if (NG_STATES.has(single.toLowerCase())) {
        region = single;
        country = 'Nigeria';
      } else {
        // Treat as city
        city = single;
      }
    }

    return {
      country,
      region: region || null,
      city: city || null,
      isRemote,
      raw,
    };
  }

  /**
   * Parses multiple raw location strings and returns the best structured result.
   * Uses the first non-empty parsed location as primary.
   */
  public static parseMultiple(rawLocations: string[]): ParsedLocation {
    let bestResult: ParsedLocation = { country: null, region: null, city: null, isRemote: false, raw: '' };
    let anyRemote = false;

    for (const loc of rawLocations) {
      const parsed = this.parse(loc);
      if (parsed.isRemote) anyRemote = true;

      // Use the first location that has a country as the primary
      if (!bestResult.country && parsed.country) {
        bestResult = parsed;
      }
      // Or the first that has a city
      if (!bestResult.city && parsed.city) {
        bestResult = { ...bestResult, city: parsed.city };
      }
    }

    bestResult.isRemote = anyRemote || bestResult.isRemote;
    bestResult.raw = rawLocations.join('; ');

    return bestResult;
  }

  /**
   * Resolves a string to a canonical country name.
   */
  private static resolveCountry(value: string): string | null {
    if (!value) return null;
    const lower = value.toLowerCase().trim();

    // Direct alias match
    if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];

    // Direct country name match
    if (KNOWN_COUNTRIES.has(lower)) {
      // Capitalize properly
      return lower.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    return null;
  }

  private static isUSStateAbbr(value: string): boolean {
    return Boolean(US_STATE_ABBR[value.toUpperCase().trim()]);
  }

  private static isUSState(value: string): boolean {
    return US_STATE_NAMES.has(value.toLowerCase().trim()) || this.isUSStateAbbr(value);
  }
}
