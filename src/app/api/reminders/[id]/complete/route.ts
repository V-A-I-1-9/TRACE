import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolvedParams = await params
  
  const { data, error } = await supabase
    .from('reminders')
    .update({ status: 'COMPLETED' })
    .eq('id', resolvedParams.id)
    .eq('user_id', user.id)
    .select('id').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({error:'Reminder unavailable.'},{status:404})
  return NextResponse.json({ success: true })
}
