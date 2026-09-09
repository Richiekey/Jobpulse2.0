/**
 * JobPulse 2.0 — Centralized Job Eligibility Policy
 *
 * Authoritative gate evaluating whether a job candidate qualifies for the
 * active JobPulse public job corpus.
 *
 * Core Invariants:
 * 1. Hard 30-day Age Invariant: posted_at >= now() - 30 days.
 * 2. Geography Whitelist: Primary (US, Canada), Secondary (Europe).
 *    Explicit exclusions: Asia, Africa, LATAM, Middle East, Oceania.
 * 3. Remote Classification: Prioritizes US/CA/Europe/Worldwide remote.
 *    Strictly rejects remote jobs restricted to excluded regions (e.g. Remote - Africa, Remote - India).
 * 4. Technical Roles Only: CS, Software, Data/AI/ML, Cybersecurity, IT Systems, Architecture.
 *    Strictly excludes non-technical roles (Sales, Marketing, HR, Finance, etc.)
 *    and pseudo-technical titles (Technical Sales, Technical Recruiter, Technical Writer, Technical CSM).
 * 5. Work Arrangement Priority: Remote (3) > Hybrid (2) > Onsite (1).
 */

import { LocationParser } from './location-parser.js';

export interface JobCandidateData {
  title?: string | null;
  displayTitle?: string | null;
  canonicalTitle?: string | null;
  description?: string | null;
  locations?: string[] | null;
  workplaceType?: 'remote' | 'hybrid' | 'on_site' | 'unspecified' | string | null;
  postedAt?: string | Date | null;
  skills?: string[] | null;
  sourceMetadata?: Record<string, any> | null;
}

export type EligibilityExclusionReason =
  | 'TOO_OLD'
  | 'EXCLUDED_GEOGRAPHY'
  | 'NON_TECHNICAL_ROLE'
  | 'MISSING_REQUIRED_DATA';

export type GeographyCategory =
  | 'US'
  | 'CANADA'
  | 'EUROPE'
  | 'WORLDWIDE'
  | 'EXCLUDED'
  | 'UNKNOWN';

export type RemoteCategory =
  | 'REMOTE_US'
  | 'REMOTE_CANADA'
  | 'REMOTE_EUROPE'
  | 'REMOTE_NORTH_AMERICA'
  | 'REMOTE_WORLDWIDE'
  | 'REMOTE_EXCLUDED_REGION'
  | 'REMOTE_UNKNOWN'
  | 'NOT_REMOTE';

export interface JobEligibilityResult {
  eligible: boolean;
  reason?: EligibilityExclusionReason;
  geographyCategory: GeographyCategory;
  remoteCategory: RemoteCategory;
  workplaceType: 'remote' | 'hybrid' | 'on_site' | 'unspecified';
  roleCategory: 'software' | 'data_ai' | 'cybersecurity' | 'it_systems' | 'technical_other' | 'non_technical';
  priorityScore: number; // 3 for remote, 2 for hybrid, 1 for onsite, 0 for unspecified
}

// Canonical lists of European countries
const EUROPEAN_COUNTRIES = new Set([
  'united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland',
  'ireland', 'germany', 'france', 'netherlands', 'spain', 'portugal', 'italy',
  'sweden', 'norway', 'denmark', 'finland', 'switzerland', 'austria', 'belgium',
  'poland', 'czech republic', 'romania', 'ukraine', 'estonia', 'latvia', 'lithuania',
  'greece', 'croatia', 'bulgaria', 'hungary', 'slovakia', 'slovenia', 'luxembourg',
  'cyprus', 'malta', 'iceland', 'liechtenstein', 'serbia', 'bosnia and herzegovina',
  'albania', 'montenegro', 'north macedonia', 'turkey'
]);

// Canonical excluded regions & countries
const EXCLUDED_COUNTRIES = new Set([
  // Africa
  'nigeria', 'kenya', 'south africa', 'ghana', 'egypt', 'morocco', 'uganda',
  'tanzania', 'rwanda', 'ethiopia', 'algeria', 'tunisia', 'zimbabwe', 'senegal',
  'cameroon', 'ivory coast', 'cote d\'ivoire', 'zambia', 'angola',
  // Asia
  'india', 'pakistan', 'china', 'japan', 'south korea', 'philippines', 'singapore',
  'indonesia', 'vietnam', 'thailand', 'malaysia', 'taiwan', 'hong kong', 'bangladesh',
  'sri lanka', 'nepal', 'myanmar', 'cambodia',
  // LATAM
  'brazil', 'mexico', 'argentina', 'colombia', 'chile', 'peru', 'uruguay',
  'venezuela', 'ecuador', 'bolivia', 'paraguay', 'costa rica', 'panama', 'guatemala',
  'dominican republic', 'puerto rico',
  // Middle East
  'united arab emirates', 'uae', 'saudi arabia', 'israel', 'qatar', 'kuwait',
  'bahrain', 'oman', 'jordan', 'lebanon', 'iraq',
  // Oceania
  'australia', 'new zealand', 'fiji', 'papua new guinea'
]);

