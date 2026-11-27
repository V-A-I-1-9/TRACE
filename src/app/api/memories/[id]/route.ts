import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { cleanDeletedSources } from '@/lib/deleted-sources'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return Response.json({ error: 'Sign in to delete a memory.' }, { status: 401 })
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return Response.json({ error: 'Invalid memory.' }, { status: 400 })
  const { error } = await db.rpc('trace_delete_memory', { p_memory: id })
  if (error) return Response.json({ error: 'Could not confirm deletion. Please try again.' }, { status: 503 })
  for (const page of ['/memories', '/dashboard', '/graph']) revalidatePath(page)
  const cleaned = await cleanDeletedSources(db, user.id, id).catch(() => false)
  return Response.json({
    message: cleaned
      ? 'Memory deleted.'
      : 'Memory deleted. Original file cleanup will retry when you open Memories.',
  })
}
