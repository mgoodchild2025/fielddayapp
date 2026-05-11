import { z } from 'zod'

/**
 * Validates that a phone number, when provided, contains between 7 and 15 digits
 * after stripping formatting characters (spaces, dashes, parentheses, dots).
 * This covers both North American 10-digit numbers and international E.164 formats.
 */
const phoneRefine = (v: string | null | undefined) => {
  if (!v || v.trim() === '') return true
  const digits = v.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}
const phoneMessage = { message: 'Please enter a valid phone number' }

/** Optional phone — rejects non-empty values that don't look like a real phone number. */
export const optionalPhone = z
  .string()
  .optional()
  .refine(phoneRefine, phoneMessage)

/** Optional + nullable phone — same rules, also accepts null. */
export const nullablePhone = z
  .string()
  .optional()
  .nullable()
  .refine(phoneRefine, phoneMessage)
