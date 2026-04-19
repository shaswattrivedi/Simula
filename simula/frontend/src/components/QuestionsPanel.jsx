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
            <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{q.question}</span>
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
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)', fontSize: 12,
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
              background: answers.trim() && !loading ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
              color: answers.trim() && !loading ? '#080a0f' : 'var(--muted)',
              borderRadius: 'var(--radius)',
              fontSize: 11, fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
              cursor: answers.trim() && !loading ? 'pointer' : 'not-allowed',
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
