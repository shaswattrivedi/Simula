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

  const originalPromptRef = useRef('')
  const priorQuestionsRef = useRef([])

  const push = useCallback((...msgs) =>
    setMessages(prev => [...prev, ...msgs]), [])

  // ── SEND INITIAL PROMPT ─────────────────────────────────────────────────
  const sendPrompt = useCallback(async (prompt) => {
    if (!prompt.trim() || stage === STAGE.LOADING) return

    originalPromptRef.current = prompt
    push(userMsg(prompt))
    setStage(STAGE.LOADING)

    try {
      const result = await api.chat(prompt)
      setApiCalls(c => c + result.api_calls_made)

      if (result.stage === 'questions_needed') {
        priorQuestionsRef.current = result.questions
        setQuestions(result.questions)
        setStage(STAGE.QUESTIONS)
        push(sysMsg(result.message))
      } else {
        setSchema(result.schema)
        setStage(STAGE.SCHEMA)
        push(sysMsg(result.message))
      }
    } catch (e) {
      setStage(STAGE.ERROR)
      push(errMsg(e.message))
    }
  }, [stage, push])

  // ── SEND ANSWERS TO QUESTIONS ───────────────────────────────────────────
  const sendAnswers = useCallback(async (answersText) => {
    if (!answersText.trim()) return

    push(userMsg(answersText))
    setStage(STAGE.LOADING)

    try {
      const result = await api.chat(
        originalPromptRef.current,
        answersText,
        priorQuestionsRef.current
      )
      setApiCalls(c => c + result.api_calls_made)

      setQuestions([])
      priorQuestionsRef.current = []
      setSchema(result.schema)
      setStage(STAGE.SCHEMA)
      push(sysMsg(result.message))
    } catch (e) {
      setStage(STAGE.ERROR)
      push(errMsg(e.message))
    }
  }, [push])

  // ── CONFIRM SCHEMA → GENERATE ───────────────────────────────────────────
  const confirmAndGenerate = useCallback(async (confirmedSchema, rowCount) => {
    setStage(STAGE.GENERATING)
    push(sysMsg('Generating your dataset…'))

    try {
      await api.confirmSchema(confirmedSchema, originalPromptRef.current)
      await api.generate(confirmedSchema, rowCount)
      push(sysMsg('Dataset downloaded. Running learnability scoring…'))

      setStage(STAGE.SCORING)
      const scoreResult = await api.score(confirmedSchema, rowCount)
      setScore(scoreResult)
      push(dataMsg(scoreResult))
      setStage(STAGE.DONE)
    } catch (e) {
      setStage(STAGE.ERROR)
      push(errMsg(e.message))
    }
  }, [push])

  // ── RESET ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setMessages([])
    setStage(STAGE.IDLE)
    setSchema(null)
    setQuestions([])
    setScore(null)
    setApiCalls(0)
    originalPromptRef.current = ''
    priorQuestionsRef.current = []
  }, [])

  return {
    messages, stage, schema, questions, score, apiCalls,
    setSchema,
    sendPrompt, sendAnswers, confirmAndGenerate, reset,
  }
}
