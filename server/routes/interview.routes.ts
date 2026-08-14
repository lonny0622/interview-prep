import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { errorMessage } from '../http/errors.js'
import { matchesRoute, pathSegment } from '../http/routing.js'
import type { ScoreQuestion, ScoreResult } from '../domain/question.js'
import type { StructuredProfile } from '../domain/profile.js'
import { createInterviewSession, completeInterviewSession, getInterviewSession, insertInterviewFollowUp, listInterviewSessions, listInterviewTurns, saveInterviewTurn } from '../db/repositories/interview.repository.js'
import { listJobProfiles } from '../db/repositories/profile.repository.js'

type InterviewServices = {
  parseStructuredProfile: (resumeText: string, jdText: string, existing: Record<string, unknown>) => Promise<StructuredProfile>
  generateInterviewBlueprint: (profile: any) => Promise<any[]>
  scoreAnswer: (question: ScoreQuestion, answer: string) => Promise<ScoreResult>
  decideNextAction: (session: any, answer: string) => Promise<any>
  generateInterviewReport: (session: any, turns: any[]) => Promise<any>
}

const sessionId = (request: IncomingMessage) => pathSegment(request, 3)

/** 模拟面试生命周期路由；模型编排通过 services 注入，避免 HTTP 层依赖 gateway 内部实现。 */
export async function handleInterviewRoutes(request: IncomingMessage, response: ServerResponse, services: InterviewServices): Promise<boolean> {
  if (matchesRoute(request, 'POST', '/api/interview-sessions')) {
    try {
      const body = await readJson<{ profile?: any }>(request, 2_000_000)
      if (!body.profile || typeof body.profile !== 'object') { jsonResponse(response, 400, { error: 'profile 必须是对象。' }); return true }
      const rawProfile = body.profile
      if (rawProfile.jobProfileId || rawProfile.resumeId) {
        const job = listJobProfiles().find((item) => item.id === rawProfile.jobProfileId)
        const resume = job?.resumes.find((item) => item.id === rawProfile.resumeId)
        if (!job) { jsonResponse(response, 400, { error: '选择的岗位不存在。' }); return true }
        if (!resume) { jsonResponse(response, 400, { error: '选择的简历不属于该岗位。' }); return true }
        rawProfile.role = job.title
        rawProfile.resume = resume.text
        rawProfile.resumeFileName = resume.fileName
        rawProfile.candidateProfile = resume.candidateProfile
      }
      const structured = rawProfile.candidateProfile || await services.parseStructuredProfile(String(rawProfile.resume || ''), String(rawProfile.jd || ''), rawProfile)
      const profile = { ...rawProfile, candidateProfile: structured }
      const blueprint = await services.generateInterviewBlueprint(profile)
      if (!blueprint.length) { jsonResponse(response, 502, { error: '没有生成有效的面试问题。' }); return true }
      jsonResponse(response, 201, { session: createInterviewSession(profile, blueprint) }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '模拟面试创建失败。') }); return true }
  }
  if (matchesRoute(request, 'GET', '/api/interview-sessions')) { jsonResponse(response, 200, { sessions: listInterviewSessions() }); return true }
  if (matchesRoute(request, 'GET', /^\/api\/interview-sessions\/[^/]+$/)) {
    const id = sessionId(request)
    const session = getInterviewSession(id)
    if (!session) { jsonResponse(response, 404, { error: '模拟面试不存在。' }); return true }
    jsonResponse(response, 200, { session, turns: listInterviewTurns(id) }); return true
  }
  if (matchesRoute(request, 'POST', /^\/api\/interview-sessions\/[^/]+\/turns$/)) {
    try {
      const id = sessionId(request)
      const body = await readJson<any>(request, 2_000_000)
      if (!body.question || typeof body.answerText !== 'string' || !body.answerText.trim()) { jsonResponse(response, 400, { error: 'question 和 answerText 必填。' }); return true }
      let score = null
      try { score = await services.scoreAnswer({ title: body.question, answer: body.referenceAnswer || '', interviewAnswer: body.referenceAnswer || '' }, body.answerText) } catch { score = null }
      jsonResponse(response, 201, { turn: saveInterviewTurn(id, { stage: body.stage || 'knowledge', question: body.question, answerText: body.answerText }, score) }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '面试回答保存失败。') }); return true }
  }
  if (matchesRoute(request, 'POST', /^\/api\/interview-sessions\/[^/]+\/next-action$/)) {
    try {
      const id = sessionId(request)
      const session = getInterviewSession(id)
      if (!session) { jsonResponse(response, 404, { error: '模拟面试不存在。' }); return true }
      const body = await readJson<{ answerText?: string }>(request, 2_000_000)
      if (typeof body.answerText !== 'string' || !body.answerText.trim()) { jsonResponse(response, 400, { error: 'answerText 必填。' }); return true }
      const action = await services.decideNextAction(session, body.answerText)
      const nextSession = action.action === 'follow_up'
        ? insertInterviewFollowUp(id, { stage: session.stage, kind: action.kind || '发散追问', question: action.question, focus: action.focus || session.blueprint[session.currentIndex]?.focus || '', referenceAnswer: action.referenceAnswer || '', followUps: [] }) || session
        : session
      jsonResponse(response, 200, { action, session: nextSession }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '下一步面试动作生成失败。') }); return true }
  }
  if (matchesRoute(request, 'POST', /^\/api\/interview-sessions\/[^/]+\/complete$/)) {
    try {
      const id = sessionId(request)
      const session = getInterviewSession(id)
      if (!session) { jsonResponse(response, 404, { error: '模拟面试不存在。' }); return true }
      const report = await services.generateInterviewReport(session, listInterviewTurns(id))
      jsonResponse(response, 200, { session: completeInterviewSession(id, report), report }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '面试复盘失败。') }); return true }
  }
  return false
}
