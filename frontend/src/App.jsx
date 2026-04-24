import React, { useState, useRef, useEffect } from 'react'
import { Plus, UploadCloud, Zap, RotateCcw } from 'lucide-react'
import { useChat, STAGE } from './hooks/useChat'
import { Message } from './components/Message'
import { api } from './lib/api'

const MODES = [
  {
    id: "simulate",
    label: "Simulate",
    tag: "No data? Start here.",
    description: "Describe your project in plain language. Simula builds a schema and generates a complete labeled dataset from scratch — no existing data needed.",
    example: "e.g. I'm building an IoT crowd monitoring system with PIR sensors",
  },
  {
    id: "repair",
    label: "Repair",
    tag: "Broken dataset?",
    description: "Upload a CSV with NaN values, class imbalance, outliers, or encoding issues. Simula diagnoses and fixes it, returning a clean ready-to-train file.",
    example: "e.g. My Tox21 dataset has NaN values across multiple assay columns",
  },
  {
    id: "augment",
    label: "Augment",
    tag: "Not enough data?",
    description: "Have a small dataset? Simula expands it using SMOTE and time-series-aware augmentation — preserving structure while filling gaps and balancing classes.",
    example: "e.g. I have 200 labelled phishing emails but need at least 2000",
  },
  {
    id: "validate",
    label: "Validate",
    tag: "How good is your data?",
    description: "Upload or generate a dataset and get a Learnability Score — a benchmark of how well your data can train a model, with model recommendations.",
    example: "e.g. Score my synthetic sensor dataset before I start training",
  },
]

const SIDEBAR_MODES = [
  { label: 'Simulate', desc: 'Draft data from plain language.', active: true },
  { label: 'Repair', desc: 'Clean and rebalance CSVs.', active: true },
  { label: 'Augment', desc: 'Expand sparse datasets.', active: false },
  { label: 'Validate', desc: 'Score learnability quickly.', active: true },
]

