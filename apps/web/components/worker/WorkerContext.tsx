'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface UserOrganization {
  id: string;
  name: string;
  slug?: string;
  domain?: string | null;
  logoUrl?: string | null;
  membershipRole: 'owner' | 'admin' | 'worker';
  joinedAt?: string;
}

interface WorkerContextType {
  user: any | null;
  isAdmin: boolean;
  organizations: UserOrganization[];
  activeOrgId: string | null;
  activeOrg: UserOrganization | null;
  setActiveOrgId: (orgId: string | null) => void;
  isLoading: boolean;
  refreshOrganizations: () => Promise<void>;
  signOut: () => Promise<void>;
}

const WorkerContext = createContext<WorkerContextType | undefined>(undefined);

export const WorkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch('/api/organizations');
      if (res.ok) {
        const json = await res.json();
        const orgs = json.data || [];
        setOrganizations(orgs);

        // Check if there is an organizationId in searchParams
        const queryOrgId = searchParams.get('organizationId');
        if (queryOrgId && orgs.some((o: UserOrganization) => o.id === queryOrgId)) {
          setActiveOrgIdState(queryOrgId);
        } else if (orgs.length === 1 && !activeOrgId) {
          // If user belongs to exactly one organization, select it by default
          setActiveOrgIdState(orgs[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch organizations for worker:', err);
    }
  }, [searchParams, activeOrgId]);

  useEffect(() => {
    let cancelled = false;
    async function initAuth() {
      try {
        const supabase = createClient();
        const { data: { user: authUser }, error } = await supabase.auth.getUser();

        if (cancelled) return;

        if (error || !authUser) {
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        setUser(authUser);

        // Check if platform admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authUser.id)
          .maybeSingle();

        if (!cancelled && profile && (profile as any).role === 'admin') {
          setIsAdmin(true);
        }

        await fetchOrganizations();
      } catch (err) {
        console.error('Worker auth initialization error:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    initAuth();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, fetchOrganizations]);

  const setActiveOrgId = (orgId: string | null) => {
    setActiveOrgIdState(orgId);
    // Update query param smoothly without reloading
    const params = new URLSearchParams(searchParams.toString());
    if (orgId) {
      params.set('organizationId', orgId);
    } else {
      params.delete('organizationId');
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const activeOrg = organizations.find((o) => o.id === activeOrgId) || null;

  return (
    <WorkerContext.Provider
      value={{
        user,
        isAdmin,
        organizations,
        activeOrgId,
        activeOrg,
        setActiveOrgId,
        isLoading,
        refreshOrganizations: fetchOrganizations,
        signOut,
      }}
    >
      {children}
    </WorkerContext.Provider>
  );
};

export const useWorker = (): WorkerContextType => {
  const ctx = useContext(WorkerContext);
  if (!ctx) {
    throw new Error('useWorker must be used within a WorkerProvider');
  }
  return ctx;
};
