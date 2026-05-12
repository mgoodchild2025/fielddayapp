'use server'

import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type LeagueDocument = {
  id: string
  title: string
  file_url: string
  sort_order: number
  created_at: string
}

const MAX_DOCS = 10
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export async function getLeagueDocuments(leagueId: string): Promise<LeagueDocument[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any
  const { data } = await db
    .from('league_documents')
    .select('id, title, file_url, sort_order, created_at')
    .eq('league_id', leagueId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as LeagueDocument[]
}

export async function addLeagueDocument(
  leagueId: string,
  title: string,
  formData: FormData,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'Please select a file' }
  if (file.type !== 'application/pdf') return { error: 'Only PDF files are supported' }
  if (file.size > MAX_SIZE) return { error: 'File too large (max 10 MB)' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  // Enforce 10-doc limit
  const { count } = await db
    .from('league_documents')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
  if ((count ?? 0) >= MAX_DOCS) return { error: `Maximum of ${MAX_DOCS} documents per event` }

  // Upload to existing org-documents bucket.
  // Convert to Buffer first — passing a File object directly through a server
  // action boundary can produce an empty body in Supabase Storage.
  const path = `${org.id}/${leagueId}/docs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await db.storage
    .from('org-documents')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: false })
  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = db.storage.from('org-documents').getPublicUrl(path)

  // next sort_order = current max + 1
  const { data: top } = await db
    .from('league_documents')
    .select('sort_order')
    .eq('league_id', leagueId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = ((top?.[0]?.sort_order ?? -1) as number) + 1

  await db.from('league_documents').insert({
    organization_id: org.id,
    league_id: leagueId,
    title: title.trim() || file.name.replace(/\.pdf$/i, ''),
    file_url: publicUrl,
    sort_order: nextOrder,
  })

  revalidatePath(`/admin/events/${leagueId}`)
  return { error: null }
}

export async function updateLeagueDocumentTitle(
  documentId: string,
  title: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any
  const { error } = await db
    .from('league_documents')
    .update({ title: title.trim() })
    .eq('id', documentId)
    .eq('organization_id', org.id)
  return { error: error?.message ?? null }
}

export async function deleteLeagueDocument(
  documentId: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any

  // Fetch the URL so we can remove the storage object too
  const { data: doc } = await db
    .from('league_documents')
    .select('file_url, league_id')
    .eq('id', documentId)
    .eq('organization_id', org.id)
    .single()

  if (doc?.file_url) {
    try {
      const url = new URL(doc.file_url as string)
      const marker = '/org-documents/'
      const idx = url.pathname.indexOf(marker)
      if (idx !== -1) {
        const storagePath = url.pathname.slice(idx + marker.length)
        await db.storage.from('org-documents').remove([storagePath])
      }
    } catch {
      // best-effort storage cleanup — proceed with row deletion regardless
    }
  }

  const { error } = await db
    .from('league_documents')
    .delete()
    .eq('id', documentId)
    .eq('organization_id', org.id)

  if (doc?.league_id) revalidatePath(`/admin/events/${doc.league_id as string}`)
  return { error: error?.message ?? null }
}

export async function reorderLeagueDocuments(
  leagueId: string,
  orderedIds: string[],
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .from('league_documents')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('organization_id', org.id)
    )
  )

  return { error: null }
}
