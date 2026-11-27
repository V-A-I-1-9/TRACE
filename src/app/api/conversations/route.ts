import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(()=>null)
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body.query !== undefined && typeof body.query !== 'string'))
      return NextResponse.json({error:'Enter a valid question.'},{status:400})
    const trimmed = body.query?.trim() || ''
    if (trimmed.length > 1500) return NextResponse.json({error:'Keep the question under 1,501 characters.'},{status:400})
    const title = trimmed ? (trimmed.length > 30 ? trimmed.slice(0, 30) + '...' : trimmed) : 'New Conversation'

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title })
      .select('id, title, updated_at')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error('Error creating conversation:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message || 'Failed to create conversation' }, { status: 500 })
  }
}
