/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GraphVisualizer } from '@/components/domain/GraphVisualizer'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

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

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interactive Knowledge Graph</h1>
          <p className="text-muted-foreground text-sm">Visualize the connections between your memories and entities.</p>
        </div>
      </div>
      
      <div className="flex-1 w-full min-h-0 bg-background rounded-xl border border-border">
        <GraphVisualizer 
          memories={memories || []} 
          entities={entities || []} 
          memoryEntities={memoryEntities} 
        />
      </div>
    </div>
  )
}
