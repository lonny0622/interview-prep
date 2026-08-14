import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { errorMessage } from '../http/errors.js'
import { createJobProfile, createResume, deleteJobProfile, deleteResume, getProfile, listJobProfiles, updateJobProfile, updateProfile, updateResume } from '../db/repositories/profile.repository.js'

const pathOf = (request: IncomingMessage) => request.url?.split('?')[0] || ''
const is = (request: IncomingMessage, method: string, path: string | RegExp) => request.method === method && (typeof path === 'string' ? pathOf(request) === path : path.test(pathOf(request)))
const idFrom = (request: IncomingMessage) => pathOf(request).split('/').pop() || ''

/** 个人资料、岗位和简历的 HTTP 适配层。业务规则留在 profile repository。 */
export async function handleProfileRoutes(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (is(request, 'GET', '/api/profile')) { jsonResponse(response, 200, { profile: getProfile() }); return true }
  if (is(request, 'PATCH', '/api/profile')) {
    try { jsonResponse(response, 200, { profile: updateProfile(await readJson(request, 500_000)) }); return true } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '个人资料保存失败。') }); return true }
  }
  if (is(request, 'GET', '/api/profile/jobs')) { jsonResponse(response, 200, { jobs: listJobProfiles() }); return true }
  if (is(request, 'POST', '/api/profile/jobs')) {
    try {
      const body = await readJson<{ title?: string }>(request)
      if (!String(body.title || '').trim()) { jsonResponse(response, 400, { error: '岗位名称不能为空。' }); return true }
      jsonResponse(response, 201, { job: createJobProfile(body.title) }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '岗位创建失败。') }); return true }
  }
  if (is(request, 'PATCH', /^\/api\/profile\/jobs\/[^/]+$/)) {
    try { const job = updateJobProfile(idFrom(request), await readJson(request)); jsonResponse(response, job ? 200 : 404, job ? { job } : { error: '岗位不存在。' }); return true } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '岗位更新失败。') }); return true }
  }
  if (is(request, 'DELETE', /^\/api\/profile\/jobs\/[^/]+$/)) { const deleted = deleteJobProfile(idFrom(request)); jsonResponse(response, deleted ? 204 : 404, deleted ? {} : { error: '岗位不存在。' }); return true }
  if (is(request, 'GET', /^\/api\/profile\/jobs\/[^/]+\/resumes$/)) {
    const job = listJobProfiles().find((item) => item.id === pathOf(request).split('/')[4])
    jsonResponse(response, job ? 200 : 404, job ? { resumes: job.resumes } : { error: '岗位不存在。' }); return true
  }
  if (is(request, 'POST', /^\/api\/profile\/jobs\/[^/]+\/resumes$/)) {
    try {
      const body = await readJson<{ text?: string }>(request, 1_500_000)
      if (!String(body.text || '').trim()) { jsonResponse(response, 400, { error: '简历文本不能为空。' }); return true }
      const resume = createResume(pathOf(request).split('/')[4], body)
      jsonResponse(response, resume ? 201 : 404, resume ? { resume } : { error: '岗位不存在。' }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '简历保存失败。') }); return true }
  }
  if (is(request, 'PATCH', /^\/api\/profile\/resumes\/[^/]+$/)) {
    try { const resume = updateResume(idFrom(request), await readJson(request)); jsonResponse(response, resume ? 200 : 404, resume ? { resume } : { error: '简历不存在。' }); return true } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '简历更新失败。') }); return true }
  }
  if (is(request, 'DELETE', /^\/api\/profile\/resumes\/[^/]+$/)) { const deleted = deleteResume(idFrom(request)); jsonResponse(response, deleted ? 204 : 404, deleted ? {} : { error: '简历不存在。' }); return true }
  return false
}
