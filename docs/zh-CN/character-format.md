# 角色包格式

[English](../en/character-format.md) · [简体中文](../zh-CN/character-format.md)

> 英文版为准。译文与英文不一致时，以[英文原文](../en/character-format.md)为准。

一个 Lar 就是 `characters/<名字>/` 下的一个目录。它的运行时模型文件放在 `runtime/`
里；`lar.character.json` 是 Lares 的一层轻量映射。它指明模型，并把角色自身的骨骼
参数接到 Lares 那套渲染器无关的表演通道上。Lares 绝不修改作者的模型文件或模型索引。

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
  "anchors": {
    "neutral": { "eyeOpen": 0.2 },
    "+++": { "mouthCurve": 1, "browRaise": 0.6 },
    "---": { "mouthCurve": -1, "browRaise": -0.6, "gazeHeight": -0.5 }
  },
  "operational": {
    "awaiting_input": { "browRaise": 0.5, "gazeHeight": 0.8 },
    "error": { "browKnit": 0.7, "mouthCurve": -0.4 }
  },
  "renderers": {
    "live2d": {
      "model": "runtime/Example.model3.json",
      "performance": {
        "params": [
          { "id": "ParamMouthForm", "source": "mouthCurve", "gain": 1, "offset": 0 },
          { "id": "ParamBrowLY", "source": "browRaise", "gain": 0.8, "offset": 0 }
        ],
        "idle": {
          "breath": { "id": "ParamBreath", "basePeriodMs": 4000, "amplitude": 1 },
          "blink": { "ids": ["ParamEyeLOpen", "ParamEyeROpen"], "baseIntervalMs": 3500, "durationMs": 160 },
          "sway": { "id": "ParamBodyAngleX", "baseAmplitude": 6, "periodMs": 5000 }
        }
      }
    }
  }
}
```

- `identity.name` 和 `identity.license` 为必填。请把模型要求的声明写进 `license`。
- `renderers.live2d.model` 是指向 `.model3.json` 的包内相对路径。
- `anchors` 为可选项，可以覆盖九个已授权姿态中的任意子集——`neutral` 加上立方体
  的八个角，按符号顺序（valence、activation、control）排列：`+++`、`++-`、`+-+`、
  `+--`、`-++`、`-+-`、`--+`、`---`。每个键下是一个通道值的部分对象，取值范围
  `[-1, 1]`。包里没写的通道会回退到内置的默认锚点。完全没有 `anchors` 块的包会
  整体使用内置默认值。
- `operational` 为可选项，合并规则相同，用于两个会视觉呈现的状态：
  `awaiting_input` 和 `error`。
- 十二个表演通道分别是 `mouthCurve`、`mouthOpen`、`browRaise`、`browKnit`、
  `eyeOpen`、`gazeHeight`、`headPitch`、`lean`、`swayAmplitude`、`breathRate`、
  `breathDepth`、`blinkRate`。它们命名的是可观察的身体行为，绝不直接对应骨骼参数。
- `renderers.live2d.performance.params[]` 把一个骨骼参数接到一个通道：`id`
  （Live2D 参数）、`source`（通道名）、`gain` 和 `offset`。`idle` 用对应通道去
  缩放呼吸、眨眼和摇摆这几个写入器。没有 `performance` 块的包会使用内置的默认
  接线——同一套标准 Cubism 参数 ID，重新接到通道上——因此标准命名的导入包无需
  任何校准即可正确表现；命名不规范的骨骼在这些参数上则接不上任何东西，需要手写
  接线。
- `expressions`、`cueMappings` 和 `renderers.live2d.cues` 已从格式中退役。清单
  仍然可以带着它们，作为不起作用的 JSON——Lares 不再为它们提供任何专门处理，也
  不提供向后兼容。

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
`.exp3.json` 和 `.motion3.json` 文件，按归一化的包内相对路径去重，并用完整的相对
路径来区分同名文件。散落的 `.physics3.json` 只有一个时作为兜底；多个则视为歧义。
缺少 MOC 或贴图会阻止导入。缺少姿势、用户数据、显示信息、命中区域或动作音频，会作为
具名降级或警告被报告。

`--check` 打印的 JSON 报告包含所选入口点、必需与可选资源、已注册与散落资源、被忽略的
VTS 元数据、performance 参数 ID，以及全部错误、警告和降级项。运行时加载还会追加 Core
的 MOC 版本、参数与分组清单、动作分组，以及渲染器贴图上限和探测到的贴图尺寸。

## 导入一个模型

1. 创建 `characters/<名字>/runtime/`，把完整的模型目录放进去，包括它的
   `.model3.json`、贴图、表情和动作。
2. 在仓库根目录导入该包：

   ```sh
   pnpm run import -- characters/<名字>
   ```

   导入会找到包里唯一的 `.model3.json`，并写出一个只指明模型的最小
   `lar.character.json`。如果目录树里有零个或多个模型文件，导入会拒绝——猜测只会
   猜错。

3. 你可以随时查看而不写入任何改动：

   ```sh
   pnpm run import -- --check characters/<名字>
   ```

   检查模式会指出损坏的文件，并展示完整的资源清单——已注册和散落的表情、动作、
   物理文件——与任何接线无关。加载该包之前，请先修复报告中的路径或格式错误的
   表情文件。

4. 启动 Lares 并选中该角色。它会立即演出内置的默认锚点和接线，无需任何校准。

## 手写锚点和接线

应用内的校准工作流——由 agent 预览姿态和接线——已在规划中，但尚未实现。在它
出现之前，想让角色更贴合自己的表情，就需要对照上面的通道列表，手工编辑清单里的
`anchors` 和 `renderers.live2d.performance`，改完后重新运行 `--check` 校验。
Lares MCP 服务上的 `list_parameters` 和 `preview_expression` 可以让 agent 查看
实机模型的参数，并把一组精确的参数值保持在屏幕上供你查看，但两者都不会写入清单
文件——文件的编辑权始终在你手里。

## Haru 是随包默认角色

Haru 是构建时选定的默认角色，出厂即带有自身骨骼参数的接线，已重新接到十二个表演
通道上——无需任何校准步骤。没有 `performance` 块的角色则会回退到内置的标准 ID
接线；无论哪种情况，`renderers.live2d.performance` 都是可选项，包的加载从不要求
它存在。
