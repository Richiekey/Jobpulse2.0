/**
 * JobPulse 2.0 — Job Alert Matching Engine
 * 
 * Evaluates newly ingested jobs against active user alerts with multi-criteria filtering
 * and guarantees strict anti-duplicate delivery invariants.
 */

export type AlertFrequency = 'instant' | 'daily' | 'weekly';
export type AlertChannel = 'email' | 'webhook' | 'in_app';
export type AlertRemoteType = 'remote' | 'hybrid' | 'onsite' | 'any';

export interface JobAlert {
  id: string;
  userId: string;
  title: string;
  query?: string | null;
  location?: string | null;
  department?: string | null;
  employmentType?: string | null;
  remoteType?: AlertRemoteType | null;
  frequency: AlertFrequency;
  channel: AlertChannel;
  webhookUrl?: string | null;
  isActive: boolean;
  lastDispatchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobAlertMatchCandidate {
  id: string;
  title: string;
  companyName?: string;
  locationRaw?: string | null;
  department?: string | null;
  employmentType?: string | null;
  remoteType?: string | null;
  descriptionText?: string | null;
  url: string;
}

export interface AlertMatchResult {
  alert: JobAlert;
  matchedJobs: JobAlertMatchCandidate[];
  newMatchedJobIds: string[];
}

export class JobAlertMatchingService {
  /**
   * Evaluates whether a candidate job matches a specific user alert criteria.
   */
  public static matchesJob(job: JobAlertMatchCandidate, alert: JobAlert): boolean {
    if (!alert.isActive) {
      return false;
    }

    // 1. Keyword Query Matching (Title, Company, or Description)
    if (alert.query && alert.query.trim().length > 0) {
      const keywords = alert.query.toLowerCase().trim().split(/\s+/);
      const searchableText = [
        job.title,
        job.companyName || '',
        job.descriptionText || '',
      ].join(' ').toLowerCase();

      const allKeywordsMatch = keywords.every((kw) => searchableText.includes(kw));
      if (!allKeywordsMatch) {
        return false;
      }
    }

    // 2. Location Matching
    if (alert.location && alert.location.trim().length > 0) {
      const alertLoc = alert.location.toLowerCase().trim();
      const jobLoc = (job.locationRaw || '').toLowerCase();
      if (!jobLoc.includes(alertLoc)) {
        return false;
      }
    }

    // 3. Department Matching
    if (alert.department && alert.department.trim().length > 0) {
      const alertDept = alert.department.toLowerCase().trim();
      const jobDept = (job.department || '').toLowerCase();
      if (!jobDept.includes(alertDept)) {
        return false;
      }
    }

    // 4. Employment Type Matching
    if (alert.employmentType && alert.employmentType.trim().length > 0) {
      const alertType = alert.employmentType.toLowerCase().trim();
      const jobType = (job.employmentType || '').toLowerCase();
      if (!jobType.includes(alertType)) {
        return false;
      }
    }

    // 5. Remote Type Matching
    if (alert.remoteType && alert.remoteType !== 'any') {
      const alertRemote = alert.remoteType.toLowerCase();
      const jobRemote = (job.remoteType || '').toLowerCase();
      if (alertRemote === 'remote' && !jobRemote.includes('remote')) {
        return false;
      }
      if (alertRemote === 'hybrid' && !jobRemote.includes('hybrid')) {
        return false;
      }
      if (alertRemote === 'onsite' && !jobRemote.includes('onsite') && !jobRemote.includes('in-office') && jobRemote.includes('remote')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates a batch of jobs against all active alerts, returning only newly matched, undelivered jobs.
   * INVARIANT: Never delivers the same job ID twice to the same alert.
   */
  public static evaluateAlerts(
    newJobs: JobAlertMatchCandidate[],
    activeAlerts: JobAlert[],
    previouslyDeliveredJobIdsByAlert: Map<string, Set<string>>
  ): AlertMatchResult[] {
    const results: AlertMatchResult[] = [];

    for (const alert of activeAlerts) {
      if (!alert.isActive) continue;

      const previouslyDelivered = previouslyDeliveredJobIdsByAlert.get(alert.id) || new Set<string>();
      const matchedCandidates: JobAlertMatchCandidate[] = [];
      const newJobIds: string[] = [];

      for (const job of newJobs) {
        if (previouslyDelivered.has(job.id)) {
          continue; // Skip already delivered job
        }

        if (this.matchesJob(job, alert)) {
          matchedCandidates.push(job);
          newJobIds.push(job.id);
        }
      }

      if (matchedCandidates.length > 0) {
        results.push({
          alert,
          matchedJobs: matchedCandidates,
          newMatchedJobIds: newJobIds,
        });
      }
    }

    return results;
  }
}
