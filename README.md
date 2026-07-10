# 华医网学习助手 v7

面向 2026 年华医网真实页面重新实现的单文件 Tampermonkey 脚本。v7 已删除 v6 的补丁式状态机、重复 Node 自动化实现和相互冲突的旧 UI。

## 设计原则

- 以学习记录页的“已申请”状态作为学分唯一依据。
- 使用页面提供的真实 `cid`、`cwid` 和操作地址，不拼造课程标识。
- 播放器保持网站原生行为；助手不控制媒体元素，只读取网站启用的考试入口。
- “待考试”课件直接使用真实 `cwid` 进入考试，避免返回播放器循环。
- 控制面板使用 Shadow DOM，与 ASP.NET 表单和网站 CSS 隔离。
- 所有面板按钮均为普通按钮，不会提交考试或证书表单。
- 单一持久状态 `HY7_STATE`，跨页面恢复开始、暂停、当前课程和当前课件。
- 考试先匹配已验证答案；未知题按确定组合重试，不再随机乱选。
- 只在顶层页面运行，不注入课程页中的指南、药品和 AI iframe。

## 支持的真实流程

```text
学习记录
  → 读取已申请学分
  → 优先处理申请证书
  → 进入未完成项目
  → 待考试课件直接考试
  → 未学习课件进入网站原生播放器
  → 网站启用考试入口后进入考试
  → 通过后返回项目继续下一课件
  → 全部完成后回学习记录核验
  → 达到 25 分后停止
```

另外支持问卷必填项、互动病例安全推进、证书申请页和无培训卡停止状态。

## 安装

1. 安装 Tampermonkey。
2. 打开：
   <https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js>
3. 确认安装版本为 `7.0.0`。
4. 打开华医网学习记录页，点击面板中的“开始/继续”。

如果播放器提示存在异常插件，应停用其他会注入所有网站的用户脚本或视频增强扩展。v7 本身不会修改播放器。

## 项目结构

```text
src/tampermonkey/hua-yi-helper.user.js  # 唯一运行实现
tests/run-all.js                        # 模块契约测试
tests/dom-integration.js                # 真实 DOM 格式行为测试
tests/source-quality.js                 # 语法、版本和禁止行为检查
```

## 本地验证

```powershell
npm install
npm test
```

## 安全与隐私

源码不包含账号、密码、GitHub token 或浏览器会话数据。运行状态和答案记录只保存在 Tampermonkey 的 GM 存储中。

## 协议

[AGPL-3.0](LICENSE)
