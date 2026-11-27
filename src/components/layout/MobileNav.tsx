'use client'

import { NotificationBell } from './NotificationBell'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fingerprint } from 'lucide-react'
import { navigation } from './navigation'
import { SignOutButton } from './SignOutButton'

export function MobileNav() {
  const pathname = usePathname()
  if (['/login', '/signup'].includes(pathname)) return null
  return (
    <>
      <header className="mobile-top">
        <Link className="wordmark" href="/dashboard">
          <Fingerprint aria-hidden="true" />
          TRACE
        </Link>
        <div className="flex items-center gap-2"><NotificationBell /><SignOutButton /></div>
      </header>
      <nav aria-label="Workspace" className="mobile-dock">
        {navigation.map(({ href, name, short, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={name}
            aria-current={pathname === href ? 'page' : undefined}
          >
            <Icon size={18} />
            <span>{short}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
