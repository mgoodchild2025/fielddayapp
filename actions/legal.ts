'use server'

import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LegalDocument {
  id: string
  slug: string
  title: string
  description: string | null
  content: string
  published_at: string | null
  effective_date: string | null
  version: string | null
  is_published: boolean
  published_content: string | null
  created_at: string
  updated_at: string
}

export interface LegalDocumentVersion {
  id: string
  document_id: string
  version: string
  content: string
  effective_date: string | null
  published_at: string
  published_by: string | null
  notes: string | null
  created_at: string
  // joined
  published_by_email?: string | null
}

// ── Auth helper ────────────────────────────────────────────────────────────────

async function requirePlatformAdmin(): Promise<string> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (db as any)
    .from('profiles')
    .select('platform_role')
    .eq('id', user.id)
    .single()

  if (profile?.platform_role !== 'platform_admin') {
    throw new Error('Platform admin role required')
  }
  return user.id
}

// ── Public reads ───────────────────────────────────────────────────────────────

export async function listPublishedDocuments(): Promise<LegalDocument[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('legal_documents')
    .select('*')
    .eq('is_published', true)
    .order('title')

  if (error) return []
  return (data ?? []) as LegalDocument[]
}

export async function getPublishedDocument(slug: string): Promise<LegalDocument | null> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('legal_documents')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  return (data as LegalDocument) ?? null
}

// ── Admin reads ────────────────────────────────────────────────────────────────

export async function listAllDocuments(): Promise<LegalDocument[]> {
  await requirePlatformAdmin()
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('legal_documents')
    .select('*')
    .order('title')

  if (error) return []
  return (data ?? []) as LegalDocument[]
}

export async function getDocument(slug: string): Promise<LegalDocument | null> {
  await requirePlatformAdmin()
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('legal_documents')
    .select('*')
    .eq('slug', slug)
    .single()

  return (data as LegalDocument) ?? null
}

export async function getVersionHistory(slug: string): Promise<LegalDocumentVersion[]> {
  await requirePlatformAdmin()
  const db = createServiceRoleClient()

  // Get document id first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: doc } = await (db as any)
    .from('legal_documents')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!doc) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('legal_document_versions')
    .select(`
      *,
      publisher:profiles!legal_document_versions_published_by_fkey(email)
    `)
    .eq('document_id', (doc as { id: string }).id)
    .order('published_at', { ascending: false })

  return ((data ?? []) as Array<LegalDocumentVersion & { publisher?: { email: string } | null }>).map((v) => ({
    ...v,
    published_by_email: v.publisher?.email ?? null,
  }))
}

// ── Admin writes ───────────────────────────────────────────────────────────────

export async function saveDraft(
  slug: string,
  content: string,
): Promise<{ error: string | null }> {
  try {
    await requirePlatformAdmin()
    const db = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('legal_documents')
      .update({ content })
      .eq('slug', slug)

    if (error) return { error: error.message }

    revalidatePath(`/super/legal/${slug}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function publishDocument(
  slug: string,
  opts: {
    version: string
    effectiveDate: string | null
    notes: string | null
    requiresReconsent?: boolean
    reconsentSummary?: string | null
  },
): Promise<{ error: string | null }> {
  try {
    const userId = await requirePlatformAdmin()
    const db = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc } = await (db as any)
      .from('legal_documents')
      .select('id, content')
      .eq('slug', slug)
      .single()

    if (!doc) return { error: 'Document not found' }

    const docTyped = doc as { id: string; content: string }

    // Insert immutable version snapshot
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: vErr } = await (db as any)
      .from('legal_document_versions')
      .insert({
        document_id: docTyped.id,
        version: opts.version,
        content: docTyped.content,
        effective_date: opts.effectiveDate ?? null,
        published_by: userId,
        notes: opts.notes ?? null,
        requires_reconsent: opts.requiresReconsent ?? false,
        reconsent_summary: opts.reconsentSummary ?? null,
      })

    if (vErr) return { error: vErr.message }

    // Update the live document
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dErr } = await (db as any)
      .from('legal_documents')
      .update({
        is_published: true,
        published_at: new Date().toISOString(),
        published_content: docTyped.content,
        effective_date: opts.effectiveDate ?? null,
        version: opts.version,
        requires_reconsent: opts.requiresReconsent ?? false,
        reconsent_summary: opts.reconsentSummary ?? null,
      })
      .eq('slug', slug)

    if (dErr) return { error: dErr.message }

    revalidatePath(`/legal/${slug}`)
    revalidatePath(`/super/legal/${slug}`)
    revalidatePath(`/super/legal`)
    // Vanity routes
    if (slug === 'privacy-policy') revalidatePath('/privacy')
    if (slug === 'terms-of-service') revalidatePath('/terms')
    if (slug === 'sub-processors') revalidatePath('/sub-processors')

    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function unpublishDocument(slug: string): Promise<{ error: string | null }> {
  try {
    await requirePlatformAdmin()
    const db = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('legal_documents')
      .update({ is_published: false })
      .eq('slug', slug)

    if (error) return { error: error.message }

    revalidatePath(`/legal/${slug}`)
    revalidatePath(`/super/legal/${slug}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
