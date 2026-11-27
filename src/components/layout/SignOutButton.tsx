'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

export function SignOutButton() {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function signOut() {
    setPending(true)
    setFailed(false)
    try {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      window.location.replace('/login')
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        aria-label="Sign out"
        title="Sign out"
        className="rounded-full p-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
      </button>
      {failed && (
        <p
          role="alert"
          className="absolute bottom-full right-0 w-40 rounded-lg border bg-background p-2 text-xs"
        >
          Could not sign out. Try again.
        </p>
      )}
    </div>
  )
}
