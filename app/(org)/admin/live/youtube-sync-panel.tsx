'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { connectYouTube, disconnectYouTube, setItemApproval, type SocialConnection, type SyncedItem } from '@/actions/social'

export function YouTubeSyncPanel({
  connection,
  items,
}: {
  connection: SocialConnection | null
  items: SyncedItem[]
}) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function connect() {
    setError(null)
    startTransition(async () => {
      const res = await connectYouTube(input.trim())
      if (res.error) setError(res.error)
      else { setInput(''); router.refresh() }
    })
  }
  function disconnect() {
    startTransition(async () => { await disconnectYouTube(); router.refresh() })
  }
  function setApproval(id: string, approved: boolean) {
    startTransition(async () => { await setItemApproval(id, approved); router.refresh() })
  }

  return (
    <div className="bg-white rounded-lg border p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">YouTube Auto-Sync</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Connect your channel — new uploads appear below for review, and live broadcasts are detected automatically.
          </p>
        </div>
        {connection && (
          <button onClick={disconnect} disabled={isPending}
            className="text-xs text-gray-400 hover:text-red-600 shrink-0">
            Disconnect
          </button>
        )}
      </div>

      {!connection ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600">Channel URL, @handle, or channel ID</label>
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              placeholder="https://youtube.com/@yourchannel"
              className="flex-1 border rounded-md px-3 py-2 text-sm" />
            <button onClick={connect} disabled={isPending || !input.trim()}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}>
              {isPending ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-700">Connected to <strong>{connection.account_handle ?? connection.external_account_id}</strong></span>
            {connection.last_synced_at && (
              <span className="text-xs text-gray-400">· last synced {new Date(connection.last_synced_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </div>

          {/* Moderation queue */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Synced videos</p>
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-lg border">
                No videos synced yet. New uploads appear here within ~30 minutes.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 border rounded-lg p-2">
                    {item.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumbnail_url} alt="" className="w-24 h-14 object-cover rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.caption ?? 'Untitled'}</p>
                      <p className="text-xs text-gray-400">
                        {item.posted_at ? new Date(item.posted_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                        {item.approved && <span className="ml-2 text-green-600">· Shown publicly</span>}
                      </p>
                    </div>
                    {item.approved ? (
                      <button onClick={() => setApproval(item.id, false)} disabled={isPending}
                        className="text-xs px-3 py-1.5 rounded-md border text-gray-600 hover:bg-gray-50 shrink-0">
                        Hide
                      </button>
                    ) : (
                      <button onClick={() => setApproval(item.id, true)} disabled={isPending}
                        className="text-xs px-3 py-1.5 rounded-md font-medium text-white shrink-0"
                        style={{ backgroundColor: 'var(--brand-primary)' }}>
                        Show publicly
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