// Excluded regional keywords found in raw location strings
const EXCLUDED_REGION_PATTERNS = [
  /\b(africa|nigeria|kenya|ghana|egypt|south\s+africa)\b/i,
  /\b(asia|apac|india|pakistan|bangladesh|philippines|singapore|japan|china|indonesia|malaysia|vietnam)\b/i,
  /\b(latam|latin\s+america|south\s+america|brazil|mexico|argentina|colombia|chile|peru)\b/i,
  /\b(middle\s+east|mena|uae|dubai|abu\s+dhabi|saudi|israel|qatar)\b/i,
  /\b(australia|new\s+zealand|oceania|anz|sydney|melbourne|brisbane|auckland)\b/i,
];

// Whitelist regional patterns
const US_PATTERNS = /\b(united\s+states|usa?\b|u\.s\.a?\b|america)\b/i;
const CANADA_PATTERNS = /\b(canada|can\b|ontario|toronto|vancouver|quebec|montreal|british\s+columbia|alberta|calgary|ottawa|edmonton|winnipeg)\b/i;
const EUROPE_PATTERNS = /\b(europe|emea|united\s+kingdom|uk\b|u\.k\b|london|england|ireland|germany|berlin|france|paris|netherlands|amsterdam|spain|madrid|barcelona|sweden|stockholm|poland|warsaw|switzerland|zurich)\b/i;
const WORLDWIDE_PATTERNS = /\b(worldwide|anywhere|global|all\s+locations)\b/i;

// Common US cities & state abbreviations (fallback when country is not explicitly mentioned)
const US_CITY_PATTERNS = /\b(san\s+francisco|new\s+york|los\s+angeles|seattle|austin|chicago|boston|denver|portland|atlanta|miami|dallas|houston|phoenix|philadelphia|san\s+diego|san\s+jose|washington\s*,?\s*d\.?c\.?|pittsburgh|minneapolis|detroit|charlotte|raleigh|salt\s+lake|nashville|columbus|indianapolis|madison|boulder|palo\s+alto|mountain\s+view|menlo\s+park|redwood\s+city|sunnyvale|cupertino|santa\s+clara|san\s+mateo|redmond|bellevue|brooklyn|manhattan|jersey\s+city|arlington|cambridge|somerville|oakland|berkeley|burlington)\b/i;
const US_STATE_PATTERNS = /\b(california|new\s+york|texas|washington|massachusetts|colorado|georgia|florida|illinois|pennsylvania|virginia|north\s+carolina|ohio|michigan|minnesota|oregon|maryland|connecticut|new\s+jersey|arizona|tennessee|utah|wisconsin|indiana|missouri|\bCA\b|\bNY\b|\bTX\b|\bWA\b|\bMA\b|\bCO\b|\bGA\b|\bFL\b|\bIL\b|\bPA\b|\bVA\b|\bNC\b|\bOH\b|\bOR\b|\bMD\b|\bCT\b|\bNJ\b|\bAZ\b|\bTN\b|\bUT\b|\bWI\b|\bMN\b)\b/i;

// Pseudo-technical patterns that MUST BE EXCLUDED even if containing the word "technical"
const PSEUDO_TECHNICAL_EXCLUSIONS = [
  /\btechnical\s+sales\b/i,
  /\btechnical\s+recruiter\b/i,
  /\btechnical\s+recruiting\b/i,
  /\btechnical\s+talent\b/i,
  /\btechnical\s+writer\b/i,
  /\btechnical\s+writing\b/i,
  /\btechnical\s+documentation\b/i,
  /\btechnical\s+customer\s+success\b/i,
  /\btechnical\s+csm\b/i,
  /\btechnical\s+account\s+executive\b/i,
  /\btechnical\s+sourcer\b/i,
  /\btechnical\s+trainer\b/i,
  /\btechnical\s+instructor\b/i,
];

