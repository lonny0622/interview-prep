import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

type TemporaryDocument = {
  directory: string
  inputPath: string
}

function writeTemporaryDocument(rootDir: string, extension: string, binary: Buffer): TemporaryDocument {
  const directory = mkdtempSync(join(rootDir, '.resume-'))
  const inputPath = join(directory, `resume.${extension}`)
  writeFileSync(inputPath, binary)
  return { directory, inputPath }
}

function removeTemporaryDocument(directory: string) {
  rmSync(directory, { recursive: true, force: true })
}

function extractDocxText(binary: Buffer, rootDir: string): Promise<string> {
  const temporary = writeTemporaryDocument(rootDir, 'docx', binary)
  const unzip = spawn('unzip', ['-p', temporary.inputPath, 'word/document.xml'])
  return new Promise((resolve, reject) => {
    const output: Buffer[] = []
    const errors: Buffer[] = []
    unzip.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    unzip.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    unzip.on('error', (error) => {
      removeTemporaryDocument(temporary.directory)
      reject(error)
    })
    unzip.on('close', (code) => {
      if (code !== 0) {
        removeTemporaryDocument(temporary.directory)
        reject(new Error(`DOCX 解析失败：${Buffer.concat(errors).toString('utf8').trim()}`))
        return
      }
      const xml = Buffer.concat(output).toString('utf8')
      removeTemporaryDocument(temporary.directory)
      resolve(xml
        .replace(/<w:tab\s*\/?>(\s*)/g, '\t')
        .replace(/<w:br\s*\/?>(\s*)/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+\n/g, '\n')
        .trim())
    })
  })
}

function extractPdfText(binary: Buffer, rootDir: string): Promise<string> {
  const temporary = writeTemporaryDocument(rootDir, 'pdf', binary)
  const textutil = spawn('textutil', ['-convert', 'txt', '-stdout', temporary.inputPath])
  return new Promise((resolve, reject) => {
    const output: Buffer[] = []
    const errors: Buffer[] = []
    textutil.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    textutil.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    textutil.on('error', (error) => {
      removeTemporaryDocument(temporary.directory)
      reject(error)
    })
    textutil.on('close', (code) => {
      removeTemporaryDocument(temporary.directory)
      if (code === 0) {
        resolve(Buffer.concat(output).toString('utf8').trim())
        return
      }
      reject(new Error(`PDF 解析失败：${Buffer.concat(errors).toString('utf8').trim()}`))
    })
  })
}

/** 根据文件扩展名和 MIME 类型选择文档解析器，并统一限制可支持的格式。 */
export async function extractResumeText(binary: Buffer, fileName: string, mimeType: string, rootDir: string): Promise<string> {
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.docx') || mimeType.includes('wordprocessingml')) return extractDocxText(binary, rootDir)
  if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') return extractPdfText(binary, rootDir)
  if (lowerName.endsWith('.doc') || mimeType === 'application/msword') throw new Error('暂不支持旧版 .doc，请另存为 .docx 或 PDF 后上传。')
  throw new Error('仅支持 .docx 和 .pdf 简历文件。')
}
