# 分发

[English](../en/distribution.md) · [简体中文](../zh-CN/distribution.md)

> 英文版为准。译文与英文不一致时，以[英文原文](../en/distribution.md)为准。

Lares 的安装包刻意不做签名。Gatekeeper 和 SmartScreen 的警告是预期行为，具体的绕过
步骤见下文。M5a 的产物为全新机器测试而手工构建；M5b 通过 GitHub Releases 发布形态
相同的未签名产物。

## 自动公开发布

推送到 `master` 的 `package.json` 语义化版本号提升，是唯一的自动发布信号。修正、
降版本，以及其他代码、依赖或文档推送都不会触发打包。手动运行会为 `master` 上的当前
版本打包：

```sh
gh workflow run release.yml --ref master
```

测试和两个原生包检查全部通过后，GitHub Actions 会在该提交上创建 `v<版本号>`，发布
两个安装包及其 SHA-256 文件，并把版本号中含 `-` 的标记为预发布。若标签已存在，流程
会失败，而不会移动或覆盖它。

## 构建与检查

在目标操作系统上，从一份干净的检出开始运行：

```sh
pnpm install
pnpm fetch-assets
pnpm package:preflight
```

`build/default-character` 明确指定随包附带的角色包。只有当某个包已获得再分发许可、
并自带 `NOTICE` 时，才可以改动这一行选择；preflight 会拒绝缺失 notice 或运行时引用
无效的情况。

在 macOS 13 及以上：

```sh
pnpm package:mac
pnpm package:inspect -- dist/mac-universal/Lares.app darwin universal
lipo -archs dist/mac-universal/Lares.app/Contents/MacOS/Lares
shasum -a 256 dist/Lares-*-macOS-universal-unsigned.dmg
```

检查器必须通过，且 `lipo` 必须同时打印 `x86_64` 和 `arm64`。

在 x64 Windows 10/11：

```powershell
pnpm package:win
pnpm package:inspect -- dist\win-unpacked win32 x64
Get-AuthenticodeSignature .\dist\Lares-*-Windows-x64-unsigned.exe
Get-FileHash .\dist\Lares-*-Windows-x64-unsigned.exe -Algorithm SHA256
```

检查器必须通过，解包后的应用载荷必须报告为 x64，签名状态则预期为 `NotSigned`。

这个机械检查器会读取打包后的 ASAR 和可执行文件。它要求存在应用本体、钩子转发器、
Cubism Core、恰好一个选定的 `default-character`、该角色专属的 `NOTICE`、`LICENSE`
以及应用的 `NOTICE`；它会拒绝整棵 `characters/` 目录树、IceGirl、多余的角色清单，
以及 `.cmo3`/`.can3` 源文件。

## 仅限本地的安装入口

这些脚本从不下载任何内容，产物路径必须显式给出。

```sh
./scripts/install-local.sh install "/absolute/path/Lares-0.1.0-alpha.4-macOS-universal-unsigned.dmg"
./scripts/install-local.sh uninstall
```

macOS 的卸载动作会打开 Lares 自带的确认框。**同时删除 Lares 数据**默认不勾选。
Lares 没有托盘卸载入口：如果 Lares 正在运行，该命令会拒绝执行并提示
`Lares is already running; quit it and run --uninstall again`。请先退出它，再重复该命令。

```powershell
.\scripts\install-local.ps1 install "C:\local\Lares-0.1.0-alpha.4-Windows-x64-unsigned.exe"
.\scripts\install-local.ps1 uninstall
.\scripts\install-local.ps1 uninstall -DeleteData
```

PowerShell 夹具使用 NSIS 静默模式：不加 `-DeleteData` 表示保留数据，加上则删除数据。
「应用和功能」以及随包附带的 `Uninstall Lares.exe`，使用的是原生的、默认不勾选的复选框。

自动化检查会把每个目标位置重定向到临时夹具根目录。运行 Windows 原生夹具：

```powershell
.\scripts\install-local.windows.test.ps1
```

## macOS 全新机器验收 —— 尚未认领

请使用一台运行 macOS 13 或更高版本的干净 Apple Silicon Mac。

