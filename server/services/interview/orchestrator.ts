import { errorMessage } from '../../http/errors.js'
import { completeChat } from '../llm/client.js'
import { extractJsonArray, extractJsonObject } from '../llm/json.js'

export type InterviewOrchestratorConfig = {
  baseUrl: string
  model: string
  importModel: string
  apiKey: string
  requestTimeoutMs: number
}

const interviewBlueprintSchema = '[{"stage":"self_introduction|project_experience|knowledge|scenario|follow_up|candidate_questions","kind":"自我介绍|简历项目题|八股题|场景题|发散追问|反问环节","question":"问题","focus":"考察点","referenceAnswer":"参考回答或评分要点","followUps":["追问"]}]'
const nextActionSchema = '{"action":"follow_up|advance_stage|finish","reason":"判断依据","question":"追问问题，可为空","kind":"发散追问|进入下一阶段|结束","focus":"考察点","referenceAnswer":"评分要点"}'

function normalizeBlueprint(value: any) {
  if (!Array.isArray(value)) throw new Error('模型返回的问题蓝图不是数组。')
  const allowed = ['self_introduction', 'project_experience', 'knowledge', 'scenario', 'follow_up', 'candidate_questions']
  return value.map((item: any) => ({
    stage: allowed.includes(item.stage) ? item.stage : 'knowledge',
    kind: String(item.kind || '八股题').trim(),
    question: String(item.question || item.title || '').trim(),
    focus: String(item.focus || '').trim(),
    referenceAnswer: String(item.referenceAnswer || item.reference_answer || item.expectedPoints || '').trim(),
    followUps: Array.isArray(item.followUps) ? item.followUps.map(String).filter(Boolean).slice(0, 3) : [],
  })).filter((item) => item.question).slice(0, 18)
}

function fallbackBlueprint(profile: any) {
  const project = profile.projects?.[0]?.name || profile.candidateProfile?.candidate?.projects?.[0]?.name || '你简历中的核心项目'
  return [
    { stage: 'self_introduction', kind: '自我介绍', question: '请做一个 1-2 分钟的自我介绍，重点讲和这个岗位最相关的经历。', focus: '表达结构、岗位匹配度', referenceAnswer: '应包含个人定位、最相关经历、核心能力和与岗位的匹配关系。', followUps: ['为什么考虑这个岗位？'] },
    { stage: 'project_experience', kind: '简历项目题', question: `请介绍一下你在「${project}」项目中的职责、技术选型和最终结果。`, focus: '项目真实性、个人贡献、结果', referenceAnswer: '应说明项目背景、个人职责、关键技术取舍、遇到的难点和可量化结果。', followUps: ['当时最大的技术取舍是什么？'] },
    { stage: 'knowledge', kind: '八股题', question: '在前端应用中，你会如何定位一次明显的性能下降？', focus: '分析方法、指标和验证', referenceAnswer: '应先区分加载、运行时和交互问题，建立指标基线，再使用 Performance、Network 或 Profiler 验证假设。', followUps: ['如果优化没有收益，你会怎么排查？'] },
    { stage: 'scenario', kind: '场景题', question: '如果线上出现偶发的接口变慢和页面卡顿，你会如何组织定位和止损？', focus: '优先级、协作和落地', referenceAnswer: '应先确认影响范围并止损，再通过监控、链路和前后端指标定位，最后补充复盘和监控。', followUps: ['如何判断先处理前端还是后端？'] },
    { stage: 'follow_up', kind: '发散追问', question: '如果重新做一个类似项目，你会保留和改变哪些设计？', focus: '复盘能力、边界意识', referenceAnswer: '应结合真实项目说明保留的设计、改动依据和预期收益，不能只给抽象观点。', followUps: [] },
    { stage: 'candidate_questions', kind: '反问环节', question: '面试接近尾声，你想向面试官了解哪些信息？', focus: '问题质量、岗位理解', referenceAnswer: '应围绕岗位目标、团队协作、技术挑战和成功标准提出具体问题。', followUps: [] },
  ]
}

