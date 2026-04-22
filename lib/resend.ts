import { Resend } from 'resend'

export const getResend = () => new Resend(process.env.RESEND_API_KEY ?? 'placeholder')

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'hello@fielddayapp.ca'
