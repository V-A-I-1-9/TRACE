import type { Metadata } from 'next'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource-variable/dm-sans/wght.css'
import './globals.css'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { MobileNav } from '@/components/layout/MobileNav'

export const metadata: Metadata = {
  title: 'TRACE | Ask. Retrieve. Verify.',
  description: 'Trusted Retrieval and Associated Context Engine',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="flex h-dvh bg-background text-foreground overflow-hidden font-sans antialiased">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <AppSidebar />
        <div className="flex min-w-0 flex-col flex-1 overflow-hidden">
          <MobileNav />
          <main id="main-content" tabIndex={-1} className="workspace-main">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
