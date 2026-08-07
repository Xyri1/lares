<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — フードをかぶった家の守り神">
</p>

<h1 align="center">Lares</h1>
<p align="center"><em>/ˈlɛəriːz/</em> · レアリーズ</p>

<p align="center">
  <strong>AI エージェントに顔を。</strong><br>
  エージェント自身の状況評価を生きた演技に変える、ローカル Live2D コンパニオン。
</p>

<p align="center">
  <a href="LICENSE"><img alt="Apache 2.0 ライセンス" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="早期 alpha" src="https://img.shields.io/badge/status-early_alpha-orange.svg">
  <img alt="macOS と Windows" src="https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey.svg">
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong>
</p>

## Lares とは

Lares はエージェントのセッションを、絶えず動き続けるデスクトップ
キャラクター「Lar」に変えます。考えているのか、行き詰まっているのか、
待っているのか、持ち直したのか、終わったのか——Lar を見ればわかるので、
進捗確認のためにパネルをもうひとつ開く必要はありません。

## Lares の違い

一般的なエージェントペットは、ライフサイクルイベントを決まった反応に
対応づけます。作業中なら忙しい、失敗なら悲しい、完了なら嬉しい、という具合です。
何が起きたかは示せても、モデル自身がその仕事をどう評価しているかは表せません。

Lares はライフサイクルイベントを稼働状態の鼓動として残しつつ、別に一人称の
チャンネルを加えます。モデルは `feel(valence, activation, control)` を通して
現在の状況評価を投影します。3 軸は、不快から快、沈静から活性、圧倒された状態
から自分で対処できる状態までを表します。Lares はその小さな報告を、連続した
キャラクター固有の演技へ変換します。

`モデルの状況評価 → feel(v, a, c) → ローカルで決定論的な演技 → Lar`

Lares は会話ログもモデル内部も読みません。モデル自身が状況評価を報告し、
フックは作業中や入力待ちといった運用上の事実だけを報告します。

この表現力は、トークン効率も重視して設計されています。固定イベント型の
ペットはモデル出力をほとんど必要としませんが、決まった反応しかできません。
一方、エージェントに表情、パラメーター、アニメーション曲線を書かせれば自由度は
上がるものの、トークンを消費し、動きが安定しない場合もあります。Lares が
求めるのは、
エージェントの状況評価が意味のある形で変わったときの、境界づけられた 3 つの
値だけです。感情が変わらなければ呼び出しません。連続した演技はすべてローカルで
行われ、アニメーション用プロンプト、キーフレーム、フレームごとのモデル推論は
不要です。

> まばらな 3 値の報告から幅広い感情表現を生み出す——固定の反応リストも、
> アニメーション用トークンの連続出力も必要ありません。

## インストール

