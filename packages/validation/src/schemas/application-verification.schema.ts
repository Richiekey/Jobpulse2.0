import { z } from 'zod';

export const VerificationStatusEnumSchema = z.enum([
  'pending',
  'verified',
  'rejected',
]);

const ALLOWED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;

/**
 * Storage Path validator
 * Strictly enforces that screenshotUrl is a private storage object path located within
 * the 'verification-screenshots' bucket, ending with a supported image extension.
 * Arbitrary external HTTP/HTTPS URLs are strictly rejected.
 */
const ScreenshotUrlSchema = z
  .string()
  .trim()
  .min(5, 'Screenshot reference must be at least 5 characters')
  .max(1024, 'Screenshot reference exceeds maximum length of 1024 characters')
  .refine(
    (val) =>
      val.startsWith('verification-screenshots/') &&
      !val.startsWith('http://') &&
      !val.startsWith('https://') &&
      !val.includes('..') &&
      ALLOWED_IMAGE_EXTENSIONS.test(val),
    {
      message:
        'Screenshot reference must be a valid storage path located within verification-screenshots/ ending with .png, .jpg, .jpeg, .webp, or .gif (external URLs are strictly prohibited)',
    }
  );

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
