# Live2D model distribution shapes

Research for the M5a import flow, 2026-07-29. Sources are first-party Live2D
and VTube Studio documentation and repositories. They establish supported and
officially demonstrated shapes; they do **not** establish how frequently each
shape occurs across third-party marketplaces.

## The formats that exist

### Cubism authoring data

`.cmo3` is an editable Cubism model project and `.can3` is an editable
animation project. They are not runtime entrypoints. Runtime exports use
`.moc3` for the model, `.model3.json` for the model settings/index,
`.motion3.json` for motions, and `.exp3.json` for expressions
([Live2D file types](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)).

Creator archives can therefore contain authoring files as well as a runnable
export. Lares should preserve authoring files when copying a selected folder,
but must locate a runtime `.model3.json`; `.cmo3` or `.can3` alone is not
importable.

### Cubism runtime model folder

Cubism Editor exports `.moc3`, `.model3.json`, and textures by default.
Physics, user data, display information, and other runtime data are optional
exports
([Live2D embedded-data export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)).
The official schema requires `FileReferences.Moc` and
`FileReferences.Textures`; physics, expressions, and motions are optional, and
all references are relative to the `.model3.json`
([Live2D `model3.json` specification](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)).

An official full example looks like:

```text
Mao/
  Mao.model3.json
  Mao.moc3
  Mao.cdi3.json
  Mao.physics3.json
  Mao.pose3.json
  Mao.2048/
    texture_00.png
  expressions/
    *.exp3.json
  motions/
    *.motion3.json
```

Mao's index references its expression files and groups its motions under
`Idle` and `TapBody`
([official Mao folder](https://github.com/Live2D/CubismWebSamples/tree/develop/Samples/Resources/Mao),
[official Mao index](https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/Resources/Mao/Mao.model3.json)).
The official Hiyori runtime folder instead has indexed motions but no
expressions, demonstrating that expression assets cannot be assumed
([official Hiyori folder](https://github.com/Live2D/CubismWebSamples/tree/develop/Samples/Resources/Hiyori)).
Folder names such as `expressions/` and `motions/` are conventions, not the
contract; the index contains relative paths.

### VTube Studio model folder

VTube Studio asks users to place one model folder under `Live2DModels/`. It
looks for the `.model3.json` and creates `<model>.vtube.json` in the same
folder. Expressions and motions may be beside the model files or in any
subfolder
([VTube Studio model loading](https://github.com/DenchiSoft/VTubeStudio/wiki/Loading-your-own-Models)).
VTube Studio-created expressions are saved as `.exp3.json` under that folder,
and its expression picker discovers files in the folder tree
([VTube Studio expressions](https://github.com/DenchiSoft/VTubeStudio/wiki/Expressions-%28a.k.a.-Stickers-or-Emotes%29)).
It likewise reads `.motion3.json` from the model folder or subfolders
([VTube Studio animations](https://github.com/DenchiSoft/VTubeStudio/wiki/Animations)).

Consequently, valid expression and motion files can be loose rather than
listed in `FileReferences`. Import must union the index references with a
recursive `.exp3.json`/`.motion3.json` scan. VTube Studio metadata such as
`.vtube.json`, icons, and sounds may coexist with the Cubism files but is not
part of the Cubism runtime contract.

### Download archives

Live2D's nizima marketplace exports three ZIP deliverables:
`export.zip` (non-editable runtime data), `original.zip` (editable data), and
`preview.zip`. Its instructions explicitly tell creators to unzip, add motion
files/folders, and recompress
([nizima model-posting guide](https://docs.nizima.com/en/guide/item-upload/live2d/)).
ZIP is therefore a real delivery form, but neither Cubism nor VTube Studio
defines a universal archive-root layout. A runtime model folder may be wrapped
by documentation, licenses, authoring files, or another directory.

## Import implications for M5a

1. A ready `lar.character.json` directory is Lares-specific; none of the
   upstream formats will contain it unless someone deliberately packaged a
   Lar.
2. For a raw folder, recursively locate `.model3.json`. Accept exactly one;
   zero means no runtime export, and multiple means an ambiguous bundle that
   requires user selection. Do not guess the first match.
3. Copy the selected source into managed storage without flattening it, then
   preserve the `.model3.json` containing directory and every relative
   dependency it references.
4. Harvest both indexed and loose `.exp3.json`/`.motion3.json` files beneath
   the model root.
5. Folder-only import is compatible with Cubism and VTube Studio after the
   user unzips a download. Direct ZIP import is a separate convenience, not a
   format requirement; add it only if M5a explicitly takes on safe extraction.

The defensible statement is: **a runnable Live2D delivery is centered on a
`.model3.json` plus its relative assets, commonly carried as a model folder or
ZIP; expressions and motions may be indexed or loose.** The sources do not
support claiming that most models include expressions, that every selected
folder contains exactly one model at its top level, or that a marketplace ZIP
has one fixed nesting shape.