1. 传输 DMG，并与构建机器核对它的 SHA-256。
2. 打开 DMG，把 **Lares.app** 复制到 `/Applications`，然后尝试打开它。
3. 出现未签名/未公证警告属于预期。在这次被拦截的尝试之后，打开**系统设置 → 隐私与
   安全性**，滚动到「安全性」，选择**仍要打开**，完成认证，然后在再次出现的提示中
   选择**打开**。Apple 提醒仅在信任来源和完整性时才使用该覆盖；参见
   [从身份不明的开发者处打开 Mac App](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)
   与[安全地打开 Mac 上的 App](https://support.apple.com/zh-cn/102445)。
4. 确认 Lares 以托盘模式启动：有托盘图标，无 Dock 图标，无设置窗口。
5. 导入一个真实的、已解压的 Live2D 目录。再次导入同名包；确认两者分别显示为 `名字`
   和 `名字 (2)`，切换是实时的，且损坏的候选包不会影响正在显示的 Lar。
6. 更改角色、缩放、勿扰、开机启动、位置和自动更新偏好。重启后确认每项设置都被保留。
   确认勿扰只隐藏身体，且**重置位置**使用主显示器。
7. 在 harness 会话中调用 `feel`，确认 Lar 缓动到所报告的三元组并保持住——不会
   漂回中性，且紧接着的第二次调用会被拒绝并给出需等待的时间。在同一会话中提交
   新的提示词，确认写有上次三元组的检查点行送达模型。重启 Lares，确认无需新的
   调用即可恢复同样的表演。
8. 选择 **配置 Agent 集成…** 并取消一次；确认没有发生任何市场或插件变更。再选一次，
   接受已披露的下载，确认两个已安装的工具都报告为已配置。启动新的 Claude Code 会话
   （或运行 `/reload-plugins`）。在 CLI 或 ChatGPT 桌面应用中启动新的本地 Codex 任务，
   并通过 `/hooks` 复查并信任 Lares。确认两者都能驱动基线状态，并能通过插件的 MCP
   入口发出 agent 的 `feel` 报告。如果这台机器曾运行过 009 之前的构建，还需确认首次启动已
   清除遗留的 Claude settings/MCP 块和 Codex 钩子文件。
9. 运行一次 **检查更新…**。这是唯一一次由应用发起的、指向
   `https://api.github.com/repos/Xyri1/lares/releases/latest` 的已披露请求；确认手动
   检查的失败或无更新结果可见，且没有下载或安装任何更新。
10. 退出 Lares，然后运行 `/Applications/Lares.app/Contents/MacOS/Lares --uninstall`
    （或 `./scripts/install-local.sh uninstall`）。保持**同时删除 Lares 数据**不勾选，然后确认。确认应用本体、
    任何遗留的 Codex 钩子文件和 Claude settings/MCP 条目，以及启动器 shim 都已移除，
    而导入的角色、设置和位置仍保留在 Lares 的应用支持目录中。
    Claude Code 与 Codex 插件属于用户安装，会保留下来；请按各自 README 的说明，用
    `/plugin uninstall lares@lares`（Claude Code）和 `/plugins`（Codex）移除它们。
11. 重新安装，确认保留的数据被复用。再次卸载，这次勾选**同时删除 Lares 数据**；确认
    同样的集成都已移除，且 Lares 的应用支持目录已被删除。

结论：**尚未认领 —— 维护者必须记录真实机器上的结果。**

## Windows 全新机器验收 —— 尚未认领

请使用一台干净的 x64 Windows 10 或 Windows 11 机器。

1. 传输 NSIS 安装包，并与构建机器核对它的 SHA-256。
2. 运行它。未签名构建预期会显示 **Windows 已保护你的电脑**；选择**更多信息 → 仍要
   运行**，然后完成安装。微软在
   [面向 Windows 应用开发者的 SmartScreen 信誉说明](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
   中说明未签名应用需要**仍要运行**，且企业策略可以禁用该绕过路径；其自身的示例安装
   指引也展示了[更多信息 → 仍要运行](https://learn.microsoft.com/en-us/windows/mixed-reality/design/add-custom-home-environments#trying-a-sample-environment)。
   如果策略或智能应用控制移除了该选项，请把这台机器上的验收记录为「受阻」；不要为了
   制造一个虚假的通过结果而关闭系统级保护。
3. 重复 macOS 的第 4 至 9 步：托盘模式启动、真实导入、同名包与实时切换、持久化与重启、
   勿扰与重置、两个工具的插件安装、Codex 钩子信任，以及那一次已披露的在线更新
   请求。
4. 退出 Lares，然后从「应用和功能」或随包附带的 `Uninstall Lares.exe` 启动卸载。
   保持**同时删除 Lares 数据**不勾选。确认应用及其
   拥有的集成已移除，而 `%APPDATA%\Lares` 中的数据被保留（用户安装的插件保留下来；
   用 Claude Code 的 `/plugin uninstall lares@lares` 和 Codex 的 `/plugins` 移除）。
5. 重新安装，确认保留的数据被复用，然后勾选该复选框再次卸载。确认集成和 Lares 的应用
   数据目录都已消失。

结论：**尚未认领 —— 维护者必须记录真实机器上的结果。**
