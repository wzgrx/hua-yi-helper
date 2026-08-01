# 贡献指南

## 开发环境

- Node.js `>=20.9.0`；
- Windows、Linux 或 macOS；
- Edge、Chrome 或 Chromium，用于强制浏览器烟雾测试。

```bash
git clone https://github.com/wzgrx/hua-yi-helper.git
cd hua-yi-helper
npm ci
npm test
```

提交前执行：

```bash
npm run validate:repo
npm run audit:security
```

CI 会在 Windows/Linux 和 Node.js 20/24 上执行全量测试，并要求真实浏览器烟雾测试成功。

## 源码与生成文件

- `src/shared/core.js` 与 `src/tampermonkey/runtime.js` 是油猴脚本主要源码；
- `src/tampermonkey/hua-yi-helper.user.js` 由 `npm run build` 生成；
- 修改生成源后应同时提交生成文件；
- CI 使用 `git diff --exit-code` 检查生成文件是否同步。

## 变更要求

1. 一个提交聚焦一个主题，提交信息使用简洁的祈使句或 Conventional Commits 前缀；
2. 修复问题时补充覆盖该问题的自动测试；
3. 新增配置项时同步更新 README、帮助文本和测试；
4. 保持凭据、Cookie、培训卡、真实页面数据和浏览器资料目录在版本库之外；
5. 拉取请求需通过 CI、CodeQL 和依赖审查。

提交拉取请求即表示贡献内容按本项目的 AGPL-3.0 许可证发布，并遵守
[行为准则](CODE_OF_CONDUCT.md)。安全问题请遵循 [安全政策](SECURITY.md)。
