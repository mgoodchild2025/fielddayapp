import { describe, expect, it } from 'vitest'
import { escapeHtml } from './html-escape'
import { buildJoinRequestEmail, buildTeamInviteEmail } from './email'

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#x27;y&#x27;&gt;&amp;&lt;/a&gt;')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('email builders', () => {
  it('never pass a typed name or message through as markup', () => {
    const html = buildJoinRequestEmail({
      teamName: 'Net <b>Gains</b>', orgName: 'KABOOM', playerName: '<a href="https://evil.example">Click</a>',
      playerEmail: 'p@example.com', message: '<img src=x onerror=alert(1)>', teamUrl: 'https://kaboom.fielddayapp.ca/teams/1?a=1&b=2',
    })
    expect(html).not.toContain('<a href="https://evil.example">')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Click&lt;/a&gt;')
    expect(html).toContain('href="https://kaboom.fielddayapp.ca/teams/1?a=1&amp;b=2"')
  })

  it('keeps optional values optional', () => {
    const html = buildTeamInviteEmail({
      teamName: 'Dig It', leagueName: null, orgName: 'KABOOM', invitedBy: 'Sam "the Hammer"', role: 'player',
      acceptUrl: 'https://kaboom.fielddayapp.ca/invite/t', declineUrl: 'https://kaboom.fielddayapp.ca/invite/t?decline=1',
    })
    expect(html).toContain('Sam &quot;the Hammer&quot;')
    expect(html).not.toContain(' for <strong>')
  })
})
