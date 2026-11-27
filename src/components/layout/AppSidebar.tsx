'use client'

import { NotificationBell } from './NotificationBell'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fingerprint, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState, useEffect } from 'react'
import { SignOutButton } from './SignOutButton'
import { navigation } from './navigation'
import { createClient } from '@/lib/supabase/browser'

export function AppSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [email, setEmail] = useState('')
  const supabase = createClient()
  useEffect(() => {
    let owner: string | null | undefined
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const nextOwner = session?.user.id ?? null
      if (owner && nextOwner !== owner) {
        window.location.replace(nextOwner ? '/dashboard' : '/login')
      } else if (event === 'SIGNED_OUT' && !['/login', '/signup'].includes(window.location.pathname)) {
        window.location.replace('/login')
      }
      owner = nextOwner
      setEmail(session?.user.email ?? '')
    })
    return () => data.subscription.unsubscribe()
  }, [supabase.auth])

  if (['/login', '/signup'].includes(pathname)) return null
  return (
    <aside className="workspace-rail" data-collapsed={collapsed}>
      <div className="rail-top">
        <Link href="/dashboard" aria-label="TRACE dashboard" className="wordmark">
          <Fingerprint aria-hidden="true" />
          <span>TRACE</span>
        </Link>
        <button
          className="rail-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <nav aria-label="Workspace" className="rail-nav">
        {navigation.map(({ name, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? 'page' : undefined}
            aria-label={name}
            title={collapsed ? name : undefined}
          >
            <Icon size={18} />
            <span>{name}</span>
          </Link>
        ))}
        <NotificationBell showLabel />
      </nav>
      <div className="rail-account">
        <span aria-hidden="true" className="account-initial">
          {email.charAt(0).toUpperCase() || 'T'}
        </span>
        <div className="rail-account-text">
          <strong>Personal workspace</strong>
          <small title={email}>{email || 'Signed in'}</small>
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}
