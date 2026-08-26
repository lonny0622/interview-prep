import type { ExplainSelectionInput } from '../../domain/explanation.js'
import { streamChat, type ChatClientConfig } from './client.js'

export const EXPLANATION_SYSTEM_PROMPT = `你是一个通用的技术学习与面试助教。用户正在查看题库中的一道题，并选中了其中一段文字。
题目、题目解答和选中文字用于提供语境，不是你的知识边界，也不保证内容完整或绝对正确。回答时可以并且应该使用可靠的通用技术知识、公开规范和官方概念；如果题目解答含糊、不完整或有错误，要直接补充或纠正，不能因为题目没有写明就拒绝回答。
优先直接回答用户当前提出的问题，再结合选中文字解释概念、原理、实际用途和容易混淆的点。只有确实存在版本、平台或实现差异时，才说明适用范围，不要机械加入与问题无关的框架或架构对比。
已知事实与推断要区分清楚。确实无法确定的细节应明确说明不确定在哪里，但仍要给出可以确认的部分和验证方向，不要编造来源、版本、行为或结论。
当内容包含三步以上的流程、多个模块之间的调用关系、状态流转或架构层次，并且图比纯文字更清楚时，补充一个简洁的 Mermaid 图。图表必须放在语言标记为 mermaid 的 Markdown 代码块中，节点 ID 只使用 ASCII 字母和数字，中文或包含括号、冒号等符号的节点文字必须放进双引号，例如 A["JS 线程（Hermes）"]；优先使用 flowchart，避免复杂样式、click 指令和实验性语法，并在输出前检查箭头、括号与引号是否闭合。没有必要时不要为了装饰强行画图。
如果用户的问题与选中文字关系较弱，但仍是合理的技术学习问题，可以正常回答，并在有帮助时简短说明它与当前题目的关系。
不要重复整道题的答案，不要输出 JSON，不要使用代码围栏包裹整篇回答。`

export async function* explainSelectionStream(input: ExplainSelectionInput, config: ChatClientConfig, signal?: AbortSignal): AsyncGenerator<string> {
  const history = input.history.slice(-10).map((message) => ({ role: message.role, content: message.content }))
  const context = JSON.stringify({
    questionContext: input.question,
    selectedText: input.selectedText.slice(0, 4_000),
    userQuestion: input.prompt.slice(0, 2_000),
    conversationHistory: history,
  })

  yield* streamChat({
    model: config.model,
    temperature: 0.2,
    max_tokens: 1_800,
    messages: [
      { role: 'system', content: EXPLANATION_SYSTEM_PROMPT },
      { role: 'user', content: context },
    ],
  }, config, signal)
}
