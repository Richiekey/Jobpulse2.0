/**
 * Location Parser — Structured Location Decomposition & Country Normalization
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

export interface CountryInfo {
  canonicalName: string;
  iso2: string;
  iso3: string;
  aliases: string[];
}

// Comprehensive ISO Country Metadata mapping
const COUNTRY_DEFINITIONS: CountryInfo[] = [
  { canonicalName: 'United States', iso2: 'US', iso3: 'USA', aliases: ['united states', 'united states of america', 'u.s.', 'u.s.a.', 'us', 'usa', 'america'] },
  { canonicalName: 'United Kingdom', iso2: 'GB', iso3: 'GBR', aliases: ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland'] },
  { canonicalName: 'Canada', iso2: 'CA', iso3: 'CAN', aliases: ['canada', 'ca', 'can'] },
  { canonicalName: 'Germany', iso2: 'DE', iso3: 'DEU', aliases: ['germany', 'de', 'deu', 'deutschland'] },
  { canonicalName: 'Nigeria', iso2: 'NG', iso3: 'NGA', aliases: ['nigeria', 'ng', 'nga'] },
  { canonicalName: 'France', iso2: 'FR', iso3: 'FRA', aliases: ['france', 'fr', 'fra'] },
  { canonicalName: 'India', iso2: 'IN', iso3: 'IND', aliases: ['india', 'in', 'ind'] },
  { canonicalName: 'Australia', iso2: 'AU', iso3: 'AUS', aliases: ['australia', 'au', 'aus'] },
  { canonicalName: 'Netherlands', iso2: 'NL', iso3: 'NLD', aliases: ['netherlands', 'nl', 'nld', 'holland'] },
  { canonicalName: 'Switzerland', iso2: 'CH', iso3: 'CHE', aliases: ['switzerland', 'ch', 'che', 'swiss'] },
  { canonicalName: 'Ireland', iso2: 'IE', iso3: 'IRL', aliases: ['ireland', 'ie', 'irl'] },
  { canonicalName: 'Singapore', iso2: 'SG', iso3: 'SGP', aliases: ['singapore', 'sg', 'sgp'] },
  { canonicalName: 'Japan', iso2: 'JP', iso3: 'JPN', aliases: ['japan', 'jp', 'jpn'] },
  { canonicalName: 'Brazil', iso2: 'BR', iso3: 'BRA', aliases: ['brazil', 'br', 'bra', 'brasil'] },
  { canonicalName: 'Mexico', iso2: 'MX', iso3: 'MEX', aliases: ['mexico', 'mx', 'mex'] },
  { canonicalName: 'Spain', iso2: 'ES', iso3: 'ESP', aliases: ['spain', 'es', 'esp', 'espana'] },
  { canonicalName: 'Italy', iso2: 'IT', iso3: 'ITA', aliases: ['italy', 'it', 'ita', 'italia'] },
  { canonicalName: 'Sweden', iso2: 'SE', iso3: 'SWE', aliases: ['sweden', 'se', 'swe', 'sverige'] },
  { canonicalName: 'Norway', iso2: 'NO', iso3: 'NOR', aliases: ['norway', 'no', 'nor', 'norge'] },
  { canonicalName: 'Denmark', iso2: 'DK', iso3: 'DNK', aliases: ['denmark', 'dk', 'dnk', 'danmark'] },
  { canonicalName: 'Finland', iso2: 'FI', iso3: 'FIN', aliases: ['finland', 'fi', 'fin', 'suomi'] },
  { canonicalName: 'Poland', iso2: 'PL', iso3: 'POL', aliases: ['poland', 'pl', 'pol', 'polska'] },
  { canonicalName: 'Portugal', iso2: 'PT', iso3: 'PRT', aliases: ['portugal', 'pt', 'prt'] },
  { canonicalName: 'Austria', iso2: 'AT', iso3: 'AUT', aliases: ['austria', 'at', 'aut', 'osterreich'] },
  { canonicalName: 'Belgium', iso2: 'BE', iso3: 'BEL', aliases: ['belgium', 'be', 'bel', 'belgique'] },
  { canonicalName: 'Israel', iso2: 'IL', iso3: 'ISR', aliases: ['israel', 'il', 'isr'] },
  { canonicalName: 'South Africa', iso2: 'ZA', iso3: 'ZAF', aliases: ['south africa', 'za', 'zaf'] },
  { canonicalName: 'Kenya', iso2: 'KE', iso3: 'KEN', aliases: ['kenya', 'ke', 'ken'] },
  { canonicalName: 'Ghana', iso2: 'GH', iso3: 'GHA', aliases: ['ghana', 'gh', 'gha'] },
  { canonicalName: 'Egypt', iso2: 'EG', iso3: 'EGY', aliases: ['egypt', 'eg', 'egy'] },
  { canonicalName: 'United Arab Emirates', iso2: 'AE', iso3: 'ARE', aliases: ['united arab emirates', 'uae', 'ae', 'are', 'dubai', 'abu dhabi'] },
  { canonicalName: 'Saudi Arabia', iso2: 'SA', iso3: 'SAU', aliases: ['saudi arabia', 'sa', 'sau', 'ksa'] },
  { canonicalName: 'New Zealand', iso2: 'NZ', iso3: 'NZL', aliases: ['new zealand', 'nz', 'nzl'] },
  { canonicalName: 'South Korea', iso2: 'KR', iso3: 'KOR', aliases: ['south korea', 'korea', 'kr', 'kor'] },
  { canonicalName: 'Philippines', iso2: 'PH', iso3: 'PHL', aliases: ['philippines', 'ph', 'phl'] },
  { canonicalName: 'Thailand', iso2: 'TH', iso3: 'THA', aliases: ['thailand', 'th', 'tha'] },
  { canonicalName: 'Vietnam', iso2: 'VN', iso3: 'VNM', aliases: ['vietnam', 'vn', 'vnm'] },
  { canonicalName: 'Malaysia', iso2: 'MY', iso3: 'MYS', aliases: ['malaysia', 'my', 'mys'] },
  { canonicalName: 'Indonesia', iso2: 'ID', iso3: 'IDN', aliases: ['indonesia', 'id', 'idn'] },
  { canonicalName: 'Taiwan', iso2: 'TW', iso3: 'TWN', aliases: ['taiwan', 'tw', 'twn'] },
  { canonicalName: 'Hong Kong', iso2: 'HK', iso3: 'HKG', aliases: ['hong kong', 'hk', 'hkg'] },
  { canonicalName: 'Argentina', iso2: 'AR', iso3: 'ARG', aliases: ['argentina', 'ar', 'arg'] },
  { canonicalName: 'Chile', iso2: 'CL', iso3: 'CHL', aliases: ['chile', 'cl', 'chl'] },
  { canonicalName: 'Colombia', iso2: 'CO', iso3: 'COL', aliases: ['colombia', 'co', 'col'] },
  { canonicalName: 'Peru', iso2: 'PE', iso3: 'PER', aliases: ['peru', 'pe', 'per'] },
  { canonicalName: 'Czech Republic', iso2: 'CZ', iso3: 'CZE', aliases: ['czech republic', 'czechia', 'cz', 'cze'] },
  { canonicalName: 'Romania', iso2: 'RO', iso3: 'ROU', aliases: ['romania', 'ro', 'rou'] },
  { canonicalName: 'Ukraine', iso2: 'UA', iso3: 'UKR', aliases: ['ukraine', 'ua', 'ukr'] },
  { canonicalName: 'Turkey', iso2: 'TR', iso3: 'TUR', aliases: ['turkey', 'turkiye', 'tr', 'tur'] },
  { canonicalName: 'China', iso2: 'CN', iso3: 'CHN', aliases: ['china', 'cn', 'chn'] },
];

// Lookup map for fast normalization
const COUNTRY_LOOKUP = new Map<string, CountryInfo>();

for (const def of COUNTRY_DEFINITIONS) {
  COUNTRY_LOOKUP.set(def.canonicalName.toLowerCase(), def);
  COUNTRY_LOOKUP.set(def.iso2.toLowerCase(), def);
  COUNTRY_LOOKUP.set(def.iso3.toLowerCase(), def);
  for (const alias of def.aliases) {
    COUNTRY_LOOKUP.set(alias.toLowerCase().trim(), def);
  }
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

// Nigerian states
const NG_STATES = new Set([
  'lagos', 'abuja', 'rivers', 'oyo', 'kano', 'delta', 'enugu', 'anambra',
  'kaduna', 'ogun', 'edo', 'imo', 'abia', 'benue', 'cross river',
  'fct', 'federal capital territory', 'lagos state',
]);

// Well-known UK regions & cities
const UK_REGIONS: Record<string, { city?: string; region: string; country: string }> = {
  'england': { region: 'England', country: 'United Kingdom' },
  'scotland': { region: 'Scotland', country: 'United Kingdom' },
  'wales': { region: 'Wales', country: 'United Kingdom' },
  'northern ireland': { region: 'Northern Ireland', country: 'United Kingdom' },
  'greater london': { region: 'Greater London', country: 'United Kingdom' },
  'london': { city: 'London', region: 'Greater London', country: 'United Kingdom' },
};

// Recognized global macro-regions
const MACRO_REGIONS = new Set(['emea', 'apac', 'americas', 'europe', 'latin america', 'latam', 'middle east', 'global', 'worldwide']);

const REMOTE_PATTERNS = /\b(remote|work\s+from\s+home|wfh|anywhere|distributed|worldwide|global|telecommute)\b/i;

export class LocationParser {
  /**
   * Deterministically normalizes a country string (name, ISO-2, ISO-3, alias)
   * into its canonical representation and query aliases.
   */
  public static normalizeCountry(input: string): { canonicalName: string; iso2: string; queryTokens: string[] } | null {
    if (!input) return null;
    const clean = input.toLowerCase().trim();
    const info = COUNTRY_LOOKUP.get(clean);
    if (!info) return null;

    // Build unique query tokens for matching
    const tokens = Array.from(new Set([info.canonicalName, info.iso2, info.iso3, ...info.aliases]));

    return {
      canonicalName: info.canonicalName,
      iso2: info.iso2,
      queryTokens: tokens,
    };
  }

  /**
   * Expands a list of raw country filter inputs into all possible database representations.
   * E.g. ['US', 'ca'] → ['United States', 'US', 'USA', 'Canada', 'CA', 'CAN']
   */
  public static expandCountryFilters(countryInputs: string[]): string[] {
    const results = new Set<string>();

    for (const input of countryInputs) {
      const clean = input.trim();
      if (!clean) continue;

      const norm = this.normalizeCountry(clean);
      if (norm) {
        results.add(norm.canonicalName);
        results.add(norm.iso2);
        results.add(norm.canonicalName.toUpperCase());
        results.add(norm.canonicalName.toLowerCase());
      } else {
        // Fallback to exact input and upper/lower variations
        results.add(clean);
        results.add(clean.toUpperCase());
        results.add(clean.toLowerCase());
      }
    }

    return Array.from(results);
  }

  /**
   * Parses a raw location string into structured components.
   */
  public static parse(rawLocation: string): ParsedLocation {
    const raw = rawLocation.trim();
    if (!raw || raw.toLowerCase() === 'unspecified') {
      return { country: null, region: null, city: null, isRemote: false, raw };
    }

    const isRemote = REMOTE_PATTERNS.test(raw);

    // Strip "Remote", "Hybrid", "On-site" prefixes/suffixes for pure location parsing
    let cleaned = raw
      .replace(/^remote\s*[-—–:,/]\s*/i, '')
      .replace(/\s*[-—–:,/]\s*remote$/i, '')
      .replace(/^hybrid\s*[-—–:,/]\s*/i, '')
      .replace(/\s*[-—–:,/]\s*hybrid$/i, '')
      .replace(/^\(remote\)\s*/i, '')
      .replace(/\s*\(remote\)$/i, '')
      .replace(/^multiple locations$/i, '')
      .trim();

    // Check macro-regions
    if (MACRO_REGIONS.has(cleaned.toLowerCase())) {
      return {
        country: null,
        region: cleaned.toUpperCase(),
        city: null,
        isRemote,
        raw,
      };
    }

    // If only "Remote" with no geographic info
    if (!cleaned || (REMOTE_PATTERNS.test(cleaned) && cleaned.replace(REMOTE_PATTERNS, '').trim().length === 0)) {
      return { country: null, region: null, city: null, isRemote: true, raw };
    }

    // Split by common delimiters: comma, semicolon, slash, hyphen
    const parts = cleaned.split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);

    let country: string | null = null;
    let region: string | null = null;
    let city: string | null = null;

    if (parts.length >= 3) {
      // Pattern: "City, State/Region, Country" (e.g., "Austin, TX, US" or "London, England, United Kingdom")
      city = parts[0]!;
      region = parts[1]!;
      const resolved = this.resolveCountry(parts[2]!);
      if (resolved) {
        country = resolved;
      } else {
        country = this.resolveCountry(parts[1]!) || this.resolveCountry(parts[0]!);
      }
    } else if (parts.length === 2) {
      const first = parts[0]!;
      const second = parts[1]!;

      if (this.isUSStateAbbr(second)) {
        // "Austin, TX", "San Francisco, CA"
        if (second.toUpperCase() === 'CA' && (CA_PROVINCE_NAMES.has(first.toLowerCase()) || CA_PROVINCES[first.toUpperCase()])) {
          region = CA_PROVINCES[first.toUpperCase()] || first;
          country = 'Canada';
        } else {
          city = first;
          region = US_STATE_ABBR[second.toUpperCase()] || second;
          country = 'United States';
        }
      } else if (this.isUSState(second)) {
        // "San Francisco, California"
        city = first;
        region = second;
        country = 'United States';
      } else if (CA_PROVINCES[second.toUpperCase()] || CA_PROVINCE_NAMES.has(second.toLowerCase())) {
        city = first;
        region = CA_PROVINCES[second.toUpperCase()] || second;
        country = 'Canada';
      } else if (NG_STATES.has(second.toLowerCase())) {
        city = first;
        region = second;
        country = 'Nigeria';
      } else if (UK_REGIONS[second.toLowerCase()]) {
        city = first;
        region = UK_REGIONS[second.toLowerCase()]!.region;
        country = UK_REGIONS[second.toLowerCase()]!.country;
      } else {
        const secondCountry = this.resolveCountry(second);
        if (secondCountry) {
          country = secondCountry;
          if (this.isUSState(first)) {
            region = this.isUSStateAbbr(first) ? US_STATE_ABBR[first.toUpperCase()] || first : first;
            country = 'United States';
          } else if (CA_PROVINCE_NAMES.has(first.toLowerCase())) {
            region = first;
            country = 'Canada';
          } else {
            city = first;
          }
        } else {
          city = first;
          region = second;
        }
      }
    } else {
      // Single value
      const single = parts[0]!;
      const lowerSingle = single.toLowerCase();

      const resolved = this.resolveCountry(single);
      if (resolved) {
        country = resolved;
      } else if (this.isUSState(single)) {
        region = this.isUSStateAbbr(single) ? US_STATE_ABBR[single.toUpperCase()] || single : single;
        country = 'United States';
      } else if (CA_PROVINCES[single.toUpperCase()] || CA_PROVINCE_NAMES.has(lowerSingle)) {
        region = CA_PROVINCES[single.toUpperCase()] || single;
        country = 'Canada';
      } else if (NG_STATES.has(lowerSingle)) {
        region = single;
        country = 'Nigeria';
      } else if (UK_REGIONS[lowerSingle]) {
        city = UK_REGIONS[lowerSingle]!.city || null;
        region = UK_REGIONS[lowerSingle]!.region;
        country = UK_REGIONS[lowerSingle]!.country;
      } else if (lowerSingle.includes('bay area') || lowerSingle.includes('metropolitan area')) {
        region = single;
        country = 'United States';
      } else {
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
   */
  public static parseMultiple(rawLocations: string[]): ParsedLocation {
    let bestResult: ParsedLocation = { country: null, region: null, city: null, isRemote: false, raw: '' };
    let anyRemote = false;

    for (const loc of rawLocations) {
      const parsed = this.parse(loc);
      if (parsed.isRemote) anyRemote = true;

      if (!bestResult.country && parsed.country) {
        bestResult = parsed;
      }
      if (!bestResult.city && parsed.city) {
        bestResult = { ...bestResult, city: parsed.city };
      }
    }

    bestResult.isRemote = anyRemote || bestResult.isRemote;
    bestResult.raw = rawLocations.join('; ');

    return bestResult;
  }

  private static resolveCountry(value: string): string | null {
    if (!value) return null;
    const clean = value.toLowerCase().trim();
    const info = COUNTRY_LOOKUP.get(clean);
    return info ? info.canonicalName : null;
  }

  private static isUSStateAbbr(value: string): boolean {
    return Boolean(US_STATE_ABBR[value.toUpperCase().trim()]);
  }

  private static isUSState(value: string): boolean {
    return US_STATE_NAMES.has(value.toLowerCase().trim()) || this.isUSStateAbbr(value);
  }
}
