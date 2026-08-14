import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { errorMessage } from '../http/errors.js'
import { lastPathSegment, matchesRoute, pathSegment } from '../http/routing.js'
import { createJobProfile, createResume, deleteJobProfile, deleteResume, getProfile, listJobProfiles, updateJobProfile, updateProfile, updateResume } from '../db/repositories/profile.repository.js'
import type { CreateResumeInput, JobProfilePatch, ResumePatch, StructuredProfile, UserProfilePatch } from '../domain/profile.js'

type ProfileServices = {
  parseStructuredProfile: (resumeText: string, jdText: string, existing: Record<string, unknown>) => Promise<StructuredProfile>
}

type ProfileRouteConfig = {
  llmConfigured: boolean
}

/** 个人资料、岗位和简历的 HTTP 适配层。业务规则留在 profile repository。 */
export async function handleProfileRoutes(request: IncomingMessage, response: ServerResponse, services: ProfileServices, config: ProfileRouteConfig): Promise<boolean> {
  if (matchesRoute(request, 'GET', '/api/profile')) { jsonResponse(response, 200, { profile: getProfile() }); return true }
  if (matchesRoute(request, 'PATCH', '/api/profile')) {
    try { jsonResponse(response, 200, { profile: updateProfile(await readJson<UserProfilePatch>(request, 500_000)) }); return true } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '个人资料保存失败。') }); return true }
  }
  if (matchesRoute(request, 'POST', '/api/profile/parse')) {
    try {
      const body = await readJson<{ resumeText?: string; jdText?: string; existing?: Record<string, unknown> }>(request, 1_500_000)
      const resumeText = String(body.resumeText || '')
      const jdText = String(body.jdText || '')
      if (!resumeText.trim() && !jdText.trim()) { jsonResponse(response, 400, { error: 'resumeText 或 jdText 至少填写一项。' }); return true }
      const profile = await services.parseStructuredProfile(resumeText, jdText, body.existing || {})
      jsonResponse(response, 200, { profile, fallback: !config.llmConfigured }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '资料解析失败。') }); return true }
  }
  if (matchesRoute(request, 'GET', '/api/profile/jobs')) { jsonResponse(response, 200, { jobs: listJobProfiles() }); return true }
  if (matchesRoute(request, 'POST', '/api/profile/jobs')) {
    try {
      const body = await readJson<{ title?: string }>(request)
      if (!String(body.title || '').trim()) { jsonResponse(response, 400, { error: '岗位名称不能为空。' }); return true }
      jsonResponse(response, 201, { job: createJobProfile(body.title) }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '岗位创建失败。') }); return true }
  }
  if (matchesRoute(request, 'PATCH', /^\/api\/profile\/jobs\/[^/]+$/)) {
    try { const job = updateJobProfile(lastPathSegment(request), await readJson<JobProfilePatch>(request)); jsonResponse(response, job ? 200 : 404, job ? { job } : { error: '岗位不存在。' }); return true } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '岗位更新失败。') }); return true }
  }
  if (matchesRoute(request, 'DELETE', /^\/api\/profile\/jobs\/[^/]+$/)) { const deleted = deleteJobProfile(lastPathSegment(request)); jsonResponse(response, deleted ? 204 : 404, deleted ? {} : { error: '岗位不存在。' }); return true }
  if (matchesRoute(request, 'GET', /^\/api\/profile\/jobs\/[^/]+\/resumes$/)) {
    const job = listJobProfiles().find((item) => item.id === pathSegment(request, 4))
    jsonResponse(response, job ? 200 : 404, job ? { resumes: job.resumes } : { error: '岗位不存在。' }); return true
  }
  if (matchesRoute(request, 'POST', /^\/api\/profile\/jobs\/[^/]+\/resumes$/)) {
    try {
      const body = await readJson<Partial<CreateResumeInput>>(request, 1_500_000)
      if (!String(body.text || '').trim()) { jsonResponse(response, 400, { error: '简历文本不能为空。' }); return true }
      const resume = createResume(pathSegment(request, 4), { fileName: String(body.fileName || ''), text: String(body.text), candidateProfile: body.candidateProfile, parsedAt: body.parsedAt })
      jsonResponse(response, resume ? 201 : 404, resume ? { resume } : { error: '岗位不存在。' }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '简历保存失败。') }); return true }
  }
  if (matchesRoute(request, 'PATCH', /^\/api\/profile\/resumes\/[^/]+$/)) {
    try { const resume = updateResume(lastPathSegment(request), await readJson<ResumePatch>(request)); jsonResponse(response, resume ? 200 : 404, resume ? { resume } : { error: '简历不存在。' }); return true } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '简历更新失败。') }); return true }
  }
  if (matchesRoute(request, 'DELETE', /^\/api\/profile\/resumes\/[^/]+$/)) { const deleted = deleteResume(lastPathSegment(request)); jsonResponse(response, deleted ? 204 : 404, deleted ? {} : { error: '简历不存在。' }); return true }
  return false
}
