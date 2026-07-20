import React, { useState, useRef, useEffect } from 'react'
import { Plus, UploadCloud, Zap, RotateCcw, PanelLeftClose, PanelRightClose, MessageSquare, LogOut, User, Edit2, Trash2, Share } from 'lucide-react'
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import { useChat, STAGE } from './hooks/useChat'
import { Message } from './components/Message'
import { api } from './lib/api'
import Login from './Login'
import Register from './Register'

const MODES = [
  {
    id: "simulate",
    label: "Simulate",
    tag: "No data? Start here.",
    description: "Describe your project in plain language. Simula builds a schema and generates a labeled dataset.",
    examples: [
      "I need an e-commerce customer churn dataset with purchase histories",
      "Draft a social media sentiment analysis schema focusing on tech products",
      "I need a cybersecurity intrusion detection dataset with network traffic logs"
    ]
  },
  {
    id: "repair",
    label: "Repair",
    tag: "Broken dataset?",
    description: "Upload a CSV with NaN values, class imbalance, or outliers. Simula diagnoses and fixes it.",
    examples: [
      "My retail sales dataset has NaN values across multiple price columns",
      "I have a highly imbalanced credit card fraud dataset that needs fixing",
      "My healthcare records dataset has inconsistent date formats and missing ages"
    ]
  },
  {
    id: "augment",
    label: "Augment",
    tag: "Not enough data?",
    description: "Have a small dataset? Simula expands it using advanced augmentation techniques.",
    examples: [
      "I have 200 labeled credit card fraud instances but need at least 2000",
      "Generate 5000 more rows of customer reviews based on my sample CSV",
      "Expand my small stock price dataset while retaining time-series patterns"
    ]
  },
  {
    id: "validate",
    label: "Validate",
    tag: "How good is your data?",
    description: "Get a Learnability Score — a benchmark of how well your data can train a model.",
    examples: [
      "Score my user engagement dataset before I start training",
      "Evaluate if my manufacturing defect dataset is linearly separable",
      "Analyze the class distribution and predictability of my churn dataset"
    ]
  },
]

