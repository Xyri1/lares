# 角色包格式

[English](../en/character-format.md) · [简体中文](../zh-CN/character-format.md)

> 英文版为准。译文与英文不一致时，以[英文原文](../en/character-format.md)为准。

一个 Lar 就是 `characters/<名字>/` 下的一个目录。它的运行时模型文件放在 `runtime/`
里；`lar.character.json` 是 Lares 的一层轻量映射。它指明模型，并把作者提供的表情或
动作（以及你创作的任何表情）映射到情感坐标。Lares 绝不修改作者的模型文件或模型索引。

## 清单文件

`lar.character.json` 使用 `lares/1` 格式：

```json
{
  "format": "lares/1",
  "identity": {
    "name": "Example Lar",
    "author": "Model author; Lares package by you",
    "license": "The model's applicable license notice"
  },
  "expressions": {
    "surprised": { "valence": -0.1, "arousal": 0.85 },
    "wave": { "valence": 0.45, "arousal": 0.6 },
    "weary": { "valence": -0.35, "arousal": 0.15 },
    "neutral": { "valence": 0.1, "arousal": 0.25 }
  },
  "renderers": {
    "live2d": {
      "model": "runtime/Example.model3.json",
      "cues": {
        "surprised": { "expression": "runtime/expressions/驚き.exp3.json" },
        "wave": { "motion": "runtime/motions/wave.motion3.json" },
        "weary": { "expression": "authored/weary.exp3.json" },
        "neutral": { "params": { "ParamMouthForm": 0, "ParamEyeLOpen": 1 } }
      }
    }
  }
}
```

- `identity.name` 和 `identity.license` 为必填。请把模型要求的声明写进 `license`。
- `renderers.live2d.model` 是指向 `.model3.json` 的包内相对路径。
- 每个 cue 只能有一个来源：`expression`（包内相对的 `.exp3.json` 路径）、`motion`
  （包内相对的 `.motion3.json` 路径），或 `params`（参数 ID 到数值的映射）。
- `expressions` 把 cue 名字映射为 `{ "valence", "arousal" }`。valence（效价）取值
  在 `-1` 到 `1` 之间，arousal（唤醒度）在 `0` 到 `1` 之间。导入的 cue 初始为 `null`：
  它们可以被直接播放，但在映射完成前，自主情感选择器会忽略它们。
- 新表情请创作在 `authored/<名字>.exp3.json` 下，并作为 `expression` 类型的 cue
  引用。不要覆盖随包附带的文件。
- `renderers.live2d.performance` 可以包含与 `presets/default.json` 相同的 `params`
  和 `idle` 映射结构。生产环境使用当前角色的映射；预设仅作为开发面板的覆盖项。

## 兼容性边界

Lares 支持 VTube Studio 风格的模型资源目录，但不支持 VTube Studio 的配置、追踪、
快捷键、道具或特效。`.vtube.json` 会被报告并忽略。

兼容性由 Cubism Core 直接从 MOC 判定：

| Core MOC 值 | 运行时 | 结果 |
| --- | --- | --- |
| 1 | SDK 3.0–3.2 | 支持 |
| 2 | SDK 3.3 | 支持 |
| 3 | SDK 4.0 | 支持 |
| 4 | SDK 4.2 | 支持 |
| 5 及以上 | SDK 5.x+ | 拒绝 |
| 未知或格式错误 | 未知 | 拒绝 |

`.moc3` 扩展名和模型 JSON 中的 `Version` 都不能证明兼容性。应用会在 pixi 复原模型
之前先探测 Core。

`FileReferences` 负责 MOC、贴图和已注册的附属文件。导入时还会递归扫描散落的
`.exp3.json` 和 `.motion3.json` 文件，按归一化的包内相对路径去重，并用相对路径作为
cue 名字来区分同名文件。散落的 `.physics3.json` 只有一个时作为兜底；多个则视为歧义。
缺少 MOC 或贴图会阻止导入。缺少姿势、用户数据、显示信息、命中区域或动作音频，会作为
具名降级或警告被报告。

`--check` 打印的 JSON 报告包含所选入口点、必需与可选资源、已注册与散落资源、被忽略的
VTS 元数据、performance ID，以及全部错误、警告和降级项。运行时加载还会追加 Core 的
MOC 版本、参数与分组清单、动作分组，以及渲染器贴图上限和探测到的贴图尺寸。

## 导入并映射一个模型