[最新リリース](https://github.com/Xyri1/lares/releases/latest)から、お使いの
システム向けのインストーラーをダウンロードしてください。

> [!IMPORTANT]
> Lares はまだ初期のアルファ版で、インストーラーには**署名がありません**。
> 開発者に署名料を払う余裕がないだけで、セキュリティ機能ではなく単なる
> 懐事情です。macOS も Windows も一度だけ警告で止めてきますが、正規の
> 通り方は以下のとおりです。

### macOS

DMG を開き、**Lares.app** を**アプリケーション**にドラッグします。初回起動は、
次のメッセージとともに拒否されます。

> "Lares"にMacに損害を与えたりプライバシーを侵害する可能性のあるマルウェアが
> 含まれていないことをAppleは確認できませんでした。

選べる操作は**ゴミ箱に入れる**だけですが、押してはいけません。ダイアログを
閉じて、次のように操作します。

1. **システム設定 → プライバシーとセキュリティ**を開きます。
2. **セキュリティ**の欄まで下にスクロールすると、*「Lares」は、Macを保護する
   ためにブロックされました*という行があります。
3. **このまま開く**をクリックします。
4. 認証を済ませ、最後の確認ダイアログで承認します。

macOS はこの判断を記憶するので、次回以降は通常どおり起動します。

### Windows

インストーラーを実行すると、SmartScreen の**WindowsによってPCが保護されました**
という画面が表示されます。**詳細情報**をクリックし、**実行**を選びます。
続いて**不明な発行元**のアプリを許可するか尋ねられるので、**はい**を選べば
インストールが進みます。

未署名による違いはこれだけです。各リリースには SHA-256 チェックサムも付属して
いるので、インストール前にダウンロードしたファイルを検証できます。

## エージェントを接続する

Lares を起動すると、Lar がデスクトップに現れます。各種操作はトレイメニューに
まとまっています。

トレイから **Configure Agent Integrations…** を選び、インストーラーに確認を
求められたら Claude Code プラグインまたは Codex プラグインを承認してください。

フックとローカル MCP 接続を読み込ませるため、新しいエージェントセッションを
開始します。Claude Code では `/reload-plugins` でプラグインを再読み込み
できます。Codex では Lares のフックを信頼するか確認されるので、許可して
ください。

あとはいつもどおり作業するだけです。Lar はセッションの運用状態と、
エージェント自身による一人称の感情報告を映し出します。キャラクターの変更、
サイズの調整、Do Not Disturb の切り替えはトレイから行えます。

手動でセットアップする場合は、[Claude Code](plugins/claude-code/README.md) と
[Codex](plugins/codex/README.md) のプラグインガイドを参照してください。

## できること

- 透明でドラッグでき、常に最前面に表示されるオーバーレイとしてデスクトップに
  常駐します。
- Claude Code と Codex に、それぞれ純正のプラグイン機構で接続します。
- 3 軸の感情報告を、固定された感情リストから選ぶアニメーションではなく、
  連続した演技へ変換します。
- ランタイムはローカルで完結します。デーモンはループバックにのみバインドし、
  会話ログがマシンの外に出ることはありません。

アプリが自分から行うネットワーク通信は、明示されている GitHub への更新
チェックだけです。エージェントプラグインのダウンロードも、ユーザーが要求して
承認したあとにしか始まりません。

## ソースから実行

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`fetch-assets` は Live2D Cubism Core と Haru サンプルを Git 管理外のパスに
ダウンロードします。開発中は Electron のレンダラーが `127.0.0.1:5300` で
動きます。

## 自分の Lar を持ち込む

このリリースでは、サードパーティ製モデルのインポートは利用できません。
トレイには無効化された **Import Character — Coming Soon** 項目が表示されます。
現在、Lares は同梱の Haru キャラクターを使用します。

対応範囲、`lares/1` マニフェスト、アンカーと配線の書き方、コマンドラインの
開発手順については、[キャラクターパッケージガイド](docs/en/character-format.md)を
参照してください。

## 開発

| コマンド                 | 内容                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `pnpm dev`               | 開発モードで Lares を実行                                   |
| `pnpm test`              | Vitest スイートを実行                                        |
| `pnpm build`             | 型チェックと本番ビルド                                      |
| `pnpm fetch-assets`      | Cubism Core と Haru を Git 管理外のパスへダウンロード       |
| `pnpm package:preflight` | ローカル配布に必要な入力を検証                              |
| `pnpm package:mac`       | 未署名のユニバーサル macOS DMG をビルド                     |
| `pnpm package:win`       | 未署名の Windows x64 NSIS インストーラーをビルド            |

## プロジェクトドキュメント

利用者向けのガイドは [`docs/`](docs/) に、プロダクトと設計の一次情報は
[`sdd/`](sdd/) にあります。

- [`docs/en/usage.md`](docs/en/usage.md) — インストール、エージェント接続、
  Lar の読み方（英語）
- [`docs/en/development.md`](docs/en/development.md) — アーキテクチャと開発手順
  （英語）
- [`sdd/PRD.md`](sdd/PRD.md) — Lares が存在する理由
- [`sdd/SPEC.md`](sdd/SPEC.md) — 契約と不変条件
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — マイルストーンと現在のスコープ
- [`AGENTS.md`](AGENTS.md) — コントリビューターとコーディングエージェント
  向けのリポジトリの見取り図
- [`docs/en/distribution.md`](docs/en/distribution.md) — 未署名ビルドと
  クリーンマシンでの検証

## ライセンス

[Apache 2.0](LICENSE) です。Live2D Cubism Core と同梱のキャラクターアセット
には、それぞれのライセンス条件が適用されます。詳しくは [NOTICE](NOTICE) を
参照してください。

## 謝辞

Lares は次のプロジェクトの成果の上に成り立っています。

- [Live2D Cubism SDK](https://www.live2d.com/sdk/about/) — Cubism Core と
  Framework（© Live2D Inc.、Live2D 独自のライセンス条件が適用されます。
  詳細は [NOTICE](NOTICE)）。同梱の Haru は Live2D のサンプルモデルです。
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) —
  PixiJS 上での Live2D モデル描画。
- [PixiJS](https://pixijs.com/) — ステージを支える WebGL レンダラー。
- [Electron](https://www.electronjs.org/) — デスクトップシェル。開発と
  パッケージングには [electron-vite](https://electron-vite.org/) と
  [electron-builder](https://www.electron.build/) を使用。
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
  — 一人称の感情報告を受け取る Model Context Protocol サーバー。
- [Zod](https://zod.dev/) — すべての入口でのスキーマ検証。
