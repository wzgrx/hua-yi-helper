# v8 需求覆盖矩阵

| 需求 | 实现 | 验证 |
|---|---|---|
| 年度 25 分不是单一总数 | `src/shared/core.js` 分别核验公需与其他 | `tests/core-planner.js` |
| 公需课固定 5 分 | `publicTarget: 5`，独立缺口和任务队列 | 2025 规划夹具 |
| 继续教育与全员专项合计 20 分 | `otherTarget: 20`，`source` 区分两类来源 | 混合来源最优子集断言 |
| 智能最优选课 | 0.1 分精度动态规划，依次最小化超额、时长、数量 | 最优组合与不足场景 |
| 不浪费已投入课程 | 已完成先申请，已选课程先按最优子集恢复 | 任务优先级断言 |
| Tampermonkey | UMD 核心 + 单文件生成物 + GM 状态迁移 | 构建、DOM、源码质量测试 |
| 旧版本原位升级 | 保留脚本名称，迁移 `HY7_*` 到 `HY8_*` | 模块契约和迁移夹具 |
| Win11 | Edge/Chrome 自动路径发现、PowerShell 启动器 | `tests/hermes-config.js` |
| WSL | `/mnt/c` 浏览器探测、Bash 启动器、DevTools URL 连接 | WSL 路径与参数测试 |
| Hermes | Puppeteer 运行器、浏览器资料目录、状态监视 | 配置、登录和浏览器烟雾测试 |
| 跨子域断点 | 受 4 KiB Cookie 上限约束的状态桥；本地完整记录与桥接游标按时间戳合并 | `tests/hermes-login.js` 大状态与跨子域夹具、实站状态机 |
| 自动登录 | 微信/短信/密码模式切换、真实字段、密码同步、协议勾选、提交重试和断点恢复 | `tests/hermes-login.js`、`tests/live-login.js` 与真实 `test:login` |
| 图形验证码 | 本机 Tesseract.js、Sharp 预处理、定宽数字分割、共识识别；统一覆盖登录与考试异常验证页 | `tests/captcha.js`、DOM 适配与 12 个真实验证码回归 |
| 学习记录 | 年度筛选、学分/类别/来源/状态/操作解析 | DOM 与异步测试 |
| 课程目录 | 公需/继教/专项扫描、去重、候选缓存、切换目录 | DOM 和模块契约 |
| 课件学习 | 真实 `cid`/`cwid`、待考试直达、播放器入口观察 | DOM 与异步测试 |
| 考试恢复 | 已验证答案、确定性未知组合、结果页正确答案学习 | DOM、异步和模块测试 |
| 证书/问卷/病例/培训卡 | 独立路由、证书步骤状态核验、语义动作、唯一卡自动选择、无卡任务跳过 | DOM、模块与实站状态机测试 |
| 异步加载 | 学习记录/课件/考试/结果/目录均有限重试 | `tests/async-integration.js` |
| 密钥与隐私 | 环境变量/GM 存储；源码泄露扫描 | `tests/source-quality.js` |

## 在线布局基线

2026-07-30 通过 Win11 Edge 中的当前登录页确认：

- 表单：`#form1`
- 更多登录方式：`#show_type_more`
- 密码登录：`#type_pwd`
- 用户名：`#txt_user_name`
- 显示密码：`#txt_user_pwd`
- 实际提交密码：`#txt_user_pwd_real`
- 图形验证码：`#txt_img_code`
- 验证码图片：`#yzm_img`
- 协议勾选：`#agree1`
- 登录按钮：`.btn_login`

学习记录当前列为“项目名称 / 项目编号 / 学分类型 / 学习状态 / 学分申请时间 / 机构 / 学习进度 / 操作”，继续教育入口为 `/cme/index.html`，全员专项入口为 `/pages/fme.aspx`。

课程与考试选择器同时保留当前页面结构和公开页面脚本中的兼容结构，例如 `.lis-inside-content`、`course_ware.aspx?cwid=`、`#jrks`、`.pv-ask-modal-wrap`、`player.j2s_getCurrentTime()`、`.state_cour_ul input.state_lis_han` 与 `bar_img`。