1. 创建 `characters/<名字>/runtime/`，把完整的模型目录放进去，包括它的
   `.model3.json`、贴图、表情和动作。
2. 在仓库根目录导入该包：

   ```sh
   pnpm run import -- characters/<名字>
   ```

   导入会递归扫描 `runtime/` 下的 `.exp3.json` 和 `.motion3.json`。存在模型索引条目
   时也会一并读取，然后写出 `lar.character.json`，为每个发现的文件生成一个空坐标 cue。
   名字（包括中日韩文字）原样保留。

3. 你可以随时查看而不写入任何改动：

   ```sh
   pnpm run import -- --check characters/<名字>
   ```

   检查模式会指出损坏的文件，并显示随包、动作、创作、已校准和未校准的 cue 数量。加载
   该包之前，请先修复报告中的路径或格式错误的表情文件。

4. 启动 Lares，然后用一个支持 MCP 的 agent 预览并映射导入的 cue。预览是视觉过程：
   请保持角色可见，并与坐在桌前的人一起做映射决定。

## 可直接复制的映射流程

角色加载完成后，把下面这段提示词交给 agent。

> 这段提示词与应用复制到剪贴板的文本逐字一致，因此保持英文原文，请勿翻译后使用。

```text
You are mapping the active Lares character's expression cues with the user
watching the desktop. First call list_cues and list_parameters, then tell
the user the plan: which cues you will map from their names alone, which
you propose to discard, and which few need their eyes. Progress saves per
cue; stopping at any point is fine.

Cue names are the artist's own labels, in any language, and a clear name
is the artist telling you what the face means. Map each expressively named
cue (Smile, 生气, 疑惑) yourself with category-level coordinates — valence
[-1, 1], arousal [0, 1]; do not ask the user about degree. Preview each
one as you write it so the user can veto a wrong-looking face; silence is
consent. Propose clearly non-emotive cues (outfits, accessories, props,
toggles) as one batch discard; after a single confirmation, remove each
discarded key from both `expressions` and `renderers.live2d.cues` in the
manifest; never delete or rename the artist's asset. Interview only opaque
names (f01, m_03): preview with preview_expression({ cue: "<cue name>" }),
ask the user what it visibly conveys, propose coordinates, confirm, then
call update_expression({ name: "<cue name>", affect: { valence, arousal } }).
Map expressions before motions, and warn the user before each motion
preview: a motion plays once, so they must be watching the character. If
the user wants a clearer cue name, rename the key in both blocks while
leaving its referenced path unchanged.

If the set lacks a useful emotion, use list_parameters, preview_expression
with a small parameter map, ask the user to accept the visible result, then
call save_expression({ name, params, affect }) once to create it. Do not save
until the user accepts it. Never overwrite a bundled cue; choose a new name.
Use preview_expression({}) to revert an expression preview when done.
```

在作者已经表态的地方，确认采用例外制：名字本身有表达力的 cue 直接按名字映射，用户
只需在看到不对劲时否决；只有含义不明的 cue 才走完整的「预览并询问」轮次。丢弃项和
创作的表情仍然通过对话确认。若手边没有 MCP 客户端，用户也可以手工编辑清单文件，改完
之后运行 `--check`。

## 一个完整的示例

导入一个虚构模型后，它的清单文件可能包含一个作者表情（`驚き`）、一个作者动作
（`wave`），以及一个创作补齐的表情（`weary`）：

```json
{
  "expressions": {
    "驚き": { "valence": -0.1, "arousal": 0.85 },
    "wave": { "valence": 0.45, "arousal": 0.6 },
    "weary": { "valence": -0.35, "arousal": 0.15 }
  },
  "renderers": {
    "live2d": {
      "cues": {
        "驚き": { "expression": "runtime/expressions/驚き.exp3.json" },
        "wave": { "motion": "runtime/motions/wave.motion3.json" },
        "weary": { "expression": "authored/weary.exp3.json" }
      }
    }
  }
}
```

这是映射完成后的示意数据。刚导入时，每个坐标条目都是 `null`，直到对着可见的模型完成
映射为止。

## Haru 是随包默认角色

Haru 是构建时选定的默认角色，并且出厂即完成校准。cue 也可以通过 `params` 直接驱动
原始参数，而不引用 `.exp3.json` —— 这是为不附带表情文件的模型准备的应急出口；第三方
模型通常都会提供可供导入的表情和动作。
