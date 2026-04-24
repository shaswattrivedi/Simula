import React, { useState } from 'react'
import { Send } from 'lucide-react'

export function QuestionsPanel({ questions, onSubmit, loading }) {
  const [answers, setAnswers] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (answers.trim()) onSubmit(answers)
  }

  return (
    <div style={{
      border: '1px solid var(--border-hover)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface)',
      boxShadow: 'var(--ring-soft)',
      overflow: 'hidden',
      marginTop: 4,
    }}>
      {/* Questions list */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        {questions.map((q, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < questions.length - 1 ? 10 : 0 }}>
            <span style={{
              fontSize: 10, color: 'var(--teal)', fontFamily: 'var(--font-mono)',
              background: 'var(--teal-dim)', padding: '1px 5px', borderRadius: 3,
              flexShrink: 0, height: 'fit-content', marginTop: 1,
            }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.62 }}>{q.question}</span>
          </div>
        ))}
      </div>

      {/* Answer textarea */}
      <form onSubmit={handleSubmit} style={{ padding: 12 }}>
        <textarea
          value={answers}
          onChange={e => setAnswers(e.target.value)}
          placeholder="Answer all questions above in any order. Be as specific as you can…"
          rows={4}
          style={{
            width: '100%', padding: '8px 10px',
            background: 'var(--accent)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            color: 'var(--text)', fontSize: 13,
            resize: 'vertical', outline: 'none',
            lineHeight: 1.6,
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e)
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="submit"
            disabled={!answers.trim() || loading}
            style={{
              padding: '7px 14px',
              background: answers.trim() && !loading ? 'var(--teal)' : 'var(--surface-3)',
              color: answers.trim() && !loading ? 'var(--accent)' : 'var(--muted)',
              borderRadius: '12px',
              fontSize: 11, fontFamily: 'var(--font-sans)',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
              cursor: answers.trim() && !loading ? 'pointer' : 'not-allowed',
              boxShadow: answers.trim() && !loading ? '0 0 0 1px rgba(201,100,66,0.28)' : 'var(--ring-soft)',
            }}
          >
            <Send size={11} />
            {loading ? 'Processing…' : 'Submit answers  ⌘↵'}
          </button>
        </div>
      </form>
    </div>
  )
}
