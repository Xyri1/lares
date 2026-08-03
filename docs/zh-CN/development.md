# 开发指南

[English](../en/development.md) · [简体中文](../zh-CN/development.md)

本指南说明如何构建 Lares、它的各部分如何组合，以及如何做出一个能通过评审的改动。

日常使用见[使用指南](usage.md)；角色包格式见[角色包指南](character-format.md)；
安装包见[分发指南](distribution.md)。

> 英文版为准。译文与英文不一致时，以[英文原文](../en/development.md)为准。

---

## 1. 环境准备

你需要 Node.js 和 pnpm。发布流水线固定使用 Node 24.18.0，建议本地也用 Node 24 与之对齐。

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`pnpm fetch-assets` 会把两样东西下载到 gitignore 的路径下：

| 内容 | 路径 | 原因 |
| --- | --- | --- |
| Live2D Cubism Core | `vendor/live2d/` | 许可证禁止再分发 |
| Haru 示例模型 | `characters/haru/runtime/` | 同上 |

克隆仓库后运行一次 `pnpm fetch-assets` 即可。缺少这些文件时 Lares 无法启动。

`pnpm dev` 启动 Electron 应用，渲染进程运行在 `127.0.0.1:5300`。Vite 固定了这个
地址，因为在某些 Windows 机器上，默认的 5173 端口落在系统排除的端口区间内。

### 仓库地图

| 路径 | 内容 |
| --- | --- |
| `sdd/` | 规格文档。`SPEC.md` 是唯一事实来源 |
| `src/main/` | 大脑：服务、会话、情感、角色、配置、托盘 |
| `src/renderer/` | 身体：舞台、合成器和 Live2D 运行时 |
| `src/preload/` | IPC 桥接及其类型 |
| `scripts/` | 钩子转发器、资源下载、导入和打包工具 |
| `plugins/` | Claude Code 与 Codex 的市场插件 |
| `characters/` | 已提交的清单文件。`runtime/` 资源目录被 gitignore |
| `scenarios/` | 四个黄金场景文件 |
| `presets/` | 供开发面板使用的合成预设 |
| `vendor/` | 被 gitignore。Cubism Core 下载至此 |

机器相关的笔记请写入 `AGENTS.local.md`，该文件已被 gitignore。可从
`AGENTS.local.example.md` 复制一份开始。

---

## 2. 架构

Lares 是一个 Electron 应用，分成两半，界线严格。

```
工具钩子 ──┐
           ├─► 大脑（主进程） ─── 表演数据流 ──► 身体（渲染进程）
MCP feel ──┘                                        │
                                                     ▼
                                              Live2D 参数
```

### 大脑

主进程持有状态，不含任何渲染器知识。

| 模块 | 职责 |
| --- | --- |
| `server/` | HTTP 路由与 MCP 服务 |
| `sessions/` | 会话表、事件映射和基线解析 |
| `feel/` | 感受锁存寄存器、会话归属、持久化存储和数据流闸门 |
| `characters/` | 清单、角色库、导入、切换和创作 |
| `scenario/` | 场景播放器 |
| `config.ts`、`strings.ts`、`shell.ts` | 设置、本地化字符串和托盘 |

### 身体

渲染进程负责画面，它接收的是与渲染器无关的数据流。

| 模块 | 职责 |
| --- | --- |
| `stage/` | 窗口、数据流订阅和开发面板 |
| `feel/` | 通道空间中的九锚点混合与运行状态叠加 |
| `synth/` | 逐帧参数合成：呼吸、眨眼和摇摆 |
| `runtime/` | `IRuntime` 接口背后的 `pixi-live2d-display` 适配层 |

### 接缝

表演数据流是两半之间唯一的契约，它承载：

```
{ tick, feel, operational }
```

`feel` 是锁存的三元组——以线上整数表示的 `{ valence, activation, control }`，
寄存器为空时为 `null`；`operational` 是解析出的会话状态。身体把这个三元组变成
通道空间中的姿态，再把运行状态叠加合成到它之上。**资源路径绝不跨越这条界线。**

这里有两条硬规则：

1. 大脑的任何模块都不得从身体侧导入内容。
2. 除 `src/renderer/src/runtime/` 之外，任何文件都不得导入 `pixi-live2d-display`
   或 `pixi.js`。

第二条规则的意义在于：将来接入 3D 身体，只需新增一个 `runtime/` 模块。

---

## 3. 开发控制窗口

`pnpm dev` 会在悬浮窗旁边打开第二个带边框的窗口。打包后的构建只显示悬浮窗。

该窗口依据 `ELECTRON_RENDERER_URL` 判断，而这个变量只有开发服务器会设置。仅判断
`is.dev` 是不够的，因为 `electron-vite preview` 下 `is.dev` 仍为真。

面板提供：

