'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronDown, Check, Shield, Globe, Users, PlusCircle, X, RefreshCw } from 'lucide-react';

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

  // Create Organization modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createDomain, setCreateDomain] = useState('');
  const [createLogoUrl, setCreateLogoUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

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

  // Fetch organizations
  const fetchOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/organizations');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const json = await res.json();

      const allOrgs: AdminOrganization[] = json.data || [];
      const manageable = isPlatformAdmin
        ? allOrgs
        : allOrgs.filter((o) => o.membershipRole === 'owner' || o.membershipRole === 'admin');

      setOrganizations(manageable);

      if (!currentOrgId && manageable.length > 0) {
        onSelectOrg(manageable[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [isPlatformAdmin]);

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setCreateName(val);
    if (!slugManuallyEdited) {
      setCreateSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 50)
      );
    }
  };

  const handleCreateOrganization = async () => {
    if (!createName.trim() || !createSlug.trim()) return;
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          slug: createSlug.trim(),
          domain: createDomain.trim() || null,
          logoUrl: createLogoUrl.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed to create organization (HTTP ${res.status})`);
      }

      const json = await res.json();
      const newOrg = json.data;

      // Reset form
      setCreateName('');
      setCreateSlug('');
      setCreateDomain('');
      setCreateLogoUrl('');
      setSlugManuallyEdited(false);
      setShowCreateModal(false);

      // Refresh org list and auto-select new org
      await fetchOrganizations();
      if (newOrg?.id) {
        onSelectOrg({
          id: newOrg.id,
          name: newOrg.name || createName,
          slug: newOrg.slug || createSlug,
          domain: newOrg.domain || null,
          logo_url: newOrg.logo_url || null,
          membershipRole: 'owner',
        });
      }
    } catch (err: any) {
      setCreateError(err.message || 'Error creating organization.');
    } finally {
      setCreating(false);
    }
  };

  const activeOrg = organizations.find((o) => o.id === currentOrgId) || null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
  };

  return (
    <>
      <div style={{ position: 'relative', zIndex: 1000 }} ref={dropdownRef}>
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
            border: '1px solid var(--border-default)',
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
                ? 'Loading Orgsâ€¦'
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
              background: '#151c2e',
              border: '1px solid var(--border-default)',
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
                borderBottom: '1px solid var(--border-default)',
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

            {/* Create Organization Button */}
            {isPlatformAdmin && (
              <>
                <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowCreateModal(true);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: '#10b981',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontWeight: 600,
                  }}
                >
                  <PlusCircle size={15} />
                  <span>Create Organization</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
            overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div
            className="ui-card-elevated"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              background: '#151c2e',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Building2 size={20} color="#10b981" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Create Organization</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    You'll be automatically assigned as the owner.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {createError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#f87171',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Organization Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={createName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  style={inputStyle}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Slug * <span style={{ fontWeight: 400, fontSize: '0.7rem' }}>(URL-safe identifier)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. acme-corp"
                  value={createSlug}
                  onChange={(e) => {
                    setCreateSlug(e.target.value);
                    setSlugManuallyEdited(true);
                  }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Domain <span style={{ fontWeight: 400, fontSize: '0.7rem' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. acme.com"
                  value={createDomain}
                  onChange={(e) => setCreateDomain(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Logo URL <span style={{ fontWeight: 400, fontSize: '0.7rem' }}>(optional)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={createLogoUrl}
                  onChange={(e) => setCreateLogoUrl(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrganization}
                disabled={creating || !createName.trim() || !createSlug.trim()}
                className="btn btn-primary"
                style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {creating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Creatingâ€¦</span>
                  </>
                ) : (
                  <>
                    <PlusCircle size={14} />
                    <span>Create Organization</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
};

