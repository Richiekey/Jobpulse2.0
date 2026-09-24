import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/api-response';
import { AuthGuard } from '@/lib/auth-guard';
import { LocationParser, JobFunctionTaxonomy } from '@jobpulse/domain';
import { z } from 'zod';

const ExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  q: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  function: z.string().max(300).optional(),
  ats: z.string().max(300).optional(),
  workplace: z.string().max(200).optional(),
  employment: z.string().max(200).optional(),
  skills: z.string().max(300).optional(),
  salary_min: z.coerce.number().min(0).optional(),
  salary_max: z.coerce.number().min(0).optional(),
  currency: z.string().trim().max(10).toUpperCase().optional(),
  has_salary: z.coerce.boolean().optional(),
  date_preset: z.enum(['24h', '3d', '7d', '14d', '30d', 'all']).optional(),
});

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) return authResult.errorResponse;

    const { searchParams } = new URL(request.url);
    const parseResult = ExportQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid export query parameters: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const {
      format,
      limit,
      q,
      search,
      function: fnParam,
      ats: atsParam,
      workplace,
      employment,
      skills: skillsParam,
      salary_min,
      salary_max,
      currency,
      has_salary,
      date_preset,
    } = parseResult.data;

    const searchTerm = (q || search || '').trim();
    const supabase = await createClient();

    let dbQuery = supabase
      .from('jobs')
      .select(`
        id,
        canonical_title,
        display_title,
        employment_type,
        workplace_type,
        locations,
        salary_min,
        salary_max,
        salary_currency,
        salary_interval,
        skills,
        posted_at,
        apply_url,
        canonical_url,
        company:companies (
          id,
          name,
          domain,
          logo_url
        ),
        source:company_sources (
          ats_platform
        )
      `)
      .eq('status', 'active')
      .order('posted_at', { ascending: false })
      .limit(limit);

    if (workplace) {
      dbQuery = dbQuery.eq('workplace_type', workplace);
    }
    if (employment) {
      dbQuery = dbQuery.eq('employment_type', employment);
    }
    if (salary_min !== undefined) {
      dbQuery = dbQuery.gte('annualized_min', salary_min);
    }
    if (salary_max !== undefined) {
      dbQuery = dbQuery.lte('annualized_max', salary_max);
    }
    if (currency) {
      dbQuery = dbQuery.eq('salary_currency', currency);
    }
    if (has_salary !== undefined) {
      dbQuery = dbQuery.eq('has_salary', has_salary);
    }
    if (skillsParam) {
      const skillTokens = skillsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (skillTokens.length > 0) {
        dbQuery = dbQuery.contains('skills', skillTokens);
      }
    }
    if (searchTerm) {
      dbQuery = dbQuery.or(`display_title.ilike.%${searchTerm}%,canonical_title.ilike.%${searchTerm}%`);
    }

    if (date_preset && date_preset !== 'all') {
      const now = new Date();
      const presetHours: Record<string, number> = {
        '24h': 24,
        '3d': 72,
        '7d': 168,
        '14d': 336,
        '30d': 720,
      };
      const hours = presetHours[date_preset];
      if (hours) {
        const threshold = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
        dbQuery = dbQuery.gte('posted_at', threshold);
      }
    }

    const { data: rawJobs, error } = await dbQuery;
    if (error) {
      return ApiResponse.error('Failed to query jobs for export.', error, 500);
    }

    const jobs = (rawJobs || []).map((j: any) => ({
      id: j.id,
      title: j.display_title || j.canonical_title,
      company: j.company?.name || 'Unknown Company',
      locations: Array.isArray(j.locations) ? j.locations.join('; ') : '',
      workplace: j.workplace_type || 'unspecified',
      employment: j.employment_type || 'other',
      salary_min: j.salary_min ?? '',
      salary_max: j.salary_max ?? '',
      currency: j.salary_currency || '',
      interval: j.salary_interval || '',
      skills: Array.isArray(j.skills) ? j.skills.join('; ') : '',
      posted_at: j.posted_at || '',
      apply_url: j.apply_url || j.canonical_url || '',
      ats: j.source?.ats_platform || '',
    }));

    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      return new NextResponse(JSON.stringify(jobs, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="jobpulse-export-${dateStr}.json"`,
        },
      });
    }

    // CSV format
    const csvHeaders = [
      'ID',
      'Title',
      'Company',
      'Locations',
      'Workplace Type',
      'Employment Type',
      'Salary Min',
      'Salary Max',
      'Currency',
      'Salary Interval',
      'Skills',
      'Posted At',
      'Apply URL',
      'ATS Platform',
    ];

    const rows = [csvHeaders.join(',')];
    for (const job of jobs) {
      const row = [
        escapeCsvCell(job.id),
        escapeCsvCell(job.title),
        escapeCsvCell(job.company),
        escapeCsvCell(job.locations),
        escapeCsvCell(job.workplace),
        escapeCsvCell(job.employment),
        escapeCsvCell(job.salary_min),
        escapeCsvCell(job.salary_max),
        escapeCsvCell(job.currency),
        escapeCsvCell(job.interval),
        escapeCsvCell(job.skills),
        escapeCsvCell(job.posted_at),
        escapeCsvCell(job.apply_url),
        escapeCsvCell(job.ats),
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="jobpulse-export-${dateStr}.csv"`,
      },
    });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while generating the export.', err, 500);
  }
}
