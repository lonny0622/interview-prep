import type { ScoreQuestion, ScoreResult } from '../../domain/question.js'
import { completeChat } from './client.js'
import { extractJsonObject } from './json.js'

const scoreSchema = '{"score":0,"dimensions":{"correctness":0,"structure":0,"clarity":0,"relevance":0},"strengths":["优点"],"gaps":["缺口"],"betterAnswer":"更好的回答"}'

/** 使用统一 LLM 客户端评分，保证鉴权、超时和上游错误处理保持一致。 */
export async function scoreAnswer(question: ScoreQuestion, answer: string, model: string): Promise<ScoreResult> {
  const content = await completeChat({
    model,
    temperature: 0.1,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: `你是面试回答教练。只输出 JSON，不要代码围栏。结构：${scoreSchema}。所有分数为 0 到 100 的整数，评价要基于题目和回答，不要假装知道回答之外的事实。` },
      { role: 'user', content: `题目：${String(question.title || '')}\n参考答案：${String(question.answer || '')}\n用户回答：${answer}` },
    ],
  })
  return extractJsonObject<ScoreResult>(content, '评分结果不是有效 JSON。')
}

/** 无模型可用时按回答长度和参考答案关键词给出保守分数。 */
export function fallbackScore(question: ScoreQuestion, answer: string): ScoreResult {
  const normalized = answer.trim()
  const referenceAnswer = String(question.answer || '')
  const lengthScore = Math.min(40, Math.round(normalized.length / 5))
  const keywordScore = referenceAnswer.split(/[，。；、\s]+/).filter((word) => word.length > 1 && normalized.includes(word)).length * 10
  const score = Math.min(85, Math.max(10, lengthScore + Math.min(50, keywordScore)))
  return {
    score,
    dimensions: { correctness: score, structure: normalized.length > 40 ? 70 : 35, clarity: normalized.length > 20 ? 65 : 30, relevance: keywordScore ? 75 : 35 },
    strengths: normalized.length > 40 ? ['回答包含了一定展开'] : ['已经开始组织答案'],
    gaps: keywordScore ? ['可以补充边界条件和具体例子'] : ['回答过短，缺少关键概念'],
    betterAnswer: String(question.interviewAnswer || referenceAnswer),
    source: 'fallback',
  }
}
