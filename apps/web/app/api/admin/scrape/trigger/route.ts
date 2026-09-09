import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { z } from 'zod';

const ScrapeTriggerSchema = z.object({
  companyIdentifier: z.string().trim().max(100).optional(),
  sourceId: z.string().uuid().optional(),
  executionMode: z.enum(['scheduled', 'manual_global', 'manual_company', 'manual_source']).optional(),
});

/**
 * POST /api/admin/scrape/trigger
 * 
 * Atomically schedules a scrape run for a target company source or global crawl.
 * HARD INVARIANT (P0): Uses PostgreSQL `schedule_admin_scrape_run` RPC with explicit
 * execution mode and global concurrency serialization.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authorize Admin
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase, profile } = authResult;

    // 2. Validate Request Payload
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = ScrapeTriggerSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid request payload: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { companyIdentifier, sourceId } = parseResult.data;

    let executionMode = parseResult.data.executionMode;
    if (!executionMode) {
      if (sourceId) {
        executionMode = 'manual_source';
      } else if (companyIdentifier && companyIdentifier !== 'all') {
        executionMode = 'manual_company';
      } else {
        executionMode = 'manual_global';
      }
    }

    // 3. Atomically schedule scrape run via PostgreSQL RPC with transactional advisory locking
    const { data: result, error: rpcError } = await supabase.rpc('schedule_admin_scrape_run', {
      p_admin_id: profile.id,
      p_company_identifier: companyIdentifier || 'all',
      p_source_id: sourceId || null,
      p_ttl_seconds: 900,
      p_execution_mode: executionMode,
    });

    if (rpcError || !result) {
      return ApiResponse.error(
        'Failed to execute atomic scrape scheduling RPC in database.',
        rpcError,
        500
      );
    }

    if (!result.success) {
      if (result.conflict) {
        return ApiResponse.error(
          result.message || 'A crawl run is already in progress or queued for this target.',
          { existingRunId: result.existing_run_id, status: result.existing_status },
          409
        );
      }
      if (result.error_type === 'NOT_FOUND') {
        return ApiResponse.error(result.message, undefined, 404);
      }
      if (result.error_type === 'DISABLED') {
        return ApiResponse.error(result.message, { sourceId, isActive: false }, 400);
      }
      return ApiResponse.error(result.message || 'Could not schedule scrape run.', undefined, 400);
    }

    // 4. Attempt automated GitHub Actions workflow dispatch if token is configured
    const githubToken = process.env.GITHUB_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPOSITORY || 'Richiekey/Jobpulse2.0';
    const githubWorkflow = process.env.GITHUB_SCRAPER_WORKFLOW || 'jobpulse-scraper.yml';
    const githubRef = process.env.GITHUB_DISPATCH_REF || 'main';

    let githubDispatched = false;
    let dispatchMessage = 'Queued in database. Awaiting worker execution.';

    if (githubToken) {
      try {
        const dispatchUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/${githubWorkflow}/dispatches`;
        const dispatchRes = await fetch(dispatchUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${githubToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'JobPulse-Web-Dispatcher',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: githubRef,
            inputs: {
              run_id: result.run_id,
              company: companyIdentifier || '',
              force_due: 'true',
            },
          }),
        });

        if (dispatchRes.ok || dispatchRes.status === 204) {
          githubDispatched = true;
          dispatchMessage = 'GitHub Actions scraper workflow dispatched successfully.';

          // Update run metadata with github_dispatched flag
          const { data: currentRun } = await supabase
            .from('scrape_runs')
            .select('metadata')
            .eq('id', result.run_id)
            .single();

          const currentMeta = (currentRun?.metadata as Record<string, unknown>) || {};
          await supabase
            .from('scrape_runs')
            .update({
              metadata: {
                ...currentMeta,
                github_dispatched: true,
                github_dispatched_at: new Date().toISOString(),
                github_repo: githubRepo,
              },
            })
            .eq('id', result.run_id);
        } else {
          const errText = await dispatchRes.text().catch(() => '');
          console.warn(`GitHub workflow dispatch returned status ${dispatchRes.status}: ${errText}`);
          dispatchMessage = `Crawl queued in database, but GitHub dispatch returned status ${dispatchRes.status}.`;
        }
      } catch (dispatchErr) {
        console.warn('GitHub workflow dispatch error:', dispatchErr);
        dispatchMessage = 'Crawl queued in database, but an error occurred dispatching GitHub Actions.';
      }
    }

    return ApiResponse.success(
      {
        message: githubDispatched
          ? 'Scrape run scheduled and GitHub Actions worker dispatched!'
          : 'Scrape run successfully scheduled and queued for execution.',
        runId: result.run_id,
        status: result.status,
        executionMode: result.execution_mode || executionMode,
        companyIdentifier: result.company_identifier,
        sourceId: result.source_id,
        scheduledAt: result.scheduled_at,
        githubDispatched,
        dispatchMessage,
      },
      undefined,
      { status: 202 }
    );
  } catch (err) {
    return ApiResponse.error(
      'An unexpected error occurred while processing the scrape request.',
      err,
      500
    );
  }
}
