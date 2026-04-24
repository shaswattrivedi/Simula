import React from 'react'
import { TrendingUp, Award, AlertTriangle } from 'lucide-react'

function ScoreBar({ value }) {
  const color = value >= 75 ? '#4dd9ac' : value >= 50 ? '#f5c842' : '#f87171'
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
      <div style={{
        width: `${value}%`,
        height: '100%',
        background: color,
        borderRadius: 4,
        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  )
}

export function ScoreCard({ result }) {
  const { learnability_score, best_model, task_type, model_scores, summary, rows_used, features_used, error } = result
  const score = Math.round(learnability_score)
  const color = score >= 75 ? '#4dd9ac' : score >= 50 ? '#f5c842' : '#f87171'

  return (
    <div style={{
      border: `1px solid ${color}30`,
      borderRadius: 'var(--radius-lg)',
      background: `${color}06`,
      padding: 16,
      marginTop: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontFamily: 'var(--font-display)', color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>/ 100</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
            Learnability Score
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>{summary}</div>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 12,
          padding: '8px 10px',
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 4,
          fontSize: 11,
          color: '#fca5a5',
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
                <span style={{ fontSize: 11, color: m.model === best_model ? 'var(--teal)' : 'var(--muted)' }}>
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
      <div style={{ display: 'flex', gap: 16, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {[
          ['task', task_type],
          ['rows scored', rows_used?.toLocaleString()],
          ['features', features_used],
          ['best fit', best_model],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 9, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Honest framing */}
      <div style={{
        marginTop: 10, padding: '8px 10px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 4, borderLeft: '2px solid rgba(255,255,255,0.1)',
        fontSize: 10, color: 'var(--muted)',
        display: 'flex', gap: 6, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={10} style={{ flexShrink: 0, marginTop: 2 }} />
        This score measures internal dataset learnability — not real-world model accuracy. Validate against real data when available.
      </div>
    </div>
  )
}
