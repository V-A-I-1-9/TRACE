import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resolvedParams = await params
  const conversationId = resolvedParams.id

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, structured_response, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('role', { ascending: false })

  if (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  // Saved answers are historical. Only offer originals that still belong to a live memory.
  const paths = new Set<string>()
  for (const row of data) {
    for (const entry of row.structured_response?.evidence ?? []) {
      if (typeof entry.source_path === 'string') paths.add(entry.source_path)
    }
  }
  const unique = [...paths]
  const existing = new Set<string>()
  for (let offset=0;offset<unique.length;offset+=40) {
    const sources = await supabase.from('memories').select('source_path').eq('user_id',user.id).in('source_path',unique.slice(offset,offset+40))
    if (sources.error) return NextResponse.json({error:'Could not load conversation sources.'},{status:503})
    for (const source of sources.data) existing.add(source.source_path)
  }
  for (const row of data) {
    for (const entry of row.structured_response?.evidence ?? []) {
      if (entry.source_path && !existing.has(entry.source_path)) {
        entry.source_deleted = true
        entry.source_path = null
      }
    }
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resolvedParams = await params
  const conversationId = resolvedParams.id

  const { data, error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .select('id').maybeSingle()

  if (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }

  if (!data) return NextResponse.json({error:'Conversation unavailable.'},{status:404})
  return NextResponse.json({ success: true })
}
