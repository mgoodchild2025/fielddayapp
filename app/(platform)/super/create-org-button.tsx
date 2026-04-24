'use client'

import { useState } from 'react'
import { CreateOrgForm } from './create-org-form'

export function CreateOrgButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700"
      >
        + New Organization
      </button>
      {open && <CreateOrgForm onClose={() => setOpen(false)} />}
    </>
  )
}
