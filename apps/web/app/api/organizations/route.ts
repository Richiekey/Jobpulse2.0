import { NextRequest } from 'next/server';
import { AuthGuard } from '@/lib/auth-guard';
import { ApiResponse } from '@/lib/api-response';
import { CreateOrganizationSchema } from '@jobpulse/validation';

export async function GET() {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { user, supabase } = authResult;

    // Check if user is platform super-admin (platform-wide organization discovery)
    let isPlatformAdmin = false;
    try {
      const profileQuery = supabase.from('profiles');
      if (typeof profileQuery?.select === 'function') {
        const selectQuery = profileQuery.select('id, role');
        if (typeof selectQuery?.eq === 'function') {
          const { data: profile } = await selectQuery
            .eq('id', user.id)
            .maybeSingle();
          isPlatformAdmin = Boolean(profile && (profile as any).role === 'admin');
        }
      }
    } catch {
      // Fall through to standard direct organization membership discovery
    }

    if (isPlatformAdmin) {
      const { data: allOrgs, error: orgsError } = await supabase
        .from('organizations')
        .select('id, name, slug, domain, logo_url, created_at')
        .order('name', { ascending: true });

      if (orgsError) {
        return ApiResponse.error('Failed to retrieve organizations.', orgsError, 500);
      }

      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, role, created_at')
        .eq('user_id', user.id);

      const membershipMap = new Map((memberships || []).map((m: any) => [m.organization_id, m]));

      const orgs = (allOrgs || []).map((org: any) => {
        const m = membershipMap.get(org.id);
        return {
          ...org,
          membershipRole: m ? m.role : 'owner',
          joinedAt: m ? m.created_at : org.created_at,
        };
      });

      return ApiResponse.success(orgs);
    }

    // Standard organization member discovery: strictly scoped to direct memberships
    const { data: memberships, error: memberError } = await supabase
      .from('organization_members')
      .select('role, created_at, organizations (id, name, slug, domain, logo_url, created_at)')
      .eq('user_id', user.id);

    if (memberError) {
      return ApiResponse.error('Failed to retrieve organizations.', memberError, 500);
    }

    const orgs = (memberships || []).map((m: any) => ({
      ...m.organizations,
      membershipRole: m.role,
      joinedAt: m.created_at,
    }));

    return ApiResponse.success(orgs);
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while listing organizations.', err, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await AuthGuard.requireAuthenticatedUser();
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }

    const { supabase } = authResult;
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = CreateOrganizationSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return ApiResponse.error(
        `Invalid organization data: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error,
        400
      );
    }

    const { name, slug, domain, logoUrl } = parseResult.data;

    // Use atomic database RPC to create org and assign caller as owner
    const { data, error: rpcError } = await supabase.rpc('create_organization_with_owner', {
      p_name: name,
      p_slug: slug,
      p_domain: domain || null,
      p_logo_url: logoUrl || null,
    });

    if (rpcError) {
      if (rpcError.message.includes('CONFLICT')) {
        return ApiResponse.error('Organization slug is already in use.', rpcError, 409);
      }
      return ApiResponse.error('Failed to create organization.', rpcError, 500);
    }

    return ApiResponse.success(data, undefined, { status: 201 });
  } catch (err) {
    return ApiResponse.error('An unexpected error occurred while creating organization.', err, 500);
  }
}
