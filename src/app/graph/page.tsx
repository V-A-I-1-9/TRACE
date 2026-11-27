import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MemoryConnections } from '@/components/domain/MemoryConnections'

export default async function GraphPage() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  const [memoryRows, entityRows] = await Promise.all([
    supabase.from('memories')
      .select('id,title,category,memory_entities(memory_id,entity_id,relationship)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('entities').select('id,name,type').eq('user_id', user.id),
  ])
  if (memoryRows.error || entityRows.error) throw new Error('Could not load the knowledge graph.')
  const memoryEntities = memoryRows.data.flatMap(memory => memory.memory_entities)
  const memories = memoryRows.data.map(({ id, title, category }) => ({ id, title, category }))
  const entities = entityRows.data
  const linkedIds = new Set(memoryEntities.map(edge => edge.entity_id))
  return (
    <div className="workspace-page graph-page">
      <header className="page-heading"><div><h1>Knowledge graph</h1>
        <p>Follow a source to its people, places and related memories.</p></div></header>
      <div className="graph-frame">
        <MemoryConnections
          memories={memories}
          entities={entities.filter(entity => linkedIds.has(entity.id))}
          memoryEntities={memoryEntities} 
        />
      </div>
    </div>
  )
}
