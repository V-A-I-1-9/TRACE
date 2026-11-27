/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MemoryConnections } from '@/components/domain/MemoryConnections'

export default async function GraphPage() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch all memories
  const { data: memories } = await supabase
    .from('memories')
    .select('id, title, category')
    .eq('user_id', user.id)
    .order('created_at',{ascending:false})

  // Fetch all entities
  const { data: entities } = await supabase
    .from('entities')
    .select('id, name, type')
    .eq('user_id', user.id)

  // Fetch all memory_entities relationships
  // Use inner join or just fetch the raw data and let client process
  // Note: we can only fetch the relationships for the user's memories, but RLS on memory_entities
  // is usually enforced implicitly or we can just fetch all memory_entities that belong to user's memories.
  // Assuming memory_entities doesn't have user_id, but memory does.
  
  // Since we don't have user_id on memory_entities, we can fetch them via a joined query or RPC, 
  // or just fetch all memory_entities where memory_id IN (memories.map(m => m.id))
  let memoryEntities: any[] = []
  if (memories && memories.length > 0) {
    const memoryIds = memories.map(m => m.id)
    const { data: me } = await supabase
      .from('memory_entities')
      .select('memory_id, entity_id, relationship')
      .in('memory_id', memoryIds)
    if (me) memoryEntities = me
  }

  const linkedIds = new Set(memoryEntities.map(edge => edge.entity_id))
  return (
    <div className="workspace-page graph-page">
      <header className="page-heading"><div><h1>Knowledge graph</h1>
        <p>Follow a source to its people, places and related memories.</p></div></header>
      <div className="graph-frame">
        <MemoryConnections
          memories={memories || []} 
          entities={(entities || []).filter(entity => linkedIds.has(entity.id))}
          memoryEntities={memoryEntities} 
        />
      </div>
    </div>
  )
}
