import type { SupabaseClient } from '@supabase/supabase-js'

export function startOfIndiaDay(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return new Date(date + 'T00:00:00+05:30').toISOString()
}

type ScheduleItem = { id: string; memory_id: string; title: string; date: string; kind: string }

export function expiryLabel(date: string, now = new Date()) {
  const days = (Date.parse(startOfIndiaDay(new Date(date))) - Date.parse(startOfIndiaDay(now))) / 86_400_000
  if (days === 0) return 'Expires today'
  return days > 0 && days <= 7 ? 'Expiring soon' : 'Coupon expiry'
}

export async function upcomingSchedule(db: SupabaseClient, limit: number, memoryId?: string | null) {
  const { data, error } = await db.rpc('trace_upcoming', {
    p_start: startOfIndiaDay(),
    p_count: limit,
    p_memory: memoryId ?? null,
  })
  if (error) throw new Error('Could not load the upcoming schedule.')
  return data as ScheduleItem[]
}

type Reminder = { event_id: string; reminder_date: string; status: string }

export function notificationFeed(items: ScheduleItem[], reminders: Reminder[], now = new Date()) {
  const today = Date.parse(startOfIndiaDay(now))
  const day = 86_400_000
  return items.flatMap(item => {
    const target = Date.parse(startOfIndiaDay(new Date(item.date)))
    if (target < today) return []
    const matches = reminders.filter(row => row.event_id === item.id)
    const pending = matches.filter(row => row.status === 'PENDING')
    if (matches.length && !pending.length) return []
    // The capture pipeline schedules its reminder against the primary event date.
    const primary = !items.some(other => other.id === item.id && other.kind !== 'DEADLINE' && item.kind === 'DEADLINE')
    const leadDays = item.kind === 'COUPON_EXPIRY' ? 7 : 2
    const saved = primary ? pending.map(row => Date.parse(startOfIndiaDay(new Date(row.reminder_date)))) : []
    const remindAt = Math.min(target - leadDays * day, ...saved)
    return [{ ...item, remindAt: new Date(remindAt).toISOString(), due: remindAt <= today }]
  }).sort((a, b) => Number(b.due) - Number(a.due) ||
    Date.parse(a.due ? a.date : a.remindAt) - Date.parse(b.due ? b.date : b.remindAt))
}

export async function loadNotifications(db: SupabaseClient) {
  const items = await upcomingSchedule(db, 100)
  const ids = [...new Set(items.filter(item => item.id !== item.memory_id).map(item => item.id))]
  if (!ids.length) return notificationFeed(items, [])
  const { data, error } = await db.from('reminders').select('event_id, reminder_date, status').in('event_id', ids)
  if (error) throw new Error('Could not load reminders.')
  return notificationFeed(items, data)
}
