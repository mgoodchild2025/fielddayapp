import { redirect } from 'next/navigation'

// Dashboard has been removed — redirect to My Events
export default function DashboardRedirect() {
  redirect('/my-events')
}
