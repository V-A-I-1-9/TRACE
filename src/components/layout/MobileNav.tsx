'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ScanText, BrainCircuit, Search, Network } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Ask', href: '/ask', icon: Search },
  { name: 'Capture', href: '/capture', icon: ScanText },
  { name: 'Memories', href: '/memories', icon: BrainCircuit },
  { name: 'Graph', href: '/graph', icon: Network },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <div className="md:hidden fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <nav className="flex items-center space-x-1 p-1.5 rounded-full bg-background/80 backdrop-blur-xl border border-border shadow-lg shadow-black/5 pointer-events-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href) || (pathname === '/' && item.href === '/dashboard')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center justify-center p-3 rounded-full transition-all duration-300',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title={item.name}
            >
              <item.icon className="w-5 h-5" />
              <span className="sr-only">{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
