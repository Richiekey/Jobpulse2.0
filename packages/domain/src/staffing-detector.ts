export interface StaffingDetectionResult {
  isStaffingAgency: boolean;
  agencyName?: string;
  confidence: number;
  reason?: string;
}

const KNOWN_STAFFING_AGENCIES: Array<{ name: string; aliases: string[] }> = [
  { name: 'Robert Half', aliases: ['robert half', 'roberthalf'] },
  { name: 'CyberCoders', aliases: ['cybercoders', 'cyber coders'] },
  { name: 'TEKsystems', aliases: ['teksystems', 'tek systems'] },
  { name: 'Apex Systems', aliases: ['apex systems'] },
  { name: 'Randstad', aliases: ['randstad', 'randstad usa', 'randstad technologies'] },
  { name: 'Insight Global', aliases: ['insight global'] },
  { name: 'Kelly Services', aliases: ['kelly services', 'kelly oliver', 'kelly science'] },
  { name: 'Aerotek', aliases: ['aerotek'] },
  { name: 'Kforce', aliases: ['kforce', 'kforce inc'] },
  { name: 'Manpower', aliases: ['manpower', 'manpowergroup', 'experis'] },
  { name: 'Adecco', aliases: ['adecco', 'adecco group'] },
  { name: 'Hays', aliases: ['hays', 'hays recruitment'] },
  { name: 'Michael Page', aliases: ['michael page', 'pagegroup'] },
  { name: 'Motion Recruitment', aliases: ['motion recruitment', 'jobspring partners', 'workbridge associates'] },
  { name: 'Beacon Hill Staffing', aliases: ['beacon hill', 'beacon hill staffing'] },
  { name: 'Lucas Group', aliases: ['lucas group'] },
  { name: 'The Judge Group', aliases: ['the judge group', 'judge group'] },
  { name: 'Modis', aliases: ['modis', 'akana'] },
  { name: 'Revature', aliases: ['revature'] },
  { name: 'LaSalle Network', aliases: ['lasalle network'] },
  { name: 'Addison Group', aliases: ['addison group'] },
  { name: 'Collabera', aliases: ['collabera'] },
  { name: 'Harvey Nash', aliases: ['harvey nash'] },
  { name: 'Robert Walters', aliases: ['robert walters'] },
  { name: 'Aston Carter', aliases: ['aston carter'] },
];

const STAFFING_NAME_PATTERNS = [
  /\bstaffing\b/i,
  /\brecruiting\b/i,
  /\brecruitment\b/i,
  /\btalent solutions\b/i,
  /\bsearch group\b/i,
  /\bsearch partners\b/i,
  /\bexecutive search\b/i,
  /\bplacement partners\b/i,
  /\bplacement group\b/i,
  /\bpersonnel\b/i,
  /\bheadhunters?\b/i,
  /\bworkforce solutions\b/i,
];

const CLIENT_DESCRIPTION_PATTERNS = [
  /\bour client (is|in|a|has|seeks|looking)\b/i,
  /\bon behalf of (our|a) client\b/i,
  /\bclient is an? (established|industry|growing|innovative)\b/i,
  /\bdirect-hire (opportunity|role|position) for our client\b/i,
  /\bcontract-to-hire (opportunity|role|position) with our client\b/i,
  /\bthis position is with our client\b/i,
  /\bwe are recruiting on behalf of\b/i,
  /\bconfidential client\b/i,
];

export class StaffingDetector {
  /**
   * Detects whether a company or job posting originates from a staffing or recruiting agency.
   */
  public static detect(companyName?: string | null, description?: string | null): StaffingDetectionResult {
    const cleanName = (companyName || '').trim().toLowerCase();

    // 1. Direct match against known major staffing agencies
    for (const agency of KNOWN_STAFFING_AGENCIES) {
      if (agency.aliases.some((alias) => cleanName === alias || cleanName.startsWith(`${alias} `) || cleanName.includes(` ${alias}`))) {
        return {
          isStaffingAgency: true,
          agencyName: agency.name,
          confidence: 0.99,
          reason: `Matched known agency: ${agency.name}`,
        };
      }
    }

    // 2. Name-based keyword match
    for (const pattern of STAFFING_NAME_PATTERNS) {
      if (pattern.test(cleanName)) {
        return {
          isStaffingAgency: true,
          agencyName: companyName || undefined,
          confidence: 0.92,
          reason: 'Company name contains recruiting or staffing terminology',
        };
      }
    }

    // 3. Job description cues
    if (description && description.length > 50) {
      for (const pattern of CLIENT_DESCRIPTION_PATTERNS) {
        if (pattern.test(description)) {
          return {
            isStaffingAgency: true,
            agencyName: companyName || undefined,
            confidence: 0.85,
            reason: 'Job description indicates client-representation third-party placement',
          };
        }
      }
    }

    return {
      isStaffingAgency: false,
      confidence: 0.0,
    };
  }
}
