import { describe, expect, it } from 'vitest'
import { assetBelongsToOrg, assetIsInFolder, eventFolderFor, leagueIdFromEventFolder, vetParamsToSign } from './cloudinary-scope'

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const LEAGUE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = 1_800_000_000
const folder = eventFolderFor(ORG, LEAGUE)

describe('leagueIdFromEventFolder', () => {
  it('reads the league from an event folder of this org only', () => {
    expect(leagueIdFromEventFolder(folder, ORG)).toBe(LEAGUE)
    expect(leagueIdFromEventFolder(eventFolderFor(OTHER, LEAGUE), ORG)).toBeNull()
    for (const bad of [`${folder}/../x`, `${folder}/sub`, `fieldday/${ORG}`, `x/${folder}`, '', null, 42]) {
      expect(leagueIdFromEventFolder(bad, ORG)).toBeNull()
    }
  })
})

describe('vetParamsToSign', () => {
  it('signs what the widget sends', () => {
    const res = vetParamsToSign({ timestamp: NOW, folder, source: 'uw' }, ORG, NOW)
    expect(res).toEqual({ ok: true, params: { timestamp: NOW, folder, source: 'uw' }, leagueId: LEAGUE })
  })

  it('refuses options that choose where or how the file is written', () => {
    for (const key of ['public_id', 'overwrite', 'invalidate', 'eager', 'upload_preset', 'type', 'notification_url', 'asset_folder', 'use_filename']) {
      expect(vetParamsToSign({ timestamp: NOW, folder, [key]: 'x' }, ORG, NOW).ok, key).toBe(false)
    }
  })

  it("refuses another org's folder, a missing folder and a stale timestamp", () => {
    expect(vetParamsToSign({ timestamp: NOW, folder: eventFolderFor(OTHER, LEAGUE) }, ORG, NOW).ok).toBe(false)
    expect(vetParamsToSign({ timestamp: NOW }, ORG, NOW).ok).toBe(false)
    expect(vetParamsToSign({ timestamp: NOW - 7200, folder }, ORG, NOW).ok).toBe(false)
    expect(vetParamsToSign({ timestamp: 'soon', folder }, ORG, NOW).ok).toBe(false)
  })

  it('refuses values that are not plain text or numbers', () => {
    expect(vetParamsToSign({ timestamp: NOW, folder, tags: ['a'] }, ORG, NOW).ok).toBe(false)
    expect(vetParamsToSign({ timestamp: NOW, folder, context: 'x'.repeat(501) }, ORG, NOW).ok).toBe(false)
    expect(vetParamsToSign(null, ORG, NOW).ok).toBe(false)
    expect(vetParamsToSign([], ORG, NOW).ok).toBe(false)
  })
})

describe('asset ownership', () => {
  it('accepts either folder mode', () => {
    expect(assetIsInFolder({ public_id: `${folder}/abc123` }, folder)).toBe(true)
    expect(assetIsInFolder({ public_id: 'abc123', asset_folder: folder }, folder)).toBe(true)
    expect(assetIsInFolder({ public_id: 'abc123', folder }, folder)).toBe(true)
  })

  it('refuses assets elsewhere', () => {
    expect(assetIsInFolder({ public_id: 'abc123' }, folder)).toBe(false)
    expect(assetIsInFolder({ public_id: `${eventFolderFor(OTHER, LEAGUE)}/abc` }, folder)).toBe(false)
    expect(assetIsInFolder({ public_id: `${folder}/../../x` }, folder)).toBe(false)
    expect(assetIsInFolder(null, folder)).toBe(false)
  })

  it("knows an org's assets from another's", () => {
    expect(assetBelongsToOrg({ public_id: `${folder}/abc` }, ORG)).toBe(true)
    expect(assetBelongsToOrg({ public_id: 'abc', asset_folder: `fieldday/${ORG}/events/x` }, ORG)).toBe(true)
    expect(assetBelongsToOrg({ public_id: `${folder}/abc` }, OTHER)).toBe(false)
    expect(assetBelongsToOrg({ public_id: 'abc' }, ORG)).toBe(false)
  })
})
