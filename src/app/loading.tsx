import { Fingerprint } from 'lucide-react'

export default function Loading() {
  return (
    <div className="trace-loader" role="status">
      <div className="trace-reader" aria-hidden="true">
        <Fingerprint size={54} strokeWidth={1.35} />
        <div className="trace-scan" />
      </div>
      <p>Loading workspace…</p>
    </div>
  )
}
