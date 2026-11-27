import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return new Response('Sign in to view the source.', { status: 401 })
  const path = new URL(request.url).searchParams.get('path')
  if (!path || path.split('/')[0] !== user.id) return new Response('Source unavailable.', { status: 404 })
  const linked = await db.from('memories').select('id').eq('user_id',user.id).eq('source_path',path).limit(1)
  if (linked.error) return new Response('Source temporarily unavailable.', { status: 503 })
  if (!linked.data.length) return new Response('This source was deleted.', { status: 404 })
  const { data, error } = await db.storage.from('trace-sources').createSignedUrl(path, 300)
  if (error || !data) return new Response('Source unavailable.', { status: 404 })
  return new Response(null, {
    status: 307,
    headers: {
      Location: data.signedUrl,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
