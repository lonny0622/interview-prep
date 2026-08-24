import { runBoundedCommand } from './process.js'

type SpeechConfig = {
  baseUrl: string
  model: string
  apiKey: string
  ffmpegPath: string
  requestTimeoutMs: number
}

async function convertToWav(binary: Buffer, mimeType: string, ffmpegPath: string): Promise<Buffer> {
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav' || mimeType === 'audio/wave') return Promise.resolve(binary)
  const { stdout } = await runBoundedCommand(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'], {
    input: binary,
    timeoutMs: 30_000,
    maxOutputBytes: 25_000_000,
  })
  if (!stdout.length) throw new Error('音频格式转换没有产生有效输出。')
  return stdout
}

/** 将浏览器录音规范化为 WAV 后调用 OpenAI-compatible STT 接口。 */
export async function transcribeAudio(audioBase64: string, mimeType = 'audio/webm', config: SpeechConfig): Promise<string> {
  if (!config.baseUrl || !config.model || !config.apiKey) throw new Error('语音转写服务尚未配置。')
  const binary = Buffer.from(audioBase64, 'base64')
  if (!binary.length) throw new Error('录音内容为空。')
  const wav = await convertToWav(binary, mimeType, config.ffmpegPath)
  const form = new FormData()
  form.append('file', new Blob([wav as unknown as BlobPart], { type: 'audio/wav' }), 'answer.wav')
  form.append('model', config.model)
  const response = await fetch(`${config.baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; text?: unknown }
  if (!response.ok) throw new Error(payload.error?.message || `语音转写请求失败（${response.status}）。`)
  if (typeof payload.text !== 'string' || !payload.text.trim()) throw new Error('语音服务没有返回转写文本。')
  return payload.text.trim()
}
