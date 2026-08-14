import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { errorMessage } from '../http/errors.js'

type MediaServices = {
  extractResumeText: (binary: Buffer, fileName: string, mimeType: string) => Promise<string>
  transcribeAudio: (audioBase64: string, mimeType?: string) => Promise<string>
}
type SpeechConfig = { sttBaseUrl: string; sttModel: string; sttApiKey: string; sttProvider: string }
const pathOf = (request: IncomingMessage) => request.url?.split('?')[0] || ''
const is = (request: IncomingMessage, method: string, path: string) => request.method === method && pathOf(request) === path

/** 简历文件解析和语音转写路由。外部进程/上游服务细节通过 services 注入。 */
export async function handleMediaRoutes(request: IncomingMessage, response: ServerResponse, config: SpeechConfig, services: MediaServices): Promise<boolean> {
  if (is(request, 'GET', '/api/speech/health')) { jsonResponse(response, 200, { configured: Boolean(config.sttBaseUrl && config.sttModel && config.sttApiKey), provider: config.sttProvider || 'openai-compatible', model: config.sttModel || '' }); return true }
  if (is(request, 'POST', '/api/resume/extract')) {
    try {
      const body = await readJson<{ fileBase64?: string; fileName?: string; mimeType?: string }>(request, 12_000_000)
      if (typeof body.fileBase64 !== 'string' || !body.fileBase64.trim()) { jsonResponse(response, 400, { error: 'fileBase64 不能为空。' }); return true }
      const text = await services.extractResumeText(Buffer.from(body.fileBase64, 'base64'), String(body.fileName || ''), String(body.mimeType || ''))
      if (!text) { jsonResponse(response, 422, { error: '文档中没有提取到文本，请改用粘贴文本。' }); return true }
      jsonResponse(response, 200, { text: text.slice(0, 80_000), fileName: body.fileName }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '简历解析失败。') }); return true }
  }
  if (is(request, 'POST', '/api/stt/transcribe')) {
    try {
      const body = await readJson<{ audioBase64?: string; mimeType?: string }>(request, 15_000_000)
      if (typeof body.audioBase64 !== 'string' || !body.audioBase64.trim()) { jsonResponse(response, 400, { error: 'audioBase64 不能为空。' }); return true }
      jsonResponse(response, 200, { text: await services.transcribeAudio(body.audioBase64, body.mimeType), model: config.sttModel }); return true
    } catch (error) { jsonResponse(response, 502, { error: errorMessage(error, '语音转写失败。') }); return true }
  }
  return false
}