| 控件 | 作用 |
| --- | --- |
| 语义管线 | 显示线上与归一化感受、运行状态、通道姿态和映射/夹取后的模型参数 |
| 手动管线输入 | 开启预览后，V/A/C、运行状态、表现力和锚点的变化立即生效，且不修改实时锁存值 |
| 实时连接追踪 | 跟踪 MCP 会话开关、已接受的钩子与报告、数据流发送和渲染器接收 |
| 场景回放 | 选择、播放、暂停、继续、定位，并设置 1×、8× 或 64× 速度 |
| 动作选择器 | 播放已加载模型的某个动作 |
| 参数滑块 | 手动驱动某个参数 |
| 全量扫描 | 让每个参数走完整个取值范围 |
| FPS 计数 | 报告渲染帧率 |

手动输入和场景回放都会明确标记为绕过路径：它们不能证明 MCP、钩子、会话归属、持久化或间隔限制正常。
Schema 无效的 MCP 调用会在进入 Lares handler 之前被 SDK 拒绝，因此实时追踪不会声称看到了它们。
面板是测试工装，不是产品界面。

---

## 4. 完整追踪一个事件

调试时请沿这条路径走。

1. **工具触发钩子。** 插件的钩子命令调用 `~/.lares/bin/` 下的启动器 shim。应用在
   每次启动时重写该 shim，因此插件里永远不需要保存机器相关路径。
2. **转发器提交事件。** `scripts/forwarder.js` 从 `~/.lares/runtime.json` 读取端口，
   把工具原始载荷包进信封并 POST 到 `/v1/events`。若 Lares 未运行，转发器静默以 0
   退出，绝不阻塞 agent 回合。
3. **服务校验请求。** `server/server.ts` 拒绝任何带 `Origin` 头的请求，并要求每个
   POST 带 `Content-Type: application/json`。
4. **适配器映射事件。** `sessions/mapEvent.ts` 把工具原生载荷转换成一个基线状态。
   新增工具时改这里。
5. **更新会话表。** `sessions/ingest.ts` 持有会话行。它是纯状态表，时钟由调用方提供。
6. **解析基线。** `sessions/resolveBaseline.ts` 返回所有活跃会话中优先级最高的状态。
7. **数据流闸门解析显示状态。** `feel/service.ts` 把最新锁存的感受与已解析的
   运行基线合并，仅在任一值变化时发送。
8. **发出数据流。** 大脑通过 IPC 发送 `affect:update`。
9. **身体渲染。** `feel/` 在通道空间中归一化并混合三元组，再合成运行状态叠加；
   随后 `synth/` 和 `runtime/` 驱动已映射的模型参数。

从钩子触发到可见反应，全链路预算是 250 毫秒。这个预算是硬性的，因为可读性依赖于它。

---

## 5. 测试你的改动

```sh
pnpm test        # Vitest
pnpm typecheck   # 两个 TypeScript 工程
pnpm build       # 先类型检查，再生产构建
```

`pnpm test` 覆盖主进程侧的纯逻辑，以及不依赖 Live2D 的渲染进程模块。测试文件与被测
文件同目录，命名为 `*.test.ts`。

感受寄存器和会话表的时间都由调用方提供。写测试时请自行传入时间戳，不要使用真实时钟，
也不要 sleep。

针对运行中的应用做在线检查：

```sh
pnpm smoke:nerves
```

该脚本读取 `~/.lares/runtime.json`，提交一个合成会话，并调用 MCP 工具。请先运行
`pnpm dev`。

需要确定性的混合/合成检查时，从开发面板播放黄金场景。场景回放会刻意绕过
MCP、钩子、会话归属、持久化和间隔限制；测试这些入口接缝时，请使用 smoke 命令和面板的
实时连接追踪。

---

## 6. 常见改动怎么做

### 新增一种工具

1. 在 `src/main/sessions/mapEvent.ts` 的联合类型中加入工具名。
2. 在同一文件中把它的事件映射到基线状态。不要新增状态 —— 新状态必须先修改
   `sdd/SPEC.md`。
3. 在 `plugins/` 下新增插件目录。保持它很薄：钩子命令、MCP 地址和技能文件。插件里
   不放逻辑，这样旧版应用也能配合新插件工作。
4. 在 `src/main/integrations.ts` 中加入发现逻辑和安装命令。使用固定参数，绝不把外部
   输入拼进命令。
5. 如果旧版构建写过遗留配置，请补一个清理流程。

### 调整感受行为

| 常量 | 位置 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `expressiveness` | 应用配置文件 | 1 | 把混合结果相对中性姿态整体放缩 |
| `TRANSITION_MS` | `renderer/feel/feel.ts` | 700 | 每次目标变化所走的那一条缓动 |
| `OVERLAY_WEIGHT` | `renderer/feel/feel.ts` | 0.6 | 运行状态叠加占最终姿态的比重 |
| `FEEL_SPACING_MS` | `main/feel/register.ts` | 2 000 | 两次报告之间的最小间隔 |
| `LATCH_CAPACITY` | `main/feel/register.ts` | 64 | 保留的会话锁存条数 |

