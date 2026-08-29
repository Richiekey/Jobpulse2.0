import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAdmin();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Concurrent aggregate queries
    const [
      companiesResult,
      sourcesResult,
      jobsActiveResult,
      jobsExpiredResult,
      scrapeRuns24hResult,
      clicks24hResult,
      applicationsResult,
    ] = await Promise.all([
      // Total & verified companies
      supabase.from('companies').select('id, verified', { count: 'exact' }),

      // Company sources health breakdown
      supabase.from('company_sources').select('id, health_status, is_active', { count: 'exact' }),

      // Active jobs
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'active'),

      // Expired jobs
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'expired'),

      // 24h scrape runs
      supabase.from('scrape_runs').select('id, status').gte('started_at', oneDayAgo),

      // 24h outbound clicks
      supabase.from('outbound_clicks').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),

      // Applications by status
      supabase.from('applications').select('id, status', { count: 'exact' }),
    ]);

    // Compute Company metrics
    const totalCompanies = companiesResult.count ?? (companiesResult.data?.length || 0);
    const verifiedCompanies = (companiesResult.data || []).filter((c: any) => c.verified).length;

    // Compute Source health breakdown
    const sourcesData = sourcesResult.data || [];
    const totalSources = sourcesResult.count ?? sourcesData.length;
    const activeSources = sourcesData.filter((s: any) => s.is_active).length;
    const healthBreakdown = {
      healthy: sourcesData.filter((s: any) => s.health_status === 'healthy').length,
      degraded: sourcesData.filter((s: any) => s.health_status === 'degraded').length,
      failing: sourcesData.filter((s: any) => s.health_status === 'failing').length,
      unreachable: sourcesData.filter((s: any) => s.health_status === 'unreachable').length,
    };

    // Compute Scrape runs 24h metrics
    const runs24h = scrapeRuns24hResult.data || [];
    const totalRuns24h = runs24h.length;
    const successfulRuns24h = runs24h.filter((r: any) => r.status === 'completed').length;
    const failedRuns24h = runs24h.filter((r: any) => r.status === 'failed').length;
    const successRate24h = totalRuns24h > 0 ? Number(((successfulRuns24h / totalRuns24h) * 100).toFixed(1)) : 100;

    // Compute Applications metrics
    const appsData = applicationsResult.data || [];
    const totalApplications = applicationsResult.count ?? appsData.length;
    const applicationsByStatus: Record<string, number> = {};
    for (const app of appsData) {
      applicationsByStatus[app.status] = (applicationsByStatus[app.status] || 0) + 1;
    }

    const metrics = {
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
      },
      companies: {
        total: totalCompanies,
        verified: verifiedCompanies,
      },
      sources: {
        total: totalSources,
        active: activeSources,
        health: healthBreakdown,
      },
      jobs: {
        active: jobsActiveResult.count || 0,
        expired: jobsExpiredResult.count || 0,
      },
      ingestion24h: {
        totalRuns: totalRuns24h,
        successfulRuns: successfulRuns24h,
        failedRuns: failedRuns24h,
        successRatePercent: successRate24h,
      },
      engagement: {
        outboundClicks24h: clicks24hResult.count || 0,
        totalApplicationsTracked: totalApplications,
        applicationsByStatus,
      },
    };

    return ApiResponse.success(metrics);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while compiling system metrics.', err, 500);
  }
}
