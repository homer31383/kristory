import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../hooks/useUser'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

export default function UserPicker() {
  const { setUser } = useUser()
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUsers() {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .order('name')

      if (error) {
        console.error('Failed to fetch users:', error)
        setLoading(false)
        return
      }

      setUsers(data as User[])
      setLoading(false)
    }
    fetchUsers()
  }, [])

  const handleSelect = (user: User) => {
    setUser(user)
    navigate('/journal')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="text-center max-w-md w-full">
        <h1
          className="text-4xl mb-2"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          The Kristory
        </h1>
        <p className="text-base mb-10" style={{ color: 'var(--text-secondary)' }}>
          Who's writing today?
        </p>

        {loading ? (
          <div className="flex gap-4 justify-center">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="w-36 h-44 rounded-xl animate-pulse"
                style={{ backgroundColor: 'var(--bg-card)' }}
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-4 justify-center">
            {users.map((user) => {
              const isChris = user.name.toLowerCase() === 'chris'
              const color = isChris ? 'var(--chris-color)' : 'var(--krista-color)'
              const initial = user.name[0].toUpperCase()

              return (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user)}
                  className="w-36 py-8 rounded-xl border transition-all duration-150 cursor-pointer hover:scale-105 active:scale-95 flex flex-col items-center gap-4"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-card)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {initial}
                  </div>
                  <span
                    className="text-lg font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {user.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
