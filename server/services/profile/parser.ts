import { errorMessage } from '../../http/errors.js'
import { extractJsonObject } from '../llm/json.js'

export type ProfileParserConfig = {
  baseUrl: string
  model: string
  importModel: string
  apiKey: string
}

const profileSchema = '{"candidate":{"name":"","headline":"","yearsExperience":0,"skills":[""],"experiences":[{"company":"","title":"","period":"","responsibilities":[""]}],"projects":[{"name":"","background":"","responsibilities":[""],"techStack":[""],"challenges":[""],"solutions":[""],"results":[""],"risks":[""]}]},"job":{"role":"","responsibilities":[""],"requiredSkills":[""],"preferredExperience":[""],"interviewSignals":[""]},"gaps":[""]}'

function normalizeStructuredProfile(value: any, resumeText = '', jdText = '') {
  const candidate = value?.candidate || {}
  const job = value?.job || {}
  const list = (items: any) => Array.isArray(items) ? items.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 20) : []
  const projects = Array.isArray(candidate.projects) ? candidate.projects.map((item: any) => ({
    name: String(item?.name || '').trim(), background: String(item?.background || '').trim(), responsibilities: list(item?.responsibilities), techStack: list(item?.techStack), challenges: list(item?.challenges), solutions: list(item?.solutions), results: list(item?.results), risks: list(item?.risks),
  })).filter((item: any) => item.name).slice(0, 12) : []
  const experiences = Array.isArray(candidate.experiences) ? candidate.experiences.map((item: any) => ({ company: String(item?.company || '').trim(), title: String(item?.title || '').trim(), period: String(item?.period || '').trim(), responsibilities: list(item?.responsibilities) })).filter((item: any) => item.company || item.title).slice(0, 12) : []
  return {
    candidate: { name: String(candidate.name || '').trim(), headline: String(candidate.headline || '').trim(), yearsExperience: Math.max(0, Number(candidate.yearsExperience) || 0), skills: list(candidate.skills), experiences, projects, sourceText: resumeText.slice(0, 80_000) },
    job: { role: String(job.role || '').trim(), responsibilities: list(job.responsibilities), requiredSkills: list(job.requiredSkills), preferredExperience: list(job.preferredExperience), interviewSignals: list(job.interviewSignals), sourceText: jdText.slice(0, 30_000) },
    gaps: list(value?.gaps),
  }
}

function fallbackStructuredProfile(resumeText = '', jdText = '', existing: Record<string, any> = {}) {
  const lines = resumeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const projectHeading = lines.findIndex((line) => /项目|project/i.test(line))
  const projectLine = projectHeading >= 0 ? lines[projectHeading + 1] : ''
  const skillsLine = lines.find((line) => /技能|skill|技术栈/i.test(line)) || ''
  const skills = skillsLine.split(/[：:、,，|/]/).slice(1).flatMap((item) => item.split(/\s+/)).map((item) => item.trim()).filter((item) => item.length > 1).slice(0, 20)
  const role = jdText.split(/\r?\n/).map((line) => line.trim()).find((line) => /岗位|职位|工程师|developer|engineer/i.test(line)) || existing.role || ''
  return normalizeStructuredProfile({ candidate: { name: existing.name || lines[0] || '', headline: existing.headline || '', yearsExperience: existing.yearsExperience || 0, skills, projects: projectLine ? [{ name: projectLine, background: '', responsibilities: [], techStack: skills, challenges: [], solutions: [], results: [], risks: [] }] : [] }, job: { role, responsibilities: [], requiredSkills: [], preferredExperience: [], interviewSignals: [] }, gaps: ['建议补充项目背景、个人职责和量化结果'] }, resumeText, jdText)
}

/** 调用画像模型；上游不可用时返回基于原文的保守画像，避免阻塞面试流程。 */
export async function parseStructuredProfile(resumeText = '', jdText = '', existing: Record<string, any> = {}, config: ProfileParserConfig): Promise<any> {
  const fallback = fallbackStructuredProfile(resumeText, jdText, existing)
  if (!config.baseUrl || !config.model || !config.apiKey || (!resumeText.trim() && !jdText.trim())) return fallback
  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.importModel, temperature: 0.1, max_tokens: 2400, messages: [
        { role: 'system', content: `你是简历和岗位画像解析器。只输出 JSON，不得输出代码围栏。严格遵守结构：${profileSchema}。只能提取文本中明确出现的事实；未知字段填空数组，不得编造项目、公司、技术或结果。项目必须保留原文项目名。` },
        { role: 'user', content: JSON.stringify({ resumeText: resumeText.slice(0, 80_000), jdText: jdText.slice(0, 30_000) }) },
      ] }),
    })
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; choices?: Array<{ message?: { content?: unknown } }> }
    if (!response.ok) throw new Error(payload.error?.message || `资料解析失败（${response.status}）。`)
    const content = payload.choices?.[0]?.message?.content
    return normalizeStructuredProfile(extractJsonObject(typeof content === 'string' ? content : '', '模型返回的资料画像不是有效 JSON。'), resumeText, jdText)
  } catch (error) {
    console.warn(`Structured profile fallback: ${errorMessage(error)}`)
    return fallback
  }
}
