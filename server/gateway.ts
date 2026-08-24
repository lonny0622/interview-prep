import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appConfig } from './config/env.js'
import { jsonResponse } from './http/response.js'
import { errorMessage } from './http/errors.js'
import { applySecurityHeaders, isRequestOriginAllowed } from './http/security.js'
import { serveStaticApp } from './http/static.js'
import { createAuthHandler, validateAuthConfig } from './routes/auth.routes.js'
import { attachRequestLogging, logEvent } from './http/logger.js'
import { closeDatabase, databaseIsReady } from './db/connection.js'
import { handleProfileRoutes } from './routes/profile.routes.js'
import { handleQuestionRoutes } from './routes/questions.routes.js'
import { handleInterviewRoutes } from './routes/interview.routes.js'
import { handleStudyRoutes } from './routes/study.routes.js'
import { handleLlmRoutes } from './routes/llm.routes.js'
import { handleMediaRoutes } from './routes/media.routes.js'
import { extractResumeText as extractResumeTextFile } from './services/media/document.js'
import { transcribeAudio as transcribeAudioFile } from './services/media/speech.js'
import { parseStructuredProfile as parseStructuredProfileService } from './services/profile/parser.js'
import { decideNextAction as decideNextActionService, generateInterviewBlueprint as generateInterviewBlueprintService, generateInterviewReport as generateInterviewReportService } from './services/interview/orchestrator.js'
import { enrichQuestionBatch as enrichQuestionBatchService, enrichQuestionBatchStream as enrichQuestionBatchStreamService, normalizeQuestionOutline, parseQuestionSource } from './services/llm/questions.js'
import { fallbackScore, scoreAnswer as scoreAnswerService } from './services/llm/scoring.js'
import { explainSelectionStream as explainSelectionStreamService } from './services/llm/explanation.js'
import type { QuestionOutline, ScoreQuestion } from './domain/question.js'
import type { InterviewProfile, InterviewSession, InterviewTurn } from './domain/interview.js'

const { rootDir, isProduction, host, provider, baseUrl, model, importModel, apiKey, sttProvider, sttBaseUrl, sttModel, sttApiKey, ffmpegPath, sttRequestTimeoutMs, port, requestTimeoutMs, auth } = appConfig
validateAuthConfig(auth, isProduction)
const authHandler = createAuthHandler(auth)

const llmConfig = { baseUrl, model, importModel, apiKey, requestTimeoutMs }
const parseStructuredProfile = (resumeText: string, jdText: string, existing: Record<string, unknown>) => parseStructuredProfileService(resumeText, jdText, existing, llmConfig)
const generateInterviewBlueprint = (profile: InterviewProfile) => generateInterviewBlueprintService(profile, llmConfig)
const decideNextAction = (session: InterviewSession, answer: string) => decideNextActionService(session, answer, llmConfig)
const generateInterviewReport = (session: InterviewSession, turns: InterviewTurn[]) => generateInterviewReportService(session, turns, llmConfig)
const callModel = (source: string) => parseQuestionSource(source, importModel)
const enrichQuestionBatch = (outlines: QuestionOutline[], category: string, context?: string) => enrichQuestionBatchService(outlines, category, importModel, context)
const enrichQuestionBatchStream = (outlines: QuestionOutline[], category: string, context?: string, signal?: AbortSignal) => enrichQuestionBatchStreamService(outlines, category, importModel, undefined, context, signal)
const scoreAnswer = (question: ScoreQuestion, answer: string) => scoreAnswerService(question, answer, model)
const explainSelectionStream = (input: import('./domain/explanation.js').ExplainSelectionInput, signal?: AbortSignal) => explainSelectionStreamService(input, llmConfig, signal)
let shuttingDown = false

async function handle(request: IncomingMessage, response: ServerResponse) {
  applySecurityHeaders(response, isProduction)
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS' })
    response.end()
    return
  }
  if (request.url?.split('?')[0] === '/health') {
    const ready = !shuttingDown && databaseIsReady()
    jsonResponse(response, ready ? 200 : 503, { status: ready ? 'ok' : 'unavailable' })
    return
  }
  if (await authHandler.handleRoutes(request, response)) return
  if (request.url?.startsWith('/api/')) {
    if (!authHandler.authenticatedUsername(request)) {
      jsonResponse(response, 401, { error: '登录状态已失效，请重新登录。' })
      return
    }
    if (!isRequestOriginAllowed(request, auth.appOrigin)) {
      jsonResponse(response, 403, { error: '请求来源校验失败。' })
      return
    }
  }
  if (await handleLlmRoutes(request, response, { baseUrl, model, importModel, apiKey, provider }, { callModel, normalizeQuestionOutline, enrichQuestionBatch, enrichQuestionBatchStream, explainSelectionStream, scoreAnswer, fallbackScore })) return
  if (await handleMediaRoutes(request, response, { sttBaseUrl, sttModel, sttApiKey, sttProvider }, {
    extractResumeText: (binary, fileName, mimeType) => extractResumeTextFile(binary, fileName, mimeType, rootDir),
    transcribeAudio: (audioBase64, mimeType) => transcribeAudioFile(audioBase64, mimeType, { baseUrl: sttBaseUrl, model: sttModel, apiKey: sttApiKey, ffmpegPath, requestTimeoutMs: sttRequestTimeoutMs }),
  })) return
  if (await handleProfileRoutes(request, response, { parseStructuredProfile }, { llmConfigured: Boolean(baseUrl && model && apiKey) })) return
  if (await handleInterviewRoutes(request, response, { parseStructuredProfile, generateInterviewBlueprint, scoreAnswer, decideNextAction, generateInterviewReport })) return
  if (await handleStudyRoutes(request, response)) return
  if (await handleQuestionRoutes(request, response)) return
  if (request.url?.startsWith('/api/')) {
    jsonResponse(response, 404, { error: 'Not Found' })
    return
  }
  if (serveStaticApp(request, response, rootDir)) return
  jsonResponse(response, 404, { error: 'Not Found' })
}

const server = createServer((request, response) => {
  const requestId = attachRequestLogging(request, response)
  void handle(request, response).catch((error) => {
    logEvent('error', 'http_unhandled_error', { requestId, error: errorMessage(error) })
    if (!response.headersSent) jsonResponse(response, 500, { error: isProduction ? '请求处理失败。' : errorMessage(error) })
    else response.destroy()
  })
})

server.requestTimeout = 120_000
server.headersTimeout = 15_000
server.keepAliveTimeout = 5_000
server.maxHeadersCount = 100
server.on('clientError', (error, socket) => {
  logEvent('warn', 'http_client_error', { error: error.message })
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
})

server.listen(port, host, () => logEvent('info', 'server_started', { host, port }))

function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  logEvent('info', 'server_shutdown_started', { signal })
  const forceTimer = setTimeout(() => {
    logEvent('error', 'server_shutdown_forced')
    server.closeAllConnections()
    closeDatabase()
    process.exitCode = 1
  }, 15_000)
  forceTimer.unref()
  server.close((error) => {
    clearTimeout(forceTimer)
    if (error) logEvent('error', 'server_shutdown_error', { error: error.message })
    closeDatabase()
    logEvent('info', 'server_stopped')
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
