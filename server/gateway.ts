import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appConfig } from './config/env.js'
import { jsonResponse } from './http/response.js'
import { errorMessage } from './http/errors.js'
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
import { enrichQuestionBatch as enrichQuestionBatchService, normalizeQuestionOutline, parseQuestionSource } from './services/llm/questions.js'
import { fallbackScore, scoreAnswer as scoreAnswerService } from './services/llm/scoring.js'

const { rootDir, provider, baseUrl, model, importModel, apiKey, sttProvider, sttBaseUrl, sttModel, sttApiKey, ffmpegPath, port, requestTimeoutMs } = appConfig

const llmConfig = { baseUrl, model, importModel, apiKey, requestTimeoutMs }
const parseStructuredProfile = (resumeText: string, jdText: string, existing: Record<string, any>) => parseStructuredProfileService(resumeText, jdText, existing, llmConfig)
const generateInterviewBlueprint = (profile: any) => generateInterviewBlueprintService(profile, llmConfig)
const decideNextAction = (session: any, answer: string) => decideNextActionService(session, answer, llmConfig)
const generateInterviewReport = (session: any, turns: any[]) => generateInterviewReportService(session, turns, llmConfig)
const callModel = (source: string) => parseQuestionSource(source, importModel)
const enrichQuestionBatch = (outlines: any[], category: string) => enrichQuestionBatchService(outlines, category, importModel)
const scoreAnswer = (question: any, answer: string) => scoreAnswerService(question, answer, model)

async function handle(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
    response.end()
    return
  }
  if (await handleLlmRoutes(request, response, { baseUrl, model, importModel, apiKey, provider }, { callModel, normalizeQuestionOutline, enrichQuestionBatch, scoreAnswer, fallbackScore })) return
  if (await handleMediaRoutes(request, response, { sttBaseUrl, sttModel, sttApiKey, sttProvider }, {
    extractResumeText: (binary, fileName, mimeType) => extractResumeTextFile(binary, fileName, mimeType, rootDir),
    transcribeAudio: (audioBase64, mimeType) => transcribeAudioFile(audioBase64, mimeType, { baseUrl: sttBaseUrl, model: sttModel, apiKey: sttApiKey, ffmpegPath }),
  })) return
  if (await handleProfileRoutes(request, response, { parseStructuredProfile }, { llmConfigured: Boolean(baseUrl && model && apiKey) })) return
  if (await handleInterviewRoutes(request, response, { parseStructuredProfile, generateInterviewBlueprint, scoreAnswer, decideNextAction, generateInterviewReport })) return
  if (await handleStudyRoutes(request, response)) return
  if (await handleQuestionRoutes(request, response)) return
  jsonResponse(response, 404, { error: 'Not Found' })
}

createServer((request, response) => handle(request, response).catch((error) => jsonResponse(response, 500, { error: errorMessage(error) }))).listen(port, '127.0.0.1', () => {
  console.log(`InterviewPrep LLM Gateway listening on http://127.0.0.1:${port}`)
})
