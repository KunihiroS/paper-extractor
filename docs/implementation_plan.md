# Implementation Plan: new flow (command palette + URL prompt + template + new note)

## Goals
- コマンドパレット起動のみ（リボン廃止）
- arXiv URL を実行時に入力（既存の検証ロジック踏襲）
- Vault ルートに新規ノート作成（一時名 → title_extractor でリネーム）
- テンプレート適用（`{{url}}` 必須、未検出は中断）

## Scope / Affected Files
- `src/main.ts` : コマンド再設計、旧フロー・リボン・サンプル削除
- `src/settings.ts` : `templatePath` 追加
- `src/note.ts` : テンプレ読み込み・URL注入・必須検証
- `src/title_extractor.ts` : 引数化（TFile + url）
- `src/paper_fetcher.ts` : 引数化（TFile + url）
- `src/summary_generator.ts` : 引数化（TFile + url）
- （必要なら）`extractUrl01FromNoteBody` を `@deprecated`

## Steps
1. **設定追加**
   - `templatePath` を `MyPluginSettings` と UI に追加
   - 未設定時は実行初期で中断 + Notice

2. **テンプレ適用ユーティリティ**
   - `loadTemplateAndInjectUrl(templatePath, url)` を `note.ts` に追加
   - `{{url}}` 未検出時は `TEMPLATE_URL_PLACEHOLDER_MISSING` で中断
   - 置換は `{{url}}` のみ（将来拡張を見据えて構造化）

3. **新コマンド導入（main.ts）**
   - コマンド名: `Create paper note from arXiv URL`
   - Prompt で URL 入力 → 検証 → テンプレ適用 → 新規ノート作成（Vault ルート）
   - 新規ノート名は `untitled_<timestamp>.md`

4. **既存処理の引数化**
   - `extractAndRenameActiveNoteTitle` → `extractAndRenameNoteTitle(app, logDir, noteFile, url)`
   - `fetchAndSaveArxivFromActiveNote` → `fetchAndSaveArxiv(app, logDir, noteFile, url)`
   - `generateSummaryForActiveNote` → `generateSummary(app, settings, noteFile, url)`

5. **既存の起動導線削除**
   - リボン、旧コマンド、サンプル UI を削除

6. **通知/ログ**
   - Notice 英語統一は継続
   - 新エラー理由を追加（TEMPLATE_PATH_MISSING, TEMPLATE_URL_PLACEHOLDER_MISSING, INVALID_URL 等）

## Testing (manual)
- templatePath 未設定
- `{{url}}` 不在
- URL 不正（非 arXiv / 不正形式）
- 新規ノート作成失敗（同名衝突）
- 既存フロー削除後の基本動作
