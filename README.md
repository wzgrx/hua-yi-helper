# 华医网小助手 v3.0

> 全自动智能刷课 | 智能学分规划 | 三端适配 (油猴/Hermes/Win11)

[![License](https://img.shields.io/badge/license-AGPL%20v3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.0.0-brightgreen.svg)](https://greasyfork.org/scripts/483418)
[![Platform](https://img.shields.io/badge/platform-Tampermonkey%20%7C%20Node.js%20%7C%20Win11-orange.svg)](https://github.com/wzgrx/hua-yi-helper)

---

## 核心功能

### 智能学分规划器 (v3.0 新增)

| 功能 | 说明 |
|------|------|
| 学分分析 | 自动解析"学习记录"页，统计已获学分 |
| 缺口计算 | 以2025年为例: 公需5分(固定) + 其他20分 = 25分目标 |
| 最优组合 | 从未完成课程中筛选最优组合填补学分缺口 |
| 任务排序 | 按优先级排序: 未学习 → 播放中 → 学习中 → 待考试 |
| 可视化计划 | 在页面右侧显示完整学习计划、学分进度、预计时间 |
| 一键执行 | 点击"自动执行计划"按顺序刷完所有课程 |

### 全自动刷课

- 自动扫描课程列表 → 进入未学习课程 → 自动播放视频 → 自动静音 → 自动跳过疲劳检测 → 视频完成 → 自动考试(可选) → 自动返回 → 播放下一个

### 考试助手

- 试错算法：自动遍历选项找到正确答案
- 答案记忆：正确题目标签持久化存储，下次自动填写
- 自动交卷：答题完成自动提交

### 反作弊对抗

- 抢先覆盖 `blockAbnormalPlugin`
- 拦截 Object.defineProperty 重定义
- 拦截 `isTrusted` 的 click 事件检测
- 拦截倍速检测定时器
- MutationObserver 清除页面限制属性

---

## 安装方式

### 方式一: Tampermonkey (油猴) - 推荐

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)
2. 打开: [最新油猴脚本](https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js)
3. Tampermonkey 自动提示安装，点击安装
4. 打开 [华医网](https://www.91huayi.com) 并登录，脚本自动运行

### 方式二: Hermes (Node.js / WSL)

适用于 WSL / Linux 环境，使用 Puppeteer 控制浏览器自动化：

```bash
# 安装依赖
cd src/hermes
npm install

# 全自动模式
node index.js --mode full --speed 2

# 仅刷视频 (跳过考试)
node index.js --mode video --speed 2

# 无头模式 (后台运行)
node index.js --mode full --headless
```

### 方式三: Win11 原生支持

```powershell
# 运行PowerShell启动脚本
.\scripts\run-hermes.ps1 -Mode full -Speed 2 -Headless

# 一键安装配置
.\scripts\setup.ps1 -InstallChrome -CreateTask -TaskTime "06:00"
```

---

## 运行模式

| 模式 | 油猴 | Hermes | 说明 |
|------|------|--------|------|
| `auto` | ✅ | - | 智能规划 + 全自动执行 (默认) |
| `full` | ✅ | ✅ | 视频+考试全自动 |
| `video` | ✅ | ✅ | 仅刷视频，跳过考试 |
| `plan` | ✅ | ✅ | 仅生成学习计划，不执行 |

---

## 学分计算规则

以 2025 年继续医学教育为例:

```
学分目标: 25分/年
├─ 公需课: 5分 (必修, 固定)
└─ 其他:  20分 (来自 继续教育/全员专项)
     ├─ 纳入正在进行的课程
     ├─ 扫描可用的课程
     └─ 输出最优课程组合
```

脚本自动:
1. 统计已获学分
2. 计算学分缺口
3. 扫描可用课程
4. 按优先级排序
5. 生成学习计划
6. 自动执行

---

## 项目结构

```
hua-yi-helper/
├── src/
│   ├── tampermonkey/
│   │   └── hua-yi-helper.user.js    # 油猴脚本 (单文件, 直接安装)
│   ├── hermes/
│   │   ├── index.js              # Hermes CLI入口
│   │   ├── bot.js                # 核心自动化引擎 (Puppeteer)
│   │   └── lib/
│   │       ├── credit-planner.js # 学分规划器
│   │       ├── answer-store.js   # 答案持久化
│   │       └── page-processor.js # 页面处理器
│   └── shared/                   # 共享模块 (未来)
├── scripts/
│   ├── setup.ps1                 # Win11一键安装
│   └── run-hermes.ps1            # Win11启动脚本
├── tests/                        # 测试
├── docs/                         # 文档
├── package.json                  # Node.js项目配置
└── README.md                     # 本文件
```

---

## Hermes 命令行参数

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--mode` | `-m` | full | 运行模式: full/video/plan |
| `--speed` | `-s` | 2 | 播放倍速 |
| `--headless` | `-h` | false | 无头模式 |
| `--chrome-path` | `-c` | 自动检测 | Chrome/Edge路径 |
| `--target-year` | `-y` | 2025 | 目标年份 |
| `--target-credits` | `-t` | 25 | 目标学分 |

---

## FAQ

**Q: 脚本会被检测封号吗？**
A: 脚本使用多层反作弊保护，与手动操作特征接近。但不能100%保证不被检测，请合理使用。

**Q: 考试能保证通过吗？**
A: 试错算法需要多次提交。第一次可能不通过，答案会逐渐积累，后续同题库题目自动正确。

**Q: 倍速为什么无效？**
A: 华医网已禁用视频倍速功能。Hermes版使用 currentTime 跳跃方案 bypass 检测。

**Q: 学分数值不对怎么办？**
A: 不同年份/地区学分规则可能不同。可在学习记录页手动查看，或修改目标学分参数。

---

## 免责声明

- 本脚本仅供**学习交流**使用
- 使用者需自行承担使用后果
- 请遵守华医网用户协议和相关法规
- 考试助手仅试错遍历，不搜索外部答案

---

## 更新日志

### v3.0.0 (2026.7.8)
- 完全重构: 全新架构设计
- 新增: 智能学分规划器 (公需5+其他20=25自动规划)
- 新增: 三端适配 (油猴/Hermes/Win11 PowerShell)
- 新增: 计划展示UI + 一键执行
- 增强: 反作弊模块多层拦截
- 优化: 代码模块化, 可维护性大幅提升

[历史版本](https://github.com/wzgrx/hua-yi-helper/releases)

---

## 开源协议

[AGPL v3](LICENSE)