/** 根据画像生成面试蓝图；模型异常时返回覆盖完整流程的固定蓝图。 */
export async function generateInterviewBlueprint(profile: any, config: InterviewOrchestratorConfig): Promise<any[]> {
  if (!config.baseUrl || !config.model || !config.apiKey) return fallbackBlueprint(profile)
  const source = JSON.stringify(profile).slice(0, 30_000)
  try {
    const content = await completeChat({
      model: config.importModel,
      temperature: 0.3,
      max_tokens: 2200,
      messages: [
        { role: 'system', content: `你是资深面试官，依据候选人资料和 JD 生成一份可执行的模拟面试问题蓝图。必须覆盖自我介绍、简历项目题、八股题、场景题、发散追问、反问环节；项目题必须引用候选人资料中真实出现的项目，不能编造经历。只输出 JSON 数组，结构：${interviewBlueprintSchema}` },
        { role: 'user', content: source },
      ],
    }, config)
    return normalizeBlueprint(extractJsonArray(content, '模型返回的问题蓝图不是有效 JSON。'))
  } catch (error) {
    console.warn(`Interview blueprint fallback: ${errorMessage(error)}`)
    return fallbackBlueprint(profile)
  }
}

/** 依据已保存的回答生成复盘报告，并在模型不可用时提供可操作建议。 */
export async function generateInterviewReport(session: any, turns: any[], config: InterviewOrchestratorConfig): Promise<any> {
  const fallback = { summary: '本次模拟面试已完成。建议结合每轮回答继续补充具体数据、个人贡献和复盘动作。', strengths: ['完成了完整面试流程'], risks: ['部分回答还可以增加背景、行动和结果'], suggestions: ['重新回答项目题并补充量化结果', '针对场景题练习先判断影响范围再制定方案'], nextQuestions: session.blueprint.slice(0, 3).map((item: any) => item.question) }
  if (!config.baseUrl || !config.model || !config.apiKey) return fallback
  try {
    const content = await completeChat({
      model: config.model,
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: '你是面试复盘教练。只输出 JSON 对象，字段为 summary、strengths（字符串数组）、risks（字符串数组）、suggestions（字符串数组）、nextQuestions（字符串数组）。评价必须基于实际回答，不要编造经历。' },
        { role: 'user', content: JSON.stringify({ profile: session.profile, turns }).slice(0, 40_000) },
      ],
    }, config)
    return { ...fallback, ...extractJsonObject(content, '模型返回的复盘结果不是有效 JSON。') }
  } catch (error) {
    console.warn(`Interview report fallback: ${errorMessage(error)}`)
    return fallback
  }
}

function fallbackNextAction(session: any, answer: string) {
  const current = session.blueprint[session.currentIndex]
  const normalized = answer.trim()
  const hasWeakSignal = normalized.length < 45 || !/[0-9%]|结果|指标|影响|负责/.test(normalized)
  const followUp = current?.followUps?.[0]
  if (followUp && hasWeakSignal && session.currentIndex < session.blueprint.length - 1) return { action: 'follow_up', reason: '回答较短或缺少具体结果，需要继续核实。', question: followUp, kind: '发散追问', focus: current.focus, referenceAnswer: current.referenceAnswer }
  if (session.currentIndex >= session.blueprint.length - 1) return { action: 'finish', reason: '已覆盖面试蓝图中的全部环节。', question: '', kind: '结束', focus: '', referenceAnswer: '' }
  return { action: 'advance_stage', reason: '当前环节已完成，进入下一阶段。', question: '', kind: '进入下一阶段', focus: '', referenceAnswer: '' }
}

/** 根据回答决定追问、进入下一阶段或结束，并校验模型动作的有限集合。 */
export async function decideNextAction(session: any, answer: string, config: InterviewOrchestratorConfig): Promise<any> {
  const fallback = fallbackNextAction(session, answer)
  if (!config.baseUrl || !config.model || !config.apiKey) return fallback
  try {
    const current = session.blueprint[session.currentIndex]
    const content = await completeChat({
      model: config.model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: `你是模拟面试编排 Agent。只能输出 JSON，不要代码围栏。${nextActionSchema}。只允许 follow_up、advance_stage、finish。当前阶段未完成时不能 finish；最多只生成一个追问；追问必须基于当前回答，不得编造候选人经历。` },
        { role: 'user', content: JSON.stringify({ current, answer, currentIndex: session.currentIndex, total: session.blueprint.length }) },
      ],
    }, config)
    const value = extractJsonObject<any>(content, '模型返回的下一步动作不是有效 JSON。')
    if (!['follow_up', 'advance_stage', 'finish'].includes(value.action)) throw new Error('Agent action 不合法。')
    if (value.action === 'follow_up' && !String(value.question || '').trim()) throw new Error('Agent 追问为空。')
    if (value.action !== 'follow_up' && session.currentIndex >= session.blueprint.length - 1) value.action = 'finish'
    return { ...fallback, ...value, question: String(value.question || '').trim(), referenceAnswer: String(value.referenceAnswer || '').trim() }
  } catch (error) {
    console.warn(`Interview next action fallback: ${errorMessage(error)}`)
    return fallback
  }
}
