import { DoorDisplayResume } from '@/components/door/display-resume'

export const metadata = { title: 'Door display' }

/** /door/display: back to this browser's paired display, or to /door/join. */
export default function DoorDisplayIndex() {
  return <DoorDisplayResume />
}
