import React, { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Edit2, RotateCcw } from 'lucide-react'

const TYPE_COLORS = {
  float:     '#4dd9ac',
  int:       '#4dd9ac',
  category:  '#f5c842',
  boolean:   '#f5c842',
  timestamp: '#a78bfa',
  text:      '#f87171',
}

function ColRow({ col, onChange }) {
  const [editing, setEditing] = useState(false)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 80px 100px 1fr auto',
      gap: 8,
      padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      alignItems: 'center',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: col.is_label ? 'var(--teal)' : 'var(--text)' }}>
        {col.name}
        {col.is_label && <span style={{ fontSize: 10, color: 'var(--teal)', marginLeft: 6, opacity: 0.7 }}>label</span>}
      </span>
      <span style={{
        fontSize: 10, padding: '2px 6px', borderRadius: 3,
        background: (TYPE_COLORS[col.type] || '#888') + '18',
        color: TYPE_COLORS[col.type] || '#888',
        fontFamily: 'var(--font-mono)',
      }}>
        {col.type}
      </span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{col.distribution}</span>
      <span style={{ fontSize: 11, color: 'var(--muted-2)', fontStyle: 'italic' }}>{col.notes}</span>
      <button
        onClick={() => setEditing(!editing)}
        style={{ color: 'var(--muted-2)', padding: 2, borderRadius: 3, opacity: 0.6 }}
      >
        <Edit2 size={12} />
      </button>
    </div>
  )
}

export function SchemaCard({ schema, onConfirm, loading }) {
  const [open, setOpen] = useState(true)
  const [rowCount, setRowCount] = useState(schema.recommended_rows || 1000)
  const [localSchema, setLocalSchema] = useState(schema)

  const handleConfirm = () => onConfirm(localSchema, rowCount)

  return (
    <div style={{
      border: '1px solid var(--teal-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'rgba(77,217,172,0.04)',
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
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
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
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 10px', fontStyle: 'italic' }}>
              {localSchema.description}
            </p>
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
            {localSchema.columns?.map((col, i) => (
              <ColRow key={i} col={col} onChange={(updated) => {
                const cols = [...localSchema.columns]
                cols[i] = updated
                setLocalSchema({ ...localSchema, columns: cols })
              }} />
            ))}
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
              disabled={loading}
              style={{
                flex: 1,
                padding: '9px 16px',
                background: 'var(--teal)',
                color: '#080a0f',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'var(--font-mono)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Check size={13} />
              {loading ? 'Generating…' : 'Confirm & Generate'}
            </button>
            <button
              onClick={() => setLocalSchema(schema)}
              title="Reset to original"
              style={{
                padding: '9px 12px',
                border: '1px solid var(--border-hover)',
                borderRadius: 'var(--radius)',
                color: 'var(--muted)',
                fontSize: 12,
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


