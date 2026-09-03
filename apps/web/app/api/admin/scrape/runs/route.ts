import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

export interface AdminScrapeRunItem {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  executionMode: string;
  startedAt: string;
  completedAt: string | null;
  sourcesTargeted: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  jobsDiscovered: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRejected: number;
  jobsFailed: number;
  outcomeText: string;
  metadata?: Record<string, unknown>;
  errorSummary?: unknown;
}

/**
 * GET /api/admin/scrape/runs
 * 
 * Returns the most recent scrape execution runs with human-readable outcome classification.
 */
export async function GET(_request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;

    const { data: runs, error } = await supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) {
      return ApiResponse.error('Failed to fetch recent scrape runs.', error, 500);
    }

    const now = Date.now();

    const formattedRuns: AdminScrapeRunItem[] = (runs || []).map((r) => {
      const meta = (r.metadata || {}) as Record<string, unknown>;
      const executionMode = (meta['execution_mode'] as string) || 'manual_global';
      const rawOutcome = meta['outcome'] as string | undefined;

      const sourcesTargeted = Number(meta['sources_targeted'] ?? r.companies_attempted ?? 0);
      const sourcesAttempted = Number(r.companies_attempted ?? 0);
      const sourcesSucceeded = Number(r.companies_succeeded ?? 0);
      const sourcesFailed = Number(r.companies_failed ?? 0);
      const jobsDiscovered = Number(r.jobs_discovered ?? 0);
      const jobsInserted = Number(r.jobs_inserted ?? 0);
      const jobsUpdated = Number(r.jobs_updated ?? 0);
      const jobsRejected = Number(r.jobs_rejected ?? 0);
      const jobsFailed = Number(r.jobs_failed ?? 0);

      // Derive human-readable outcome
      let outcomeText = 'In progress';
      const startedAgeMs = now - new Date(r.started_at).getTime();
      const isStalePending = r.status === 'pending' && startedAgeMs > 15 * 60 * 1000;

      if (r.status === 'completed') {
        if (rawOutcome === 'zero_sources_due' || (sourcesAttempted === 0 && sourcesTargeted > 0)) {
          outcomeText = 'Completed — 0 sources due';
        } else if (jobsDiscovered === 0) {
          outcomeText = 'Completed — 0 jobs discovered';
        } else {
          outcomeText = `Completed — ${jobsInserted + jobsUpdated} jobs ingested`;
        }
      } else if (r.status === 'failed' || isStalePending) {
        outcomeText = 'Failed — worker unavailable';
      } else if (r.status === 'pending') {
        outcomeText = 'Queued — waiting for worker';
      } else if (r.status === 'running') {
        outcomeText = 'Running — processing sources...';
      }

      return {
        id: r.id,
        status: isStalePending ? 'failed' : (r.status as any),
        executionMode,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        sourcesTargeted,
        sourcesAttempted,
        sourcesSucceeded,
        sourcesFailed,
        jobsDiscovered,
        jobsInserted,
        jobsUpdated,
        jobsRejected,
        jobsFailed,
        outcomeText,
        metadata: meta,
        errorSummary: r.error_summary,
      };
    });

    return ApiResponse.success({ runs: formattedRuns });
  } catch (err) {
    return ApiResponse.error('Unexpected error fetching scrape runs.', err, 500);
  }
}
