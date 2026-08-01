# 更新日志

本项目的重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [8.10.0] - 2026-08-01

### Added

- OpenClaw Skill、确定性 Hermes 桥接、安装校验和单实例保护。
- OpenClaw 集成测试及真实运行状态读取。
- 完整许可证、贡献指南、安全政策、行为准则、Issue/PR 模板和代码所有者配置。
- Dependabot、CodeQL、依赖审查、自动 GitHub Release 与仓库规范自检。

### Changed

- GitHub Actions 锁定到完整提交 SHA。
- npm 包声明为私有项目并增加显式文件白名单，避免误发布。

### Fixed

- Hermes、状态和验证码 CLI 的 `--help`/`--version` 行为。
- Edge `Edg/` 用户代理在真实浏览器烟雾测试中的识别。
- 验证码 CLI 端口和长度参数校验。

### Verified

- Windows/Linux × Node.js 20/24 全量 CI。
- Edge 真实浏览器烟雾测试与依赖安全审计。

[Unreleased]: https://github.com/wzgrx/hua-yi-helper/compare/v8.10.0...HEAD
[8.10.0]: https://github.com/wzgrx/hua-yi-helper/releases/tag/v8.10.0
