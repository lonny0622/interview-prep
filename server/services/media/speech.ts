import { spawn } from 'node:child_process'

type SpeechConfig = {
  baseUrl: string
  model: string
  apiKey: string
  ffmpegPath: string
}

function convertToWav(binary: Buffer, mimeType: string, ffmpegPath: string): Promise<Buffer> {
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav' || mimeType === 'audio/wave') return Promise.resolve(binary)
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'])
    const output: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    child.on('error', (error) => reject(new Error(`音频格式转换失败，请确认已安装 ffmpeg（${error.message}）。`)))
    child.on('close', (code) => {
      if (code === 0 && output.length) {
        resolve(Buffer.concat(output))
        return
      }
      reject(new Error(`音频格式转换失败：${Buffer.concat(errors).toString('utf8').trim() || `ffmpeg 退出码 ${code}`}。`))
    })
    child.stdin.end(binary)
  })
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
  })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; text?: unknown }
  if (!response.ok) throw new Error(payload.error?.message || `语音转写请求失败（${response.status}）。`)
  if (typeof payload.text !== 'string' || !payload.text.trim()) throw new Error('语音服务没有返回转写文本。')
  return payload.text.trim()
}