锚点姿态本身放在 `renderer/feel/anchors.default.json` 与 `operational.default.json`。
这些数字是可调默认值，改动它们不算契约变更。改动 schema、接口、状态机或验收场景才算。

### 新增一条用户可见字符串

先在 `src/main/strings.ts` 的 `en` 中加键，再在 `zhCN` 中加同名键。

`zhCN` 表带有 `typeof en` 注解。缺键、多键或类型不符都会让 `pnpm typecheck` 失败。
类型检查器强制保证翻译对齐，因此 Lares 不需要 i18n 框架。

读取字符串请通过实时绑定 `L`，不要缓存取值。

### 修改角色 schema

Schema 位于 `sdd/SPEC.md` 第 5 节和 `src/main/characters/manifest.ts`。

校验是一个纯函数，有三个调用方：导入脚本、它的 `--check` 参数，以及应用加载时。请
保持这一结构。

身份与情感语义必须留在渲染器块之外。问自己一个问题：将来的 VRM 块能否在不改动共享
部分的前提下实现这个角色？如果不能，这个改动就是错的。

---

## 7. 约束每一次改动的规则

完整表述见 `sdd/PRINCIPLES.md`。违反其中任何一条的改动都是错的，哪怕它能跑。

| 规则 | 简述 |
| --- | --- |
| P1 | 每个行为都要告诉用户一件他能据此行动的事 |
| P2 | agent 报告自己的感受，Lares 绝不推断 |
| P3 | 除已披露的更新检查外，没有任何数据离开本机 |
| P4 | 渲染路径中没有推理，动力学是确定性的 |
| P5 | 角色身份高于任何渲染器 |
| P6 | 大脑不含渲染器知识 |
| P7 | 所有入口流量都在服务端校验、夹紧并限速 |
| P8 | 同一事件在不同历史下读起来不同 |
| P9 | 非目标清单在书面决议修订之前始终有效 |
| P10 | 需要输入的会话绝不被视觉遮蔽 |
| P11 | Lares 只感知工具主动发送的内容，不读取工具文件 |

P11 是最常见的陷阱。任何 tail 日志、轮询进程或监视工具文件的改动都无法通过评审，
即使它确实补上了一个真实缺口。

### 动手写代码前该看哪份文档

| 你的任务 | 该读 |
| --- | --- |
| 触及契约、schema 或不变量 | `sdd/SPEC.md` |
| 推进某个里程碑 | `sdd/slices/NNN-name/` |
| 用规则检查一个改动 | `sdd/PRINCIPLES.md` |
| 质疑某个设计选择 | `sdd/DECISIONS.md`，并引用 D 编号 |
| 询问范围内外 | `sdd/ROADMAP.md` |
| 询问 Lares 为何存在 | `sdd/PRD.md` |

### 提交信息

使用约定式提交：`type(scope): 祈使语气的摘要`。类型包括 `feat`、`fix`、`chore`、
`docs`、`refactor` 和 `test`。

---

## 8. 构建与发布

| 命令 | 作用 |
| --- | --- |
| `pnpm build` | 先类型检查，再构建生产产物 |
| `pnpm package:preflight` | 校验本地分发输入 |
| `pnpm package:mac` | 构建未签名的 macOS 通用 DMG |
| `pnpm package:win` | 构建未签名的 Windows x64 NSIS 安装包 |
| `pnpm package:inspect` | 检查已构建的产物 |
| `pnpm import` | 从命令行导入角色包 |
| `pnpm adapter:remove` | 移除本机上的 Lares 适配器条目 |

`build/default-character` 指定安装包内置的那一个角色。只有当某个包已获得再分发许可、
并自带 `NOTICE` 时，才可以改这一行。preflight 会拒绝缺失 notice 的包。

发布只由一个信号触发：`package.json` 中的语义化版本号提升并推送到 `master`。其他任何
改动都不会打包。随后 GitHub Actions 创建标签、发布两个安装包及其 SHA-256 文件，并把
含 `-` 的版本标记为预发布。

完整流程和全新机器验收清单见[分发指南](distribution.md)。

---

## 9. 环境变量

| 变量 | 作用 |
| --- | --- |
| `LARES_PORT` | 覆盖入口端口，默认 21473 |
| `LARES_DEFAULT_CHARACTER` | 指定默认角色，默认为 `haru` |
| `LARES_DENSITY_LOG` | 把情感密度日志写入该路径 |
| `LARES_RUNTIME_FILE` | 让转发器指向另一个发现文件 |
| `LARES_FORWARDER_TIMING` | 让转发器报告自身耗时 |
| `LARES_HARNESS_PID` | shim 捕获到的工具进程号 |

当你要在常规实例之外再跑一个实例时，请同时设置 `LARES_PORT` 和 `LARES_RUNTIME_FILE`。
注意工具插件里写的是 `127.0.0.1:21473`，因此只有跑在默认端口上的实例才会响应它们的
MCP 调用。
