# 华医网学习助手 v6.0.0

> 面向 2026 年华医网新版混合站点的油猴自动化脚本：登录辅助、学分规划、课程发现、视频/互动病例/问卷/考试流程、进度核验与异常恢复。

[![License](https://img.shields.io/badge/license-AGPL%20v3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-6.0.0-brightgreen.svg)](https://github.com/wzgrx/hua-yi-helper)
[![Platform](https://img.shields.io/badge/platform-Tampermonkey%20%7C%20Edge%20%7C%20Win11-orange.svg)](https://github.com/wzgrx/hua-yi-helper)

## 当前版本重点

v6 是一次围绕真实页面布局和可恢复执行的重构：

- 适配 `cme28.91huayi.com` 2026 登录页、Vue SPA 课程页、ASP.NET 课程详情页、学习记录页、`dcwj.91huayi.com` 问卷页、`hdbl.91huayi.com` 互动病例页。
- 登录辅助支持密码登录页切换、账号/密码填充、用户协议勾选、本地图形验证码 OCR 识别与验证码错误重试。
- 登录失败分类：验证码错误自动重试；账号/密码类服务端错误立即停止，避免无限刷新验证码。
- 学分规划按年度过滤学习记录，并同时满足：总学分 25、公需课 5、其他课程 20。
- 课程发现支持 Vue 分页跨页合并，只使用页面真实 URL，不伪造课程链接。
- 视频页基于真实播放器/考试按钮状态推进，不再用本地播放秒数伪造完成。
- 考试页按题组选项 `name` 分组，结果页仅学习明确判定正确的已提交答案。
- 问卷页先填写必需控件再提交，不直接跳过真实问卷表单。
- 互动病例页只点击可见、可用、白名单推进按钮，避免误点返回/关闭/删除等控件。
- 运行状态写入 GM 存储，跨页面跳转后可恢复；暂停状态同样持久化。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开脚本地址：
   <https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js>
3. 在 Tampermonkey 中安装或更新脚本。
4. 打开华医网继续医学教育页面或登录页。

## 使用

1. 打开华医网登录页或继续教育首页。
2. 登录页右上角会出现脚本登录面板；保存账号密码后可自动尝试密码登录和图形验证码识别。
3. 登录后点击脚本面板中的“计划”生成学习计划。
4. 点击“执行”后脚本会按学习记录核验、课程详情、问卷、视频、考试、结果页的顺序推进。
5. 需要中断时点击“暂停”；恢复时重新点击“执行”。

凭据只保存在 Tampermonkey 的 GM 存储中，项目源码和测试均不包含账号、密码或 GitHub token。

## 流程架构

```text
登录页
  ├─ 切换密码登录
  ├─ 填账号/密码/隐藏真实密码字段
  ├─ OCR 图形验证码
  └─ 根据错误类型重试或停止

学习记录页
  ├─ 按目标年度过滤
  ├─ 只把“已申请”计入已获学分
  └─ 计算公需/其他/总分缺口

课程发现
  ├─ Vue SPA 多页课程卡片扫描
  ├─ ASP.NET 课程详情链接解析
  └─ 合并真实 URL 生成任务队列

执行引擎
  ├─ 问卷：填写必需控件后提交
  ├─ 视频：监控真实进度和考试按钮
  ├─ 互动病例：安全推进按钮白名单
  ├─ 考试：题目指纹、答案记忆、智能试错
  └─ 结果：通过后才推进任务，未知状态返回学习记录核验
```

## 本地开发

```powershell
cd "C:\Users\123\Documents\New project\hua-yi-helper"
npm install
npm test
```

测试包括：

- `tests/run-all.js`：脚本结构、元数据和核心模块存在性检查。
- `tests/dom-integration.js`：基于 jsdom 的关键 DOM 行为回归测试。
- `tests/source-quality.js`：源码质量检查，防止硬编码凭据、过时 API、无效选择器等问题。

## Hermes 自动化入口

项目保留 Node/Puppeteer 版 Hermes 入口，用于调试和后续自动化扩展：

```powershell
npm run plan
npm run brush
npm run full
```

油猴脚本仍是主要交付物：`src/tampermonkey/hua-yi-helper.user.js`。

## 版本记录

### v6.0.0

- 全面重构登录、学分规划、课程发现、执行恢复、视频、问卷、考试、互动病例逻辑。
- 增加 Tesseract.js 本地图形验证码 OCR。
- 增加年度/分类学分核验，防止总分够但分类不足时误判达标。
- 移除会导致误判完成或破坏站点完整性的全局覆盖逻辑。
- 增加可重复运行的 DOM 集成测试和源码质量检查。

## 协议

[AGPL-3.0](LICENSE)
