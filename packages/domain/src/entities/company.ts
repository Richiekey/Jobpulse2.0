export interface Company {
  id: string;
  name: string;
  normalizedName: string;
  website?: string | null;
  careersUrl?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  status: 'active' | 'inactive' | 'pending_verification';
  createdAt: string;
  updatedAt: string;
}

export interface CompanySourceConfig {
  id: string;
  companyId: string;
  sourceId: string;
  sourceIdentifier: string;
  sourceUrl?: string | null;
  adapterConfig: Record<string, unknown>;
  isActive: boolean;
  healthStatus: 'healthy' | 'degraded' | 'failing' | 'disabled';
  consecutiveFailures: number;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
}