// Broad non-technical role exclusions
const NON_TECHNICAL_ROLE_PATTERNS = [
  /\b(marketing|content\s+creator|social\s+media|seo\s+specialist|growth\s+lead|copywriter)\b/i,
  /\b(sales\s+manager|account\s+executive|business\s+development|sdr\b|bdr\b|inside\s+sales)\b/i,
  /\b(recruiter|talent\s+acquisition|human\s+resources|hr\s+manager|hrbp|people\s+partner)\b/i,
  /\b(accountant|accounting|auditor|financial\s+analyst|payroll|bookkeeper|finance\s+manager)\b/i,
  /\b(customer\s+success|csm\b|client\s+success|customer\s+support\s+specialist|customer\s+care)\b/i,
  /\b(legal\s+counsel|paralegal|attorney|lawyer|compliance\s+officer)\b/i,
  /\b(general\s+manager|executive\s+assistant|office\s+manager|administrative\s+assistant|receptionist)\b/i,
  /\b(nurse|nursing|physician|doctor|pharmacist|medical\s+assistant|therapist|clinical)\b/i,
  /\b(teacher|teaching|professor|elementary|curriculum\s+specialist|instructor)\b/i,
  /\b(retail|cashier|store\s+associate|store\s+manager|barista|waiter|hospitality)\b/i,
  /\b(warehouse|forklift|driver|courier|supply\s+chain|logistics\s+coordinator)\b/i,
  /\b(construction|carpenter|electrician|plumber|manufacturing\s+operator)\b/i,
];

// Valid technical role patterns
const TECHNICAL_ROLE_PATTERNS: { pattern: RegExp; category: JobEligibilityResult['roleCategory'] }[] = [
  // Software Engineering
  {
    pattern: /\b(software\s+engineer|software\s+developer|full[\s-]?stack|frontend|front[\s-]?end|backend|back[\s-]?end|web\s+developer|mobile\s+engineer|mobile\s+developer|ios\s+(developer|engineer)|android\s+(developer|engineer)|embedded\s+engineer|firmware\s+engineer|application\s+engineer|systems\s+engineer|platform\s+engineer|infrastructure\s+engineer|devops|site\s+reliability|sre\b|\bqa\b|quality\s+assurance|test\s+automation|automation\s+engineer|test\s+engineer|sdet\b|swe\b|sde\b)\b/i,
    category: 'software',
  },
  // Data / AI / ML
  {
    pattern: /\b(data\s+scientist|data\s+analyst|data\s+engineer|analytics\s+engineer|machine\s+learning|ml\s+engineer|ai\s+engineer|ai\s+research|research\s+engineer|research\s+scientist|mlops|bi\s+engineer|business\s+intelligence\s+engineer|data\s+architect|data\s+platform|computer\s+vision|nlp\s+engineer|deep\s+learning)\b/i,
    category: 'data_ai',
  },
  // Cybersecurity & Cloud
  {
    pattern: /\b(cybersecurity|security\s+engineer|information\s+security|infosec|soc\s+analyst|application\s+security|appsec|cloud\s+security|devsecops|penetration\s+tester|pen\s+tester|security\s+researcher|threat\s+intelligence|incident\s+response|security\s+architect|cloud\s+engineer|cloud\s+architect)\b/i,
    category: 'cybersecurity',
  },
  // Computer Science, IT & Systems Architecture
  {
    pattern: /\b(computer\s+scientist|systems\s+analyst|technical\s+systems\s+analyst|database\s+administrator|dba\b|database\s+engineer|network\s+engineer|network\s+administrator|solutions\s+architect|technical\s+architect|enterprise\s+architect|infrastructure\s+architect)\b/i,
    category: 'it_systems',
  },
  // Genuine Technical Cross-Disciplinary
  {
    pattern: /\b(technical\s+product\s+manager|technical\s+program\s+manager|tpm\b|developer\s+advocate|developer\s+relations|devrel|technical\s+support\s+engineer|support\s+engineer|implementation\s+engineer|integration\s+engineer|api\s+engineer|blockchain\s+engineer|smart\s+contract\s+engineer|web3\s+engineer|forward\s+deployed\s+engineer|solutions\s+engineer|sales\s+engineer)\b/i,
    category: 'technical_other',
  },
];

export class JobEligibilityPolicy {
  public static readonly MAX_RETENTION_DAYS = 30;

