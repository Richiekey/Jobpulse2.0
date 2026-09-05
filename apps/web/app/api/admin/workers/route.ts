import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      return ApiResponse.error('Invalid or missing organizationId query parameter.', null, 400);
    }

    const authResult = await AuthGuard.requireOrgAdmin(organizationId);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;

    // Fetch members who are workers (or admins) in this org
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        role,
        created_at,
        profiles (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('organization_id', organizationId);

    if (membersError) {
      return ApiResponse.error('Failed to retrieve organization workers.', membersError, 500);
    }

    // Fetch worker profiles for this org
    const { data: profiles, error: profilesError } = await supabase
      .from('worker_profiles')
      .select('*')
      .eq('organization_id', organizationId);

    if (profilesError) {
      return ApiResponse.error('Failed to retrieve worker profiles.', profilesError, 500);
    }

    const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]));

    // Fetch assignment counts per worker
    const { data: assignments } = await supabase
      .from('job_assignments')
      .select('worker_id, status')
      .eq('organization_id', organizationId);

    const statsMap = new Map<string, { total: number; assigned: number; in_progress: number; completed: number; skipped: number; cancelled: number }>();
    for (const a of assignments || []) {
      const stats = statsMap.get(a.worker_id) || { total: 0, assigned: 0, in_progress: 0, completed: 0, skipped: 0, cancelled: 0 };
      stats.total += 1;
      if (a.status in stats) {
        (stats as any)[a.status] += 1;
      }
      statsMap.set(a.worker_id, stats);
    }

    const workers = (members || []).map((m: any) => {
      const wp = profileMap.get(m.user_id);
      const stats = statsMap.get(m.user_id) || { total: 0, assigned: 0, in_progress: 0, completed: 0, skipped: 0, cancelled: 0 };

      return {
        memberId: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.created_at,
        email: m.profiles?.email || null,
        fullName: m.profiles?.full_name || null,
        avatarUrl: m.profiles?.avatar_url || null,
        profile: wp ? {
          cvUrl: wp.cv_url,
          skills: wp.skills,
          experienceYears: wp.experience_years,
          education: wp.education,
          preferredRoles: wp.preferred_roles,
          preferredLocations: wp.preferred_locations,
          availability: wp.availability,
          notes: wp.notes,
          updatedAt: wp.updated_at,
        } : null,
        assignmentStats: stats,
      };
    });

    return ApiResponse.success(workers);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while listing workers.', err, 500);
  }
}