function Sidebar({ apiCalls, onReset, onRepair, compact }) {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
  }, [])

  if (compact) {
    return (
      <div style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: 'var(--ring-soft)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--teal)',
            boxShadow: '0 0 0 1px rgba(201,100,66,0.2)',
          }} />
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              lineHeight: 1,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
            }}>
              Simula
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>Editorial Lab</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onRepair}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 9px',
              borderRadius: '10px',
              border: '1px solid var(--border-hover)',
              background: 'var(--surface-2)',
              color: 'var(--muted)',
              fontSize: 11,
            }}
          >
            <UploadCloud size={12} />
            Repair
          </button>
          <button
            onClick={onReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 9px',
              borderRadius: '10px',
              border: '1px solid var(--teal-border)',
              background: 'var(--teal)',
              color: 'var(--accent)',
              fontSize: 11,
            }}
          >
            <Plus size={12} />
            New
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: 248,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--surface)',
      boxShadow: 'var(--ring-soft)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34,
          lineHeight: 1,
          letterSpacing: '-0.012em',
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--teal)',
            boxShadow: '0 0 0 1px rgba(201,100,66,0.2)',
          }} />
          Simula
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--muted)',
          marginTop: 6,
          letterSpacing: '0.03em',
          lineHeight: 1.45,
        }}>
          Thoughtful synthetic data design,
          <br />
          with a warmer interface.
        </div>
      </div>

      {/* New session */}
      <div style={{ padding: '0 12px 18px' }}>
        <button
          onClick={onReset}
          style={{
            width: '100%',
            padding: '9px 12px',
            border: '1px solid var(--border-hover)',
            borderRadius: '12px',
            background: 'var(--surface-2)',
            color: 'var(--muted)', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'all 0.15s',
            boxShadow: 'var(--ring-soft)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--teal-border)'
            e.currentTarget.style.color = 'var(--text)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-hover)'
            e.currentTarget.style.color = 'var(--muted)'
          }}
        >
          <Plus size={12} />
          New session
        </button>
      </div>

      {/* Modes */}
      <div style={{ padding: '0 12px', flex: 1 }}>
        <div style={{
          fontSize: 10,
          color: 'var(--muted-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.11em',
          marginBottom: 10,
          paddingLeft: 8,
        }}>
          Modes
        </div>
        {SIDEBAR_MODES.map(m => (
          <div
            key={m.label}
            onClick={m.label === 'Repair' ? onRepair : undefined}
            style={{
              padding: '8px 10px',
              borderRadius: '12px',
              marginBottom: 6,
              cursor: m.active ? 'pointer' : 'default',
              opacity: m.active ? 1 : 0.4,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              border: '1px solid var(--border)',
              background: m.active ? 'var(--accent)' : 'transparent',
              boxShadow: m.active ? 'var(--ring-soft)' : 'none',
            }}
          >
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: m.active ? 'var(--teal)' : 'var(--muted-2)',
            }} />
            <div>
              <div style={{
                fontSize: 13,
                color: 'var(--text)',
                fontFamily: 'var(--font-display)',
                lineHeight: 1.2,
              }}>
                {m.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 2 }}>{m.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{
        padding: '16px 20px 0',
        borderTop: '1px solid var(--border)',
        marginTop: 'auto',
      }}>
        <div style={{
          fontSize: 10,
          color: 'var(--muted-2)',
          marginBottom: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Session
        </div>
        {[
          ['API calls', apiCalls],
          ['Backend', health ? '●  live' : '○  —'],
          ['Cache', health?.cache ? `${health.cache.entries} entries` : '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{k}</span>
            <span style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: k === 'Backend' && health ? 'var(--teal)' : 'var(--muted)',
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
          background: i === 1 ? 'var(--amber)' : 'var(--teal)',
          animation: `pulse 1.2s ease-in-out ${d}s infinite`,
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}

export default function App() {
  const { messages, stage, schema, questions, score, apiCalls, canRetry, retryKind,
          setSchema, sendPrompt, sendAnswers, retryLast, confirmAndGenerate, reset } = useChat()

  const [input, setInput] = useState('')
  const [repairLoading, setRepairLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 980)
  const bottomRef = useRef(null)
  const fileRef   = useRef(null)

  const loading = [STAGE.LOADING, STAGE.GENERATING, STAGE.SCORING].includes(stage)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 980)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || loading) return

    const text = input.trim()
    const rescoreIntent = /(learnabil|re[-\s]?score|score\s+(again|test\s+again|once\s+more)|rerun\s+.*scor|run\s+.*scor\s+again)/i
    if (rescoreIntent.test(text) && canRetry && retryKind === 'score') {
      retryLast()
      setInput('')
      return
    }

    sendPrompt(text)
    setInput('')
  }

  const handleRetry = () => {
    if (loading || !canRetry) return
    retryLast()
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
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>
      <Sidebar
        apiCalls={apiCalls}
        onReset={reset}
        onRepair={() => fileRef.current?.click()}
        compact={isMobile}
      />
      <input ref={fileRef} type="file" accept=".csv" onChange={handleRepairFile} style={{ display: 'none' }} />

      {/* Main */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>

        {/* Chat area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '20px 14px 24px' : '36px 40px 28px',
        }}>
          {isEmpty ? (
            <div style={{ maxWidth: 760, margin: isMobile ? '12px auto 0' : '42px auto 0' }}>
              <div style={{ textAlign: 'center', marginBottom: isMobile ? 30 : 46 }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: isMobile ? 'clamp(2rem, 8vw, 2.6rem)' : 'clamp(2.6rem, 6vw, 3.8rem)',
                  letterSpacing: '-0.02em',
                  color: 'var(--text)',
                  lineHeight: 1.12,
                  marginBottom: 14,
                }}>
                  Begin from a <span style={{ fontStyle: 'italic', color: 'var(--teal)' }}>brief.</span>
                </div>
                <p style={{
                  fontSize: isMobile ? 14 : 16,
                  color: 'var(--muted)',
                  lineHeight: 1.66,
                  maxWidth: 640,
                  margin: '0 auto',
                }}>
                  Sketch your project in plain language. Simula turns that brief into a trainable dataset,
                  then helps you repair, expand, and validate it.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 12,
              }}>
                <div style={{
                  gridColumn: '1 / -1',
                  fontSize: 10,
                  color: 'var(--muted-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.11em',
                  marginBottom: 2,
                }}>
                  What do you want to do?
                </div>
                {MODES.map((mode) => (
                  <div
                    key={mode.id}
                    onClick={() => setInput(mode.example.replace('e.g. ', ''))}
                    style={{
                      padding: '16px 16px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: '14px',
                      background: 'var(--surface)',
                      cursor: 'pointer',
                      transition: 'all 0.16s',
                      textAlign: 'left',
                      boxShadow: 'var(--ring-soft)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--teal-border)'
                      e.currentTarget.style.background = 'var(--accent)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--surface)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 22,
                        lineHeight: 1.05,
                        color: 'var(--text)',
                      }}>
                        {mode.label}
                      </span>
                      <span style={{
                        fontSize: 10,
                        padding: '3px 7px',
                        borderRadius: 999,
                        background: 'var(--teal-dim)',
                        color: 'var(--teal)',
                        border: '1px solid var(--teal-border)',
                        letterSpacing: '0.03em',
                      }}>
                        {mode.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.58, marginBottom: 6 }}>
                      {mode.description}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--muted-2)',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                    }}>
                      {mode.example}
                    </div>
                  </div>
                ))}
              </div>

              {/* Repair shortcut */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={repairLoading}
                style={{
                  marginTop: 20,
                  width: '100%',
                  padding: '11px 14px',
                  border: '1px dashed var(--border-hover)',
                  borderRadius: '12px',
                  background: 'var(--surface-2)',
                  color: 'var(--muted)',
                  fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  transition: 'all 0.15s',
                  boxShadow: 'var(--ring-soft)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--teal-border)'
                  e.currentTarget.style.color = 'var(--text)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-hover)'
                  e.currentTarget.style.color = 'var(--muted)'
                }}
              >
                <UploadCloud size={13} />
                {repairLoading ? 'Repairing…' : 'Upload a broken CSV to repair it'}
              </button>
            </div>
          ) : (
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
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
                    onRetry={handleRetry}
                    canRetry={isLast && canRetry && !loading}
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
          padding: isMobile ? '12px 10px 14px' : '14px 30px 18px',
          background: 'linear-gradient(180deg, rgba(250,248,241,0.7) 0%, rgba(245,242,232,0.95) 100%)',
        }}>
          <div style={{
            maxWidth: 760,
            margin: '0 auto',
            display: 'flex', gap: 10, alignItems: 'flex-end',
            padding: 8,
            borderRadius: '16px',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: 'var(--whisper)',
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={stage === STAGE.IDLE ? "Describe your project or dataset need…" : "Continue the conversation…"}
              rows={1}
              disabled={loading}
              style={{
                flex: 1,
                background: 'var(--accent)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                color: 'var(--text)',
                fontSize: 14,
                lineHeight: 1.55,
                padding: '10px 13px',
                resize: 'none',
                outline: 'none',
                maxHeight: 140,
                overflow: 'auto',
                opacity: loading ? 0.5 : 1,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--teal-border)'
                e.target.style.boxShadow = 'var(--ring-soft)'
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--border)'
                e.target.style.boxShadow = 'none'
              }}
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
              onClick={handleRetry}
              disabled={!canRetry || loading}
              title="Retry / Regenerate last prompt"
              aria-label="Retry or regenerate"
              style={{
                padding: '10px 11px',
                background: canRetry && !loading ? 'var(--surface-2)' : 'var(--surface-3)',
                color: canRetry && !loading ? 'var(--teal)' : 'var(--muted-2)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                cursor: canRetry && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
                boxShadow: 'var(--ring-soft)',
              }}
              onMouseEnter={e => {
                if (!canRetry || loading) return
                e.currentTarget.style.borderColor = 'var(--teal-border)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <RotateCcw size={13} />
            </button>
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              style={{
                padding: '10px 15px',
                background: input.trim() && !loading ? 'var(--teal)' : 'var(--surface-3)',
                color: input.trim() && !loading ? 'var(--accent)' : 'var(--muted-2)',
                border: 'none',
                borderRadius: '12px',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontFamily: 'var(--font-sans)',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                boxShadow: input.trim() && !loading ? '0 0 0 1px rgba(201,100,66,0.28)' : 'var(--ring-soft)',
              }}
            >
              <Zap size={12} />
              Generate
            </button>
          </div>
          <div style={{
            maxWidth: 760,
            margin: isMobile ? '8px auto 0' : '7px auto 0',
            fontSize: 10, color: 'var(--muted-2)', textAlign: 'center',
            padding: '0 6px',
          }}>
            Enter to send · Shift+Enter for new line · Use ⟲ to retry or regenerate
          </div>
        </div>
      </div>
    </div>
  )
}
