import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appConfig } from './config/env.js'
import { jsonResponse } from './http/response.js'
import { errorMessage } from './http/errors.js'
import { applySecurityHeaders, isRequestOriginAllowed } from './http/security.js'
import { serveStaticApp } from './http/static.js'
import { createAuthHandler, validateAuthConfig } from './routes/auth.routes.js'
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

const { rootDir, isProduction, host, provider, baseUrl, model, importModel, apiKey, sttProvider, sttBaseUrl, sttModel, sttApiKey, ffmpegPath, port, requestTimeoutMs, auth } = appConfig
validateAuthConfig(auth, isProduction)
const authHandler = createAuthHandler(auth)

const llmConfig = { baseUrl, model, importModel, apiKey, requestTimeoutMs }
const parseStructuredProfile = (resumeText: string, jdText: string, existing: Record<string, unknown>) => parseStructuredProfileService(resumeText, jdText, existing, llmConfig)
const generateInterviewBlueprint = (profile: InterviewProfile) => generateInterviewBlueprintService(profile, llmConfig)
const decideNextAction = (session: InterviewSession, answer: string) => decideNextActionService(session, answer, llmConfig)
const generateInterviewReport = (session: InterviewSession, turns: InterviewTurn[]) => generateInterviewReportService(session, turns, llmConfig)
const callModel = (source: string) => parseQuestionSource(source, importModel)
const enrichQuestionBatch = (outlines: QuestionOutline[], category: string, context?: string) => enrichQuestionBatchService(outlines, category, importModel, context)
const enrichQuestionBatchStream = (outlines: QuestionOutline[], category: string, context?: string) => enrichQuestionBatchStreamService(outlines, category, importModel, undefined, context)
const scoreAnswer = (question: ScoreQuestion, answer: string) => scoreAnswerService(question, answer, model)
const explainSelectionStream = (input: import('./domain/explanation.js').ExplainSelectionInput) => explainSelectionStreamService(input, llmConfig)

async function handle(request: IncomingMessage, response: ServerResponse) {
  applySecurityHeaders(response, isProduction)
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS' })
    response.end()
    return
  }
  if (request.url?.split('?')[0] === '/health') {
    jsonResponse(response, 200, { status: 'ok' })
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
    transcribeAudio: (audioBase64, mimeType) => transcribeAudioFile(audioBase64, mimeType, { baseUrl: sttBaseUrl, model: sttModel, apiKey: sttApiKey, ffmpegPath }),
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

createServer((request, response) => handle(request, response).catch((error) => jsonResponse(response, 500, { error: isProduction ? '请求处理失败。' : errorMessage(error) }))).listen(port, host, () => {
  console.log(`InterviewPrep server listening on http://${host}:${port}`)
})
