<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — 戴兜帽的家宅精灵">
</p>

<h1 align="center">Lares</h1>
<p align="center"><em>/ˈlɛəriːz/</em> · LAIR-eez</p>

<p align="center">
  <strong>给你的 AI 智能体一张脸。</strong><br>
  将智能体自身的感受化为鲜活表演的本地 Live2D 桌面伙伴。
</p>

<p align="center">
  <a href="LICENSE"><img alt="Apache 2.0 许可证" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="早期 alpha" src="https://img.shields.io/badge/status-early_alpha-orange.svg">
  <img alt="macOS 和 Windows" src="https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg">
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong> · <a href="README.ja.md">日本語</a>
</p>

## 它是什么

Lares 把智能体会话变成桌面上一个时刻都在动的角色——一个 **Lar**。
它思考、卡壳、等待、缓过来、完工，你都看在眼里，不用再另开一个活动面板盯进度。

## Lares 有何不同

典型的智能体桌宠会把生命周期事件映射为固定反应：工作中就是忙碌，失败就是
难过，完成就是开心。它们能告诉你发生了什么，却无法呈现模型如何看待眼前的工作。

Lares 保留生命周期事件作为运行心跳，同时另设一条第一人称通道。模型通过
`feel(valence, activation, control)` 投射它对当前处境的判断——三个轴分别表示
不愉快到愉快、低沉到活跃、受阻到掌控局面。Lares 再把这份精简汇报转化为连续且
贴合角色的表演。

`模型对处境的判断 → feel(v, a, c) → 本地确定性表演 → Lar`

Lares 不读取对话记录或模型内部状态。模型自行汇报它对处境的判断；钩子只汇报
工作中、等待输入等运行事实。

这份表现力在设计上也很省 token。固定事件桌宠几乎不需要模型输出，却只能使用
预设反应；让智能体编写表情、参数或动画曲线虽然更自由，却会消耗大量 token，
动作质量也可能不稳定。Lares 只在智能体对处境的判断发生有意义的变化时，请它汇报
三个有界值；感受不变就不调用。连续表演全部在本地完成——无需动画提示词、
关键帧或逐帧模型推理。

> 稀疏的三值汇报换来广阔的情感表达——无需固定反应列表，也无需源源不断的
> 动画 token。

## 安装

