# Changelog

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
