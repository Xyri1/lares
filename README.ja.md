<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — フードをかぶった家の守り神">
</p>

<h1 align="center">Lares</h1>
<p align="center"><em>/ˈlɛəriːz/</em> · レアリーズ</p>

<p align="center">
  <strong>AI エージェントに顔を。</strong><br>
  Claude Code と Codex のための、ローカルで動く Live2D デスクトップコンパニオン。
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

Lares は会話ログを読みません。感情の推測もしません。感情はエージェント
自身が MCP を通じて一人称で報告し、決定論的なライフサイクルフックが基本の
鼓動を刻みます。感情と気分はセッションを通じて履歴として積み重なって
いきます。

`エージェントフック + MCP → ローカル感情エンジン → Live2D の演技`

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

あとはいつもどおり作業するだけです。Lar はセッションの状態と、エージェント
自身が報告する感情に合わせて動きます。キャラクターの変更、サイズの調整、
Do Not Disturb の切り替えはトレイから行えます。

手動でセットアップする場合は、[Claude Code](plugins/claude-code/README.md) と
[Codex](plugins/codex/README.md) のプラグインガイドを参照してください。

## できること

- 透明でドラッグでき、常に最前面に表示されるオーバーレイとしてデスクトップに
  常駐します。
- Claude Code と Codex に、それぞれ純正のプラグイン機構で接続します。
- ランタイムはローカルで完結します。デーモンはループバックにのみバインドし、
  会話ログがマシンの外に出ることはありません。
- 展開済みの VTube Studio 形式（Cubism SDK 3.0–4.2）のモデルフォルダを
  取り込み、その表情をポータブルな Lar パッケージにマッピングします。

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

トレイから **Import Character…** を選び、展開済みの Live2D モデルフォルダを
指定します。Lares はフォルダを管理下のキャラクターライブラリへコピーし、
パッケージの検証を通ってから切り替えます。元のフォルダには手を加えません。

インポートしたばかりのモデルには、キャリブレーションが必要です。エージェント
で **Calibrate Lar** スキルを実行してください——Claude Code では
`/lares:calibrate-lar`、Codex では `$lares:calibrate-lar` です。エージェントは
モデルの表情をデスクトップ上で順にプレビューし、見た目でしか判断できない
ものはあなたに尋ねながら、規定の 6 つの cue にマッピングしていきます。
実行中は Lar を画面に出したままにしておいてください。6 つすべてがマッピング
されるまで、トレイには `Expression mapping n/6` と表示され、感情エンジンが
自分から cue を再生することはありません。

対応範囲、`lares/1` マニフェスト、表情のマッピング、コマンドラインからの
インポート手順については、[キャラクターパッケージガイド](docs/en/character-format.md)を
参照してください。

## 開発

| コマンド                 | 内容                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `pnpm dev`               | 開発モードで Lares を実行                                   |
| `pnpm test`              | メインプロセス側の Vitest スイートを実行                    |
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
