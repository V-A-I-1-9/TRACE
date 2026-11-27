'use client'

import { useState } from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Fingerprint, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.replace('/capture')
      router.refresh()
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <Fingerprint className="auth-mark" />
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email to sign in to TRACE
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 pt-4">
          {error && (
            <div className="flex items-center space-x-2 bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              autoComplete="email" id="email"
              type="email" 
              placeholder="m@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>

            </div>
            <Input 
              autoComplete="current-password" id="password"
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              disabled={loading}
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