function ChatHistoryItem({ chat, onSelect, onDelete, onRename, onShare }) {
  const [isHovering, setIsHovering] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(chat.summary)

  const handleSave = () => {
    onRename(chat, editValue)
    setIsEditing(false)
  }

  return (
    <div 
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px', borderRadius: '10px', cursor: 'pointer',
        color: 'var(--muted)', fontSize: 13, transition: 'background 0.1s',
        background: isHovering || isEditing ? 'var(--surface-3)' : 'transparent',
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={() => { if (!isEditing) onSelect(chat) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', color: isHovering || isEditing ? 'var(--text)' : 'inherit', flex: 1 }}>
        <MessageSquare size={14} style={{ flexShrink: 0 }} />
        {isEditing ? (
          <input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            onBlur={handleSave}
            autoFocus
            style={{
              background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none',
              width: '100%', fontSize: 13, fontFamily: 'inherit'
            }}
          />
        ) : (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {chat.summary}
          </div>
        )}
      </div>
      {(isHovering || isEditing) && !isEditing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
           <button onClick={() => { setIsEditing(true); setEditValue(chat.summary) }} style={{ color: 'var(--muted-2)' }}><Edit2 size={12} /></button>
           <button onClick={() => onShare(chat)} style={{ color: 'var(--muted-2)' }}><Share size={12} /></button>
           <button onClick={() => onDelete(chat)} style={{ color: 'var(--error)' }}><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  )
}

function Sidebar({ 
  onReset, 
  compact, 
  chatHistory, 
  onLogout, 
  currentUser,
  onSidebarToggle,
  isSidebarOpen,
  onSelectHistory,
  onDeleteHistory,
  onRenameHistory,
  onShareHistory
}) {
  // Using CSS transition instead of conditional unmounting for smooth animation

  if (compact) {
    return (
      <div style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: 'var(--ring-soft)',
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)',
            boxShadow: '0 0 0 1px rgba(99,102,241,0.2)',
          }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            Simula
          </div>
        </div>
        <button onClick={onReset} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 9px', borderRadius: '10px', border: '1px solid var(--teal-border)', background: 'var(--teal)', color: 'var(--accent)', fontSize: 11 }}>
          <Plus size={12} /> New
        </button>
      </div>
    )
  }

  return (
    <div style={{
      width: 260, flexShrink: 0,
      marginLeft: (!isSidebarOpen && !compact) ? -260 : 0,
      transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      borderRight: '1px solid var(--border)', background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', 
      padding: '14px 12px 24px',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', background: 'var(--teal)',
            boxShadow: '0 0 0 1px rgba(99,102,241,0.2)',
          }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--text)' }}>
            Simula
          </span>
        </div>
        <button onClick={onSidebarToggle} style={{ color: 'var(--muted)', padding: 4 }}>
          <PanelLeftClose size={18} />
        </button>
      </div>

      <button
        onClick={onReset}
        style={{
          width: '100%', padding: '10px 12px', border: '1px solid var(--border-hover)',
          borderRadius: '12px', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
          boxShadow: 'var(--ring-soft)', marginBottom: 24
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal-border)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
      >
        <Plus size={14} /> New session
      </button>

      {/* Chat History */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.11em', marginBottom: 10, paddingLeft: 8 }}>
          Chat History
        </div>
        {chatHistory.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 8 }}>No recent sessions.</div>
        ) : (
          chatHistory.map((chat) => (
            <ChatHistoryItem
              key={chat.id}
              chat={chat}
              onSelect={onSelectHistory}
              onDelete={onDeleteHistory}
              onRename={onRenameHistory}
              onShare={onShareHistory}
            />
          ))
        )}
      </div>

      {/* User Profile */}
      {currentUser && (
        <div style={{
          marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: 'var(--teal-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)'
            }}>
              <User size={16} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.2 }}>{currentUser.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>Pro Plan</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ color: 'var(--muted-2)', padding: 6, borderRadius: '6px' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <LogOut size={16} />
          </button>
        </div>
      )}
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

function MainChatApp() {
  const { messages, stage, schema, questions, score, apiCalls, canRetry, retryKind,
          setSchema, setMessages, sendPrompt, sendAnswers, retryLast, confirmAndGenerate, reset } = useChat()

  const [input, setInput] = useState('')
  const [repairLoading, setRepairLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 980)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [chatHistory, setChatHistory] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const bottomRef = useRef(null)
  
  const navigate = useNavigate()
  const loading = [STAGE.LOADING, STAGE.GENERATING, STAGE.SCORING].includes(stage)

  // Load auth state and history
  useEffect(() => {
    const user = localStorage.getItem('currentUser')
    if (!user) {
      navigate('/login')
    } else {
      setCurrentUser(JSON.parse(user))
    }
    const history = JSON.parse(localStorage.getItem('chatHistory') || '[]')
    setChatHistory(history)
  }, [navigate])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 980)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (messages.length > 0) {
      const summaryContent = messages.find(m => m.role === 'user')?.content || 'New Session'
      const summary = summaryContent.substring(0, 30) + (summaryContent.length > 30 ? '...' : '')
      
      setChatHistory(prev => {
        const id = activeSessionId || Date.now().toString()
        const existingIdx = prev.findIndex(c => c.id === id)
        let newHistory = [...prev]
        
        if (existingIdx >= 0) {
          const curr = newHistory[existingIdx]
          if (curr.messages.length === messages.length && curr.summary === summary) return prev
          newHistory[existingIdx] = { ...curr, messages: [...messages], summary }
        } else {
          newHistory = [{ id, timestamp: new Date().toLocaleString(), messages: [...messages], summary }, ...prev]
          setTimeout(() => setActiveSessionId(id), 0)
        }
        
        localStorage.setItem('chatHistory', JSON.stringify(newHistory))
        return newHistory
      })
    }
  }, [messages, activeSessionId])

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

  const handleNewSession = () => {
    reset()
    setActiveSessionId(null)
    setInput('')
  }

  const handleSelectHistory = (chatSession) => {
    reset()
    setActiveSessionId(chatSession.id)
    setTimeout(() => {
      setMessages(chatSession.messages || [])
    }, 0)
    if (isMobile) setIsSidebarOpen(false)
  }

  const handleDeleteHistory = (chatSession) => {
    const updated = chatHistory.filter(c => c.id !== chatSession.id)
    setChatHistory(updated)
    localStorage.setItem('chatHistory', JSON.stringify(updated))
    if (activeSessionId === chatSession.id) {
      handleNewSession()
    }
  }

  const handleRenameHistory = (chatSession, newName) => {
    if (!newName.trim()) return
    const updated = chatHistory.map(c => c.id === chatSession.id ? { ...c, summary: newName.trim() } : c)
    setChatHistory(updated)
    localStorage.setItem('chatHistory', JSON.stringify(updated))
  }

  const handleShareHistory = (chatSession) => {
    // Generate a quick sharable text formatted blob (Mock sharing logic)
    const blob = chatSession.messages.map(m => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n')
    navigator.clipboard.writeText(blob).then(() => {
      alert("Session copied to clipboard!")
    })
  }

  const handleLogout = () => {
    localStorage.removeItem('currentUser')
    navigate('/login')
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{
      display: 'flex', flexDirection: isMobile ? 'column' : 'row',
      height: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)',
    }}>
      <Sidebar
        onReset={handleNewSession}
        isSidebarOpen={isSidebarOpen}
        onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        compact={isMobile}
        chatHistory={chatHistory}
        currentUser={currentUser}
        onSelectHistory={handleSelectHistory}
        onDeleteHistory={handleDeleteHistory}
        onRenameHistory={handleRenameHistory}
        onShareHistory={handleShareHistory}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', minWidth: 0, position: 'relative'
      }}>
        {/* Toggle open button if closed */}
        {!isSidebarOpen && !isMobile && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            style={{ position: 'absolute', top: 20, left: 20, color: 'var(--muted)', background: 'var(--surface)', padding: 8, borderRadius: '8px', zIndex: 10, border: '1px solid var(--border)', boxShadow: 'var(--ring-soft)' }}
          >
            <PanelRightClose size={18} />
          </button>
        )}

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 14px 24px' : '36px 40px 28px', display: 'flex', flexDirection: 'column' }}>
          {isEmpty ? (
            <div style={{ maxWidth: 760, width: '100%', margin: isMobile ? '12px auto auto' : 'auto auto' }}>
              <div style={{ textAlign: 'center', marginBottom: isMobile ? 30 : 46 }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: isMobile ? 'clamp(2rem, 8vw, 2.6rem)' : 'clamp(2.6rem, 6vw, 3.8rem)',
                  letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.12, marginBottom: 14,
                }}>
                  Begin from a <span style={{ fontStyle: 'italic', color: 'var(--teal)' }}>brief.</span>
                </div>
                <p style={{ fontSize: isMobile ? 14 : 16, color: 'var(--muted)', lineHeight: 1.66, maxWidth: 640, margin: '0 auto' }}>
                  Sketch your project in plain language. Simula turns that brief into a trainable dataset,
                  then helps you repair, expand, and validate it.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.11em', marginBottom: 2 }}>
                  What do you want to do?
                </div>
                {MODES.map((mode) => (
                  <div
                    key={mode.id}
                    onClick={() => {
                       const randomExample = mode.examples[Math.floor(Math.random() * mode.examples.length)];
                       setInput(randomExample);
                    }}
                    style={{
                      padding: '16px 16px 14px', border: '1px solid var(--border)', borderRadius: '14px',
                      background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.16s', textAlign: 'left',
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
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.05, color: 'var(--text)' }}>
                        {mode.label}
                      </span>
                      <span style={{
                        fontSize: 10, padding: '3px 7px', borderRadius: 999,
                        background: 'var(--teal-dim)', color: 'var(--teal)', border: '1px solid var(--teal-border)', letterSpacing: '0.03em',
                      }}>
                        {mode.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                      {mode.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
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
          borderTop: '1px solid var(--border)', padding: isMobile ? '12px 10px 14px' : '14px 30px 18px',
          background: 'linear-gradient(180deg, rgba(9,9,11,0.7) 0%, rgba(9,9,11,0.95) 100%)',
        }}>
          <div style={{
            maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end',
            padding: 8, borderRadius: '16px', border: '1px solid var(--border)',
            background: 'var(--surface)', boxShadow: 'var(--whisper)',
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={stage === STAGE.IDLE ? "Describe your project or dataset need…" : "Continue the conversation…"}
              rows={1}
              disabled={loading}
              style={{
                flex: 1, background: 'var(--accent)', border: '1px solid var(--border)',
                borderRadius: '12px', color: 'var(--text)', fontSize: 14, lineHeight: 1.55,
                padding: '12px 14px', resize: 'none', outline: 'none', maxHeight: 140, overflow: 'auto',
                opacity: loading ? 0.5 : 1, transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--teal-border)'; e.target.style.boxShadow = 'var(--ring-soft)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }}
            />
            {/* Buttons Wrapper for vertical alignment */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
              <button
                onClick={handleRetry}
                disabled={!canRetry || loading}
                title="Retry / Regenerate last prompt"
                style={{
                  height: '42px', width: '42px',
                  background: canRetry && !loading ? 'var(--surface-2)' : 'var(--surface-3)', color: canRetry && !loading ? 'var(--teal)' : 'var(--muted-2)',
                  border: '1px solid var(--border)', borderRadius: '12px', cursor: canRetry && !loading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (canRetry && !loading) e.currentTarget.style.borderColor = 'var(--teal-border)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                style={{
                  height: '42px', padding: '0 16px',
                  background: input.trim() && !loading ? 'var(--teal)' : 'var(--surface-3)', color: input.trim() && !loading ? '#fff' : 'var(--muted-2)',
                  border: 'none', borderRadius: '12px', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                }}
              >
                <Zap size={14} />
                Generate
              </button>
            </div>
          </div>
          <div style={{ maxWidth: 760, margin: '8px auto 0', fontSize: 10, color: 'var(--muted-2)', textAlign: 'center', padding: '0 6px' }}>
            Enter to send · Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<MainChatApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
