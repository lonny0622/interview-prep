import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { createCategory, createQuestions, deleteCategory, editQuestion, listCategories, listQuestions, removeQuestion, updateCategory } from '../db/repositories/question.repository.js'

const pathOf = (request: IncomingMessage) => request.url?.split('?')[0] || ''
const is = (request: IncomingMessage, method: string, path: string | RegExp) => request.method === method && (typeof path === 'string' ? pathOf(request) === path : path.test(pathOf(request)))
const idFrom = (request: IncomingMessage) => pathOf(request).split('/').pop() || ''

/** 题库和分类的 HTTP 适配层。筛选、持久化和分类规则不再和 gateway 混在一起。 */
export async function handleQuestionRoutes(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (is(request, 'GET', /^\/api\/questions$/)) {
    const url = new URL(request.url || '', 'http://127.0.0.1')
    jsonResponse(response, 200, { questions: listQuestions({ q: url.searchParams.get('q') || '', category: url.searchParams.get('category') || '', difficulty: url.searchParams.get('difficulty') || '', mastery: url.searchParams.get('mastery') || '' }) })
    return true
  }
  if (is(request, 'GET', '/api/categories')) { jsonResponse(response, 200, { categories: listCategories() }); return true }
  if (is(request, 'POST', '/api/categories')) {
    try { jsonResponse(response, 201, { category: createCategory((await readJson<{ name?: string }>(request)).name) }); return true } catch (error) { jsonResponse(response, error.code === 'CATEGORY_EXISTS' ? 409 : 400, { error: error.message || '分类创建失败。' }); return true }
  }
  if (is(request, 'PATCH', /^\/api\/categories\/[^/]+$/)) {
    try { const category = updateCategory(idFrom(request), (await readJson<{ name?: string }>(request)).name); jsonResponse(response, category ? 200 : 404, category ? { category } : { error: '分类不存在。' }); return true } catch (error) { jsonResponse(response, error.code === 'CATEGORY_EXISTS' ? 409 : 400, { error: error.message || '分类更新失败。' }); return true }
  }
  if (is(request, 'DELETE', /^\/api\/categories\/[^/]+$/)) {
    try { const deleted = deleteCategory(idFrom(request)); jsonResponse(response, deleted ? 204 : 404, deleted ? {} : { error: '分类不存在。' }); return true } catch (error) { jsonResponse(response, error.code === 'CATEGORY_IN_USE' ? 409 : 400, { error: error.message || '分类删除失败。' }); return true }
  }
  if (is(request, 'POST', '/api/questions')) {
    try {
      const body = await readJson<{ questions?: unknown[] }>(request)
      if (!Array.isArray(body.questions) || !body.questions.length) { jsonResponse(response, 400, { error: 'questions 不能为空数组。' }); return true }
      jsonResponse(response, 201, { questions: createQuestions(body.questions) }); return true
    } catch (error) { jsonResponse(response, 400, { error: error.message || '题目保存失败。' }); return true }
  }
  if (is(request, 'PATCH', /^\/api\/questions\/[^/]+$/)) {
    try { const updated = editQuestion(idFrom(request), await readJson(request)); jsonResponse(response, updated ? 200 : 404, updated ? { question: updated } : { error: '题目不存在。' }); return true } catch (error) { jsonResponse(response, 400, { error: error.message || '题目更新失败。' }); return true }
  }
  if (is(request, 'DELETE', /^\/api\/questions\/[^/]+$/)) { const deleted = removeQuestion(idFrom(request)); jsonResponse(response, deleted ? 204 : 404, deleted ? {} : { error: '题目不存在。' }); return true }
  return false
}
