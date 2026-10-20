/**
 * The public baby-shower page is closed. This replaces BabyShower on /shower
 * (and on the shower custom domain). It makes no Supabase calls, so it works
 * for anyone after the household lockdown. BabyShower.tsx is kept, unrouted,
 * in case the page is ever reopened.
 */
export default function ShowerClosed() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: '#EDE6DE', fontFamily: "'Inter', sans-serif" }}
    >
      <div className="text-center max-w-sm w-full">
        <h1
          className="text-3xl mb-3"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: '#2C2522' }}
        >
          Baby Shower
        </h1>
        <p className="text-base" style={{ color: '#8C8078' }}>
          This page is closed.
        </p>
        <p className="text-sm mt-1" style={{ color: '#B5ADA5' }}>
          Thank you for celebrating with us.
        </p>
      </div>
    </div>
  )
}
