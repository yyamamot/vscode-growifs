# vscode-growifs

## Overview

`vscode-growifs` は、GROWI 上のページを VS Code から扱うための Desktop 向け VS Code 拡張です。
GROWI を OS レベルのファイルシステムとして mount するのではなく、`growi:` スキームの仮想ファイルとして参照、探索、保存できる体験を提供します。

現行版では、VS Code 標準の Markdown 導線に寄せた閲覧体験と、既存ページの安全な更新導線を重視しています。
加えて、`growi-current.md` や `growi-current-set/` へ書き出してローカル実ファイルとして扱えるため、Codex 等の LLM アシストを使った編集もしやすくしています。

## Features

### 主要機能

| 機能 | できること | 備考 |
| --- | --- | --- |
| ページ閲覧 | GROWI ページを VS Code 上で `.md` ファイルとして開く | `growi:` スキーム上の Markdown として扱います |
| ツリー探索 | 指定 prefix 配下を Explorer の `GROWI` view で辿る | welcome、view title、context actions から主要導線へ到達できます |
| ページオープン | URL、path、same-instance permalink、root-relative permalink からページを開く | same-instance 前提です |
| 既存ページ編集 | 既存ページ本文を更新する | `Start Edit` / `End Edit` が必要です |
| 単ページローカル往復 | `growi-current.md` へ download し、diff / upload で戻す | ローカル実ファイルとして編集できます |
| 配下ページ bundle 往復 | `growi-current-set/` へ配下ページを書き出し、bundle 単位で compare / upload する | `manifest.json` を含むローカル bundle として扱います |
| 履歴差分 | 現在本文と過去 revision の diff を開く | revision 一覧 API と本文取得 API が必要です |
| Preview | Markdown Preview 上で画像添付を表示する | 画像以外の添付は現行版対象外です |
| VS Code 連携 | wiki 内リンク移動、Outline / Breadcrumbs と整合する | wiki 内リンク移動には制約があります |
| Diagnostics | 未解決内部リンク、未取得画像、非対応 draw.io embed を diagnostics で通知する | 種別は内容により異なります |
| 補助情報 | Backlinks と Current Page Info を表示する | ページ確認用の補助機能です |

### 現行版で扱わないこと

| 対象外 | 補足 |
| --- | --- |
| OS レベルの mount | FUSE のようにローカルドライブとして扱うことはしません |
| VS Code 以外の利用 | Desktop 版 VS Code 拡張として使う前提です |
| 新規ページ作成、削除、リネーム | 現行版は既存ページ本文の更新だけを対象にします |
| 複数ページの自動同期やローカル mirror | 明示操作での閲覧・更新を前提にします |
| 添付ファイルのアップロードや削除 | 添付管理機能は現行版対象外です |
| 画像以外の添付プレビュー | 高度なプレビューは扱いません |
| 相対リンクや外部 URL の汎用解決 | 何でも自動解決する挙動は提供しません |
| draw.io / diagrams.net / PlantUML / Mermaid の図描画 | 本文や Preview で図レンダリングは行いません |

## Installation

現時点の利用者向け配布は `vsix` を前提とします。

1. 配布された `*.vsix` ファイルを入手する
2. VS Code で `Extensions: Install from VSIX...` を実行する
3. 対象の `*.vsix` を選択してインストールする

## Quick Start

### 1. 接続先を設定する

Command Palette で `GROWI: Configure Base URL` を実行し、接続先 URL を入力します。

| 項目 | 内容 |
| --- | --- |
| 入力内容 | 接続先の GROWI URL |
| 入力例 | `https://growi.example.com/`, `http://localhost:3000/` |
| 注意点 | `http://` または `https://` が必須です |

### 2. API Token を設定する

Command Palette で `GROWI: Configure API Token` を実行し、GROWI の API token を入力します。

| 項目 | 内容 |
| --- | --- |
| 入力内容 | GROWI の API token |
| 保存先 | VS Code の Secret Storage |
| 注意点 | 設定画面の公開設定には保存されません |

### 3. ページを開くか prefix を追加する

最初のページ確認は、次のどちらかから始めます。

