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

Lares 将智能体会话变成桌面上持续动画的 Live2D 角色——一个 **Lar**。
无须另开活动面板，你一眼就能看出它正在思考、遇到困难、等待、恢复，
还是已经完成任务。

Lares 不读取对话记录，也不猜测情绪。智能体通过 MCP 以第一人称表达感受，
确定性的生命周期钩子提供基础状态；情绪和心境则在整个会话中延续历史。

`智能体钩子 + MCP → 本地情感引擎 → Live2D 表演`

> [!IMPORTANT]
> Lares 仍处于早期 alpha 阶段。M5a 已完成实现，但尚未通过 macOS 和
> Windows 全新环境验收。安装包有意保持未签名。

## 如何使用

1. 启动 Lares。Lar 会出现在桌面上，所有控制项都位于系统托盘。
2. 在托盘中选择 **Configure Agent Integrations…**，确认安装 Claude Code
   或 Codex 插件。
3. 新建一个智能体会话，让钩子和本地 MCP 连接生效。Claude Code 可以运行
   `/reload-plugins` 重新加载；Codex 会请你检查并信任 Lares 钩子。
4. 像平常一样工作。Lar 会跟随会话状态和智能体的第一人称情绪表达；你可以
   通过托盘切换角色、调整缩放或开启免打扰。

手动配置请参阅 [Claude Code](plugins/claude-code/README.md) 和
[Codex](plugins/codex/README.md) 插件指南。

## 它能做什么

- 以透明、可拖动、始终置顶的浮层常驻桌面。
- 通过 Claude Code 和 Codex 的原生插件系统连接智能体。
- 保持本地运行：守护进程只绑定回环地址，对话记录不会离开你的设备。
- 导入已解压的 VTube Studio 风格 Cubism SDK 3.0–4.2 模型文件夹，并将
  表情映射为可移植的 Lar 角色包。

应用主动发起的唯一网络请求，是已明确披露的 GitHub 更新检查。只有在你主动
请求并确认后，才会下载智能体插件。

## 从源码运行

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`fetch-assets` 会将 Live2D Cubism Core 和 Haru 示例下载到 Git 忽略的路径。
开发模式下，Electron 渲染器运行在 `127.0.0.1:5300`。

## 导入自己的 Lar

在托盘中选择 **Import Character…**，然后选择一个已解压的 Live2D 模型文件夹。
Lares 会先将其复制到托管角色库并完成验证，再切换角色；原始文件不会被修改。

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
保留各自的许可条款，详见 [NOTICE](NOTICE)。
