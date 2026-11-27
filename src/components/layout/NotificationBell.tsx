'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bell, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/browser'
import { loadNotifications } from '@/lib/schedule'

const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })
type Feed = Awaited<ReturnType<typeof loadNotifications>>

function Notices({ close }: { close: () => void }) {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    loadNotifications(createClient()).then(items => {
      if (active) setFeed(items)
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [attempt])

  if (failed) return <div role="alert">Couldn’t load notifications. <button className="underline" onClick={() => { setFailed(false); setAttempt(attempt + 1) }}>Try again</button></div>
  if (!feed) return <p role="status">Loading reminders…</p>
  if (!feed.length) return <p>No upcoming dates yet. Save a ticket or a coupon with an expiry date to see it here.</p>
  return <div className="min-h-0 overflow-y-auto">
    {[true, false].map(due => {
      const rows = feed.filter(item => item.due === due)
      if (!rows.length) return null
      return <section key={String(due)} className="mb-4 last:mb-0">
        <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{due ? 'Due for a reminder' : 'Scheduled reminders'}</h3>
        {rows.map(item => <Link key={[item.id, item.kind, item.date].join('/')}
          href={`/memories?memory=${item.memory_id}#memory-${item.memory_id}`} onClick={close}
          className="flex items-center justify-between gap-3 rounded-lg border-b p-3 hover:bg-secondary focus-visible:bg-secondary">
          <div className="min-w-0">
            <strong className="block break-words">{item.title}</strong>
            <div>{item.kind === 'COUPON_EXPIRY' ? 'Coupon expires' : item.kind === 'DEADLINE' ? 'Deadline' : 'Event'} · <time dateTime={item.date}>{date.format(new Date(item.date))}</time></div>
            <small className="text-muted-foreground">Reminder · {date.format(new Date(item.remindAt))}</small>
          </div><ChevronRight aria-hidden="true" size={16} className="shrink-0" />
        </Link>)}
      </section>
    })}
  </div>
}

export function NotificationBell({ showLabel = false }: { showLabel?: boolean }) {
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger className="notification-trigger" aria-label="Notifications" title="Notifications">
      <Bell size={18} aria-hidden="true" />{showLabel && <span>Notifications</span>}
    </DialogTrigger>
    <DialogContent className="max-h-[80dvh] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-md">
      <DialogTitle>Notifications</DialogTitle>
      <DialogDescription>Upcoming dates from your saved memories.</DialogDescription>
      {open && <Notices close={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>
}
