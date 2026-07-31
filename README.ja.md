<p align="center">
  <img src="resources/icon.png" width="140" alt="Lares — フードをかぶった家の守り神">
</p>

<h1 align="center">Lares</h1>
<p align="center"><em>/ˈlɛəriːz/</em> · LAIR-eez</p>

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

Lares はエージェントのセッションを、絶えず動き続けるデスクトップキャラクター
——**Lar**——に変えます。考えている、詰まっている、待っている、持ち直した、
終わった。それが見ているだけで伝わるので、進捗のために別のパネルを開く必要は
ありません。

Lares は会話ログを読みません。感情を推測もしません。感じていることはエージェント
自身が MCP 経由で一人称で報告し、決定論的なライフサイクルフックが基本の鼓動を
刻みます。感情と気分は、セッションを通して履歴を引き継ぎます。

`エージェントフック + MCP → ローカル感情エンジン → Live2D の演技`

## クイックスタート

[最新リリース](https://github.com/Xyri1/lares/releases/latest)から
インストーラーをダウンロードし、インストールして Lares を起動します。Lar が
デスクトップに現れます。操作はトレイにまとまっています。

> [!IMPORTANT]
> Lares はまだ早期 alpha で、インストーラーには署名がありません——開発者に
> 署名料を払う余裕がないからです。セキュリティ上の意図ではなく、単なる懐事情
> です。macOS の Gatekeeper と Windows の SmartScreen は警告を出しますが、
> それは想定どおりです。[配布ガイド](docs/distribution.md)の回避手順に従って
> ください。

トレイから **Configure Agent Integrations…** を選びます。インストーラーが
尋ねてきたら、Claude Code プラグインまたは Codex プラグインを承認してください。

フックとローカル MCP 接続が読み込まれるよう、新しいエージェントセッションを
開始します。Claude Code なら `/reload-plugins` でプラグインを再読み込みでき
ます。Codex は Lares のフックの確認を求めてくるので、そこで信頼してください。

あとはいつもどおり作業するだけです。Lar はセッションの状態と、エージェントの
一人称の情動に合わせて動きます。キャラクターの変更、サイズ調整、Do Not Disturb
はトレイから。

手動セットアップについては [Claude Code](plugins/claude-code/README.md) と
[Codex](plugins/codex/README.md) のプラグインガイドを参照してください。

## できること

- 透明・ドラッグ可能・常に最前面のオーバーレイとしてデスクトップに常駐します。
- Claude Code と Codex に、それぞれのネイティブなプラグイン機構で接続します。
- ランタイムはローカル完結。デーモンはループバックにのみバインドし、会話ログが
  端末の外に出ることはありません。
- 展開済みの VTube Studio 形式の Cubism SDK 3.0–4.2 モデルフォルダを取り込み、
  その表情をポータブルな Lar パッケージへマッピングします。

アプリ自身が発生させるネットワーク通信は、明示された GitHub の更新チェック
だけです。エージェントプラグインのダウンロードも、あなたが要求して承認した
あとにしか始まりません。

## ソースから実行

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`fetch-assets` は Live2D Cubism Core と Haru サンプルを Git 管理外のパスへ
ダウンロードします。開発中、Electron のレンダラーは `127.0.0.1:5300` で
動作します。

## 自分の Lar を持ち込む

トレイから **Import Character…** を選び、展開済みの Live2D モデルフォルダを
指定します。Lares はそれを管理下のキャラクターライブラリにコピーします。
切り替える前にパッケージを検証します。元のフォルダには手を加えません。

対応範囲、`lares/1` マニフェスト、表情のマッピング、コマンドラインからの
インポート手順は[キャラクターパッケージガイド](docs/character-format.md)を
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

プロダクトと設計の正典は [`sdd/`](sdd/) にあります。

- [`sdd/PRD.md`](sdd/PRD.md) — Lares が存在する理由
- [`sdd/SPEC.md`](sdd/SPEC.md) — 契約と不変条件
- [`sdd/ROADMAP.md`](sdd/ROADMAP.md) — マイルストーンと現在のスコープ
- [`AGENTS.md`](AGENTS.md) — コントリビューターとコーディングエージェント向けの
  リポジトリ地図
- [`docs/distribution.md`](docs/distribution.md) — 未署名ビルドと
  クリーンマシンでの検証

## ライセンス

[Apache 2.0](LICENSE)。Live2D Cubism Core と同梱のキャラクターアセットは
それぞれ独自の条件に従います。[NOTICE](NOTICE) を参照してください。
