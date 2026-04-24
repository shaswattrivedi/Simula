import React, { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Edit2, RotateCcw, X } from 'lucide-react'

const TYPE_COLORS = {
  float:     '#c96442',
  int:       '#c96442',
  category:  '#7d8567',
  boolean:   '#7d8567',
  timestamp: '#9a7a52',
  text:      '#b53333',
}

const TYPE_OPTIONS = ['float', 'int', 'category', 'boolean', 'timestamp', 'text']
const DISTRIBUTIONS_BY_TYPE = {
  float: ['normal', 'uniform', 'lognormal'],
  int: ['poisson', 'normal', 'uniform'],
  category: ['categorical'],
  boolean: ['bernoulli'],
  timestamp: ['timestamp'],
  text: ['categorical'],
}

const inputStyle = {
  width: '100%',
  background: 'var(--accent)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
  lineHeight: 1.3,
  padding: '5px 7px',
}

function ColRow({ col, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(col)

  useEffect(() => {
    setDraft(col)
  }, [col])

  const distributionOptions = DISTRIBUTIONS_BY_TYPE[draft.type] || ['normal']

  const handleTypeChange = (nextType) => {
    const allowed = DISTRIBUTIONS_BY_TYPE[nextType] || ['normal']
    setDraft(prev => ({
      ...prev,
      type: nextType,
      distribution: allowed.includes(prev.distribution) ? prev.distribution : allowed[0],
    }))
  }

  const handleSave = () => {
    const safeType = TYPE_OPTIONS.includes(draft.type) ? draft.type : 'float'
    const safeDistOptions = DISTRIBUTIONS_BY_TYPE[safeType] || ['normal']
    const safeDist = safeDistOptions.includes(draft.distribution) ? draft.distribution : safeDistOptions[0]

    onChange({
      ...draft,
      name: (draft.name || '').trim() || col.name,
      type: safeType,
      distribution: safeDist,
      notes: (draft.notes || '').trim(),
      is_label: Boolean(draft.is_label),
      nullable: Boolean(draft.nullable),
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setDraft(col)
    setEditing(false)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 80px 100px 1fr auto',
      gap: 8,
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
    }}>
      {editing ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={draft.name || ''}
              onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))}
              style={inputStyle}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: 10 }}>
              <input
                type="checkbox"
                checked={Boolean(draft.is_label)}
                onChange={(e) => setDraft(prev => ({ ...prev, is_label: e.target.checked }))}
              />
              label
            </label>
          </div>

          <select
            value={draft.type || 'float'}
            onChange={(e) => handleTypeChange(e.target.value)}
            style={inputStyle}
          >
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={draft.distribution || distributionOptions[0]}
            onChange={(e) => setDraft(prev => ({ ...prev, distribution: e.target.value }))}
            style={inputStyle}
          >
            {distributionOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <input
            value={draft.notes || ''}
            onChange={(e) => setDraft(prev => ({ ...prev, notes: e.target.value }))}
            style={inputStyle}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={handleSave}
              title="Save"
              style={{ color: 'var(--teal)', padding: 2, borderRadius: 3, opacity: 0.9 }}
            >
              <Check size={12} />
            </button>
            <button
              onClick={handleCancel}
              title="Cancel"
              style={{ color: 'var(--error)', padding: 2, borderRadius: 3, opacity: 0.9 }}
            >
              <X size={12} />
            </button>
          </div>
        </>
      ) : (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: col.is_label ? 'var(--teal)' : 'var(--text)' }}>
            {col.name}
            {col.is_label && <span style={{ fontSize: 10, color: 'var(--teal)', marginLeft: 6, opacity: 0.7 }}>label</span>}
          </span>
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 999,
            background: (TYPE_COLORS[col.type] || '#888') + '18',
            color: TYPE_COLORS[col.type] || '#888',
            fontFamily: 'var(--font-mono)',
          }}>
            {col.type}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{col.distribution}</span>
          <span style={{ fontSize: 11, color: 'var(--muted-2)', fontStyle: 'italic' }}>{col.notes}</span>
          <button
            onClick={() => setEditing(true)}
            title="Edit column"
            style={{ color: 'var(--muted-2)', padding: 2, borderRadius: 3, opacity: 0.8 }}
          >
            <Edit2 size={12} />
          </button>
        </>
      )}
    </div>
  )
}

