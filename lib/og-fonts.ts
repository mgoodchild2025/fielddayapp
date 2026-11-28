/**
 * Fonts for generated images (next/og). Its built-in font has ONE weight, so
 * big "WIN" headlines came out thin. Inter is fetched from Google Fonts once
 * per weight (a plain request gets TrueType, which Satori needs), kept in
 * memory, and shared. A failed fetch gives back no fonts: the image still
 * renders in the built-in font rather than erroring.
 */
type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800 | 900; style: 'normal' }

const loads = new Map<number, Promise<ArrayBuffer | null>>()

function loadInter(weight: number): Promise<ArrayBuffer | null> {
  let p = loads.get(weight)
  if (!p) {
    p = (async () => {
      const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, { cache: 'force-cache' }).then((r) => r.text())
      const url = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/)?.[1]
      if (!url) return null
      const res = await fetch(url, { cache: 'force-cache' })
      return res.ok ? await res.arrayBuffer() : null
    })().catch(() => null)
    loads.set(weight, p)
    // A failure isn't cached: try again on the next image.
    p.then((d) => { if (!d) loads.delete(weight) })
  }
  return p
}

/** Inter 400/600/800/900 for ImageResponse `fonts`; [] if Google can't be reached. */
export async function ogFonts(): Promise<OgFont[]> {
  const weights = [400, 600, 800, 900] as const
  const data = await Promise.all(weights.map(loadInter))
  return weights.flatMap((w, i) => (data[i] ? [{ name: 'Inter', data: data[i]!, weight: w, style: 'normal' as const }] : []))
}
