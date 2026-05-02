# Opus Feedback — vscode-growifs ドキュメントレビュー

レビュー日: 2026-04-19
対象: docs/ 配下の全仕様・設計・テスト・UI 設計・競合分析ドキュメント

---

## 1. VS Code ならではの改善アイデア

### 1.1 Timeline API 統合（revision 履歴の自然な表示）

現行版は Quick Pick + `vscode.diff` で revision 履歴差分を扱っているが、VS Code には `Timeline API`（1.44+）がある。`growi:` ファイルに対して `TimelineProvider` を実装すれば、Explorer 下部の Timeline パネルに revision 一覧が自動統合され、Git と同じ感覚で履歴を辿れる。Quick Pick を経由しない直感的な導線になる。

- 現行の `vscode.diff` 主表示方針と矛盾しない補助統合として追加可能
- Timeline item 選択で `vscode.diff` を開く導線にすれば、REQ-022 の契約を壊さない
- ただし 2026-04-19 時点では `TimelineProvider` が proposed API 前提であり、stable / Marketplace 配布方針の `growifs` 本線には載せられない
- Insiders + `--enable-proposed-api=<extension-id>` + VSIX 配布であれば試作可能だが、本線では見送りとする
- 試作コードは `codex/timeline-proposed-api-spike`（commit `82b4503`）へ退避済みで、API stable 化時の再評価材料として残す

### 1.2 Source Control API（SCM）統合

stable な `Source Control API` と `vscode.scm.createSourceControl` を使えば、Git の「変更」パネルと同じ場所に GROWI の変更状態を表示できる。local mirror の compare 結果（`modified locally` / `remote changed` / `conflict`）を SCM 風に見せることで、diff 確認の補助導線を VS Code 標準 UI に寄せられる。

- `Compare Local Mirror with GROWI` の成功結果を補助導線として SCM view に直接載せる
- v1 は compare 結果の可視化に限定し、Git 風の stage / commit 擬態や Upload の SCM 化は行わない
- proposed API を使わず stable API の範囲で実装できるため、Marketplace 互換を維持できる

### 1.3 Edit Session / Continue Working On 統合

VS Code の `EditSessionIdentityProvider`（1.74+）を利用すれば、異なるマシン間で `growi:` ページの編集セッションを引き継げる。GROWI の `pageId + revisionId` が自然な edit session identity になる。

- Remote 開発やマルチデバイスでの wiki 編集体験を改善
- 既存の `editSessionRegistry.ts` の拡張で対応可能な可能性

### 1.4 Notebook API による構造化ビュー

GROWI ページの見出し単位をセルに分割した Notebook 表示を提供すれば、長大なページの読解とセクション単位の編集が容易になる。VS Code の Notebook API は Markdown セルをネイティブサポートしており、`growi:` ページを Notebook として開く「構造化ビュー」を補助導線として追加できる。

- 保存経路は現行の raw body 保持を崩さず、セル結合 → raw body 復元で対応
- 特に draw.io の長大な fenced block を折りたたみではなくセル単位で隠す選択肢になる

### 1.5 Testing API による integration test の IDE 統合

現行の `pnpm run test:unit` / `test:integration` / `test:integration:host` は CLI 実行だが、VS Code の Testing API（`TestController`）を活用すれば、テストエクスプローラーから個別テストを実行・デバッグできる。開発体験の向上に直結する。

### 1.6 Authentication Provider API

現行版は独自の Secret Storage + Command で token を管理しているが、VS Code の `AuthenticationProvider` API を実装すれば、アカウント管理パネルとの統合、token 自動更新、複数アカウント切替が標準 UI で行える。GitHub/Azure の認証体験と同様のフローになり、初心者にとって分かりやすい。

### 1.7 FileDecoration API の活用拡張

REQ-029 で stale warning decoration を実装済みだが、`FileDecorationProvider` の活用範囲を広げられる：

- 編集中ページに `$(edit)` badge を付ける
- bookmark 済みページに `$(star)` badge を付ける
- テンプレートページに特別な decoration を付ける
- 新規作成直後のページに一時的な `new` badge を付ける

### 1.8 Linked Editing Ranges（wiki リンクのリネーム追従）

VS Code の `LinkedEditingRangeProvider` を使えば、wiki リンクテキストの編集時に対応するリンク先パスも同時編集できる。GROWI ページ rename 時のリンク更新支援になる。

### 1.9 CodeLens でページメタ情報を表示

`CodeLensProvider` でページの先頭行にメタ情報（最終更新者、更新日時）を inline 表示すれば、Quick Pick を開かずに基本情報を確認できる。GitHub の blame annotation に近い体験。

