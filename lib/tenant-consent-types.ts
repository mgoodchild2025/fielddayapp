/** The three document slugs that form the mandatory tenant consent bundle. */
export const TENANT_CONSENT_SLUGS = ['terms', 'tenant-privacy', 'dpa'] as const
export type TenantConsentSlug = (typeof TENANT_CONSENT_SLUGS)[number]
