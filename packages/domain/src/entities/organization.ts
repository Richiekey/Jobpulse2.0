import type { Database } from '../database.types.js';

export type OrgRole = Database['public']['Enums']['org_role_enum'];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
  updatedAt: string;
}
