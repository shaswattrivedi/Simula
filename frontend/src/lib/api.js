const BASE = import.meta.env.VITE_API_URL || ''

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Schema pipeline — main chat endpoint
  chat(prompt, userAnswers = null, priorQuestions = null) {
    return post('/api/chat', {
      prompt,
      user_answers: userAnswers,
      prior_questions: priorQuestions,
    })
  },

  // Confirm / lock in schema after user review
  confirmSchema(schema, originalPrompt) {
    return post('/api/schema/confirm', {
      schema,
      original_prompt: originalPrompt,
    })
  },

  // Generate dataset — returns streaming CSV download
  async generate(schema, rowCount = null) {
    const res = await fetch(`${BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema, row_count: rowCount }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Generation failed' }))
      throw new Error(err.detail || 'Generation failed')
    }
    const blob = await res.blob()
    const csvText = await blob.text()
    const name = schema.schema_name?.replace(/\s+/g, '_').toLowerCase() + '.csv' || 'simula_dataset.csv'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
    return { csvText, fileName: name }
  },

  // Score dataset
  score(schema, rowCount = null) {
    return post('/api/score', { schema, row_count: rowCount })
  },

  // Score exact generated CSV dataset
  scoreFromCsv(schema, csvData) {
    return post('/api/score/csv', { schema, csv_data: csvData })
  },

  // Repair — file upload
  async repair(file) {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/api/repair`, { method: 'POST', body: form })
    if (!res.ok) throw new Error('Repair failed')
    const blob = await res.blob()
    const report = JSON.parse(res.headers.get('X-Repair-Report') || '{}')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = file.name.replace('.csv', '_repaired.csv'); a.click()
    URL.revokeObjectURL(url)
    return report
  },

  // Health check
  async health() {
    const res = await fetch(`${BASE}/health`)
    return res.json()
  }
}
