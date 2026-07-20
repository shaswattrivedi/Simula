import { useState, useCallback, useRef } from 'react'
import { api } from '../lib/api'

// Conversation stages
export const STAGE = {
  IDLE:       'idle',
  LOADING:    'loading',
  QUESTIONS:  'questions_needed',
  SCHEMA:     'schema_ready',
  GENERATING: 'generating',
  SCORING:    'scoring',
  DONE:       'done',
  ERROR:      'error',
}

const userMsg  = (text) => ({ role: 'user',      content: text,  id: Date.now() + Math.random() })
const sysMsg   = (text) => ({ role: 'system',    content: text,  id: Date.now() + Math.random() })
const dataMsg  = (data) => ({ role: 'data',      content: data,  id: Date.now() + Math.random() })
const errMsg   = (text) => ({ role: 'error',     content: text,  id: Date.now() + Math.random() })

export function useChat() {
  const [messages, setMessages]       = useState([])
  const [stage, setStage]             = useState(STAGE.IDLE)
  const [schema, setSchema]           = useState(null)
  const [questions, setQuestions]     = useState([])
  const [score, setScore]             = useState(null)
  const [apiCalls, setApiCalls]       = useState(0)
  const [canRetry, setCanRetry]       = useState(false)
  const [retryKind, setRetryKind]     = useState(null)

  const originalPromptRef = useRef('')
  const priorQuestionsRef = useRef([])
  const lastRequestRef    = useRef(null)
  const lastRetryActionRef = useRef(null)
  const lastGeneratedDatasetRef = useRef(null)

  const push = useCallback((...msgs) =>
    setMessages(prev => [...prev, ...msgs]), [])

  const setRetryAction = useCallback((action) => {
    lastRetryActionRef.current = action
    setCanRetry(Boolean(action))
    setRetryKind(action?.kind || null)
  }, [])

  const runChatRequest = useCallback(async (request, userVisibleText = null, options = {}) => {
    const forceRegenerate = Boolean(options?.forceRegenerate)
    if (!request?.prompt) return

    if (userVisibleText) push(userMsg(userVisibleText))
    setStage(STAGE.LOADING)

    try {
      const result = await api.chat(
        request.prompt,
        request.userAnswers ?? null,
        request.priorQuestions ?? null,
        forceRegenerate,
        request.isEdit || false
      )
      setApiCalls(c => c + result.api_calls_made)

      if (result.stage === 'questions_needed') {
        const nextQuestions = result.questions || []
        priorQuestionsRef.current = nextQuestions
        setQuestions(nextQuestions)
        setSchema(null)
        setStage(STAGE.QUESTIONS)
        push(sysMsg(result.message))
      } else {
        setQuestions([])
        priorQuestionsRef.current = []
        setSchema(result.schema)
        setStage(STAGE.SCHEMA)
        push(sysMsg(result.message))
      }
    } catch (e) {
      setStage(STAGE.ERROR)
      push(errMsg(e.message))
    }
  }, [push])

  const runScoring = useCallback(async (confirmedSchema, rowCount, options = {}) => {
    const { isRetry = false, csvText = null } = options
    setStage(STAGE.SCORING)
    push(sysMsg(isRetry ? 'Retrying learnability scoring…' : 'Dataset downloaded. Running learnability scoring…'))

    try {
      const payloadCsv = csvText ?? lastGeneratedDatasetRef.current?.csvText ?? null
      const scoreResult = payloadCsv
        ? await api.scoreFromCsv(confirmedSchema, payloadCsv)
        : await api.score(confirmedSchema, rowCount)
      setScore(scoreResult)
      push(dataMsg(scoreResult))
      setStage(STAGE.DONE)
    } catch (e) {
      setStage(STAGE.ERROR)
      push(errMsg(e.message))
    } finally {
      setRetryAction({
        kind: 'score',
        schema: confirmedSchema,
        rowCount,
        csvText: csvText ?? lastGeneratedDatasetRef.current?.csvText ?? null,
      })
    }
  }, [push, setRetryAction])

  const runGenerateAndScore = useCallback(async (confirmedSchema, rowCount, isRetry = false) => {
    setStage(STAGE.GENERATING)
    push(sysMsg(isRetry ? 'Retrying dataset generation…' : 'Generating your dataset…'))

    try {
      await api.confirmSchema(confirmedSchema, originalPromptRef.current)
      const generated = await api.generate(confirmedSchema, rowCount)
      const csvText = generated?.csvText || null
      lastGeneratedDatasetRef.current = {
        schema: confirmedSchema,
        rowCount,
        csvText,
      }

      setRetryAction({
        kind: 'score',
        schema: confirmedSchema,
        rowCount,
        csvText,
      })

      await runScoring(confirmedSchema, rowCount, { csvText })
    } catch (e) {
      setStage(STAGE.ERROR)
      push(errMsg(e.message))
      setRetryAction({
        kind: 'generate',
        schema: confirmedSchema,
        rowCount,
      })
    }
  }, [push, runScoring, setRetryAction])

  const sendPrompt = useCallback(async (prompt) => {
    if (!prompt.trim() || [STAGE.LOADING, STAGE.GENERATING, STAGE.SCORING].includes(stage)) return

    const normalizedPrompt = prompt.trim()
    let finalPrompt = normalizedPrompt
    let isEdit = false

    if ((stage === STAGE.SCHEMA || stage === STAGE.DONE) && schema) {
      finalPrompt = `Modify the following dataset schema according to this new instruction: "${normalizedPrompt}". Output the complete updated schema. Existing Schema:\n${JSON.stringify(schema)}`
      isEdit = true
    } else {
      originalPromptRef.current = normalizedPrompt
    }

    lastRequestRef.current = {
      prompt: finalPrompt,
      userAnswers: null,
      priorQuestions: null,
      isEdit: isEdit,
    }
    setRetryAction({ kind: 'chat' })
    lastGeneratedDatasetRef.current = null

    await runChatRequest(lastRequestRef.current, normalizedPrompt)
  }, [stage, schema, runChatRequest, setRetryAction])

  // ── SEND ANSWERS TO QUESTIONS ───────────────────────────────────────────
  const sendAnswers = useCallback(async (answersText) => {
    if (!answersText.trim() || [STAGE.LOADING, STAGE.GENERATING, STAGE.SCORING].includes(stage)) return

    const normalizedAnswers = answersText.trim()
    const priorQuestions = priorQuestionsRef.current.map(q => ({ ...q }))

    lastRequestRef.current = {
      prompt: originalPromptRef.current,
      userAnswers: normalizedAnswers,
      priorQuestions,
    }
    setRetryAction({ kind: 'chat' })

    await runChatRequest(lastRequestRef.current, normalizedAnswers)
  }, [stage, runChatRequest, setRetryAction])

  // ── RETRY / REGENERATE LAST PROMPT ─────────────────────────────────────
  const retryLast = useCallback(async () => {
    if ([STAGE.LOADING, STAGE.GENERATING, STAGE.SCORING].includes(stage)) return

    const action = lastRetryActionRef.current
    if (!action) return

    if (action.kind === 'chat') {
      if (!lastRequestRef.current) return
      const forceRegenerate = [STAGE.SCHEMA, STAGE.QUESTIONS].includes(stage)
      await runChatRequest(lastRequestRef.current, null, { forceRegenerate })
      return
    }

    if (action.kind === 'generate') {
      await runGenerateAndScore(action.schema, action.rowCount, true)
      return
    }

    if (action.kind === 'score') {
      await runScoring(action.schema, action.rowCount, {
        isRetry: true,
        csvText: action.csvText ?? lastGeneratedDatasetRef.current?.csvText ?? null,
      })
    }
  }, [stage, runChatRequest, runGenerateAndScore, runScoring])

  // ── CONFIRM SCHEMA → GENERATE ───────────────────────────────────────────
  const confirmAndGenerate = useCallback(async (confirmedSchema, rowCount) => {
    setRetryAction({
      kind: 'generate',
      schema: confirmedSchema,
      rowCount,
    })
    await runGenerateAndScore(confirmedSchema, rowCount)
  }, [runGenerateAndScore, setRetryAction])

  // ── RESET ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setMessages([])
    setStage(STAGE.IDLE)
    setSchema(null)
    setQuestions([])
    setScore(null)
    setApiCalls(0)
    setCanRetry(false)
    setRetryKind(null)
    originalPromptRef.current = ''
    priorQuestionsRef.current = []
    lastRequestRef.current = null
    lastRetryActionRef.current = null
    lastGeneratedDatasetRef.current = null
  }, [])

  return {
    messages, stage, schema, questions, score, apiCalls, canRetry, retryKind,
    setSchema, setMessages,
    sendPrompt, sendAnswers, retryLast, confirmAndGenerate, reset,
  }
}