- `GROWI: Open Page`: URL、path、same-instance permalink、root-relative permalink から直接開く
- `GROWI: Add Prefix`: Explorer で辿りたい prefix または same-instance idurl を登録する

`GROWI: Add Prefix` では、idurl を入力した場合は canonical path に解決して登録します。

| 項目 | 内容 |
| --- | --- |
| 入力内容 | 探索したい prefix または same-instance idurl |
| 入力例 | `/team`, `/team/dev`, `https://growi.example.com/67ca...` |
| 注意点 | prefix は先頭 `/` が必須です |
| 追加後の表示先 | Explorer 配下の `GROWI` view |

Explorer の `GROWI` view では、welcome から `Open Page` / `Add Prefix` / `Open README` を実行できます。登録後は view title の `Refresh Listing` / `Clear Prefixes`、context actions の `Open Prefix Root Page` / `Open Directory Page` も使えます。

### 4. 編集する

既存ページ本文を更新するときは、対象ページを開いて `GROWI: Start Edit` を実行します。保存後は `GROWI: End Edit` で通常状態へ戻します。

### 5. ローカル実ファイルで作業する

- 単ページなら `GROWI: Download Current Page to Local Work File` で `growi-current.md` に書き出す
- 配下まとめ作業なら `GROWI: Download Current Page Set to Local Bundle` で `growi-current-set/` に書き出す

どちらもローカル実ファイルとして編集したあと、compare / upload で GROWI 側へ戻せます。

## Commands / Main Workflows

### ページを開く・探索する

| 目的 | コマンド | いつ使うか | 注意点 |
| --- | --- | --- | --- |
| README を開く | `GROWI: Open README` | 使い方を拡張内から確認したいとき | Explorer welcome からも開けます |
| ページを開く | `GROWI: Open Page` | URL や path からページを直接開きたいとき | same-instance 前提です |
| prefix を追加する | `GROWI: Add Prefix` | 特定配下を Explorer で辿りたいとき | prefix または same-instance idurl を受け付けます |
| prefix root を開く | `GROWI: Open Prefix Root Page` | 登録済み prefix root のページを開きたいとき | Explorer の prefix root context action です |
| ディレクトリページを開く | `GROWI: Open Directory Page` | ディレクトリに対応する実ページを開きたいとき | 実ページを持つ directory item で使えます |
| 一覧を更新する | `GROWI: Refresh Listing` | prefix 配下の一覧を最新化したいとき | Explorer 表示を更新します |
| prefix を消す | `GROWI: Clear Prefixes` | 現在接続先の prefix 登録を消したいとき | Explorer view title から実行します |

### 編集する

| 目的 | コマンド | いつ使うか | 注意点 |
| --- | --- | --- | --- |
| 編集開始 | `GROWI: Start Edit` | 既存ページ本文を更新したいとき | 通常の保存前に必要です |
| 編集終了 | `GROWI: End Edit` | 編集モードを抜けたいとき | 保存後に通常状態へ戻します |
| 本文を再取得 | `GROWI: Refresh Current Page` | 現在ページを再読込したいとき | 明示的に最新化したい場合に使います |

### ローカル実ファイルで往復する

| 目的 | コマンド | いつ使うか | 注意点 |
| --- | --- | --- | --- |
| 単ページを書き出す | `GROWI: Download Current Page to Local Work File` | `growi-current.md` でローカル作業したいとき | workspace 直下に出力します |
| 単ページ差分を見る | `GROWI: Compare Local Work File with Current Page` | `growi-current.md` と現在ページの差分を見たいとき | VS Code 標準 diff を使います |
| 単ページ内容を戻す | `GROWI: Upload Local Work File to GROWI` | `growi-current.md` の内容を戻したいとき | metadata comment を壊すと失敗します |
| 配下ページを書き出す | `GROWI: Download Current Page Set to Local Bundle` | 現在ページ配下をローカル bundle に落としたいとき | `growi-current-set/` を出力します |
| bundle 差分を見る | `GROWI: Compare Local Bundle with GROWI` | `growi-current-set/` と GROWI 側の差分を見たいとき | `manifest.json` が必要です |
| bundle 内容を戻す | `GROWI: Upload Local Bundle to GROWI` | `growi-current-set/` の内容をまとめて戻したいとき | export 元 metadata と base URL が必要です |

