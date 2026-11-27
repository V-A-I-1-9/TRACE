const formats = {
  IMAGE: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' },
  AUDIO: {
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
  },
  DOCUMENT: { 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv' },
  TEXT: { 'text/plain': 'txt' },
}
export type CaptureKind = keyof typeof formats

export async function readSource(request: Request, kind: CaptureKind) {
  if (kind === 'TEXT') {
    const body = await request.json().catch(() => null)
    const text = body?.text
    if (typeof text !== 'string' || !text.trim() || text.length > 16000)
      throw new Error('Enter a note of 1–16,000 characters.')
    return { bytes: Buffer.from(text.trim()), mime: 'text/plain', ext: 'txt', name: 'note.txt' }
  }
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || !file.size) throw new Error('Choose a non-empty file.')
  const limit = kind === 'AUDIO' ? 20 : 10
  if (file.size > limit * 1024 ** 2) throw new Error(`Choose a file smaller than ${limit} MB.`)
  const mime = file.type.split(';')[0]
  const ext = (formats[kind] as Record<string, string>)[mime]
  if (!ext) throw new Error('This file format is unsupported.')
  return { bytes: Buffer.from(await file.arrayBuffer()), mime, ext, name: file.name.slice(0, 160) }
}
