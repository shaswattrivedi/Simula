import React from 'react'
import { AlertCircle, Terminal, RotateCcw } from 'lucide-react'
import { SchemaCard } from './SchemaCard'
import { ScoreCard } from './ScoreCard'
import { QuestionsPanel } from './QuestionsPanel'
import { STAGE } from '../hooks/useChat'

export function Message({ msg, stage, schema, questions, onConfirm, onAnswers, onRetry, canRetry, loading }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{
          maxWidth: '72%',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)',
          padding: '10px 13px',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text)',
          boxShadow: 'var(--ring-soft)',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.role === 'error') {
    return (
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        color: 'var(--error)', fontSize: 12, marginBottom: 16,
        padding: '9px 11px',
        background: 'var(--error-dim)',
        border: '1px solid rgba(181, 51, 51, 0.24)',
        borderRadius: '12px',
      }}>
        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ flex: 1 }}>{msg.content}</span>
        {canRetry && (
          <button
            onClick={onRetry}
            disabled={loading}
            title="Retry same prompt"
            aria-label="Retry same prompt"
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '1px solid rgba(181, 51, 51, 0.28)',
              color: 'var(--error)',
              background: 'rgba(250, 249, 245, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    )
  }

  if (msg.role === 'data') {
    return (
      <div style={{ marginBottom: 16 }}>
        <ScoreCard result={msg.content} />
      </div>
    )
  }

  // System message
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(201,100,66,0.25), rgba(201,100,66,0.08))',
          border: '1px solid var(--teal-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 1,
        }}>
          <Terminal size={9} color="var(--teal)" />
        </div>
        <span style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.62 }}>
          {msg.content}
        </span>
      </div>

      {canRetry && (
        <button
          onClick={onRetry}
          disabled={loading}
          title="Regenerate with same prompt"
          aria-label="Regenerate with same prompt"
          style={{
            marginLeft: 28,
            marginBottom: 8,
            fontSize: 11,
            color: 'var(--muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            border: '1px solid var(--border-hover)',
            background: 'var(--surface)',
            borderRadius: '999px',
            padding: '4px 8px',
            opacity: loading ? 0.5 : 1,
            boxShadow: 'var(--ring-soft)',
          }}
        >
          <RotateCcw size={11} />
          Regenerate
        </button>
      )}

      {/* Attach interactive panels to the last system message based on stage */}
      {stage === STAGE.QUESTIONS && questions?.length > 0 && (
        <QuestionsPanel
          questions={questions}
          onSubmit={onAnswers}
          loading={loading}
        />
      )}
      {stage === STAGE.SCHEMA && schema && (
        <SchemaCard
          schema={schema}
          onConfirm={onConfirm}
          loading={loading}
        />
      )}
    </div>
  )
}