### 1.10 Custom Editor による draw.io 統合

現行版で draw.io は `[draw.io diagram hidden]` プレースホルダとしているが、将来的に VS Code の Custom Editor API を使えば draw.io 図を直接編集可能にできる。`hediet.vscode-drawio` 拡張との連携も視野に入る。

---

## 2. 将来拡張アイデア

### 2.1 GROWI MCP Server との共存・連携

競合分析で指摘されている通り、GROWI 公式 MCP Server が存在する。VS Code の MCP client 機能（GitHub Copilot 経由）と本拡張の `growi:` FileSystemProvider を組み合わせれば、「AI が MCP 経由で GROWI を読み書きし、VS Code 上で人が確認・編集する」ワークフローが成立する。

- `growi:` URI を MCP のリソース識別子として参照可能にする
- local mirror を MCP tool の入出力先として公開する

### 2.2 Multi-root Workspace 対応

複数の GROWI インスタンス（staging / production / 異なるチーム wiki）を同時に扱う場合、Multi-root Workspace として `growi-staging:` / `growi-production:` のようにスキームまたは authority を分ける設計が有用。

### 2.3 Copilot Chat の `@growi` Participant

VS Code の Chat Participant API を使い、`@growi` と話しかけると登録済み prefix 配下のページを文脈に含めて回答するチャット参加者を実装できる。

- 「@growi /team/dev 配下の設計文書を要約して」のような使い方
- page search 基盤を再利用して文脈注入

### 2.4 Web Extension 対応

現行版は Desktop 専用だが、vscode.dev / github.dev 対応により、ブラウザだけで GROWI ページを参照できるようになる。ローカル HTTP プロキシは使えないため、画像表示は Web Worker + Service Worker 方式への移行が必要。

### 2.5 Task Provider 統合

GROWI ページ内の TODO やタスクリストを `TaskProvider` で収集し、VS Code の「タスク」パネルに表示する。wiki 上のタスク管理を IDE に統合できる。

### 2.6 Collaborative Editing の検討

VS Code の Live Share 拡張と連携し、`growi:` ページの同時編集体験を提供する。GROWI Web UI の HackMD 同時編集とは異なるアプローチだが、IDE 内完結の共同作業を実現できる。

### 2.7 Wiki リンクの自動補完

`CompletionItemProvider` で `[text](/` 入力時に登録済み prefix 配下のページ候補を自動補完する。既存の page search 基盤を再利用可能。

### 2.8 Semantic Token Provider

GROWI 独自記法（`$lsx`、`$drawio`、GROWI plugin 記法など）に対する Semantic Token を提供すれば、シンタックスハイライトが改善される。

---

## 3. 現状の問題点・懸念事項

### 3.1 ローカル HTTP プロキシのセキュリティ未決

REQ-008 / ADR-006 で明記されている通り、ローカル HTTP プロキシの防御方式（URL secret、受理パスのホワイトリスト、SSRF 制約）が未決のまま。画像表示は動作しているが、セキュリティ設計が確定していない状態はリリース前に解消すべき。

- 同一マシン上の他プロセスが `127.0.0.1:<port>` に任意リクエストを送れるリスク
- URL secret なしだと任意パスの GROWI 資産を取得される可能性

### 3.2 `FILE_UPLOAD=local` 環境で画像表示不可

GROWI の `FILE_UPLOAD=local` 構成では `/attachment/{attachmentId}` が cookie/session 認証に依存し、bearer token だけでは取得できない。この構成は少なくない GROWI 環境で使われている可能性がある。現行版の明示的な非対応表明はあるが、ユーザーが混乱する可能性が高い。

- 利用者への非対応理由の伝達方法が不十分
- 将来的に cookie proxy や `FILE_UPLOAD=local` 対応が必要になる可能性

### 3.3 大規模 prefix の性能懸念

`pages/list` を `limit=100` で尽きるまで辿る方針は、数千ページ規模の prefix で深刻な初回表示遅延を引き起こす。ADR-009 の性能懸念にも記載があるが、具体的な軽減策（lazy loading、pagination UI、背景取得）が未定義。

- Explorer 初回展開で全ページ取得は UX として厳しい
- Backlinks の 100 件上限 / 5 秒 timeout も大規模では不十分
- Tree の incremental loading（子要素の遅延取得）に切り替える検討が必要

### 3.4 HTTP ステータスマッピングの暫定状態

仕様書全体で `401`、`403`、`409`、`5xx` のマッピングが「暫定」とされている。実運用で遭遇するエラーパターンを十分にカバーできているか不明。特に：

