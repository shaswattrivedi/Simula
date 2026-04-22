import React, { useState, useRef, useEffect } from 'react'
import { Plus, UploadCloud, Zap, ChevronRight } from 'lucide-react'
import { useChat, STAGE } from './hooks/useChat'
import { Message } from './components/Message'
import { api } from './lib/api'

const SUGGESTED = [
  'IoT crowd monitoring system with PIR sensors and camera feed',
  'Social engineering detection — phishing, pretexting, baiting, impersonation, tailgating',
  'Predictive maintenance for industrial equipment with vibration and temperature sensors',
  'Chemical compound toxicity classification across multiple assays',
]

function Sidebar({ stage, apiCalls, onReset, onRepair }) {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
  }, [])

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 18px 24px' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22, letterSpacing: '-0.01em',
          color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--teal)',
            boxShadow: '0 0 8px var(--teal)',
          }} />
          Simula
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 2, letterSpacing: '0.06em' }}>
          v1.0 · phase 1
        </div>
      </div>

      {/* New session */}
      <div style={{ padding: '0 10px 16px' }}>
        <button
          onClick={onReset}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid var(--border-hover)',
            borderRadius: 'var(--radius)',
            color: 'var(--muted)', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal-border)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
        >
          <Plus size={12} />
          New session
        </button>
      </div>

      {/* Modes */}
      <div style={{ padding: '0 10px', flex: 1 }}>
        <div style={{ fontSize: 9, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, paddingLeft: 6 }}>
          Modes
        </div>
        {[
          { label: 'Simulate',       desc: 'No data? Generate.',    active: true },
          { label: 'Repair',         desc: 'Fix quality issues.',   active: false },
          { label: 'Augment',        desc: 'Expand small datasets.', active: false },
          { label: 'Validate',       desc: 'Score learnability.',   active: true },
        ].map(m => (
          <div
            key={m.label}
            onClick={m.label === 'Repair' ? onRepair : undefined}
            style={{
              padding: '6px 8px', borderRadius: 'var(--radius)',
              marginBottom: 2, cursor: m.active ? 'pointer' : 'default',
              opacity: m.active ? 1 : 0.4,
              display: 'flex', gap: 8, alignItems: 'center',
            }}
          >
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: m.active ? 'var(--teal)' : 'var(--muted-2)',
            }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>{m.label}</div>
              <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>{m.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{
        padding: '14px 18px 0',
        borderTop: '1px solid var(--border)',
        marginTop: 'auto',
      }}>
        <div style={{ fontSize: 10, color: 'var(--muted-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Session
        </div>
        {[
          ['API calls', apiCalls],
          ['Backend', health ? '●  live' : '○  —'],
          ['Cache', health?.cache ? `${health.cache.entries} entries` : '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{k}</span>
            <span style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: k === 'Backend' && health ? '#4dd9ac' : 'var(--muted)',
            }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 0' }}>
      {[0, 0.15, 0.3].map((d, i) => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--teal)',
          animation: `pulse 1.2s ease-in-out ${d}s infinite`,
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}

export default function App() {
  const { messages, stage, schema, questions, score, apiCalls,
          setSchema, sendPrompt, sendAnswers, confirmAndGenerate, reset } = useChat()

  const [input, setInput] = useState('')
  const [repairLoading, setRepairLoading] = useState(false)
  const bottomRef = useRef(null)
  const fileRef   = useRef(null)

  const loading = [STAGE.LOADING, STAGE.GENERATING, STAGE.SCORING].includes(stage)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || loading) return
    sendPrompt(input.trim())
    setInput('')
  }

  const handleRepairFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRepairLoading(true)
    try {
      const report = await api.repair(file)
      alert(`Repair complete! ${report.changes?.length || 0} changes applied. File downloaded.`)
    } catch (err) {
      alert('Repair failed: ' + err.message)
    } finally {
      setRepairLoading(false)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        stage={stage}
        apiCalls={apiCalls}
        onReset={reset}
        onRepair={() => fileRef.current?.click()}
      />
      <input ref={fileRef} type="file" accept=".csv" onChange={handleRepairFile} style={{ display: 'none' }} />

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
          {isEmpty ? (
            <div style={{ maxWidth: 580, margin: '60px auto 0' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 40, letterSpacing: '-0.02em',
                  color: 'var(--text)', lineHeight: 1.1,
                  marginBottom: 12,
                }}>
                  Start from <span style={{ fontStyle: 'italic', color: 'var(--teal)' }}>zero.</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
                  Describe what you're building. Simula generates the training dataset you need — no existing data required.
                </p>
              </div>

              {/* Suggestions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  Try one of these
                </div>
                {SUGGESTED.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); }}
                    style={{
                      padding: '10px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'transparent',
                      color: 'var(--muted)',
                      fontSize: 12, lineHeight: 1.5,
                      textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--border-hover)'
                      e.currentTarget.style.color = 'var(--text)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.color = 'var(--muted)'
                    }}
                  >
                    <span>{s}</span>
                    <ChevronRight size={12} style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>

              {/* Repair shortcut */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={repairLoading}
                style={{
                  marginTop: 20, width: '100%',
                  padding: '10px 14px',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'transparent',
                  color: 'var(--muted-2)',
                  fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <UploadCloud size={13} />
                {repairLoading ? 'Repairing…' : 'Upload a broken CSV to repair it'}
              </button>
            </div>
          ) : (
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1
                return (
                  <Message
                    key={msg.id}
                    msg={msg}
                    stage={isLast ? stage : null}
                    schema={isLast ? schema : null}
                    questions={isLast ? questions : null}
                    onConfirm={confirmAndGenerate}
                    onAnswers={sendAnswers}
                    loading={loading}
                  />
                )
              })}
              {loading && <Spinner />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '14px 40px',
          background: 'var(--bg)',
        }}>
          <div style={{
            maxWidth: 680, margin: '0 auto',
            display: 'flex', gap: 10, alignItems: 'flex-end',
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={stage === STAGE.IDLE ? "Describe your project or dataset need…" : "Continue the conversation…"}
              rows={1}
              disabled={loading}
              style={{
                flex: 1,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: 13, lineHeight: 1.6,
                padding: '9px 13px',
                resize: 'none',
                outline: 'none',
                maxHeight: 140,
                overflow: 'auto',
                opacity: loading ? 0.5 : 1,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--border-hover)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              style={{
                padding: '9px 14px',
                background: input.trim() && !loading ? 'var(--teal)' : 'var(--surface-2)',
                color: input.trim() && !loading ? '#080a0f' : 'var(--muted-2)',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <Zap size={12} />
              Simulate
            </button>
          </div>
          <div style={{
            maxWidth: 680, margin: '6px auto 0',
            fontSize: 10, color: 'var(--muted-2)', textAlign: 'center',
          }}>
            Enter to send · Shift+Enter for new line · ⌘+Enter to submit answers
          </div>
        </div>
      </div>
    </div>
  )
}
