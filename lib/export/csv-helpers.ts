import Papa from 'papaparse'

// UTF-8 BOM for Excel compatibility
const BOM = '\xEF\xBB\xBF'

/**
 * Converts an array of objects to a CSV string with UTF-8 BOM.
 * Returns a Uint8Array suitable for inclusion in a ZIP archive.
 *
 * @param rows     Data rows to serialise.
 * @param columns  Expected column names. When rows is empty these are used to
 *                 write a header-only file so the file is readable and clearly
 *                 structured rather than containing only the raw BOM bytes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCsvBytes(rows: any[], columns?: string[]): Uint8Array {
  if (rows.length === 0) {
    // Write header row using supplied column names so the file is useful even
    // when the table has no data.  Without this, the file contains only the
    // UTF-8 BOM (EF BB BF), which appears as "ï»¿" in Latin-1 editors.
    const header = columns && columns.length > 0
      ? BOM + columns.map(c => `"${c}"`).join(',') + '\n'
      : BOM + '\n'
    return new TextEncoder().encode(header)
  }
  const csv = Papa.unparse(rows, {
    quotes: true,       // always quote fields
    delimiter: ',',
    newline: '\n',      // LF only
    header: true,
  })
  return new TextEncoder().encode(BOM + csv)
}

/**
 * Converts a JS object to a pretty-printed JSON Uint8Array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toJsonBytes(obj: any): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj, null, 2))
}

/**
 * Converts a plain string to a Uint8Array.
 */
export function toTextBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/**
 * Computes SHA-256 hex digest of a Uint8Array using the Web Crypto API.
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
