import { describe, expect, it } from 'vitest'
import { detectMapPlatform, mapsHref, opensInNewTab } from './maps'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}

describe('detectMapPlatform', () => {
  it('spots iPhone and Android', () => {
    expect(detectMapPlatform(UA.iphone, 5)).toBe('ios')
    expect(detectMapPlatform(UA.android, 5)).toBe('android')
  })
  it('treats a touch "Mac" as an iPad', () => {
    expect(detectMapPlatform(UA.ipadOs, 5)).toBe('ios')
  })
  it('leaves desktops on the web', () => {
    expect(detectMapPlatform(UA.macDesktop, 0)).toBe('web')
    expect(detectMapPlatform(UA.windows, 0)).toBe('web')
    expect(detectMapPlatform('', 0)).toBe('web')
  })
})

describe('mapsHref', () => {
  const address = '1 Woodbine Ave, Toronto, ON'
  it('opens Apple Maps on iOS', () => {
    expect(mapsHref(address, 'ios')).toBe('https://maps.apple.com/?q=1%20Woodbine%20Ave%2C%20Toronto%2C%20ON')
  })
  it('uses a geo: URI on Android', () => {
    expect(mapsHref(address, 'android')).toBe('geo:0,0?q=1%20Woodbine%20Ave%2C%20Toronto%2C%20ON')
  })
  it('keeps Google Maps on the web', () => {
    expect(mapsHref(address, 'web')).toBe('https://www.google.com/maps/search/?api=1&query=1%20Woodbine%20Ave%2C%20Toronto%2C%20ON')
  })
  it('encodes characters that would break the query', () => {
    expect(mapsHref(' Rink #2 & Field ', 'android')).toBe('geo:0,0?q=Rink%20%232%20%26%20Field')
  })
})

describe('opensInNewTab', () => {
  it('only the web link opens a new tab', () => {
    expect(opensInNewTab('web')).toBe(true)
    expect(opensInNewTab('ios')).toBe(false)
    expect(opensInNewTab('android')).toBe(false)
  })
})
