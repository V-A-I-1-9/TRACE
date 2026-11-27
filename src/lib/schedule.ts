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

type ScheduleItem = { id: string; title: string; date: string; kind: string }

export async function upcomingSchedule(
  db: SupabaseClient,
  userId: string,
  limit: number,
  memoryId?: string | null,
) {
  const start = startOfIndiaDay()
  function eventQuery(column: 'event_date' | 'due_date') {
    let rows = db
      .from('events')
      .select('id,title,event_type,event_date,due_date')
      .eq('user_id', userId)
      .gte(column, start)
      .order(column)
      .limit(limit)
    if (memoryId) rows = rows.eq('memory_id', memoryId)
    return rows
  }
  let pending = db
    .from('reminders')
    .select('id,title,event_id,reminder_date,event:events!inner(memory_id)')
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .gte('reminder_date', start)
    .order('reminder_date')
    .limit(limit)
  if (memoryId) pending = pending.eq('event.memory_id', memoryId)
  const [starts, deadlines, reminders] = await Promise.all([
    eventQuery('event_date'),
    eventQuery('due_date'),
    pending,
  ])
  if (starts.error || deadlines.error || reminders.error)
    throw new Error('Could not load the upcoming schedule.')
  const items: ScheduleItem[] = []
  for (const event of starts.data)
    items.push({ id: event.id, title: event.title, date: event.event_date, kind: event.event_type })
  for (const event of deadlines.data)
    items.push({ id: event.id, title: event.title, date: event.due_date, kind: 'DEADLINE' })
  for (const reminder of reminders.data)
    items.push({
      id: reminder.event_id,
      title: reminder.title,
      date: reminder.reminder_date,
      kind: 'REMINDER',
    })
  items.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const seen = new Set<string>()
  return items
    .filter((item) => {
      const key = item.id + '/' + Date.parse(item.date)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