### 補助情報を見る

| 目的 | コマンド | いつ使うか | 注意点 |
| --- | --- | --- | --- |
| ページ情報を表示する | `GROWI: Show Current Page Info` | URL や更新者などを確認したいとき | 現在ページの情報参照用です |
| 被リンクを表示する | `GROWI: Show Backlinks` | 関連ページを確認したいとき | 補助導線として使います |
| 履歴差分を見る | `GROWI: Show Revision History Diff` | 現在本文と過去 revision の差分を見たいとき | 比較対象 revision を選択します |

## Limitations

- VS Code の Workspace Search 連携は現行版では提供しません。
- 添付は Markdown Preview 上の画像だけが対象です。画像以外の添付や添付管理機能は扱いません。
- draw.io / diagrams.net / PlantUML / Mermaid の図描画は行いません。draw.io embed は diagnostics で非対応を通知し、Preview では非表示プレースホルダを使います。
- `growi:` 文書上の wiki 内リンク移動は、Markdown の絶対ページパス形式リンクと、現在の `growi.baseUrl` と同一 origin / 同一 base path 配下のページパス URL に限定してサポートします。
- `growi:` 上の本文編集は実ファイル前提の LLM アシストを受けにくく、必要に応じて `growi-current.md` または `growi-current-set/` への download を使う前提です。

## Requirements / Compatibility

| 項目 | 内容 | 補足 |
| --- | --- | --- |
| VS Code | Desktop 版 VS Code `1.105+` | 拡張の動作対象です |
| 対象 GROWI | GROWI `7.x` | GROWI 6 系以下は非サポートです |
| 認証前提 | bearer token で `/_api/v3` を使える構成 | token-only で成立しない構成は現行版未対応です |
| 必須 API | `GET /_api/v3/page`, `GET /_api/v3/revisions/{revisionId}`, `GET /_api/v3/revisions/list`, `GET /_api/v3/pages/list`, `PUT /_api/v3/page` | `revisions/list` または `pages/list` 非対応環境では一部機能が使えません |
| 添付 Preview | Markdown Preview 上の画像添付だけ | 画像以外の添付プレビューは対象外です |
| 添付 URL 制約 | same-host absolute URL と root-relative path を前提にします | `/attachment/{attachmentId}` は Preview / token-only 取得の対象外ですが、`growi:` 文書上の通常リンクからは GROWI Web を開けます |

## よくあるつまずき

| 症状 | 確認ポイント | 補足 |
| --- | --- | --- |
| Base URL が通らない | `http://` または `https://` を付けているか | 単なるホスト名だけでは通りません |
| API Token を入れたのに失敗する | GROWI 7.x で bearer token による `/_api/v3` 利用ができるか | token が空白付きで貼られていないかも確認してください |
| Prefix を追加したのに何も見えない | prefix の先頭 `/`、Base URL、API Token、対象配下の実ページ有無を確認する | Explorer の `GROWI` view を見ているかも確認してください |
| 編集できない | 対象が既存ページか、`Start Edit` を実行したかを確認する | 通常の保存だけでは更新できません |
| `growi-current.md` の upload が失敗する | この拡張が出力した file か、metadata comment を壊していないかを確認する | download 後に GROWI 側のページが更新されている場合も失敗します |
| `growi-current-set/` の compare / upload が失敗する | `manifest.json` が残っているか、export 元の base URL と現在設定が一致しているかを確認する | 先に `Download Current Page Set to Local Bundle` をやり直すと解消することがあります |
| 履歴差分が開けない | `/_api/v3/revisions/list` と `/_api/v3/revisions/{revisionId}` が使えるか確認する | revision 一覧 API 未対応環境では使えません |
| diagnostics が出る | 未解決内部リンク、未取得画像、draw.io embed のいずれかを確認する | diagnostics は `growi:` 文書上だけで表示します |

## Development

開発時の前提は次のとおりです。

- Node.js `22+`
- `pnpm`

主なコマンド:

```bash
pnpm run build
pnpm run test:unit
pnpm run test:integration
pnpm run lint
```

## License

- License: [MIT](./LICENSE)
