/**
 * Escape text for HTML — element content and quoted attribute values alike.
 * Every value a person typed (names, team names, messages) goes through this
 * before it is put into an email or an HTML response: unescaped, a player
 * named `<a href=…>` turned Fieldday's own emails into phishing mail.
 */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
