# InterviewPrep

为个人求职准备使用的面试题库与模拟面试应用。项目独立于 SecondBrain 主仓库维护，当前以单用户、本地优先的 Web 版本为主。

## 当前进度

- 题库工作台：搜索、分类/难度/掌握度筛选、题目详情
- 手动新建和编辑题目
- 答案、解析和面试建议支持 Markdown
- 掌握程度记录和 SQLite 持久化
- LLM 批量导入、回答评分和模拟面试复盘
- 浏览器录音、STT 转写、DOCX/PDF 简历文本提取
- 移动端底部导航与响应式布局

题库、学习 session、刷题 session 和模拟面试会话保存在本地 SQLite；浏览器 `localStorage` 仅作为服务不可用时的题库降级缓存。LLM、STT 调用均通过服务端 Gateway，不在浏览器暴露密钥。

## LLM 配置占位

暂时不需要把 API key 发给我。复制 `.env.example` 为 `.env.local`，填入兼容 OpenAI Chat Completions 的服务地址和模型名；API key 使用不带 `VITE_` 前缀的 `LLM_API_KEY`，仅供未来服务端 `LLM Gateway` 使用。当前前端只展示 endpoint 配置状态，不会在浏览器直接调用模型。

批量导入可以单独配置低延迟模型：`LLM_IMPORT_MODEL=gpt-5.4-mini`。默认模型继续用于后续评分和面试复盘，导入任务不必占用高推理模型。

## 开发

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## 后续计划

1. 受约束的动态 Agent 追问和会话状态机
2. 简历/JD 结构化解析与项目问题池
3. 自选学习、错题重练和掌握度驱动复习
4. 流式 STT/TTS、语音打断和实时语音面试

产品设计文档位于 SecondBrain 的 `JobHunting/03-面试准备/06-模拟面试/面试准备应用技术方案.md`。
