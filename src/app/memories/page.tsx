import { createClient } from '@/lib/supabase/server'
import { after } from 'next/server'
import { cleanDeletedSources } from '@/lib/deleted-sources'
import { redirect } from 'next/navigation'
import { MemoryExplorer } from '@/components/domain/MemoryExplorer'

export default async function ContextPage({searchParams}:{searchParams:Promise<{memory?:string; type?:string}>}) {
  const {memory: selected,type} = await searchParams
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  after(async () => { await cleanDeletedSources(supabase, user.id) })

  const { data: memories, error } = await supabase
    .from('memories')
    .select('id,title,summary,category,source_type,source_path,created_at,event_date,claims(claim_text)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: entities } = await supabase
    .from('entities')
    .select('id, name, type')
    .eq('user_id', user.id)

  const { data: me } = await supabase
    .from('memory_entities')
    .select('memory_id, entity_id')

  const {data:events,error:eventError} = await supabase.from('events').select('id,title,event_type,event_date,due_date,memory_id').eq('user_id',user.id)
  if (error || eventError) throw new Error('Could not load the memory library.')

  const safeMemories = memories || []
  const safeEntities = entities || []
  const safeMe = me || []

  // Deduplicate entities (JS-level for Phase 3B)
  const entityIdToNormalizedName = new Map<string, string>()
  safeEntities.forEach(e => {
    entityIdToNormalizedName.set(e.id, e.name.toLowerCase().trim())
  })

  // Map memory_id to list of connected normalized entity names
  const memoryIdToEntities: Record<string, string[]> = {}
  safeMe.forEach(relation => {
    const normName = entityIdToNormalizedName.get(relation.entity_id)
    if (normName) {
      if (!memoryIdToEntities[relation.memory_id]) {
        memoryIdToEntities[relation.memory_id] = []
      }
      memoryIdToEntities[relation.memory_id].push(normName)
    }
  })

  // Map normalized entity name to list of memory IDs
  const entityToMemories = new Map<string, Set<string>>()
  safeMe.forEach(relation => {
    const normName = entityIdToNormalizedName.get(relation.entity_id)
    if (normName) {
      if (!entityToMemories.has(normName)) {
        entityToMemories.set(normName, new Set())
      }
      entityToMemories.get(normName)!.add(relation.memory_id)
    }
  })

  // Pre-calculate related memories for each memory
  const memoryIdToRelatedMemories: Record<string, { id: string, title: string }[]> = {}
  safeMemories.forEach(memory => {
    const connectedEntityNames = new Set<string>()
    safeMe.forEach(relation => {
      if (relation.memory_id === memory.id) {
        const normName = entityIdToNormalizedName.get(relation.entity_id)
        if (normName) connectedEntityNames.add(normName)
      }
    })

    const relatedMemoryIds = new Set<string>()
    connectedEntityNames.forEach(normName => {
      const memIds = entityToMemories.get(normName)
      if (memIds) {
        memIds.forEach(id => {
          if (id !== memory.id) relatedMemoryIds.add(id)
        })
      }
    })

    memoryIdToRelatedMemories[memory.id] = safeMemories
      .filter(m => relatedMemoryIds.has(m.id))
      .map(m => ({ id: m.id, title: m.title }))
  })

  return (
    <div className="workspace-page library-page">
      <header className="page-heading"><div>
        <h1 className="text-4xl font-semibold tracking-tight">Memories</h1>
        <p className="text-xl text-muted-foreground font-light">
          Search your saved sources by title, detail, or connected entity.
        </p>
      </div></header>

      <MemoryExplorer initialType={type} key={(selected || 'all') + (type || '')} initialMemory={selected}
        memories={safeMemories} 
        entityMap={memoryIdToEntities}
        relatedMemoriesMap={memoryIdToRelatedMemories}
        events={events || []}
      />
    </div>
  )
}
