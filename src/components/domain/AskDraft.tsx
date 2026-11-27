'use client'

import { useRouter } from 'next/navigation'
import { ArrowUpRight, MessageSquare } from 'lucide-react'

export function AskDraft() {
  const router = useRouter()
  return (
    <form
      className="desk-prompt"
      onSubmit={(event) => {
        event.preventDefault()
        const text = String(new FormData(event.currentTarget).get('question') ?? '').trim()
        try {
          sessionStorage.setItem('trace-question-draft', text)
        } catch {
          /* Ask stays available without tab storage. */
        }
        router.push('/ask')
      }}
    >
      <MessageSquare size={17} aria-hidden="true" />
      <input
        name="question"
        maxLength={1500}
        aria-label="Draft a question"
        placeholder="What would you like to find?"
      />
      <button aria-label="Continue in Ask" title="Continue in Ask">
        <ArrowUpRight size={19} />
      </button>
    </form>
  )
}
