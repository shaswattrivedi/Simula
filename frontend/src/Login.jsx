import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = (e) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setTimeout(() => {
      // Mock login check
      const users = JSON.parse(localStorage.getItem('mockUsers') || '[]')
      const user = users.find(u => u.email === email && u.password === password)
      
      if (user) {
        localStorage.setItem('currentUser', JSON.stringify(user))
        navigate('/')
      } else {
        alert('Invalid email or password')
        setLoading(false)
      }
    }, 600)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        width: '100%', maxWidth: 380, padding: 32,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--whisper)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: 'var(--teal)', boxShadow: '0 0 0 2px rgba(99,102,241,0.2)'
          }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1 }}>Simula</span>
        </div>
        
        <h2 style={{ fontSize: 20, marginBottom: 24, textAlign: 'center', fontWeight: 600 }}>Welcome back</h2>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-2)', marginBottom: 6 }}>Email</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                background: 'var(--bg)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 14, outline: 'none'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-2)', marginBottom: 6 }}>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                background: 'var(--bg)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 14, outline: 'none'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, marginTop: 8,
              background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 500,
              opacity: loading ? 0.7 : 1, transition: 'all 0.15s'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Sign up</Link>
        </div>
      </div>
    </div>
  )
}
