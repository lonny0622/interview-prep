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

复制 `.env.example` 为 `.env.local`，填入兼容 OpenAI Chat Completions 的服务地址和模型名。API key 使用不带 `VITE_` 前缀的 `LLM_API_KEY`，只由服务端 Gateway 读取，不会进入浏览器构建产物。

批量导入可以单独配置低延迟模型：`LLM_IMPORT_MODEL=gpt-5.4-mini`。默认模型继续用于后续评分和面试复盘，导入任务不必占用高推理模型。

## 开发

```bash
pnpm install
pnpm dev
pnpm gateway
```

提交前运行完整校验：

```bash
pnpm build
pnpm lint
pnpm test
```

`pnpm build` 会同时编译前端和服务端；`pnpm test` 会先构建 Gateway，再执行 repository、LLM、媒体、画像、面试编排和 HTTP helper 的 smoke/unit tests。

## 服务端结构

```text
server/
├── config/          # 环境变量和运行配置
├── db/
│   ├── connection.ts
│   ├── schema.ts
│   └── repositories/ # SQLite 查询与持久化规则
├── http/            # body、response、error、route matching 等通用 HTTP 能力
├── routes/          # 参数校验和 HTTP 响应适配
├── services/        # LLM、画像、面试编排、文档和语音能力
├── tests/           # 编译后运行的 Node tests
├── db.ts            # repository facade 与开发期 seed
└── gateway.ts       # composition root，仅组装配置、service 和 route
```

新增接口时，把业务规则放在 `services` 或 `repositories`，`routes` 只处理 HTTP 输入输出；`gateway.ts` 不承载 prompt、SQL 或具体业务流程。服务端启用 TypeScript `strict`，不要用关闭类型检查的方式绕过错误。

## 后续计划

1. 给 repository 和路由 DTO 补齐领域类型，继续减少显式 `any`
2. 增加路由级集成测试和失败场景覆盖
3. 自选学习、错题重练和掌握度驱动复习
4. 流式 STT/TTS、语音打断和实时语音面试

产品设计文档位于 SecondBrain 的 `JobHunting/03-面试准备/06-模拟面试/面试准备应用技术方案.md`。
