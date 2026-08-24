import type { ExplainSelectionInput } from '../../domain/explanation.js'
import { streamChat, type ChatClientConfig } from './client.js'

const SYSTEM_PROMPT = `你是一个面试学习助手。用户正在查看题库中的一道题，并选中了其中一段文字。
请只基于题目内容、选中文字和对话历史回答，不要编造题目之外的事实。
回答使用中文 Markdown，先直接解释用户选中的概念，再结合当前题目说明它为什么重要；必要时给出简短例子、边界和容易混淆的点。
当内容包含三步以上的流程、多个模块之间的调用关系、状态流转或架构层次，并且图比纯文字更清楚时，补充一个简洁的 Mermaid 图。图表必须放在语言标记为 mermaid 的 Markdown 代码块中，节点文字保持简短；没有必要时不要为了装饰强行画图。
如果用户的问题与选中文字无关，也要明确指出关联性，并把回答拉回当前题目上下文。
不要重复整道题的答案，不要输出 JSON，不要使用代码围栏包裹整篇回答。`

export async function* explainSelectionStream(input: ExplainSelectionInput, config: ChatClientConfig, signal?: AbortSignal): AsyncGenerator<string> {
  const history = input.history.slice(-10).map((message) => ({ role: message.role, content: message.content }))
  const context = JSON.stringify({
    question: input.question,
    selectedText: input.selectedText.slice(0, 4_000),
    currentQuestion: input.prompt.slice(0, 2_000),
    history,
  })

  yield* streamChat({
    model: config.model,
    temperature: 0.2,
    max_tokens: 1_800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
    ],
  }, config, signal)
}
