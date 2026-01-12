
# dev memo: paper_extractor（arXiv 論文取得・要求1）

## Plugin name

- `paper_extractor`

## Functions

### paper_fetcher

- arXiv URL から論文データを取得して保存する。

#### 目的

- **論文要約ノート（テンプレ準拠）から元論文URLを1つ特定**し、arXiv から論文データを取得して **そのノートと同階層の添付ディレクトリに保存**する。
- 1st iteration は **arXiv のみ**対応（将来拡張で他サイト対応の余地は残す）。

#### 対象ノートの定義

- **ユーザが今見ているノート**を対象にする。
  - 実装上は `workspace.getActiveViewOfType(MarkdownView)` で取得できる想定。
  - タブを開いているだけのノートは対象外。
- ノート本文は、可能なら **エディタ上の最新状態**（未保存の編集も含む）を優先して走査する。

#### 入力テンプレ（前提）

ノートは次のテンプレに従う（多少の揺れは許容しても良いが、基本は決め打ちで良い）。

```text
###### Created:
2026-01-12 09:43
###### タグ:
#paper
###### url_01:
https://arxiv.org/abs/2601.05175
###### url_02:
https://example.com
###### memo:

---
```

#### URL抽出ルール（決め打ち）

- `###### url_01:` の **直後**にある URL を「要約元論文URL」とみなす。
  - 原則は「次の行の非空文字列」
  - ただし将来のブレ対策として、同一行にURLが書かれていても許容してよい（例: `###### url_01: https://...`）
- 今回は `url_02` などの他URLは無視する（出典元等が混ざるため）。

#### arXiv URL の変換ルール

##### 入力

- `https://arxiv.org/abs/<id>`
  - 例: `https://arxiv.org/abs/2601.05175`

##### 取得対象
- 下記両方のデータを取得して保存する
  - HTML: `https://arxiv.org/html/<id>`
  - PDF: `https://arxiv.org/pdf/<id>`

#### 保存先ルール（Vault内）

- 元ノート: `path/to/{noteBaseName}.md`
- 保存フォルダ: `path/to/{noteBaseName}/`
  - フォルダが無ければ作成する
- 保存ファイル:
  - HTML: `<id>.html`
  - PDF: `<id>.pdf`

#### 実行トリガー（MVP）

- 常時監視はしない。
- **ユーザが明示操作**して開始する。
  - 候補: リボンアイコン
  - 候補: コマンドパレット

#### UX（通知）

- MVP は Obsidian の標準通知で良い。
  - 開始: `Notice` で「開始」
  - 完了: `Notice` で「保存先パス」
  - 失敗: `Notice` で「失敗理由（概要）」
- 詳細は `console.error` 等に出す（ユーザが開発者ツールで追える）。

#### 準正常系・エラー処理

- **保存先ディレクトリが存在しない**
  - 作成して保存する
- **保存先に同名ファイルが存在する**
  - 上書きする
- **URLから取得できない（404等）**
  - ユーザにエラー通知する（Notice）
  - 失敗理由（HTTP status 等）はログに残す
- **ノートがテンプレに従っていない / url_01 が見つからない**
  - 何もせずエラー通知（「url_01 が見つからない」など）
- **url_01 が arXiv ではない**
  - 1st iteration では対象外としてエラー通知

#### 競合懸念（他プラグインとの整合）

- 既存運用として、ノート `{hoge}.md` の添付は `./{hoge}/` に置く前提。
- 本プラグインも同ルールに従って保存する。
- 競合の可能性:
  - 他プラグインが同じファイル名を生成・上書きする
  - 添付管理プラグインがファイルを移動/リネームする
- MVP では「ファイル名を固定して上書き」運用で割り切る。

#### 未確定事項（要決定）

- **(A) arXiv ID の抽出揺れ**
  - 例: `https://arxiv.org/abs/2601.05175v2` や末尾スラッシュ付きも許容する？
  - **MVP案**: `<id>` と `<id>vN` の両方を許容し、そのまま `html/pdf` に差し替える
  -> arXiv ID の抽出を厳密にする必要はない、許容する
- **(B) 保存先フォルダ名の決定**
  - ノート名が `hoge.paper.md` の場合、フォルダ名は `hoge.paper/` でOK？
  - **MVP案**: `file.basename`（拡張子除去済み）をそのまま使う
  -> 保存先については、ノートのタイトルのディレクトリをそのまま使う。前提としてノートのタイトルには実体ファイルの拡張子の.mdは含まれないものと理解している
- **(C) 上書き挙動（片方失敗時）**
  - html は成功・pdf は失敗の場合、html だけ保存してOK？
  - **MVP案**: 片方成功なら保存し、通知に結果を分けて表示
  -> どちらかが失敗しても、もう片方が成功していた場合は上書き保存する
