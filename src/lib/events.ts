import { SupabaseClient } from '@supabase/supabase-js'
import { ExtractedEvent } from './validation/gemini'

export async function processEventsAndReminders(
  supabase: SupabaseClient,
  userId: string,
  memoryId: string,
  events: ExtractedEvent[]
) {
  if (!events || events.length === 0) return

  try {
    for (const evt of events) {
      console.log(`[TRACE Events] Processing event: "${evt.title}" | type: ${evt.event_type} | event_date: ${evt.event_date} | due_date: ${evt.due_date}`)

      // Insert event
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert({
          user_id: userId,
          memory_id: memoryId,
          title: evt.title,
          event_type: evt.event_type.toUpperCase(),
          event_date: evt.event_date || null,
          due_date: evt.due_date || null,
          priority: evt.priority.toUpperCase()
        })
        .select('id')
        .single()

      if (eventError || !eventData) {
        console.warn('[TRACE Events] Failed to insert event:', eventError?.message)
        continue
      }

      console.log(`[TRACE Events] Event inserted: ${eventData.id}`)

      // Determine the target date for the reminder
      const targetDateStr = evt.event_date || evt.due_date
      if (!targetDateStr) {
        console.warn(`[TRACE Events] No date found for event "${evt.title}", skipping reminder.`)
        continue
      }

      const targetDate = new Date(targetDateStr)
      if (isNaN(targetDate.getTime())) {
        console.warn(`[TRACE Events] Invalid date "${targetDateStr}" for event "${evt.title}", skipping reminder.`)
        continue
      }

      // Calculate reminder lead time based on event type
      let daysBefore = 0
      const type = evt.event_type.toUpperCase()
      
      if (type === 'TRAVEL') daysBefore = 2
      else if (type === 'MAINTENANCE' || type === 'SERVICE') daysBefore = 7
      else if (type === 'APPOINTMENT') daysBefore = 1
      // For GENERIC, SHOPPING, PURCHASE, MEETING, etc. -> 0 days (same day)

      const reminderDate = new Date(targetDate)
      reminderDate.setDate(reminderDate.getDate() - daysBefore)

      // If the reminder date is in the past (e.g., event is today with daysBefore=1),
      // set reminder to NOW so it appears immediately in Upcoming
      const now = new Date()
      if (reminderDate < now) {
        reminderDate.setTime(now.getTime())
      }

      // Insert reminder
      const { error: reminderError } = await supabase
        .from('reminders')
        .insert({
          user_id: userId,
          event_id: eventData.id,
          title: evt.title,
          reminder_date: reminderDate.toISOString(),
          status: 'PENDING',
          metadata: {
            reason: daysBefore > 0 
              ? `Auto-generated ${daysBefore} day(s) before ${type} event`
              : `Auto-generated for ${type} event on ${targetDate.toISOString().split('T')[0]}`,
            auto_generated: true
          }
        })

      if (reminderError) {
         console.warn('[TRACE Events] Failed to insert reminder:', reminderError.message)
      } else {
         console.log(`[TRACE Events] Reminder created for "${evt.title}" on ${reminderDate.toISOString()}`)
      }
    }
  } catch (error) {
    console.warn('[TRACE Events] Non-fatal error processing events/reminders:', error)
  }
}
