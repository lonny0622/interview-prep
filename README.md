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

题库、学习 session、刷题 session 和模拟面试会话保存在本地 SQLite；浏览器 `localStorage` 仅作为服务不可用时的只读题库缓存，所有修改都在 SQLite 写入成功后才更新界面。LLM、STT 调用均通过服务端 Gateway，不在浏览器暴露密钥。

## LLM 配置占位

复制 `.env.example` 为 `.env.local`，填入兼容 OpenAI Chat Completions 的服务地址和模型名。API key 使用不带 `VITE_` 前缀的 `LLM_API_KEY`，只由服务端 Gateway 读取，不会进入浏览器构建产物。

批量导入可以单独配置低延迟模型：`LLM_IMPORT_MODEL=gpt-5.4-mini`。默认模型继续用于后续评分和面试复盘，导入任务不必占用高推理模型。

题目答案生成会按最多 3 道一批顺序调用模型，并通过 NDJSON 将已完成批次即时返回浏览器。批次超时会自动降级为逐题生成，流连接中断时只续传剩余题目；输入、进度和已生成草稿会保存在浏览器本地，页面刷新后也可从断点继续。整个导入任务不设置固定总超时，每次上游模型调用仍受 `LLM_REQUEST_TIMEOUT_MS` 约束。

已入库题目支持从题目详情单题重新生成，也支持在分类管理中按分类批量重新生成。新内容会先进入审核预览，确认后以事务方式覆盖生成字段，不改变题目分类、难度和掌握度。

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

本地开发默认关闭登录校验。需要本地验证完整登录流程时，在 `.env.local` 中设置 `AUTH_ENABLED=true`，并补齐下文列出的认证变量。

## 登录与安全

生产环境只接受环境变量中配置的唯一账户，不提供注册、找回密码或创建第二个用户的入口。密码以 scrypt 哈希形式保存，登录后使用带 `HttpOnly`、`Secure`、`SameSite=Strict` 属性的签名 Cookie；修改密码哈希或 `SESSION_SECRET` 会让已有会话立即失效。同一时间只保留一个活跃会话，新设备登录会自动撤销旧设备。

生成密码哈希（密码至少 16 位，建议使用密码管理器生成随机密码）：

```bash
pnpm auth:hash
```

生成独立的会话密钥：

```bash
openssl rand -base64 48
```

登录接口默认每个来源 IP 在 15 分钟内最多执行 5 次密码校验，并有账户级总量限制；超限后锁定 15 分钟。计数保存在 SQLite，容器重启不会清空。同一时间最多执行两个 scrypt 校验，避免密码请求突发耗尽内存。服务同时启用了同源请求校验、严格 CSP、安全响应头和无通配 CORS。生产环境不要将容器端口直接暴露到公网，只允许 Coolify 反向代理访问。应用在 `TRUST_PROXY=true` 时使用 `X-Forwarded-For` 中最靠近代理的有效 IP，避免客户端预置地址绕过 IP 限流；如果前面还有 Cloudflare 等多层代理，请优先由 Cloudflare Access 做入口控制，不要同时依赖应用层固定 IP allowlist。

如果有固定出口 IP，可配置精确 IP allowlist：

```dotenv
AUTH_ALLOWED_IPS=203.0.113.10,2001:db8::10
```

动态网络建议在域名前增加 Cloudflare Access 或其他支持 MFA/Passkey 的身份代理。应用仍保留自身登录作为第二层防护。

## 数据库备份

项目使用版本化 SQLite migration，启动时会在 repository 加载前完成升级。生成在线一致性快照并执行 `PRAGMA integrity_check`：

```bash
pnpm backup
```

备份默认写入 `data/backups`，保留最近 7 份；容器中写入 `/app/data/backups`。可以通过 `INTERVIEWPREP_BACKUP_DIR` 和 `INTERVIEWPREP_BACKUP_RETENTION` 调整。Coolify 还应为 `/app/data` 配置每日 Volume Mount 备份并复制到 S3/R2；只依赖同一台服务器上的快照无法应对磁盘或主机丢失。恢复时先停止应用，保留原数据卷，移走旧的 `interviewprep.sqlite`、`interviewprep.sqlite-wal` 和 `interviewprep.sqlite-shm`，再把已验证快照复制为 `interviewprep.sqlite` 后启动，并确认 `/health` 和题库数据。

## Coolify 部署

仓库根目录已经包含生产用 `Dockerfile`，单个 Node 进程会同时提供前端、API 和 `/health` 健康检查。镜像内包含 ffmpeg、PDF 文本提取和 DOCX 解压所需工具。

1. 在 Coolify 新建 **Application → Public Repository/Private Repository**，Base Directory 指向本项目目录，Build Pack 选择 `Dockerfile`。
2. 容器端口设置为 `8787`，健康检查路径设置为 `/health`。
3. 在 **Persistent Storage** 新建不填写 Source Path 的 **Volume Mount**，Destination Path 设置为 `/app/data`；SQLite 数据全部保存在这里。部署迁移或重建前先备份该卷。
4. 绑定 HTTPS 域名，并设置以下运行时环境变量（`APP_ORIGIN` 必须与浏览器实际访问的 origin 完全一致，且不带末尾 `/`）：

```dotenv
AUTH_USERNAME=你的唯一用户名
AUTH_PASSWORD_HASH=pnpm auth:hash 输出的完整内容
SESSION_SECRET=openssl rand -base64 48 的输出
APP_ORIGIN=https://interview.example.com
TRUST_PROXY=true
# 固定出口 IP 时才设置
AUTH_ALLOWED_IPS=

VITE_LLM_PROVIDER=openai-compatible
VITE_LLM_BASE_URL=https://api.example.com/v1
VITE_LLM_MODEL=your-model-name
LLM_API_KEY=your-server-only-api-key
LLM_IMPORT_MODEL=your-fast-model-name

STT_PROVIDER=openai-compatible
STT_BASE_URL=https://api.example.com
STT_MODEL=your-transcription-model
STT_API_KEY=your-server-only-stt-key
STT_REQUEST_TIMEOUT_MS=90000
```

5. 部署后先访问 `https://你的域名/health`，应返回 `{"status":"ok"}`，随后再打开首页测试登录。健康检查同时验证 SQLite 可用性；收到 `SIGTERM` 后会先退出健康状态，再等待现有请求结束。不要设置 `AUTH_ENABLED=false` 或 `AUTH_COOKIE_SECURE=false`；生产启动时缺少账户、密码哈希、会话密钥或 `APP_ORIGIN` 会直接失败，避免误把未受保护的实例上线。

在 Coolify 的环境变量 Normal View 中，将 `AUTH_PASSWORD_HASH` 勾选为 **Literal**，否则哈希中的 `$` 可能被当成变量引用。`AUTH_PASSWORD_HASH`、`SESSION_SECRET`、`LLM_API_KEY`、`STT_API_KEY` 都只需要 Runtime Variable，应关闭 Build Variable，避免秘密进入镜像构建参数；三个 `VITE_LLM_*` 变量保留 Build + Runtime，供前端状态展示和服务端运行时读取。

如果域名接入 Cloudflare，建议再启用 Cloudflare Access；如果只有固定出口 IP，也可以在 Coolify/防火墙层配置 IP allowlist。它们位于应用登录之前，能进一步减少扫描和爆破流量。

服务输出单行 JSON 日志，包括请求 ID、路由、状态码、耗时、认证失败/锁定和未捕获异常。日志不包含密码、Cookie、API Key 或简历正文，可直接由 Coolify 收集并转发到日志平台。

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