- **(D) 処理中表示**
  - 開始通知だけで十分？それともステータスバーも欲しい？
  - **MVP案**: 開始 `Notice("Downloading arXiv...")` → 完了/失敗 `Notice` で十分
  -> MVPで十分

#### 決定事項（MVP仕様サマリ）

- **対象**: ユーザが今見ているノート（アクティブなノート）
- **URL抽出**: `###### url_01:` の直後のURLを採用（テンプレ準拠前提）
- **対応**: arXivのみ
- **取得**: `html` と `pdf` を両方取得して保存
  - `https://arxiv.org/html/<id>`
  - `https://arxiv.org/pdf/<id>`
- **保存先**: 元ノートと同階層の `{noteTitle}/`（無ければ作成）
- **保存ファイル名**:
  - HTML: `<id>.html`
  - PDF: `<id>.pdf`
- **上書き**: 常に上書き（片方失敗でも、成功した方は保存）
- **通知**: `Notice` で開始/完了/失敗を通知（MVPはこれで十分）

#### 実装メモ（設計の方向性）

- 取得: Obsidian の `requestUrl`（想定）
- 保存: `app.vault.adapter` でフォルダ作成と `write`（html）
- 対象ノート:
  - `MarkdownView` を取得し、本文を取得して抽出

#### Implementation plan (MVP)

1. Active noteから `url_01` を抽出（エディタの未保存内容を優先）
2. arXiv URL から arXiv ID を抽出（末尾 `vN`・末尾スラッシュ等を許容）
3. `https://arxiv.org/html/<id>` と `https://arxiv.org/pdf/<id>` を取得
4. 保存先 `path/to/{noteBaseName}/` を作成（無ければ）
5. `{noteBaseName}/<id>.html` と `{noteBaseName}/<id>.pdf` を常に上書き保存
6. `Notice` で開始/完了/失敗を通知（片方失敗でも成功分は保存）

### Title_Extractor

#### 目的
- 論文タイトルを取得して、元ノートのタイトルを更新する

#### UX
- 機能のアクティベーションは、paper_extractor共通のリボンアイコンで実行
- paper_fetcherの機能が完了したら、タイトルを取得して元ノートのタイトルを更新する
- 通知は、paper_extractor共通の通知で行う

#### 機能詳細
- タイトル取得は `https://arxiv.org/abs/<id>` のメタタグ（`citation_title`）のみを参照する
- フォールバックは実装しない（取得できなければエラー通知し、手運用で対応する）
- Obsidianのノートタイトルで使えない文字は、`_` に置換する

#### 準正常系
- メタタグが見つからない、取得できないなどの場合は、エラー通知し、元ノートのタイトルは変更しない

## 実装着手条件

- この文書（`dev_memo.md`）のMVP仕様が合意できた後、**ユーザが「実装を開始して良い」と明示した時点**でコード変更に入る。

## デプロイ手順（手動インストール / ローカル）

1. ビルド
   - `pnpm run build`
2. Vaultへ配置（手動）
   - Vault の `VaultFolder/.obsidian/plugins/paper_extractor/` を作成（無ければ）
   - このリポジトリ直下の下記ファイルをコピー
     - `main.js`
     - `manifest.json`
     - `styles.css`（あれば）
3. Obsidianで有効化
   - **Settings → Community plugins** で `paper_extractor` を有効化
4. 反映
   - `main.js` を更新したら、Obsidian をリロード（アプリ再起動 or コマンドでリロード）

## 将来拡張
1. Title作成
- arXivのAbstractやHTMLからTitleを抽出する
- 抽出したTitleを元ノートのタイトルに設定する

2. 要約
- 取得したファイルを指定のプロンプトで要約する
  - 要約はOpenAIやGeminiなどのLLMを用いて行う
- 要約結果を元ノートの下に追記する
```sample
###### Created:
2026-01-12 09:43 
###### タグ:
#paper
###### url_01: 
https://arxiv.org/abs/2601.05175
###### url_02: 
https://ivul-kaust.github.io/projects/videoauto-r1/
###### memo: 

---
# One line and three points
動画理解において、「直感的な即答」と「論理的な思考」を使い分けることで、推論コストを大幅に削減しつつ精度を向上させた新しい強化学習フレームワーク。
{hogehoge}
```
### 想定ユーザフロー
1. ユーザーがObsidianで新しいノートをテンプレートから作成する
2. ユーザーがarXiv論文URLを入力する
3. ユーザーがリボンの本プラグインを押下する
4. arXiv論文を取得して、Titleを元ノートのタイトルに設定する
5. arXiv論文を要約して、元ノートの下に追記する
6. arXiv論文を保存する
{end of flow}