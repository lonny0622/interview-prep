import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runBoundedCommand } from './process.js'

type TemporaryDocument = {
  directory: string
  inputPath: string
}

function writeTemporaryDocument(extension: string, binary: Buffer): TemporaryDocument {
  const directory = mkdtempSync(join(tmpdir(), 'interviewprep-resume-'))
  const inputPath = join(directory, `resume.${extension}`)
  writeFileSync(inputPath, binary)
  return { directory, inputPath }
}

function removeTemporaryDocument(directory: string) {
  rmSync(directory, { recursive: true, force: true })
}

async function extractDocxText(binary: Buffer): Promise<string> {
  const temporary = writeTemporaryDocument('docx', binary)
  try {
    const { stdout } = await runBoundedCommand('unzip', ['-p', temporary.inputPath, 'word/document.xml'], { timeoutMs: 15_000, maxOutputBytes: 5_000_000 })
    return stdout.toString('utf8')
      .replace(/<w:tab\s*\/?>(\s*)/g, '\t')
      .replace(/<w:br\s*\/?>(\s*)/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+\n/g, '\n')
      .trim()
  } finally {
    removeTemporaryDocument(temporary.directory)
  }
}

async function extractPdfText(binary: Buffer): Promise<string> {
  const temporary = writeTemporaryDocument('pdf', binary)
  const command = process.platform === 'darwin' ? 'textutil' : 'pdftotext'
  const args = process.platform === 'darwin' ? ['-convert', 'txt', '-stdout', temporary.inputPath] : [temporary.inputPath, '-']
  try {
    const { stdout } = await runBoundedCommand(command, args, { timeoutMs: 20_000, maxOutputBytes: 3_000_000 })
    return stdout.toString('utf8').trim()
  } finally {
    removeTemporaryDocument(temporary.directory)
  }
}

/** 根据文件扩展名和 MIME 类型选择文档解析器，并统一限制可支持的格式。 */
export async function extractResumeText(binary: Buffer, fileName: string, mimeType: string, _rootDir: string): Promise<string> {
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
    if (binary.subarray(0, 2).toString('ascii') !== 'PK') throw new Error('DOCX 文件头无效。')
    return extractDocxText(binary)
  }
  if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
    if (binary.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('PDF 文件头无效。')
    return extractPdfText(binary)
  }
  if (lowerName.endsWith('.doc') || mimeType === 'application/msword') throw new Error('暂不支持旧版 .doc，请另存为 .docx 或 PDF 后上传。')
  throw new Error('仅支持 .docx 和 .pdf 简历文件。')
}