- GROWI の reverse proxy 背面での `502`/`503` の扱い
- rate limit（`429`）の扱いが未定義
- `redirect: manual` で捕捉する `/login` redirect のパターン網羅

### 3.5 競合検知の弱い窓

保存前再取得 → `PUT` 送信の間にわずかな競合窓がある（ADR-003 で acknowledged）。これは best-effort として許容されているが、HackMD の real-time 同時編集との併用では事実上の問題になりうる。

- real-time collaboration との共存を想定した注意書きが不足
- 「HackMD で編集中のページは VS Code からの保存を避けるべき」等のガイダンスがない

### 3.6 仕様書の巨大化・参照コスト

REQ-001〜030、ADR-001〜018、TP 多数、UI-001〜026、IMP-001〜152+ と、単一リポジトリの仕様群としては非常に大きい。LLM が全文を参照する際のコンテキスト圧迫が顕著。

- 01-specification.md だけで 1000 行近い
- 完了済み要件と未決事項の区別がスキャンしにくい
- 将来拡張条件が仕様末尾に散在しており、一覧性が低い

### 3.7 Offline / 接続断時の UX

現行版は接続失敗を `ConnectionFailed` として分類しているが、一時的なオフライン状態での振る舞いが明示されていない：

- キャッシュ済みページは TTL 内なら読めるが、TTL 切れ後に接続断だと読めなくなる
- 編集中に接続が切れた場合の保存リトライ導線がない
- 接続状態の status bar 表示がない

### 3.8 テンプレートの探索コスト

REQ-024 の階層テンプレート解決は、作成 target の親から祖先へ向かって `_template` / `__template` を探す。深い階層では複数回の API 呼び出しが必要になり、レイテンシが顕著になりうる。

- テンプレートキャッシュの方針が未定義
- 不在テンプレートの負のキャッシュ（存在しないことの記録）が未定義

### 3.9 エラーメッセージの国際化

UI-004、UI-012 等でエラーメッセージの文言設計が議論されているが、日本語と英語の切り分け方針が未定義。VS Code の `l10n` API（1.73+）への対応計画がない。

- 現行の status bar 文言は日本語固定（`$(lock) 閲覧中` / `$(unlock) 編集中`）
- Command Palette のコマンド名は英語（`GROWI: Open Page`）
- 混在が利用者の混乱を招く可能性

### 3.10 `growi.baseUrl` 変更時の prefix 整合性

`growi.baseUrl` を変更した場合、`workspaceState` に残る旧 baseUrl 用の prefix がどう扱われるかが不明確。ADR-009 では baseUrl 単位の分離が言及されているが：

- 旧 baseUrl の prefix がゴミとして残る可能性
- baseUrl 変更を検知して prefix リセットを促す導線がない

---

## 4. ドキュメント構成への所見

### 4.1 良い点

- 要件 → ADR → テスト → 実装 → トレーサビリティの連鎖が極めて整っている
- 未決事項が明示的に管理されており、推測実装の防止が機能している
- 競合分析が具体的で、差別化軸が明確
- `IMP` 状態機械による開発フロー管理が仕様駆動開発として秀逸
- 受入条件が具体的で自動テストへの落とし込みがしやすい

### 4.2 改善候補

- 仕様書に「現行版対象外」が多く散在しており、将来拡張の一覧ビューが欲しい
- ADR の将来論点が ADR 本文に分散しており、集約的な「未決台帳」があると良い
- `変更履歴` が 01-specification.md 末尾にあるが、Git 履歴との重複が気になる
- 02-adr.md の「継続的に確認すべき注意事項」「性能上の懸念」「プラットフォーム制約」が ADR の末尾にまとめて置かれているのは良いが、各 ADR からの cross-reference が弱い

---

## 5. 優先度の高い次アクション提案

| 優先度 | アクション | 根拠 |
|--------|-----------|------|
| High | ローカル HTTP プロキシのセキュリティ設計確定 | リリースブロッカーレベルの未決事項 |
| High | 大規模 prefix の lazy loading 検討 | 実運用で最も体験劣化が顕著 |
| Medium | Timeline API 統合 | VS Code ならではの差別化と低実装コスト |
| Medium | `@growi` Chat Participant | Copilot 連携による差別化の本丸 |
| Medium | 接続状態の status bar 表示 | offline UX の最小改善 |
| Low | Authentication Provider API 移行 | 長期的な UX 改善 |
| Low | Web Extension 対応の技術調査 | 市場拡大への準備 |
