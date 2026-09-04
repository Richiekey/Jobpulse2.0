import { describe, it, expect } from 'vitest';
import {
  CreateOrganizationSchema,
  AddOrganizationMemberSchema,
  UpdateWorkerProfileSchema,
  CreateJobAssignmentSchema,
  UpdateJobAssignmentStatusSchema,
} from '../src/schemas/workforce.schema.js';

describe('Workforce & Organization Validation Schemas (Batch K)', () => {
  describe('CreateOrganizationSchema', () => {
    it('validates a correct organization creation payload', () => {
      const result = CreateOrganizationSchema.safeParse({
        name: 'Acme Corp Staffing',
        slug: 'acme-staffing',
        domain: 'acme.com',
        logoUrl: 'https://acme.com/logo.png',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid slug format', () => {
      const result = CreateOrganizationSchema.safeParse({
        name: 'Acme Staffing',
        slug: 'Acme Staffing!',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = CreateOrganizationSchema.safeParse({
        name: ' ',
        slug: 'acme',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AddOrganizationMemberSchema', () => {
    it('accepts valid member with userId and role', () => {
      const result = AddOrganizationMemberSchema.safeParse({
        userId: '11111111-1111-1111-1111-111111111111',
        role: 'worker',
      });
      expect(result.success).toBe(true);
    });

    it('accepts member with email invitation', () => {
      const result = AddOrganizationMemberSchema.safeParse({
        email: 'candidate@example.com',
        role: 'admin',
      });
      expect(result.success).toBe(true);
    });

    it('rejects payload missing both userId and email', () => {
      const result = AddOrganizationMemberSchema.safeParse({
        role: 'worker',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateWorkerProfileSchema', () => {
    it('validates full worker profile', () => {
      const result = UpdateWorkerProfileSchema.safeParse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        cvUrl: 'https://storage.jobpulse.com/resumes/worker1.pdf',
        resumes: [
          {
            id: 'res-1',
            name: 'Senior Frontend Resume',
            url: 'https://storage.jobpulse.com/resumes/worker1.pdf',
            uploadedAt: new Date().toISOString(),
            isPrimary: true,
          },
        ],
        skills: ['TypeScript', 'Next.js', 'PostgreSQL'],
        experienceYears: 5.5,
        education: [
          {
            institution: 'MIT',
            degree: 'BS',
            fieldOfStudy: 'Computer Science',
            graduationYear: 2020,
          },
        ],
        preferredRoles: ['Full Stack Engineer', 'Frontend Engineer'],
        preferredLocations: ['Remote', 'London, UK'],
        availability: 'immediate',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid organization UUID', () => {
      const result = UpdateWorkerProfileSchema.safeParse({
        organizationId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateJobAssignmentSchema', () => {
    it('validates valid assignment payload', () => {
      const result = CreateJobAssignmentSchema.safeParse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        jobId: '22222222-2222-2222-2222-222222222222',
        workerId: '33333333-3333-3333-3333-333333333333',
        deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Priority job apply with customized CV',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateJobAssignmentStatusSchema', () => {
    it('validates valid status transition payload', () => {
      const result = UpdateJobAssignmentStatusSchema.safeParse({
        status: 'in_progress',
        notes: 'Applied on company portal',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = UpdateJobAssignmentStatusSchema.safeParse({
        status: 'invalid_status',
      });
      expect(result.success).toBe(false);
    });
  });
});
