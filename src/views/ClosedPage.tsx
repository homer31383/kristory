/**
 * Static "This page is closed" screen for retired pages: the baby shower for
 * anyone who is not a signed-in household member (/shower, also on the shower
 * custom domain; members see BabyShower.tsx, see ShowerRoute in App.tsx) and
 * the baby registry (/registry). It makes no Supabase calls, so it works for
 * anyone, signed in or not. The registry code was removed.
 */
export default function ClosedPage({ title, note = 'Thank you for celebrating with us.' }: { title: string; note?: string }) {
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
          {title}
        </h1>
        <p className="text-base" style={{ color: '#8C8078' }}>
          This page is closed.
        </p>
        {note && (
          <p className="text-sm mt-1" style={{ color: '#B5ADA5' }}>
            {note}
          </p>
        )}
      </div>
    </div>
  )
}
