import { describe, it, expect } from 'vitest'
import {
  ORGANIZATION_SCHEMA,
  ORGANIZATION_ID,
  CONTACT_EMAILS,
  schemaGraph,
  SITE_URL,
} from './org-schema'

describe('ORGANIZATION_SCHEMA', () => {
  it('carries the identity fields agents check: name, url, logo, description', () => {
    expect(ORGANIZATION_SCHEMA['@type']).toBe('Organization')
    expect(ORGANIZATION_SCHEMA['@id']).toBe(ORGANIZATION_ID)
    expect(ORGANIZATION_SCHEMA.name).toBe('Fieldday')
    expect(ORGANIZATION_SCHEMA.url).toBe(SITE_URL)
    expect(ORGANIZATION_SCHEMA.logo).toMatch(/^https:\/\/fielddayapp\.ca\//)
    expect(ORGANIZATION_SCHEMA.description.length).toBeGreaterThan(100)
  })

  it('has a PostalAddress with country and region', () => {
    expect(ORGANIZATION_SCHEMA.address['@type']).toBe('PostalAddress')
    expect(ORGANIZATION_SCHEMA.address.addressCountry).toBe('CA')
    expect(ORGANIZATION_SCHEMA.address.addressRegion).toBe('ON')
  })

  it('has contactPoints with a contactType and a reachable email each', () => {
    expect(ORGANIZATION_SCHEMA.contactPoint.length).toBeGreaterThanOrEqual(3)
    for (const cp of ORGANIZATION_SCHEMA.contactPoint) {
      expect(cp['@type']).toBe('ContactPoint')
      expect(cp.contactType.length).toBeGreaterThan(0)
      expect(cp.email).toMatch(/^[^@\s]+@fielddayapp\.ca$/)
      expect(cp.availableLanguage).toContain('English')
    }
  })

  it('exposes support and privacy contacts, not just sales', () => {
    const types = ORGANIZATION_SCHEMA.contactPoint.map((c) => c.contactType)
    expect(types).toContain('sales')
    expect(types).toContain('customer support')
    expect(types).toContain('privacy')
    const emails = ORGANIZATION_SCHEMA.contactPoint.map((c) => c.email)
    expect(emails).toContain(CONTACT_EMAILS.support)
    expect(emails).toContain(CONTACT_EMAILS.privacy)
  })

  it('asserts no street address, since none is published', () => {
    expect(JSON.stringify(ORGANIZATION_SCHEMA)).not.toContain('streetAddress')
  })

  it('serializes to JSON without loss', () => {
    expect(JSON.parse(JSON.stringify(ORGANIZATION_SCHEMA))).toEqual(ORGANIZATION_SCHEMA)
  })
})

describe('schemaGraph', () => {
  it('wraps nodes with the schema.org context', () => {
    const doc = schemaGraph([ORGANIZATION_SCHEMA])
    expect(doc['@context']).toBe('https://schema.org')
    expect(doc['@graph']).toHaveLength(1)
  })
})