export function SchemaCard({ schema, onConfirm, loading }) {
  const [open, setOpen] = useState(true)
  const [rowCount, setRowCount] = useState(schema.recommended_rows || 1000)
  const [localSchema, setLocalSchema] = useState(schema)
  const [jsonEditOpen, setJsonEditOpen] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonError, setJsonError] = useState('')
  const hasColumns = Array.isArray(localSchema.columns) && localSchema.columns.length > 0

  const handleConfirm = () => {
    if (!hasColumns || loading) return
    onConfirm(localSchema, rowCount)
  }

  const openJsonEditor = () => {
    setJsonDraft(JSON.stringify(localSchema, null, 2))
    setJsonError('')
    setJsonEditOpen(true)
  }

  const applyJsonEdits = () => {
    try {
      const parsed = JSON.parse(jsonDraft)
      setLocalSchema(parsed)
      if (Number.isFinite(Number(parsed?.recommended_rows))) {
        const nextRows = Math.max(100, Math.min(50000, Number(parsed.recommended_rows)))
        setRowCount(nextRows)
      }
      setJsonError('')
      setJsonEditOpen(false)
    } catch (e) {
      setJsonError(e.message || 'Invalid JSON')
    }
  }

  return (
    <div style={{
      border: '1px solid var(--teal-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface)',
      boxShadow: 'var(--whisper)',
      overflow: 'hidden',
      marginTop: 4,
    }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
        onClick={() => setOpen(!open)}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--teal)', flexShrink: 0
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', lineHeight: 1.1, color: 'var(--text)' }}>
            {localSchema.schema_name || 'Generated Schema'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {localSchema.columns?.length} columns · {localSchema.data_type} · {rowCount.toLocaleString()} rows
          </div>
        </div>
        {open ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
      </div>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {/* Description */}
          {localSchema.description && (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '13px 0 10px', fontStyle: 'italic', lineHeight: 1.58 }}>
              {localSchema.description}
            </p>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            gap: 10,
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Edit any row with the pencil icon, or edit full schema JSON.
            </div>
            <button
              onClick={openJsonEditor}
              style={{
                padding: '6px 10px',
                border: '1px solid var(--border-hover)',
                borderRadius: 'var(--radius)',
                background: 'var(--surface-2)',
                color: 'var(--teal)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                boxShadow: 'var(--ring-soft)',
              }}
            >
              Edit JSON
            </button>
          </div>

          {jsonEditOpen && (
            <div style={{
              border: '1px solid var(--border-hover)',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              padding: 10,
              marginBottom: 12,
            }}>
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                rows={14}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: 180,
                  background: 'var(--accent)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.5,
                  padding: '8px 10px',
                }}
              />
              {jsonError && (
                <div style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: 'var(--error)',
                }}>
                  Invalid JSON: {jsonError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setJsonEditOpen(false)
                    setJsonError('')
                  }}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid var(--border-hover)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--surface-3)',
                    color: 'var(--muted)',
                    fontSize: 11,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={applyJsonEdits}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid var(--teal-border)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--accent)',
                    background: 'var(--teal)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Apply JSON Changes
                </button>
              </div>
            </div>
          )}

          {/* Column list */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 100px 1fr auto',
              gap: 8, padding: '4px 0 8px',
              borderBottom: '1px solid var(--border)',
            }}>
              {['column', 'type', 'distribution', 'notes', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 10, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
              ))}
            </div>
            {hasColumns && localSchema.columns?.map((col, i) => (
              <ColRow key={i} col={col} onChange={(updated) => {
                let cols = [...localSchema.columns]

                if (updated.is_label) {
                  cols = cols.map((existing, idx) => (
                    idx === i ? updated : { ...existing, is_label: false }
                  ))
                } else {
                  cols[i] = updated
                  if (!cols.some(c => c.is_label)) {
                    cols[i] = { ...cols[i], is_label: true }
                  }
                }

                const labelCol = cols.find(c => c.is_label)?.name || cols[0]?.name || localSchema.label_column
                setLocalSchema({ ...localSchema, columns: cols, label_column: labelCol })
              }} />
            ))}
            {!hasColumns && (
              <div style={{
                marginTop: 10,
                fontSize: 12,
                color: 'var(--error)',
                padding: '8px 10px',
                borderRadius: 'var(--radius)',
                border: '1px solid rgba(181, 51, 51, 0.24)',
                background: 'var(--error-dim)',
              }}>
                No schema options were generated for this response. Use Regenerate to request a fresh schema.
              </div>
            )}
          </div>

          {/* Row count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Row count</span>
            <input
              type="range"
              min={100}
              max={50000}
              step={100}
              value={rowCount}
              onChange={e => setRowCount(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--teal)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--teal)', fontFamily: 'var(--font-mono)', minWidth: 60, textAlign: 'right' }}>
              {rowCount.toLocaleString()}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleConfirm}
              disabled={loading || !hasColumns}
              style={{
                flex: 1,
                padding: '9px 16px',
                background: 'var(--teal)',
                color: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: loading || !hasColumns ? 'not-allowed' : 'pointer',
                opacity: loading || !hasColumns ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: '0 0 0 1px rgba(201,100,66,0.28)',
              }}
            >
              <Check size={13} />
              {loading ? 'Generating…' : hasColumns ? 'Confirm & Generate' : 'No Options Available'}
            </button>
            <button
              onClick={() => setLocalSchema(schema)}
              title="Reset to original"
              style={{
                padding: '9px 12px',
                border: '1px solid var(--border-hover)',
                borderRadius: 'var(--radius)',
                background: 'var(--surface-2)',
                color: 'var(--muted)',
                fontSize: 12,
                boxShadow: 'var(--ring-soft)',
              }}
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


