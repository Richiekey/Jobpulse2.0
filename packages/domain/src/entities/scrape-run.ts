export interface ScrapeRun {
  id: string;
  startedAt: string;
  completedAt?: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  companiesAttempted: number;
  companiesSucceeded: number;
  companiesFailed: number;
  jobsDiscovered: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRejected: number;
  jobsFailed: number;
  errorSummary: Array<{
    companySourceId?: string;
    error: string;
    timestamp: string;
  }>;
  metadata: Record<string, unknown>;
}

export interface ScrapeRunSource {
  id: string;
  scrapeRunId: string;
  companySourceId: string;
  status: 'succeeded' | 'failed' | 'skipped';
  jobsDiscovered: number;
  jobsInserted: number;
  jobsUpdated: number;
  errorMessage?: string | null;
  durationMs: number;
  createdAt: string;
}