从[最新发行版](https://github.com/Xyri1/lares/releases/latest)下载对应系统的
安装包。

> [!IMPORTANT]
> Lares 仍处于早期 alpha 阶段，安装包**没有签名**——开发者付不起签名费，
> 单纯是穷，不是什么安全特性。两个系统各会拦你一次，下面就是官方认可的
> 通过方式。

### macOS

打开 DMG，把 **Lares.app** 拖进**应用程序**。首次启动会被直接拒绝：

> Apple 无法验证“Lares”是否包含可能危害 Mac 安全或泄漏隐私的恶意软件。

弹窗给出的唯一动作是**移到废纸篓**。不要点它——关掉弹窗，然后：

1. 打开**系统设置 → 隐私与安全性**。
2. 向下找到**安全性**，会看到一行提示：已阻止使用“Lares”以保护你的 Mac。
3. 点击**仍要打开**。
4. 完成验证，并在最后一个弹窗中确认。

macOS 会记住这个决定，之后每次启动都恢复正常。

### Windows

运行安装程序，SmartScreen 会显示**Windows 已保护你的电脑**。点击**更多信息**，
再点**仍要运行**。随后 Windows 会询问是否允许一个**未知发布者**的应用——选择
**是**，安装即可继续。

未签名带来的差别仅此而已。每个发行版还附带 SHA-256 校验值，你可以先核对下载
文件再安装。

## 连接你的智能体

启动 Lares，你的 Lar 就会出现在桌面上，各项控制都在系统托盘里。

在托盘菜单中选择 **Configure Agent Integrations…**，然后按安装程序的提示
确认安装 Claude Code 插件或 Codex 插件。

开启一个新的智能体会话，让钩子和本地 MCP 连接得以加载。Claude Code 可以直接用
`/reload-plugins` 重新加载插件；Codex 会请你审核 Lares 的钩子，确认信任即可。

之后照常工作就好。Lar 会同时呈现会话的运行状态和智能体的第一人称感受汇报。
换角色、调缩放、开免打扰，都在托盘里。

如需手动配置，请参阅 [Claude Code](plugins/claude-code/README.md) 和
[Codex](plugins/codex/README.md) 插件指南。

## 它能做什么

- 以透明、可拖动、始终置顶的浮层常驻桌面。
- 通过 Claude Code 和 Codex 的原生插件系统接入智能体。
- 用三轴感受汇报驱动连续表演，而不是从固定情绪列表中挑选动画。
- 全程本地运行：守护进程只绑定回环地址，对话记录不会离开你的设备。

应用主动发起的网络请求只有一个：明确披露的 GitHub 更新检查。智能体插件
也只会在你主动要求并确认之后才开始下载。

## 从源码运行

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`fetch-assets` 会把 Live2D Cubism Core 和 Haru 示例模型下载到 Git 忽略的
路径。开发期间，Electron 渲染器运行在 `127.0.0.1:5300`。

## 导入自己的 Lar

此版本暂不支持导入第三方模型。托盘菜单会保留禁用的
**导入角色（即将推出）**入口；Lares 目前使用内置的 Haru 角色。

关于兼容范围、`lares/1` 清单格式、锚点与接线的写法和命令行开发流程，
请参阅[角色包指南](docs/zh-CN/character-format.md)。

## 开发

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 以开发模式运行 Lares |
| `pnpm test` | 运行 Vitest 测试套件 |
| `pnpm build` | 执行类型检查并构建生产版本 |
| `pnpm fetch-assets` | 将 Cubism Core 和 Haru 下载到 Git 忽略的路径 |
| `pnpm package:preflight` | 校验本地分发所需的输入 |
| `pnpm package:mac` | 构建未签名的通用 macOS DMG |
| `pnpm package:win` | 构建未签名的 Windows x64 NSIS 安装包 |

## 项目文档

面向使用者的指南在 [`docs/`](docs/) 下，提供英文和简体中文两种版本：

- [`docs/zh-CN/usage.md`](docs/zh-CN/usage.md) — 安装、连接 agent、读懂你的 Lar
- [`docs/zh-CN/development.md`](docs/zh-CN/development.md) — 架构、开发流程，以及
  一次改动必须遵守的规则

产品与设计的权威依据都在 [`sdd/`](sdd/) 下：

- [`sdd/PRD.md`](sdd/PRD.md) — Lares 为何存在
- [`sdd/SPEC.md`](sdd/SPEC.md) — 契约与不变量
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — 里程碑与当前范围
- [`AGENTS.md`](AGENTS.md) — 面向贡献者和编码智能体的仓库地图
- [`docs/zh-CN/distribution.md`](docs/zh-CN/distribution.md) — 未签名构建与全新环境验收

## 许可证

本项目采用 [Apache 2.0](LICENSE) 许可证。Live2D Cubism Core 与随附的角色
资源仍遵循各自的许可条款，详见 [NOTICE](NOTICE)。

## 致谢

Lares 建立在以下项目的成果之上：

- [Live2D Cubism SDK](https://www.live2d.com/en/sdk/about/) — Cubism Core
  与 Framework，© Live2D Inc.，适用 Live2D 自有许可条款（详见
  [NOTICE](NOTICE)）。随附的示例角色 Haru 也是 Live2D 的官方示例模型。
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) —
  在 PixiJS 上渲染 Live2D 模型。
- [PixiJS](https://pixijs.com/) — 舞台背后的 WebGL 渲染器。
- [Electron](https://www.electronjs.org/) — 桌面外壳；开发与打包使用
  [electron-vite](https://electron-vite.org/) 和
  [electron-builder](https://www.electron.build/)。
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
  — 接收第一人称感受汇报的 Model Context Protocol 服务器。
- [Zod](https://zod.dev/) — 所有入口的模式校验。
