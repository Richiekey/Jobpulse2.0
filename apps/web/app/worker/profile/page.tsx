'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  GraduationCap,
  Sparkles,
  MapPin,
  Clock,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { useWorker } from '@/components/worker/WorkerContext';

interface ResumeItem {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  isPrimary?: boolean;
}

interface EducationItem {
  institution: string;
  degree?: string | null;
  fieldOfStudy?: string | null;
  graduationYear?: number | null;
}

export default function WorkerProfilePage() {
  const { activeOrgId, organizations } = useWorker();

  // Selected organization for profile
  const [selectedOrgId, setSelectedOrgId] = useState<string>(activeOrgId || organizations[0]?.id || '');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [cvUrl, setCvUrl] = useState('');
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [experienceYears, setExperienceYears] = useState<number | ''>('');
  const [education, setEducation] = useState<EducationItem[]>([]);
  const [preferredRoles, setPreferredRoles] = useState<string[]>([]);
  const [roleInput, setRoleInput] = useState('');
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [availability, setAvailability] = useState<string>('immediate');
  const [notes, setNotes] = useState('');

  // Sync selectedOrgId with activeOrgId
  useEffect(() => {
    if (activeOrgId) {
      setSelectedOrgId(activeOrgId);
    } else if (organizations.length > 0 && !selectedOrgId) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [activeOrgId, organizations, selectedOrgId]);

  const fetchProfile = useCallback(async () => {
    if (!selectedOrgId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/profile?organizationId=${selectedOrgId}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to load profile.');
      }

      const p = json.data;
      if (p) {
        setCvUrl(p.cv_url || '');
        setResumes(p.resumes || []);
        setSkills(p.skills || []);
        setExperienceYears(p.experience_years != null ? p.experience_years : '');
        setEducation(p.education || []);
        setPreferredRoles(p.preferred_roles || []);
        setPreferredLocations(p.preferred_locations || []);
        setAvailability(p.availability || 'immediate');
        setNotes(p.notes || '');
      } else {
        // Reset to default blank state
        setCvUrl('');
        setResumes([]);
        setSkills([]);
        setExperienceYears('');
        setEducation([]);
        setPreferredRoles([]);
        setPreferredLocations([]);
        setAvailability('immediate');
        setNotes('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve profile.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleAddSkill = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(skills.filter((item) => item !== skill));
  };

  const handleAddRole = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const r = roleInput.trim();
    if (r && !preferredRoles.includes(r)) {
      setPreferredRoles([...preferredRoles, r]);
      setRoleInput('');
    }
  };

  const handleRemoveRole = (role: string) => {
    setPreferredRoles(preferredRoles.filter((item) => item !== role));
  };

  const handleAddLocation = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const loc = locationInput.trim();
    if (loc && !preferredLocations.includes(loc)) {
      setPreferredLocations([...preferredLocations, loc]);
      setLocationInput('');
    }
  };

  const handleRemoveLocation = (loc: string) => {
    setPreferredLocations(preferredLocations.filter((item) => item !== loc));
  };

  const handleAddEducation = () => {
    setEducation([
      ...education,
      { institution: '', degree: '', fieldOfStudy: '', graduationYear: new Date().getFullYear() },
    ]);
  };

  const handleUpdateEducation = (index: number, field: keyof EducationItem, value: any) => {
    const updated = [...education];
    updated[index] = { ...updated[index], [field]: value };
    setEducation(updated);
  };

  const handleRemoveEducation = (index: number) => {
    setEducation(education.filter((_, i) => i !== index));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) {
      alert('Please select an organization to save your worker profile.');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const payload: Record<string, any> = {
        organizationId: selectedOrgId,
        cvUrl: cvUrl.trim() ? cvUrl.trim() : null,
        resumes,
        skills,
        experienceYears: experienceYears === '' ? null : Number(experienceYears),
        education: education.filter((e) => e.institution.trim() !== ''),
        preferredRoles,
        preferredLocations,
        availability,
        notes: notes.trim() ? notes.trim() : null,
      };

      const res = await fetch('/api/worker/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save worker profile.');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Error saving profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <User size={24} style={{ color: 'var(--brand-text)' }} />
              <span>Worker Profile & Preferences</span>
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Maintain your credentials, skills, experience, and availability for job dispatches.
            </p>
          </div>

          {/* Org Selector */}
          {organizations.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={16} style={{ color: 'var(--text-muted)' }} />
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="input"
                style={{ fontSize: '0.8125rem', padding: '6px 10px', height: '36px' }}
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.membershipRole})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--success-surface)',
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--success-text)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={18} />
          <span>Worker profile successfully saved!</span>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--danger-surface)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger-text)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Availability & Experience Section */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} style={{ color: 'var(--brand-text)' }} />
            <span>Availability & Experience</span>
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Availability Status:
              </label>
              <select
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="immediate">Immediate Availability</option>
                <option value="two_weeks">2 Weeks Notice</option>
                <option value="one_month">1 Month Notice</option>
                <option value="not_available">Not Available</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Years of Professional Experience:
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 5"
                className="input"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Primary CV / Resume Link */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: 'var(--brand-text)' }} />
            <span>Resume & CV Link</span>
          </h2>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Public or Cloud CV URL:
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="url"
                value={cvUrl}
                onChange={(e) => setCvUrl(e.target.value)}
                placeholder="https://drive.google.com/file/... or https://linkedin.com/in/..."
                className="input"
                style={{ flex: 1 }}
              />
              {cvUrl && (
                <a
                  href={cvUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px' }}
                >
                  <ExternalLink size={14} />
                  <span>Test Link</span>
                </a>
              )}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              A direct link to your latest resume, portfolio, or Google Drive PDF.
            </span>
          </div>
        </div>

        {/* Skills Tag Manager */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--brand-text)' }} />
            <span>Skills & Technologies</span>
          </h2>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleAddSkill}
              placeholder="e.g. TypeScript, React, Next.js, Node.js..."
              className="input"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={handleAddSkill}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {skills.map((skill) => (
              <span
                key={skill}
                style={{
                  fontSize: '0.8125rem',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--brand-surface)',
                  color: 'var(--brand-text)',
                  border: '1px solid var(--brand-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{skill}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(skill)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                  aria-label={`Remove ${skill}`}
                >
                  ×
                </button>
              </span>
            ))}
            {skills.length === 0 && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No skills added yet. Add your core competencies above.
              </span>
            )}
          </div>
        </div>

        {/* Roles & Locations Preferences */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} style={{ color: 'var(--brand-text)' }} />
            <span>Target Roles & Locations</span>
          </h2>

          {/* Preferred Roles */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Preferred Job Titles:
            </label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <input
                type="text"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={handleAddRole}
                placeholder="e.g. Senior Frontend Engineer, Staff DevOps..."
                className="input"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={handleAddRole} className="btn btn-secondary">
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {preferredRoles.map((r) => (
                <span
                  key={r}
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{r}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRole(r)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Preferred Locations */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Preferred Locations or Remote:
            </label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={handleAddLocation}
                placeholder="e.g. Remote, San Francisco, London..."
                className="input"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={handleAddLocation} className="btn btn-secondary">
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {preferredLocations.map((loc) => (
                <span
                  key={loc}
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{loc}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveLocation(loc)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Education History */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GraduationCap size={18} style={{ color: 'var(--brand-text)' }} />
              <span>Education</span>
            </h2>
            <button
              type="button"
              onClick={handleAddEducation}
              className="btn btn-secondary"
              style={{ fontSize: '0.8125rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Plus size={14} />
              <span>Add School</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {education.map((edu, idx) => (
              <div
                key={idx}
                style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 36px',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  value={edu.institution}
                  onChange={(e) => handleUpdateEducation(idx, 'institution', e.target.value)}
                  placeholder="Institution / University"
                  className="input"
                  style={{ fontSize: '0.8125rem' }}
                />
                <input
                  type="text"
                  value={edu.degree || ''}
                  onChange={(e) => handleUpdateEducation(idx, 'degree', e.target.value)}
                  placeholder="Degree (e.g. B.S.)"
                  className="input"
                  style={{ fontSize: '0.8125rem' }}
                />
                <input
                  type="text"
                  value={edu.fieldOfStudy || ''}
                  onChange={(e) => handleUpdateEducation(idx, 'fieldOfStudy', e.target.value)}
                  placeholder="Field of Study"
                  className="input"
                  style={{ fontSize: '0.8125rem' }}
                />
                <input
                  type="number"
                  value={edu.graduationYear || ''}
                  onChange={(e) => handleUpdateEducation(idx, 'graduationYear', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Year"
                  className="input"
                  style={{ fontSize: '0.8125rem' }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveEducation(idx)}
                  className="btn-icon"
                  style={{ color: 'var(--danger-text)' }}
                  aria-label="Remove education entry"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {education.length === 0 && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No education history added yet.
              </div>
            )}
          </div>
        </div>

        {/* Notes & Bio */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
        >
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Professional Summary / Bio:
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Brief overview of your background, achievements, or target role specifics..."
            className="input"
            rows={4}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ fontSize: '0.9375rem', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
            disabled={isSaving}
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving Profile...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
