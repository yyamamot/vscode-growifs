# Changelog

[English](https://github.com/yyamamot/vscode-growifs/blob/main/CHANGELOG.md) | 日本語

## 0.0.8 (2026-05-04)

- UI 文言の英語 / 日本語多言語化を追加
- local mirror 編集と差分レビュー用の LLM Assist Kit を追加

## 0.0.7 (2026-05-02)

- `GROWI` Explorer の prefix 展開を lazy page loading にし、大規模 prefix では `さらに読み込む` で追加取得できるようにしました
- TreeView 右クリック menu と local mirror / SCM の導線・文言を大幅に見直し、操作対象と反映方向を分かりやすくしました
- local mirror のローカルファイル変更を自動検出し、差分確認を押さなくても SCM に反映されるようにしました
- Marketplace / VSIX インストール後に拡張ディレクトリを書き換えないよう、`Open README` と local mirror の write / delete 経路を install root 非変更にしました

## 0.0.6 (2026-04-19)

- `Open Page` で `/` 始まりや `http(s)://` を入力したとき、`URL / path を直接入力` が先頭に出るようになり、候補検索と見分けやすくなりました
- `GROWI` view 上部からも `Open Page` を開けるようになり、Command Palette を開かずにページ検索へ入れます
- `Open Page` の候補順位を見直し、ページ名や path segment から目的のページを探しやすくしました。候補がない場合も、そのまま URL / path 入力へ進めます
- 現在ページのブックマークを GROWI 本体の root bookmarks と連携するようにし、`Show Bookmarks` から再訪や手動削除ができるようになりました
- `Show Bookmarks` で、各 bookmark が `prefix未登録` / `開けない` のどちらなのか分かるようになりました
- `Compare Local Mirror with GROWI` の結果を SCM と Explorer にも表示するようにし、ローカル変更・リモート変更・競合を見つけやすくしました
- Explorer の prefix root 右クリックから、配下をまとめてローカルミラーへ同期できるようにしました

## 0.0.5 (2026-04-16)

- `Create Page` / `Create Here` で GROWI の階層テンプレートを適用し、`_template` 優先・祖先側 `__template` fallback で新規ページを作成できるように改善
- status bar の編集状態表示を `$(lock) 閲覧中` / `$(unlock) 編集中` に更新し、クリックで Start Edit / End Edit を切り替えやすく改善
- 現在ページの添付一覧を Quick Pick で表示し、選択した添付を GROWI Web として既定ブラウザで開ける導線を追加
- F5 の debug runtime 時だけ有効な JSONL 診断ログを追加し、runtime log の保存先表示と削除 command を利用できるように改善
- Explorer 右クリックの `ブラウザで表示` から、page、synthetic page、prefix root に対応する GROWI Web ページを既定ブラウザで開ける導線を追加
- `GROWI` view title actions を icon 表示へ統一し、`Add Prefix`、`Refresh Listing`、`Clear Prefixes`、runtime logs 操作の横幅圧迫を軽減
- README の導線説明を現行の `GROWI` view / Command Palette 中心の利用形態に合わせて整理

## 0.0.4 (2026-04-12)

- 破壊的変更: `growi:` prefix を workspace root として扱う前提を廃止し、探索導線を Explorer 配下の `GROWI` view と Command Palette に一本化
- local mirror 系コマンドの前提を整理し、開いているローカル `file:` workspace/folder が必要であることを明確化
- 破壊的変更: local mirror の保存先を `.growi-mirrors/<instanceKey>/` に変更し、旧 `.growi-workspaces` からの自動移行は行わない

## 0.0.3 (2026-04-04)

- ページの作成、名前変更、削除をサポート

## 0.0.2 (2026-03-15)

- 破壊的変更: workspace mirror を `.growi-workspaces/<instanceKey>/` と `.growi-mirror.json` 移行し、旧 mirror 命名・配置との互換を変更

## 0.0.1 (2026-03-13)

- 初期リリース (廃止: publisher名変更のため)
