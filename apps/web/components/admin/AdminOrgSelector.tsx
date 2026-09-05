'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Building2, ChevronDown, Check, Shield, Globe, Users } from 'lucide-react';

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  logo_url?: string | null;
  membershipRole: 'owner' | 'admin' | 'worker';
  joinedAt?: string;
}

interface AdminOrgSelectorProps {
  currentOrgId: string | null;
  isPlatformAdmin: boolean;
  onSelectOrg: (org: AdminOrganization | null) => void;
}

export const AdminOrgSelector: React.FC<AdminOrgSelectorProps> = ({
  currentOrgId,
  isPlatformAdmin,
  onSelectOrg,
}) => {
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch organizations caller belongs to as admin or owner
  useEffect(() => {
    let cancelled = false;

    async function fetchOrganizations() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/organizations');
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (cancelled) return;

        const allOrgs: AdminOrganization[] = json.data || [];
        // Filter orgs where user is admin or owner, unless platform admin who can view all
        const manageable = isPlatformAdmin
          ? allOrgs
          : allOrgs.filter((o) => o.membershipRole === 'owner' || o.membershipRole === 'admin');

        setOrganizations(manageable);

        // Auto-select first org if none selected and not explicitly platform view
        if (!currentOrgId && manageable.length > 0) {
          onSelectOrg(manageable[0]);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load organizations');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchOrganizations();
    return () => {
      cancelled = true;
    };
  }, [isPlatformAdmin]);

  const activeOrg = organizations.find((o) => o.id === currentOrgId) || null;

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="btn btn-secondary"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 14px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          cursor: loading ? 'wait' : 'pointer',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          fontWeight: 600,
          minWidth: '200px',
          justifyContent: 'space-between',
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              flexShrink: 0,
            }}
          >
            {activeOrg ? <Building2 size={15} /> : <Globe size={15} />}
          </div>
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '140px',
            }}
          >
            {loading
              ? 'Loading Orgs…'
              : activeOrg
              ? activeOrg.name
              : isPlatformAdmin
              ? 'All Organizations'
              : 'Select Organization'}
          </span>
        </div>

        {activeOrg && (
          <span
            style={{
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 6px',
              borderRadius: '4px',
              background:
                activeOrg.membershipRole === 'owner'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(99, 102, 241, 0.15)',
              color: activeOrg.membershipRole === 'owner' ? '#f59e0b' : '#818cf8',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {activeOrg.membershipRole}
          </span>
        )}

        <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: '260px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            overflow: 'hidden',
            padding: '6px',
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              fontWeight: 700,
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '4px',
            }}
          >
            Switch Organization
          </div>

          {/* Platform superadmin option */}
          {isPlatformAdmin && (
            <button
              onClick={() => {
                onSelectOrg(null);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                border: 'none',
                background: currentOrgId === null ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                color: currentOrgId === null ? '#818cf8' : 'var(--text-primary)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={15} color="#818cf8" />
                <div>
                  <div style={{ fontWeight: 600 }}>Platform-Wide View</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Superadmin scope</div>
                </div>
              </div>
              {currentOrgId === null && <Check size={16} color="#818cf8" />}
            </button>
          )}

          {organizations.map((org) => {
            const isSelected = org.id === currentOrgId;
            return (
              <button
                key={org.id}
                onClick={() => {
                  onSelectOrg(org);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                  color: isSelected ? '#818cf8' : 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <Building2 size={15} color={isSelected ? '#818cf8' : 'var(--text-muted)'} />
                  <div style={{ overflow: 'hidden' }}>
                    <div
                      style={{
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {org.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      slug: {org.slug}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {org.membershipRole}
                  </span>
                  {isSelected && <Check size={16} color="#818cf8" />}
                </div>
              </button>
            );
          })}

          {organizations.length === 0 && !loading && (
            <div
              style={{
                padding: '12px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
              }}
            >
              {error ? error : 'No organizations found.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
