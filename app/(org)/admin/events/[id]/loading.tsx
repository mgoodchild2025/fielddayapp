import { AdminSkeleton } from '@/components/ui/admin-skeleton'

// Inside the event layout: the event header and section tabs stay on screen.
export default function Loading() {
  return <AdminSkeleton label="Loading…" />
}
