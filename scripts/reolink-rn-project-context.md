# reolink-rn 项目事实摘要

- 这是 Reolink 跨端 Monorepo，使用 pnpm workspace + Turborepo；主要包含移动端宿主 `apps/core-mobile`、Electron 桌面端 `apps/core-pc`、跨端装配层 `apps/ui-entry`，以及 `packages/shared` 下的基础能力、共享逻辑和业务模块。
- 移动端当前使用 React Native 0.79.5、Expo 53、TypeScript；桌面端使用 Electron、Vite 和 React Native Web。
- Android 配置明确为 `newArchEnabled=false`，打 Bundle 脚本也显式设置 `RCT_NEW_ARCH_ENABLED=0`，因此当前可确认的移动端构建仍以旧架构为主。回答新架构问题时应说清“当前项目现状”和“迁移建议”，不能假装已经全量上线 Fabric/TurboModules。
- Android 配置 `hermesEnabled=true`，构建脚本使用 RN 自带 hermesc；项目确实选择了 Hermes。
- UI/性能相关依赖包括 Reanimated 3.17.5、React Native Screens、Gesture Handler、Skia；共享基础库中存在 `performanceProfiler` 工具和大量列表、图片、视频、播放器等组件。
- JS 与 Native 通过统一的 `packages/shared/basic/sdk/nativeApi`、`nativeEventEmitter`、日志和平台适配层交互；仓库内有大量 Native API 包装，覆盖权限、网络状态、文件、下载、推送、设备、导航、音视频等能力。
- 项目具有原生 Android/iOS 工程，是 RN + Native 混合架构；移动端入口会向原生注册 RemoteConfig、DeviceProfile、Cloud、MessageCenter、Login、Tools、DeviceAdd、CloudLinkage、SmartHome 等多个 RN 业务模块。
- 共享层按 `basic / logic / reolink` 分层：basic 提供组件、hooks、SDK、工具、样式和资源；logic 提供 DownloadManager、TaskManager、设备和云等共享逻辑；reolink 承载具体业务模块。
- 日志层同时支持 Console 与 Native Log，生产环境会按白名单和敏感字段黑名单过滤数据；埋点通过统一 `trackEvent` Native API，并有批量提交追踪日志的能力。
- CI/CD 可确认事实：仓库有 Jenkins 多分支流水线、工作日定时构建、依赖/子模块准备、导入导出检查、JS Bundle 编译、Android APK/AAB 构建与归档、企业通知；iOS 使用 Fastlane，并从内部仓库复用 Fastlane 配置。
- 多环境/OEM 能力通过 `env`、配置包、资源同步脚本和构建参数管理；根脚本包含 Reolink 资源同步、版本同步和 RN 升级辅助流程。
- iOS 工程包含崩溃保护与本地日志/调试工具，但仓库证据不足以确认完整的线上 Crash 平台、具体监控指标或告警 SLA。回答时应提出可落地的监控方案，不要声称项目已使用 Sentry 等未确认产品。
- 仓库证据不足以确认现有 OTA/热更新产品和生产策略。回答 OTA 问题时应明确“当前仓库未确认已有方案”，再给出兼容矩阵、签名校验、灰度、回滚和 Native Binary 约束等设计建议。
- 不得编造 DAU、性能提升百分比、事故影响、团队人数、个人贡献或线上结果。项目型参考回答应使用“从仓库可确认的是……”或“如果由我负责，我会……”区分事实与建议。
