# 华医网小助手 v3.1

> 全自动智能刷课 | 真实适配2026华医网Vue SPA新版 | 学分规划 | 无人值守

[![License](https://img.shields.io/badge/license-AGPL%20v3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.1.0-brightgreen.svg)](https://greasyfork.org/scripts/483418)
[![Platform](https://img.shields.io/badge/platform-Tampermonkey%20%7C%20Win11-orange.svg)](https://github.com/wzgrx/hua-yi-helper)

---

## 核心创新 (v3.1)

### 真实网站DOM适配
基于 **2026年华医网** 实际页面DOM深度分析重新设计:
- **Vue SPA主页面**: `/cme/index` - 自动识别Vue动态渲染的课程卡片网格
- **ASP.NET详情页**: `course.aspx?cid=X` - 支持传统格式的课件列表
- **全员专项**: `/cme/fme` - Vue SPA版本路由
- **问卷星**: `dcwj.91huayi.com` - 自动检测并处理视频前问卷
- **学习记录**: `study_info_list.aspx` - ASP.NET表格学分解析
- **我的继教**: `cme.aspx` - 混合格式学分数据

### 智能Tab管理
- 截获所有 `target="_blank"` 链接,统一使用 `location.href` 导航
- 防止打开数百个标签页导致浏览器卡死
- 最多3个并发标签页限制

### Vue SPA课程解析
- 从 `.pro_cent > ul.jet_ul > li.jet_lis` 卡片结构提取:
  - 课程名称 (`p.test_tit`)
  - 学分值 (`<span>`包含"X.0学分")
  - 课程状态 (已完成/待考试/学习中/未学习)
- 分页识别: `el-pagination` 支持多页课程扫描

### 答题模块增强
- 多层DOM检测: tablestyle → radio容器 → 通用选项
- 题目指纹: 无视序号随机变化的正文匹配
- 智能评分: 15维特征分析,不依赖云端API
- 模糊匹配: 精确→包含→拼音逐级降级

### 学习计划智能
- 公需课优先 (5分必修)
- 未学习 > 播放至x% > 学习中 > 待考试 优先级排序
- 学分自动检查,达标自动跳过

---

## 快速安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 打开 [最新油猴脚本](https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js)
3. 点击安装
4. 登录 [华医网](https://www.91huayi.com) 脚本自动运行

---

## 使用方法

1. 打开华医网继续医学教育首页 (`/cme/index`)
2. 点击控制面板的 **🎯 计划** 按钮自动生成学习计划
3. 点击 **▶ 执行** 开始全自动刷课
4. 脚本将自动: 扫描课程 → 进入课件 → 完成问卷 → 播放视频 → 答题 → 下一课
5. 需要暂停点击 **⏸ 暂停**

### 模式说明

| 模式 | 说明 |
|------|------|
| 🤖 智能规划 | 自动分析学分缺口,规划最优课程组合 |
| 📝 视频+考试 | 刷所有未完成课程的视频和考试 |
| 📺 仅视频 | 只刷视频,跳过考试 |
| 📋 仅规划 | 仅显示学习计划,不自动执行 |

---

## 技术架构

```
页面类型检测 (混合架构)
├── Vue SPA (/cme/index, /cme/fme)
│   └── .pro_cent > .jet_ul > .jet_lis 课程卡片解析
├── ASP.NET (course.aspx?cid=X)
│   └── a.f14blue.cw-title-link 课件链接
├── 问卷页 (dcwj.91huayi.com)
│   └── 自动完成/跳过问卷
├── 视频页 (course_ware_polyv.aspx)
│   └── Polyv播放器检测 + 完成状态轮询
├── 考试页 (exam.aspx)
│   └── 多层DOM检测 + 指纹匹配 + 智能评分
└── 结果页 (exam_result.aspx)
    └── 正确答案解析 + 持久化存储
```

## 学分计算

以2025年继续医学教育为例:
```
目标: 25分/年
├─ 公需课: 5分 (固定,必刷)
└─ 其他: 20分 (从继续教育/全员专项中选取)
```

脚本自动从未完成课程中按优先级排序,生成最优学习计划。

---

## 更新日志

### v3.1.0 (2026.7.8) - 真实DOM重构版
- **完全基于2026年华医网真实网站DOM分析重构**
- 新增: Vue SPA主页面自动识别和课程卡片解析
- 新增: 智能Tab管理, 截获 target="_blank" 防止打开数百标签页
- 新增: 问卷页自动检测 (dcwj.91huayi.com)
- 新增: ASP.NET详情页课件列表解析 (f14blue.cw-title-link)
- 新增: 智能学分规划器,从Vue SPA课程卡片直接解析学分
- 新增: 答题模块多层DOM检测 + 题目指纹 + 15维智能评分
- 新增: 分页课程扫描支持
- 重写: 控制面板全新UI设计
- 重写: 主路由基于真实URL和DOM特征分发
- 修复: 页面类型误判问题
- 移除: 所有lis-inside-content/btn67/tablestyle等废弃选择器

### v3.0.2 (2026.7.8) - 考试模块升级
- 指纹识别|文本匹配|防随机化
- 三层DOM检测策略 + 智能评分

[完整更新日志](HY_HISTORY.md)

---

## 免责声明

本脚本仅供学习交流使用,使用者需自行承担使用后果。
请遵守华医网用户协议和相关法规。

## 开源协议

[AGPL v3](LICENSE)
