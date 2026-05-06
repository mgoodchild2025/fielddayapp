'use client'

import { useState, useRef, useTransition } from 'react'
import Image from 'next/image'
import { upsertStaffMember, deleteStaffMember, uploadStaffAvatar } from '@/actions/org-staff'

type StaffMember = { id: string; name: string; role: string | null; bio: string | null; avatar_url: string | null; display_order: number }

function StaffForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<StaffMember>
  onSave: (s: StaffMember) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [bio, setBio] = useState(initial?.bio ?? '')
  const [saving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startSave(async () => {
      const result = await upsertStaffMember(initial?.id ?? null, { name, role, bio })
      if (result.error) { setError(result.error); return }
      onSave({ id: result.id!, name, role: role || null, bio: bio || null, avatar_url: initial?.avatar_url ?? null, display_order: initial?.display_order ?? 0 })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl border p-4 space-y-3">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Alex Smith" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Role / Title</label>
          <input value={role} onChange={e => setRole(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="League Coordinator" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Bio <span className="text-gray-400">(optional)</span></label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={500}
          className="w-full border rounded-md px-3 py-2 text-sm resize-none" placeholder="A short bio shown on the public site…" />
        <p className="text-xs text-gray-400 mt-0.5">{bio.length} / 500</p>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white rounded-md disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
          {saving ? 'Saving…' : initial?.id ? 'Update' : 'Add Person'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  )
}

export function StaffManager({ initialStaff }: { initialStaff: StaffMember[] }) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function handleSaved(s: StaffMember) {
    setStaff(prev => {
      const idx = prev.findIndex(p => p.id === s.id)
      return idx === -1 ? [...prev, s] : prev.map(p => p.id === s.id ? s : p)
    })
    setAdding(false)
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this person from your staff list?')) return
    setDeletingId(id)
    await deleteStaffMember(id)
    setStaff(prev => prev.filter(s => s.id !== id))
    setDeletingId(null)
  }

  async function handleAvatarChange(staffId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingId(staffId)
    const fd = new FormData()
    fd.append('avatar', file)
    const result = await uploadStaffAvatar(staffId, fd)
    if (result.url) setStaff(prev => prev.map(s => s.id === staffId ? { ...s, avatar_url: result.url } : s))
    setUploadingId(null)
    if (fileRefs.current[staffId]) fileRefs.current[staffId]!.value = ''
  }

  return (
    <div className="space-y-3">
      {staff.length === 0 && !adding && (
        <div className="text-center py-12 border-2 border-dashed rounded-xl text-gray-400">
          <p className="text-lg">No staff listed yet</p>
          <p className="text-sm mt-1">Add organizers, coaches, or volunteers to feature on your site.</p>
        </div>
      )}

      {staff.map(member => (
        <div key={member.id}>
          {editingId === member.id ? (
            <StaffForm initial={member} onSave={handleSaved} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="bg-white border rounded-xl px-5 py-4 flex items-center gap-4">
              {/* Avatar */}
              <div className="shrink-0 w-12 h-12 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
                {uploadingId === member.id ? (
                  <span className="text-xs text-gray-400">…</span>
                ) : member.avatar_url ? (
                  <Image src={member.avatar_url} alt={member.name} width={48} height={48} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <span className="text-lg font-bold text-gray-400">{member.name.charAt(0).toUpperCase()}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{member.name}</p>
                {member.role && <p className="text-xs text-gray-500 mt-0.5">{member.role}</p>}
                {member.bio && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{member.bio}</p>}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <input
                  ref={el => { fileRefs.current[member.id] = el }}
                  type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={e => handleAvatarChange(member.id, e)}
                />
                <button onClick={() => fileRefs.current[member.id]?.click()} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50">
                  {member.avatar_url ? 'Photo' : '+ Photo'}
                </button>
                <button onClick={() => setEditingId(member.id)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50">Edit</button>
                <button onClick={() => handleDelete(member.id)} disabled={deletingId === member.id} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50">
                  {deletingId === member.id ? '…' : 'Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <StaffForm onSave={handleSaved} onCancel={() => setAdding(false)} />
      ) : (
        <button onClick={() => setAdding(true)} className="w-full py-3 border-2 border-dashed rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors">
          + Add Person
        </button>
      )}
    </div>
  )
}
