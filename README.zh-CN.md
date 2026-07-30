<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — 戴兜帽的家宅精灵">
</p>

<h1 align="center">Lares</h1>

<p align="center">
  <strong>让你的 AI 智能体拥有一张脸。</strong><br>
  适用于 Claude Code 和 Codex 的本地 Live2D 桌面伙伴。
</p>

<p align="center">
  <a href="LICENSE"><img alt="Apache 2.0 许可证" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="早期 alpha" src="https://img.shields.io/badge/status-early_alpha-orange.svg">
  <img alt="macOS 和 Windows" src="https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg">
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

## 它是什么

Lares 将智能体会话变成桌面上持续动画的角色——一个 **Lar**。
你可以看见它思考、卡住、等待、恢复和完成。你不必另开活动面板。

Lares 不读取对话记录。它也不猜测情绪。智能体通过 MCP 以第一人称报告感受。
确定性的生命周期钩子提供基础心跳。情绪和心境在整个会话中保留历史。

`智能体钩子 + MCP → 本地情感引擎 → Live2D 表演`

> [!IMPORTANT]
> Lares 仍处于早期 alpha 阶段。M5a 已完成，但 macOS 和 Windows 的全新环境
> 验收尚未完成。

## 如何使用

启动 Lares。你的 Lar 会出现在桌面上。系统托盘存放控制项。

发行版安装包未签名。在 macOS 上，Gatekeeper 会发出警告。在 Windows 上，
SmartScreen 会发出警告。这是预期行为。开发者付不起 Apple Developer Program
年费（每年 99 美元），所以构建保持未签名——穷是穷，不是安全特性。安装时请按
[分发指南](docs/distribution.md) 中的绕过步骤操作。

在托盘中选择 **Configure Agent Integrations…**。当安装程序询问时，确认
Claude Code 插件或 Codex 插件。

新建一个智能体会话，让钩子和本地 MCP 连接能够加载。Claude Code 可以用
`/reload-plugins` 重新加载插件。Codex 会请你检查 Lares 钩子。当 Codex 询问时，
信任它们。

然后像平常一样工作。Lar 会跟随会话状态和智能体的第一人称情绪表达。使用托盘
切换角色、调整缩放或开启免打扰。

手动配置请参阅 [Claude Code](plugins/claude-code/README.md) 和
[Codex](plugins/codex/README.md) 插件指南。

## 它能做什么

- 以透明、可拖动、始终置顶的浮层常驻桌面。
- 通过 Claude Code 和 Codex 的原生插件系统连接智能体。
- 保持本地运行。守护进程只绑定回环地址。对话记录不会离开你的设备。
- 导入已解压的 VTube Studio 风格 Cubism SDK 3.0–4.2 模型文件夹，并将
  表情映射为可移植的 Lar 角色包。

应用主动发起的唯一网络请求，是已明确披露的 GitHub 更新检查。只有在你请求并
确认后，才会开始下载智能体插件。

## 从源码运行

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`fetch-assets` 会将 Live2D Cubism Core 和 Haru 示例下载到 Git 忽略的路径。
开发期间，Electron 渲染器运行在 `127.0.0.1:5300`。

## 导入自己的 Lar

在托盘中选择 **Import Character…**。选择一个已解压的 Live2D 模型文件夹。
Lares 会将其复制到托管角色库。它在切换前验证该包。它不会改动原始文件夹。

请参阅[角色包指南](docs/character-format.md)，了解兼容范围、`lares/1` 清单格式、
表情映射和命令行导入流程。

## 开发

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 以开发模式运行 Lares |
| `pnpm test` | 运行主进程侧的 Vitest 测试 |
| `pnpm build` | 执行类型检查并构建生产版本 |
| `pnpm fetch-assets` | 将 Cubism Core 和 Haru 下载到 Git 忽略的路径 |
| `pnpm package:preflight` | 验证本地分发输入 |
| `pnpm package:mac` | 构建未签名的通用 macOS DMG |
| `pnpm package:win` | 构建未签名的 Windows x64 NSIS 安装程序 |

## 项目文档

产品和设计的事实来源位于 [`sdd/`](sdd/)：

- [`sdd/PRD.md`](sdd/PRD.md) — Lares 为何存在
- [`sdd/SPEC.md`](sdd/SPEC.md) — 契约与不变量
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — 里程碑与当前范围
- [`AGENTS.md`](AGENTS.md) — 面向贡献者和编码智能体的仓库地图
- [`docs/distribution.md`](docs/distribution.md) — 未签名构建与全新环境验收

## 许可证

本项目采用 [Apache 2.0](LICENSE) 许可证。Live2D Cubism Core 和随附角色资源
保留各自的许可条款。详见 [NOTICE](NOTICE)。
