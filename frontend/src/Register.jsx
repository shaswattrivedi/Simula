import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleRegister = (e) => {
    e.preventDefault()
    if (!name || !email || !password) return
    setLoading(true)
    setTimeout(() => {
      const users = JSON.parse(localStorage.getItem('mockUsers') || '[]')
      if (users.find(u => u.email === email)) {
        alert('Email already exists')
        setLoading(false)
        return
      }
      
      const newUser = { id: Date.now().toString(), name, email, password }
      users.push(newUser)
      localStorage.setItem('mockUsers', JSON.stringify(users))
      localStorage.setItem('currentUser', JSON.stringify(newUser))
      navigate('/')
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
        
        <h2 style={{ fontSize: 20, marginBottom: 24, textAlign: 'center', fontWeight: 600 }}>Create an account</h2>
        
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-2)', marginBottom: 6 }}>Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Elon Musk"
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
            {loading ? 'Signing up...' : 'Create Account'}
          </button>
        </form>
        
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
