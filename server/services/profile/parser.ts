import { errorMessage } from '../../http/errors.js'
import type { CandidateExperience, CandidateProject, StructuredProfile } from '../../domain/profile.js'
import { completeChat } from '../llm/client.js'
import { extractJsonObject } from '../llm/json.js'

export type ProfileParserConfig = {
  baseUrl: string
  model: string
  importModel: string
  apiKey: string
  requestTimeoutMs: number
}

const profileSchema = '{"candidate":{"name":"","headline":"","yearsExperience":0,"skills":[""],"experiences":[{"company":"","title":"","period":"","responsibilities":[""]}],"projects":[{"name":"","background":"","responsibilities":[""],"techStack":[""],"challenges":[""],"solutions":[""],"results":[""],"risks":[""]}]},"job":{"role":"","responsibilities":[""],"requiredSkills":[""],"preferredExperience":[""],"interviewSignals":[""]},"gaps":[""]}'

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
const list = (items: unknown): string[] => Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20) : []

function normalizeStructuredProfile(value: unknown, resumeText = '', jdText = ''): StructuredProfile {
  const root = asRecord(value)
  const candidate = asRecord(root.candidate)
  const job = asRecord(root.job)
  const projects: CandidateProject[] = Array.isArray(candidate.projects) ? candidate.projects.map((entry) => {
    const item = asRecord(entry)
    return { name: String(item.name || '').trim(), background: String(item.background || '').trim(), responsibilities: list(item.responsibilities), techStack: list(item.techStack), challenges: list(item.challenges), solutions: list(item.solutions), results: list(item.results), risks: list(item.risks) }
  }).filter((item) => item.name).slice(0, 12) : []
  const experiences: CandidateExperience[] = Array.isArray(candidate.experiences) ? candidate.experiences.map((entry) => {
    const item = asRecord(entry)
    return { company: String(item.company || '').trim(), title: String(item.title || '').trim(), period: String(item.period || '').trim(), responsibilities: list(item.responsibilities) }
  }).filter((item) => item.company || item.title).slice(0, 12) : []
  return {
    candidate: { name: String(candidate.name || '').trim(), headline: String(candidate.headline || '').trim(), yearsExperience: Math.max(0, Number(candidate.yearsExperience) || 0), skills: list(candidate.skills), experiences, projects, sourceText: resumeText.slice(0, 80_000) },
    job: { role: String(job.role || '').trim(), responsibilities: list(job.responsibilities), requiredSkills: list(job.requiredSkills), preferredExperience: list(job.preferredExperience), interviewSignals: list(job.interviewSignals), sourceText: jdText.slice(0, 30_000) },
    gaps: list(root.gaps),
  }
}

function fallbackStructuredProfile(resumeText = '', jdText = '', existing: Record<string, unknown> = {}): StructuredProfile {
  const lines = resumeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const projectHeading = lines.findIndex((line) => /项目|project/i.test(line))
  const projectLine = projectHeading >= 0 ? lines[projectHeading + 1] : ''
  const skillsLine = lines.find((line) => /技能|skill|技术栈/i.test(line)) || ''
  const skills = skillsLine.split(/[：:、,，|/]/).slice(1).flatMap((item) => item.split(/\s+/)).map((item) => item.trim()).filter((item) => item.length > 1).slice(0, 20)
  const role = jdText.split(/\r?\n/).map((line) => line.trim()).find((line) => /岗位|职位|工程师|developer|engineer/i.test(line)) || String(existing.role || '')
  return normalizeStructuredProfile({ candidate: { name: String(existing.name || lines[0] || ''), headline: String(existing.headline || ''), yearsExperience: Number(existing.yearsExperience) || 0, skills, projects: projectLine ? [{ name: projectLine, background: '', responsibilities: [], techStack: skills, challenges: [], solutions: [], results: [], risks: [] }] : [] }, job: { role, responsibilities: [], requiredSkills: [], preferredExperience: [], interviewSignals: [] }, gaps: ['建议补充项目背景、个人职责和量化结果'] }, resumeText, jdText)
}

/** 调用画像模型；上游不可用时返回基于原文的保守画像，避免阻塞面试流程。 */
export async function parseStructuredProfile(resumeText = '', jdText = '', existing: Record<string, unknown> = {}, config: ProfileParserConfig): Promise<StructuredProfile> {
  const fallback = fallbackStructuredProfile(resumeText, jdText, existing)
  if (!config.baseUrl || !config.model || !config.apiKey || (!resumeText.trim() && !jdText.trim())) return fallback
  try {
    const content = await completeChat({
      model: config.importModel,
      temperature: 0.1,
      max_tokens: 2400,
      messages: [
        { role: 'system', content: `你是简历和岗位画像解析器。只输出 JSON，不得输出代码围栏。严格遵守结构：${profileSchema}。只能提取文本中明确出现的事实；未知字段填空数组，不得编造项目、公司、技术或结果。项目必须保留原文项目名。` },
        { role: 'user', content: JSON.stringify({ resumeText: resumeText.slice(0, 80_000), jdText: jdText.slice(0, 30_000) }) },
      ],
    }, config)
    return normalizeStructuredProfile(extractJsonObject(content, '模型返回的资料画像不是有效 JSON。'), resumeText, jdText)
  } catch (error) {
    console.warn(`Structured profile fallback: ${errorMessage(error)}`)
    return fallback
  }
}
