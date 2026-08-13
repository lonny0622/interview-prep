# InterviewPrep

为个人求职准备使用的面试题库与模拟面试应用。项目独立于 SecondBrain 主仓库维护，当前以单用户、本地优先的 Web 版本为主。

## 当前进度

- 题库工作台：搜索、分类/掌握度筛选、题目详情
- 手动新建和编辑题目
- 答案、解析和面试建议支持 Markdown
- 掌握程度记录和本地持久化
- 移动端底部导航与响应式布局

当前数据保存在浏览器 `localStorage`，还未接入服务端数据库和 LLM。

## 开发

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## 计划

1. 题库导入、版本管理与 PostgreSQL 数据层
2. 学习 session、刷题流程和结构化评分
3. 简历/JD 解析、项目题/场景题/发散题问题池
4. 流式 STT/TTS、语音打断和模拟面试复盘

产品设计文档位于 SecondBrain 的 `JobHunting/03-面试准备/06-模拟面试/面试准备应用技术方案.md`。
