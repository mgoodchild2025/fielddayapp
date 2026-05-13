'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

export type NavLink = {
  id: string
  label: string
  link_type: 'url' | 'document'
  url: string
  open_in_new_tab: boolean
  sort_order: number
}

const MAX_LINKS = 5
const MAX_PDF_BYTES = 10 * 1024 * 1024

function revalidate() {
  revalidatePath('/', 'layout')
  revalidatePath('/admin/settings/nav')
}

// ── Read ───────────────────────────────────────────────────────────────────────

export async function getNavLinks(orgId: string): Promise<NavLink[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any
  const { data } = await db
    .from('org_nav_links')
    .select('id, label, link_type, url, open_in_new_tab, sort_order')
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as NavLink[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function checkCap(db: any, orgId: string): Promise<boolean> {
  const { count } = await db
    .from('org_nav_links')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  return (count ?? 0) >= MAX_LINKS
}

async function nextSortOrder(db: any, orgId: string): Promise<number> {
  const { data } = await db
    .from('org_nav_links')
    .select('sort_order')
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: false })
    .limit(1)
  return ((data?.[0]?.sort_order ?? -1) as number) + 1
}

// ── Add URL link ───────────────────────────────────────────────────────────────

export async function addUrlNavLink(
  label: string,
  url: string,
  openInNewTab: boolean,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const trimmedLabel = label.trim()
  const trimmedUrl = url.trim()

  if (!trimmedLabel || trimmedLabel.length > 60) {
    return { error: 'Label must be 1–60 characters.' }
  }
  if (!trimmedUrl.match(/^https?:\/\//)) {
    return { error: 'URL must start with http:// or https://' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  if (await checkCap(db, org.id)) {
    return { error: `Maximum of ${MAX_LINKS} navigation links allowed.` }
  }

  const sortOrder = await nextSortOrder(db, org.id)

  const { error } = await db.from('org_nav_links').insert({
    organization_id: org.id,
    label: trimmedLabel,
    link_type: 'url',
    url: trimmedUrl,
    open_in_new_tab: openInNewTab,
    sort_order: sortOrder,
  })

  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

// ── Add document link ──────────────────────────────────────────────────────────

export async function addDocumentNavLink(
  formData: FormData,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const file = formData.get('file') as File | null
  const label = (formData.get('label') as string | null)?.trim() ?? ''

  if (!label || label.length > 60) {
    return { error: 'Label must be 1–60 characters.' }
  }
  if (!file || file.size === 0) {
    return { error: 'Please select a PDF file.' }
  }
  if (file.type !== 'application/pdf') {
    return { error: 'Only PDF files are supported.' }
  }
  if (file.size > MAX_PDF_BYTES) {
    return { error: 'File must be 10 MB or smaller.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  if (await checkCap(db, org.id)) {
    return { error: `Maximum of ${MAX_LINKS} navigation links allowed.` }
  }

  const ext = 'pdf'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const path = `${org.id}/nav/${filename}`
  const bytes = await file.arrayBuffer()

  const { error: upErr } = await db.storage
    .from('org-documents')
    .upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false })

  if (upErr) return { error: upErr.message }

  const { data: { publicUrl } } = db.storage.from('org-documents').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  const sortOrder = await nextSortOrder(db, org.id)

  const { error } = await db.from('org_nav_links').insert({
    organization_id: org.id,
    label,
    link_type: 'document',
    url,
    open_in_new_tab: true,
    sort_order: sortOrder,
  })

  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

// ── Update (label / URL / new-tab) ────────────────────────────────────────────

export async function updateNavLink(
  id: string,
  fields: { label?: string; url?: string; open_in_new_tab?: boolean },
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const update: Record<string, unknown> = {}
  if (fields.label !== undefined) {
    const label = fields.label.trim()
    if (!label || label.length > 60) return { error: 'Label must be 1–60 characters.' }
    update.label = label
  }
  if (fields.url !== undefined) {
    const url = fields.url.trim()
    if (!url.match(/^https?:\/\//)) return { error: 'URL must start with http:// or https://' }
    update.url = url
  }
  if (fields.open_in_new_tab !== undefined) {
    update.open_in_new_tab = fields.open_in_new_tab
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any
  const { error } = await db
    .from('org_nav_links')
    .update(update)
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

// ── Replace document PDF ───────────────────────────────────────────────────────

export async function replaceNavLinkDocument(
  id: string,
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const file = formData.get('pdf') as File | null  // PdfUploadField uses key 'pdf'
  if (!file || file.size === 0) return { url: null, error: 'Please select a PDF file.' }
  if (file.type !== 'application/pdf') return { url: null, error: 'Only PDF files are supported.' }
  if (file.size > MAX_PDF_BYTES) return { url: null, error: 'File must be 10 MB or smaller.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  // Fetch old row to attempt removal of old file
  const { data: row } = await db
    .from('org_nav_links')
    .select('url')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (row?.url) {
    try {
      const oldPath = new URL(row.url).pathname.split('/org-documents/')[1]?.split('?')[0]
      if (oldPath) await db.storage.from('org-documents').remove([oldPath])
    } catch { /* best-effort */ }
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  const path = `${org.id}/nav/${filename}`
  const bytes = await file.arrayBuffer()

  const { error: upErr } = await db.storage
    .from('org-documents')
    .upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false })

  if (upErr) return { url: null, error: upErr.message }

  const { data: { publicUrl } } = db.storage.from('org-documents').getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  const { error } = await db
    .from('org_nav_links')
    .update({ url })
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { url: null, error: error.message }
  revalidate()
  return { url, error: null }
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export async function deleteNavLink(id: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  // Fetch row first to clean up storage for document links
  const { data: row } = await db
    .from('org_nav_links')
    .select('link_type, url')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (row?.link_type === 'document' && row.url) {
    try {
      const oldPath = new URL(row.url).pathname.split('/org-documents/')[1]?.split('?')[0]
      if (oldPath) await db.storage.from('org-documents').remove([oldPath])
    } catch { /* best-effort */ }
  }

  const { error } = await db
    .from('org_nav_links')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

// ── Reorder ────────────────────────────────────────────────────────────────────

export async function reorderNavLinks(
  orderedIds: string[],
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .from('org_nav_links')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('organization_id', org.id)
    )
  )

  revalidate()
  return { error: null }
}