  /**
   * Authoritatively evaluates whether a job candidate satisfies the product invariants.
   */
  public static evaluate(
    job: JobCandidateData,
    now: Date = new Date()
  ): JobEligibilityResult {
    const title = (job.canonicalTitle || job.displayTitle || job.title || '').trim();
    if (!title) {
      return this.createIneligibleResult('MISSING_REQUIRED_DATA', 'non_technical', 'UNKNOWN', 'NOT_REMOTE', 'unspecified');
    }

    // 1. AGE CHECK (Soft — only reject for aggregator sources and unflagged candidates, not direct ATS boards)
    // Direct ATS sources (Greenhouse, Ashby, Lever, Workday, etc.) list only active jobs,
    // so being present on the board IS proof the job is current even if postedAt is > 30d.
    // The ingest_job_transaction RPC already sets status='expired' for stale jobs.
    // Only reject at the eligibility gate for aggregator sources where postedAt is the
    // sole freshness signal.
    if (job.postedAt && job.sourceMetadata?.isDirectATS !== true) {
      const postedTime = new Date(job.postedAt).getTime();
      const cutoffTime = now.getTime() - this.MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      if (!isNaN(postedTime) && postedTime < cutoffTime) {
        return this.createIneligibleResult(
          'TOO_OLD',
          'software',
          'UNKNOWN',
          'NOT_REMOTE',
          this.resolveWorkplaceType(job)
        );
      }
    }

    // 2. TECHNICAL ROLE CLASSIFICATION & NON-TECHNICAL EXCLUSION
    // Check pseudo-technical exclusions first (e.g. "Technical Sales Manager", "Technical Recruiter")
    for (const pseudoPattern of PSEUDO_TECHNICAL_EXCLUSIONS) {
      if (pseudoPattern.test(title)) {
        return this.createIneligibleResult('NON_TECHNICAL_ROLE', 'non_technical', 'UNKNOWN', 'NOT_REMOTE', this.resolveWorkplaceType(job));
      }
    }

    // Check if the title matches a valid technical role pattern
    let roleCategory: JobEligibilityResult['roleCategory'] | null = null;
    for (const techDef of TECHNICAL_ROLE_PATTERNS) {
      if (techDef.pattern.test(title)) {
        roleCategory = techDef.category;
        break;
      }
    }

    // Check explicit non-technical pattern exclusions
    for (const nonTechPattern of NON_TECHNICAL_ROLE_PATTERNS) {
      if (nonTechPattern.test(title)) {
        // If it also matched a technical role (e.g., "Software Engineer"), check if the title is actually technical
        // e.g. "Software Engineer" at a marketing company vs "Marketing Manager"
        if (!roleCategory || nonTechPattern.test(title.replace(/\b(software|data|systems|security|ai|ml|engineer|developer)\b/gi, ''))) {
          return this.createIneligibleResult('NON_TECHNICAL_ROLE', 'non_technical', 'UNKNOWN', 'NOT_REMOTE', this.resolveWorkplaceType(job));
        }
      }
    }

    // Check ATS department metadata if roleCategory not yet established from title
    if (!roleCategory && job.sourceMetadata?.department) {
      const dept = String(job.sourceMetadata.department).toLowerCase();
      if (dept.includes('engineering') || dept.includes('technology') || dept.includes('data') || dept.includes('security')) {
        roleCategory = 'software';
      }
    }

    if (!roleCategory) {
      return this.createIneligibleResult('NON_TECHNICAL_ROLE', 'non_technical', 'UNKNOWN', 'NOT_REMOTE', this.resolveWorkplaceType(job));
    }

    // 3. GEOGRAPHY & REMOTE CLASSIFICATION
    const workplaceType = this.resolveWorkplaceType(job);
    const locations = Array.isArray(job.locations) && job.locations.length > 0 ? job.locations : [];
    const locationString = locations.join(' ; ');

    // Check for explicit excluded region mentions in location string
    for (const excludedPattern of EXCLUDED_REGION_PATTERNS) {
      if (excludedPattern.test(locationString)) {
        const isRemoteMatch = workplaceType === 'remote' || /\bremote\b/i.test(locationString);
        return {
          eligible: false,
          reason: 'EXCLUDED_GEOGRAPHY',
          geographyCategory: 'EXCLUDED',
          remoteCategory: isRemoteMatch ? 'REMOTE_EXCLUDED_REGION' : 'NOT_REMOTE',
          workplaceType,
          roleCategory,
          priorityScore: 0,
        };
      }
    }

    // Parse structured location via LocationParser
    const parsed = LocationParser.parseMultiple(locations);
    const parsedCountry = parsed.country ? parsed.country.toLowerCase() : null;

    // Check if parsed country is explicitly excluded
    if (parsedCountry && EXCLUDED_COUNTRIES.has(parsedCountry)) {
      const isRemoteMatch = workplaceType === 'remote' || parsed.isRemote;
      return {
        eligible: false,
        reason: 'EXCLUDED_GEOGRAPHY',
        geographyCategory: 'EXCLUDED',
        remoteCategory: isRemoteMatch ? 'REMOTE_EXCLUDED_REGION' : 'NOT_REMOTE',
        workplaceType,
        roleCategory,
        priorityScore: 0,
      };
    }

    // Determine Remote Category and Whitelist Geography
    const isRemote = workplaceType === 'remote' || parsed.isRemote || /\bremote\b/i.test(locationString);

    let geographyCategory: GeographyCategory = 'UNKNOWN';
    let remoteCategory: RemoteCategory = isRemote ? 'REMOTE_UNKNOWN' : 'NOT_REMOTE';

    if (parsedCountry === 'united states' || US_PATTERNS.test(locationString) || US_CITY_PATTERNS.test(locationString) || US_STATE_PATTERNS.test(locationString) || (parsed.region && LocationParser['isUSState']?.(parsed.region))) {
      geographyCategory = 'US';
      remoteCategory = isRemote ? 'REMOTE_US' : 'NOT_REMOTE';
    } else if (parsedCountry === 'canada' || CANADA_PATTERNS.test(locationString)) {
      geographyCategory = 'CANADA';
      remoteCategory = isRemote ? 'REMOTE_CANADA' : 'NOT_REMOTE';
    } else if ((parsedCountry && EUROPEAN_COUNTRIES.has(parsedCountry)) || EUROPE_PATTERNS.test(locationString)) {
      geographyCategory = 'EUROPE';
      remoteCategory = isRemote ? 'REMOTE_EUROPE' : 'NOT_REMOTE';
    } else if (WORLDWIDE_PATTERNS.test(locationString)) {
      geographyCategory = 'WORLDWIDE';
      remoteCategory = isRemote ? 'REMOTE_WORLDWIDE' : 'NOT_REMOTE';
    } else if (/\bnorth\s+america\b/i.test(locationString)) {
      geographyCategory = 'US';
      remoteCategory = isRemote ? 'REMOTE_NORTH_AMERICA' : 'NOT_REMOTE';
    }

    // If not remote, an eligible job MUST be located in US, Canada, or Europe
    if (!isRemote && geographyCategory === 'UNKNOWN') {
      return {
        eligible: false,
        reason: 'EXCLUDED_GEOGRAPHY',
        geographyCategory: 'UNKNOWN',
        remoteCategory: 'NOT_REMOTE',
        workplaceType,
        roleCategory,
        priorityScore: 0,
      };
    }

    // 4. WORK ARRANGEMENT PRIORITY
    // Priority: Remote (3) > Hybrid (2) > Onsite (1)
    let priorityScore = 1;
    if (isRemote) {
      priorityScore = 3;
    } else if (workplaceType === 'hybrid' || /\bhybrid\b/i.test(locationString)) {
      priorityScore = 2;
    }

    return {
      eligible: true,
      geographyCategory,
      remoteCategory,
      workplaceType: isRemote ? 'remote' : workplaceType,
      roleCategory,
      priorityScore,
    };
  }

  private static resolveWorkplaceType(job: JobCandidateData): 'remote' | 'hybrid' | 'on_site' | 'unspecified' {
    if (job.workplaceType === 'remote' || job.workplaceType === 'hybrid' || job.workplaceType === 'on_site') {
      return job.workplaceType;
    }
    const loc = Array.isArray(job.locations) ? job.locations.join(' ') : '';
    if (/\bremote\b/i.test(loc)) return 'remote';
    if (/\bhybrid\b/i.test(loc)) return 'hybrid';
    if (/\bon[\s-]?site\b/i.test(loc)) return 'on_site';
    return 'unspecified';
  }

  private static createIneligibleResult(
    reason: EligibilityExclusionReason,
    roleCategory: JobEligibilityResult['roleCategory'],
    geographyCategory: GeographyCategory,
    remoteCategory: RemoteCategory,
    workplaceType: 'remote' | 'hybrid' | 'on_site' | 'unspecified'
  ): JobEligibilityResult {
    return {
      eligible: false,
      reason,
      geographyCategory,
      remoteCategory,
      workplaceType,
      roleCategory,
      priorityScore: 0,
    };
  }
}
