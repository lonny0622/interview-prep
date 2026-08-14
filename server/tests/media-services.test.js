import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { describe, it } from 'node:test'
import { extractResumeText } from '../../dist-server/services/media/document.js'
import { transcribeAudio } from '../../dist-server/services/media/speech.js'

describe('media services', () => {
  it('rejects unsupported resume formats before starting an external process', async () => {
    await assert.rejects(
      extractResumeText(Buffer.from('resume'), 'resume.txt', 'text/plain', '.'),
      /仅支持 \.docx 和 \.pdf 简历文件/,
    )
  })

  it('rejects empty recordings before contacting the speech provider', async () => {
    await assert.rejects(
      transcribeAudio('', 'audio/webm', { baseUrl: 'https://example.test', model: 'stt', apiKey: 'test-key', ffmpegPath: 'ffmpeg' }),
      /录音内容为空/,
    )
  })
})
