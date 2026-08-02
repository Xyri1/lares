# 使用指南

[English](../en/usage.md) · [简体中文](../zh-CN/usage.md)

本指南说明如何安装 Lares、如何将它连接到你的 agent，以及如何读懂你的 Lar。

角色包格式见[角色包指南](character-format.md)；构建与安装包见[分发指南](distribution.md)；
修改 Lares 源码见[开发指南](development.md)。

> 英文版为准。译文与英文不一致时，以[英文原文](../en/usage.md)为准。

---

## 1. Lares 是什么

Lares 是一个桌面伙伴，它给你的 AI agent 一张脸。这张脸就是 **Lar**：一个显示在
透明悬浮窗里的 Live2D 角色。

Lar 展示你各个 agent 会话的状态。你可以看出 agent 正在工作、失败了、在等你回话，
还是已经完成。你不需要再开第二个窗口。

Lares 通过两条渠道获取信息：

| 来源 | 提供什么 | 由谁发送 |
| --- | --- | --- |
| 生命周期钩子 | 每个会话的基线状态 | 工具（harness） |
| MCP `feel` 调用 | 第一人称的状况评估——valence、activation、control | agent 本身 |

整条链路是 `agent 的状况评估（feel）+ 钩子 → 角色表演 → Live2D`。

以下三条限制始终成立：

- Lares 不读取你的对话记录。
- Lares 不从你的文本里猜测情绪。
- Lares 把全部会话数据留在本机。本地服务只接受来自 `127.0.0.1` 的连接。

唯一的例外是第 9 节说明的更新检查。

---

## 2. 安装 Lares

### 第一步 —— 下载

