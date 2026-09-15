// The Organization entity, in one place.
//
// Search engines and AI answer engines use this node to decide whether a
// business is real before recommending it, and to answer "how do I contact
// them?". Every value here must be independently verifiable on the site
// itself — the contact addresses are the ones published across the app and
// the legal documents, and the region is the one named in the privacy policy
// ("operated by KABOOM SG, located in Ontario, Canada"). Do not add a value
// here that is not published somewhere a reader can check.

export const SITE_URL = 'https://fielddayapp.ca'
export const ORGANIZATION_ID = `${SITE_URL}/#organization`

/** Published contact addresses, by what they are for. */
export const CONTACT_EMAILS = {
  general: 'hello@fielddayapp.ca',
  support: 'support@fielddayapp.ca',
  privacy: 'privacy@fielddayapp.ca',
} as const

export const ORGANIZATION_DESCRIPTION =
  'Fieldday is Canadian sports league management software for community sports organizations — online registration and payments (card, Interac e-transfer, and cash) with GST/PST/HST handling, scheduling, live standings, playoff brackets, and a branded public website for every league.'

export interface PostalAddressSchema {
  '@type': 'PostalAddress'
  addressRegion: string
  addressCountry: string
}

export interface ContactPointSchema {
  '@type': 'ContactPoint'
  contactType: string
  email: string
  areaServed: string
  availableLanguage: string[]
}

export interface OrganizationSchema {
  '@type': 'Organization'
  '@id': string
  name: string
  legalName: string
  url: string
  logo: string
  image: string
  description: string
  email: string
  address: PostalAddressSchema
  contactPoint: ContactPointSchema[]
  areaServed: string
  foundingLocation: { '@type': 'Place'; address: PostalAddressSchema }
}

const ADDRESS: PostalAddressSchema = {
  '@type': 'PostalAddress',
  // Region-level only: Ontario, Canada is what the published privacy policy
  // states. A street address is not published anywhere, so it is not asserted.
  addressRegion: 'ON',
  addressCountry: 'CA',
}

function contactPoint(contactType: string, email: string): ContactPointSchema {
  return {
    '@type': 'ContactPoint',
    contactType,
    email,
    areaServed: 'CA',
    availableLanguage: ['English'],
  }
}

export const ORGANIZATION_SCHEMA: OrganizationSchema = {
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'Fieldday',
  legalName: 'Fieldday Sports Technology Inc.',
  url: SITE_URL,
  logo: `${SITE_URL}/Fieldday-Icon.png`,
  image: `${SITE_URL}/opengraph-image.png`,
  description: ORGANIZATION_DESCRIPTION,
  email: CONTACT_EMAILS.general,
  address: ADDRESS,
  contactPoint: [
    contactPoint('sales', CONTACT_EMAILS.general),
    contactPoint('customer support', CONTACT_EMAILS.support),
    contactPoint('privacy', CONTACT_EMAILS.privacy),
  ],
  areaServed: 'CA',
  foundingLocation: { '@type': 'Place', address: ADDRESS },
}

/** Wrap nodes in a schema.org graph document ready for a ld+json script tag. */
export function schemaGraph(nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes }
}
