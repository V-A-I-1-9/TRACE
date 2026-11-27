// NDJSON chunks can split UTF-8 characters and records; a last line need not end in a newline.
export async function* responseLines(response: Response) {
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Request failed. Please try again.')
  }
  if (!response.body) throw new Error('The response was empty. Please retry.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      pending += value || ''
      const lines = pending.split('\n')
      pending = lines.pop() || ''
      for (const line of lines) if (line.trim()) yield JSON.parse(line)
      if (done) break
    }
    if (pending.trim()) yield JSON.parse(pending)
  } finally {
    reader.releaseLock()
  }
}
