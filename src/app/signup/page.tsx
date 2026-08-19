'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrainCircuit, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    const supabase = createClient()
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    if (data?.user?.identities?.length === 0) {
      setStatus('error')
      setErrorMessage('An account with this email already exists.')
      return
    }
    
    setStatus('success')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <BrainCircuit className="w-10 h-10 text-primary mb-2" />
          <h1 className="text-3xl font-bold tracking-tight">Create an account</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email below to create your TRACE account
          </p>
        </div>

        {status === 'error' && (
          <div className="flex items-center space-x-2 bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm border border-destructive/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {status === 'success' ? (
          <div className="flex flex-col items-center justify-center space-y-4 bg-green-500/10 text-green-600 px-6 py-8 rounded-lg border border-green-500/20 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div>
              <h3 className="font-semibold text-lg text-foreground">Check your email</h3>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a confirmation link to {email}. Click it to verify your account and sign in.
              </p>
            </div>
            <Button variant="outline" className="mt-4" onClick={() => setStatus('idle')}>
              Back to Sign Up
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="m@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
                disabled={status === 'submitting'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
                disabled={status === 'submitting'}
                minLength={6}
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={status === 'submitting'}>
              {status === 'submitting' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your account...
                </>
              ) : (
                'Sign Up'
              )}
            </Button>
          </form>
        )}

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
