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

    // Fetch organizations that the user belongs to along with their role
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