从[最新发布页](https://github.com/Xyri1/lares/releases/latest)下载对应系统的安装包。

Lares 支持 macOS 13 及以上版本，以及 x64 架构的 Windows 10 / Windows 11。

### 第二步 —— 通过系统警告

安装包未签名，两个系统都会拦下首次启动。macOS 会直接拒绝，提示
「Apple 无法验证“Lares”是否包含……恶意软件」，并且只给出**移到废纸篓**这一个动作。
不要点它。

各系统的确切步骤见 [README 的安装章节](../../README.zh-CN.md#安装)，那里是这些步骤
唯一的维护点。

若想先验证下载文件，请把它的 SHA-256 校验值与发布页中的校验文件比对。

### 第三步 —— 启动 Lares

启动 Lares，你的 Lar 就会出现在桌面上。Lares 只驻留在托盘：有托盘图标，但没有
Dock 图标、没有任务栏按钮、也没有设置窗口。所有控制项都在托盘菜单里。

拖动 Lar 可以移动它。身体以外的透明区域会让点击穿透。

---

## 3. 连接你的 agent

Lares 支持两种工具：**Claude Code** 和 **Codex**。

### 自动配置

1. 打开托盘菜单。
2. 选择 **配置 Agent 集成…**。
3. 阅读说明。它会写明公开下载、钩子和本地 MCP 连接三件事。
4. 选择 **配置**。

随后 Lares 会调用它找到的每个工具自带的插件管理器，安装 Lares 市场插件。Lares
绝不改写工具的配置文件，也绝不绕过信任提示。

结果对话框为每个工具显示一行。如果没有找到插件管理器，选择 **复制手动命令**，
然后使用下面的命令。

### 手动配置

Claude Code：

```sh
claude plugin marketplace add Xyri1/lares --scope user
claude plugin install lares@lares --scope user
```

Codex：

```sh
codex plugin marketplace add Xyri1/lares --json
codex plugin add lares@lares --json
```

### 重新加载你的工具

工具只在会话开始时读取钩子和 MCP 配置。你当前的会话看不到新插件。

- **Claude Code**：开启新会话，或运行 `/reload-plugins`。
- **Codex**：在 CLI 或 ChatGPT 桌面应用里新建任务。Codex 会请你信任 Lares 的钩子，
  请予以信任。你也可以用 `/hooks` 复查。

Codex CLI、Codex IDE 扩展和 Codex 桌面应用共用同一个 Codex 主目录，安装一次即可
三处生效。

之后照常工作即可，Lar 会跟随你的会话。

---

## 4. 读懂你的 Lar

### 基线状态

每个会话有一个状态。Lares 按下表把工具事件映射为状态：

| 工具事件 | 状态 |
| --- | --- |
| SessionStart、UserPromptSubmit | thinking（思考） |
| PreToolUse、PostToolUse | working（工作） |
| 权限请求 | awaiting_input（等待输入） |
| Stop，且无错误 | done（完成） |
| 工具失败 | error（出错） |
| SubagentStart、SubagentStop | working，并附子 agent 计数 |

### 一个 Lar 对应全部会话

你只有一个 Lar，但可以同时跑很多会话。Lar 显示所有活跃会话中最需要你处理的那个
状态：

```
awaiting_input > error > working > thinking > done > idle
```

等你回话的会话，绝不会被正在工作的会话遮蔽。你回应之后，较低的状态会在一秒内恢复。

### 表情会保持到 agent 再次汇报为止

没有衰减，也没有心情平均值。Lar 会一直演出 agent 最近一次 `feel` 汇报——
valence、activation、control——直到新的一次覆盖它，不论中间隔了多久。沉默
不是信号：汇报之后三分钟没有动静，Lar 演出的仍是同一个表情，而不会漂回中性。

在会话的第一次汇报之前，Lar 会演出一个静息的中性姿态。这不代表 agent 有
某种感受——它只是「还没有汇报」时的样子。

无论最近一次汇报是什么，**awaiting_input（等待输入）**和 **error（出错）**
这两个状态仍会叠加显示：表现为当前姿态之上更警觉、更紧绷的一层叠加，会话
翻篇后会褪去，露出底下未曾改变的表情。

---

## 5. 托盘菜单

| 菜单项 | 作用 |
| --- | --- |
| **角色** | 选择当前 Lar。该子菜单中还有**导入角色…**和**打开角色目录** |
| **缩放** | 设置 Lar 大小：50%、75%、100%、125% 或 150% |
| **勿扰模式** | 隐藏 Lar |
| **开机启动** | 登录系统时自动启动 Lares |
| **重置位置** | 把 Lar 移到主显示器右下角 |
| **自动检查更新** | 启用或关闭每日检查 |
| **检查更新…** | 立即检查 |
| **配置 Agent 集成…** | 安装工具插件 |
| **语言** | 选择「System」、「English」或「简体中文」 |
| **退出** | 停止 Lares |

托盘中没有卸载入口，见第 10 节。

说明：

- **勿扰模式**只隐藏身体。服务和会话表都继续运行。关闭勿扰后，Lar
  立即显示当前状态。
- **开机启动**和**勿扰模式**默认关闭；自动检查更新默认开启。
- Lares 会保存每一项设置，重启后依然生效。

---

## 6. 更换你的 Lar

### 导入角色

1. 解压你的 Live2D 模型目录。
2. 从托盘选择 **导入角色…**。
3. 选中该目录。

Lares 会把目录复制进受管理的角色库，不会改动你的原始目录。

Lares 接受一个完整的 Lares 包，或一个恰好包含一个 `.model3.json` 文件的原始模型
目录树。如果目录树里有零个或多个模型文件，Lares 会拒绝导入 —— 猜测只会猜错。

Lares 先校验包，再加载它。若加载失败，当前的 Lar 继续运行。切换角色会保留你的会话、
情感状态、位置、缩放和勿扰设置。

两个角色可以同名，托盘会给第二个加上编号：`名字` 和 `名字 (2)`。

支持的运行时为 Cubism SDK 3.0 至 4.2。Lares 拒绝 Cubism 2.1 以及 MOC 版本 5 及以上。

### 校准角色

新导入的角色会立即演出内置的默认姿态锚点——无需任何校准，从第一个会话起
每根轴都能正确表现。

如果想让角色更贴合自己的表情，可以在清单里手写 `anchors` 和
`renderers.live2d.performance` 接线。应用内的校准工作流——由 agent 预览
并映射——已在规划中，但尚未实现。

[角色包指南](character-format.md)包含清单文件结构、通道表和命令行导入流程。

---

## 7. 你的 agent 可以调用什么

Lares 的 MCP 服务向 agent 提供以下工具：

| 工具 | 作用 |
| --- | --- |
| `feel` | 汇报 agent 当前的感受，三个整数：valence、activation、control |
| `status` | 报告当前角色、协议版本，以及调用者自己最近一次汇报 |
| `list_parameters` | 在预览之前，列出已加载模型的参数 |
| `preview_expression` | 在实机角色上保持一组精确的原始参数；仅限用户显式发起 |

`feel` 是运行期唯一的情感动作。服务会告诉 agent 何时该调用它：只在它对
工作的评估真正发生变化时调用一次，或者在你直接问它感受如何时调用一次——
绝不随每次工具调用或按固定节奏调用。

所有上限都由服务端强制执行，agent 无法突破：

| 限制项 | 数值 |
| --- | --- |
| 轴 | 三个必填整数，各在 −2 到 2 之间：valence、activation、control |
| 汇报频率 | 每个被归属会话每 2 秒一次 `feel` 调用 |
| 预览参数 | 每次 `preview_expression` 调用最多 24 个 |
| 预览保持时长 | 60 秒后自动撤销 |

格式错误的 `feel` 调用——浮点数、超范围整数、缺失或多余的轴——会让整次调用
失败，且不改变上一次汇报。来得太快的调用会被拒绝，并附带剩余等待时间；
无论哪种情况，agent 的任务都会继续。

---

## 8. 故障排查

**Lar 对我的 agent 没有反应。**
请开启新的 agent 会话。工具只在会话开始时读取钩子。Claude Code 中运行
`/reload-plugins` 同样有效；Codex 中请确认你已信任钩子。

**Lares 提示端口被占用。**
Lares 使用 21473 端口。它会明确报错，而不会改用空闲端口 —— 因为已注册的 MCP 地址
里写死了端口号。请关闭占用该端口的程序。

你可以用 `LARES_PORT` 环境变量改端口，但工具插件的配置里写的是
`127.0.0.1:21473`。改端口后钩子仍然工作，MCP 连接则会失败。因此更推荐腾出端口。

**我的 agent 报告连接错误。**
Lares 没有运行，请启动它。你的 agent 回合不受影响：钩子会静默退出，MCP 工具也会
提示 agent 不作说明、继续执行。

**Lar 不见了。**
检查托盘里的**勿扰模式**。也试试**重置位置**：你的 Lar 可能停在一台已断开的显示器上。

**点击穿透了我的 Lar。**
这是透明区域的正确行为。身体本身可以点击和拖动。

**我的角色表演看起来很通用。**
它正在使用内置的默认姿态锚点。请在清单里手写 `anchors` 和
`renderers.live2d.performance` 接线，见第 6 节。

---

## 9. 隐私

Lares 把你的数据留在本机：

- 本地服务只绑定 `127.0.0.1`，并拒绝任何带 `Origin` 头的请求。
- Lares 不发送任何遥测数据。
- Lares 不读取对话记录，也不读取任何工具的文件。
- Lares 只感知工具或 agent 主动发给它的内容。

Lares 自身只发起一种网络请求：更新检查。它在每次启动时、以及运行期间每 24 小时
读取 `https://api.github.com/repos/Xyri1/lares/releases/latest`。你可以在托盘里
关闭该检查。Lares 只做通知并打开发布页面，绝不自行下载或安装更新。

第 3 节的插件安装同样会联网下载，但只在你主动要求并确认之后才开始。

---

## 10. 卸载 Lares

请先退出 Lares，然后启动卸载：

- **Windows**：使用「应用和功能」，或在安装目录中运行 `Uninstall Lares.exe`。
- **macOS**：带 `--uninstall` 参数运行应用的可执行文件。

```sh
/Applications/Lares.app/Contents/MacOS/Lares --uninstall
```

`scripts/install-local.sh uninstall` 这个辅助脚本执行的就是同一条命令。

随后 Lares 会请你确认。卸载总是移除：

- Lares 应用本身。
- Lares 的钩子、MCP 条目和启动器 shim。

对话框中有一个**同时删除 Lares 数据**复选框，默认不勾选：

| 复选框 | 结果 |
| --- | --- |
| 不勾选 | 保留你的角色、设置和窗口位置。重新安装后会继续沿用。 |
| 勾选 | Lares 删除上述全部数据。 |

工具插件属于你，卸载后仍然保留。请自行移除：

- Claude Code：`/plugin uninstall lares@lares`
- Codex：`/plugins`

没有 Lares，这些钩子和 MCP 条目将指向空处。
