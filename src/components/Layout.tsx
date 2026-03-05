import { Link, Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="md:ml-60">
        {/* Mobile header */}
        <header
          className={[
            'md:hidden',
            'sticky top-0 z-30',
            'flex items-center justify-between',
            'px-4 h-14',
            'border-b border-[var(--border-divider)]',
          ].join(' ')}
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-page) 85%, transparent)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          }}
        >
          <h1 className="font-['Playfair_Display'] text-lg font-bold text-[var(--text-primary)]">
            The Kristory
          </h1>
          <Link
            to="/settings"
            className="flex items-center justify-center w-10 h-10 -mr-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Settings"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-[720px] px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
