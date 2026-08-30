'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

export type AdminDocument = {
  id: string
  league_id: string | null
  name: string
  category: 'permit' | 'insurance' | 'contract' | 'other'
  file_path: string
  created_at: string
  uploaderName?: string | null
}

const DOC_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}
const DOC_MAX_SIZE = 20 * 1024 * 1024
const DOC_CATEGORIES = ['permit', 'insurance', 'contract', 'other'] as const

async function requireOrgAdminCtx(orgId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members').select('role')
    .eq('organization_id', orgId).eq('user_id', user.id).single()
  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Unauthorized' }
  }
  return { userId: user.id }
}

/** Documents for one event (leagueId) or the org level (leagueId null). */
export async function listAdminDocuments(orgId: string, leagueId: string | null): Promise<AdminDocument[]> {
  const db = createServiceRoleClient()
  let query = db
    .from('admin_documents')
    .select('id, league_id, name, category, file_path, created_at, uploader:profiles!admin_documents_uploaded_by_fkey(full_name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  query = leagueId ? query.eq('league_id', leagueId) : query.is('league_id', null)
  const { data } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((d) => {
    const uploader = Array.isArray(d.uploader) ? d.uploader[0] : d.uploader
    return {
      id: d.id, league_id: d.league_id, name: d.name, category: d.category,
      file_path: d.file_path, created_at: d.created_at,
      uploaderName: uploader?.full_name ?? null,
    }
  })
}

/** Upload a document (fields: file, name, category, leagueId — omit leagueId for org-level). */
export async function uploadAdminDocument(formData: FormData): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireOrgAdminCtx(org.id)
  if ('error' in auth) return { error: auth.error }

  const file = formData.get('file') as File | null
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const category = (formData.get('category') as string | null) ?? 'other'
  const leagueId = (formData.get('leagueId') as string | null) || null
  if (!file || file.size === 0) return { error: 'No file provided' }
  if (!name) return { error: 'Give the document a name.' }
  if (!(DOC_CATEGORIES as readonly string[]).includes(category)) return { error: 'Invalid category' }
  const ext = DOC_TYPES[file.type]
  if (!ext) return { error: 'Use a PDF, image (JPEG/PNG/WebP), or Word document.' }
  if (file.size > DOC_MAX_SIZE) return { error: 'File too large (max 20 MB).' }

  const db = createServiceRoleClient()
  if (leagueId) {
    const { data: league } = await db
      .from('leagues').select('id').eq('id', leagueId).eq('organization_id', org.id).maybeSingle()
    if (!league) return { error: 'Event not found' }
  }

  const { data: row, error: insertError } = await db
    .from('admin_documents')
    .insert({
      organization_id: org.id,
      league_id: leagueId,
      name,
      category,
      file_path: 'pending', // set below once the id is known
      uploaded_by: auth.userId,
    })
    .select('id')
    .single()
  if (insertError || !row) return { error: insertError?.message ?? 'Could not save document' }

  const path = `${org.id}/${leagueId ?? 'org'}/${row.id}.${ext}`
  const { error: uploadError } = await db.storage
    .from('admin-documents')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) {
    await db.from('admin_documents').delete().eq('id', row.id)
    return { error: uploadError.message }
  }
  const { error: updateError } = await db
    .from('admin_documents').update({ file_path: path }).eq('id', row.id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/finances')
  return { error: null }
}

/** Short-lived signed URL to view a document (org/league admins only). */
export async function getAdminDocumentUrl(documentId: string): Promise<{ url: string | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireOrgAdminCtx(org.id)
  if ('error' in auth) return { url: null, error: auth.error }

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from('admin_documents')
    .select('file_path')
    .eq('id', documentId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!row?.file_path || row.file_path === 'pending') return { url: null, error: 'Document not found' }
  const { data, error } = await db.storage
    .from('admin-documents')
    .createSignedUrl(row.file_path, 600)
  if (error || !data?.signedUrl) return { url: null, error: error?.message ?? 'Could not create link' }
  return { url: data.signedUrl, error: null }
}

/** Delete a document and its file. */
export async function deleteAdminDocument(documentId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await requireOrgAdminCtx(org.id)
  if ('error' in auth) return { error: auth.error }

  const db = createServiceRoleClient()
  const { data: row } = await db
    .from('admin_documents')
    .select('id, file_path')
    .eq('id', documentId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!row) return { error: 'Document not found' }
  if (row.file_path && row.file_path !== 'pending') {
    await db.storage.from('admin-documents').remove([row.file_path])
  }
  const { error } = await db.from('admin_documents').delete().eq('id', row.id)
  if (error) return { error: error.message }
  revalidatePath('/admin/finances')
  return { error: null }
}
