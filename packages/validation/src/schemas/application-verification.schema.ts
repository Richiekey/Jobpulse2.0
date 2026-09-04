import { z } from 'zod';

export const VerificationStatusEnumSchema = z.enum([
  'pending',
  'verified',
  'rejected',
]);

const ALLOWED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;

/**
 * Storage Path or URL validator
 * Validates that screenshotUrl is either:
 * 1) A relative storage path targeting the verification-screenshots bucket:
 *    e.g. 'verification-screenshots/.../file.png' or '{org_or_user}/{app_id}/{file}.png'
 * 2) An HTTPS/HTTP URL ending with a supported image extension or targeting supabase storage
 */
const ScreenshotUrlSchema = z
  .string()
  .trim()
  .min(5, 'Screenshot reference must be at least 5 characters')
  .max(2048, 'Screenshot reference exceeds maximum length of 2048 characters')
  .refine((val) => {
    // Check if it is a valid URL
    try {
      const parsed = new URL(val);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      return true;
    } catch {
      // If not a full URL, validate as a structured storage path
      // Must not contain path traversal characters (..)
      if (val.includes('..')) {
        return false;
      }
      return ALLOWED_IMAGE_EXTENSIONS.test(val);
    }
  }, {
    message: 'Screenshot URL must be a valid URL or a storage path referencing an authorized image file (.png, .jpg, .jpeg, .webp, .gif)',
  });

export const CreateVerificationSchema = z.object({
  screenshotUrl: ScreenshotUrlSchema,
  idempotencyKey: z.string().trim().min(1).max(128).optional().nullable(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
});

export const ReviewVerificationSchema = z.object({
  verificationId: z
    .string()
    .uuid('Verification ID must be a valid UUID')
    .optional(),
  status: z.enum(['verified', 'rejected'], {
    errorMap: () => ({ message: "Review status must be either 'verified' or 'rejected'" }),
  }),
  reviewerNotes: z
    .string()
    .trim()
    .max(1000, 'Reviewer notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
});

export const VerificationQuerySchema = z.object({
  status: VerificationStatusEnumSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateVerificationInput = z.infer<typeof CreateVerificationSchema>;
export type ReviewVerificationInput = z.infer<typeof ReviewVerificationSchema>;
export type VerificationQueryInput = z.infer<typeof VerificationQuerySchema>;
