import React from 'react'
import { Award, AlertTriangle } from 'lucide-react'

function ScoreBar({ value }) {
  const color = value >= 75 ? '#c96442' : value >= 50 ? '#9a7a52' : '#b53333'
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 6, height: 7, overflow: 'hidden' }}>
      <div style={{
        width: `${value}%`,
        height: '100%',
        background: color,
        borderRadius: 6,
        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  )
}

export function ScoreCard({ result }) {
  const { learnability_score, best_model, task_type, model_scores, summary, rows_used, features_used, error } = result
  const score = Math.round(learnability_score)
  const color = score >= 75 ? '#c96442' : score >= 50 ? '#9a7a52' : '#b53333'

  return (
    <div style={{
      border: `1px solid ${color}30`,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface)',
      padding: 16,
      marginTop: 4,
      boxShadow: 'var(--whisper)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 42, fontFamily: 'var(--font-display)', color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>/ 100</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, lineHeight: 1.15, fontFamily: 'var(--font-display)', color: 'var(--text)', marginBottom: 4 }}>
            Learnability Score
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{summary}</div>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 12,
          padding: '8px 10px',
          background: 'var(--error-dim)',
          border: '1px solid rgba(181, 51, 51, 0.25)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--error)',
        }}>
          {error}
        </div>
      )}

      {/* Per-model breakdown */}
      {model_scores?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {model_scores.map((m, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{
                  fontSize: 12,
                  color: m.model === best_model ? 'var(--teal)' : 'var(--muted)',
                  fontFamily: m.model === best_model ? 'var(--font-display)' : 'var(--font-sans)',
                }}>
                  {m.model === best_model && <Award size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                  {m.model}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  {(m.score * 100).toFixed(1)}%
                </span>
              </div>
              <ScoreBar value={m.score * 100} />
            </div>
          ))}
        </div>
      )}

      {/* Metadata row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {[
          ['task', task_type],
          ['rows scored', rows_used?.toLocaleString()],
          ['features', features_used],
          ['best fit', best_model],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 9, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
            <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Honest framing */}
      <div style={{
        marginTop: 10, padding: '8px 10px',
        background: 'var(--surface-2)',
        borderRadius: 8,
        borderLeft: '2px solid var(--border-hover)',
        fontSize: 10, color: 'var(--muted)',
        display: 'flex', gap: 6, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={10} style={{ flexShrink: 0, marginTop: 2 }} />
        This score measures internal dataset learnability — not real-world model accuracy. Validate against real data when available.
      </div>
    </div>
  )
}
