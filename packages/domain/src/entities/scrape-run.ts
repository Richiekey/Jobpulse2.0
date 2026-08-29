export type ScrapeRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ScrapeRun {
  id: string;
  startedAt: string;
  completedAt?: string | null;
  status: ScrapeRunStatus;
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
  metadata: {
    partial_failure?: boolean;
    concurrency?: number;
    worker_id?: string;
    [key: string]: unknown;
  };
}

export interface ScrapeRunSource {
  id: string;
  scrapeRunId: string;
  companySourceId: string;
  status: 'succeeded' | 'failed' | 'skipped';
  jobsDiscovered: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRejected: number;
  jobsFailed: number;
  errorMessage?: string | null;
  durationMs: number;
  metadata: Record<string, unknown>;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
}
