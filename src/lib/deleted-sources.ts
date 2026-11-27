import type { SupabaseClient } from '@supabase/supabase-js'

// Storage and Postgres commit separately. A failed cleanup stays queued for the next library visit.
export async function cleanDeletedSources(db: SupabaseClient, userId: string, memoryId?: string) {
  let query = db
    .from('trace_source_cleanup')
    .select('memory_id,source_path')
    .eq('user_id', userId)
    .order('queued_at')
    .limit(12)
  if (memoryId) query = query.eq('memory_id', memoryId)
  const receipts = await query
  if (receipts.error) return false
  if (!receipts.data.length) return true
  const paths = receipts.data.map((item) => item.source_path)
  const linked = await db
    .from('memories')
    .select('source_path')
    .eq('user_id', userId)
    .in('source_path', paths)
  if (linked.error) return false
  const keep = new Set(linked.data.map((row) => row.source_path))
  const removable = paths.filter((path) => path.startsWith(userId + '/') && !keep.has(path))
  if (removable.length) {
    const removal = await db.storage.from('trace-sources').remove(removable)
    if (removal.error) return false
  }
  const finished = await db
    .from('trace_source_cleanup')
    .delete()
    .eq('user_id', userId)
    .in(
      'memory_id',
      receipts.data.map((item) => item.memory_id),
    )
  return !finished.error
}
