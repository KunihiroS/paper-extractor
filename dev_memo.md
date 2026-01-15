
# dev memo: paper_extractor（arXiv 論文取得・要求1）

## Plugin name

- `paper_extractor`

## 概要

本SWはObsidianのプラグインであり、以下の個別機能を有する。

- `paper_fetcher`
  - arXiv URL から論文データを取得して保存する
- `title_extractor`
  - 論文タイトルを取得して、元ノートのタイトルを更新する
- `summary_generator`
  - 論文を要約して、元ノートの下に追記する

## 前提条件

- 個人利用を想定している。
- ノートの本文は指定のテンプレートと、入力ルールの指定等に沿っているものとする。

以下は完成形イメージのサンプル（要約まで含む）。

```指定テンプレートsample
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
{以下、要約が続く}
```
- `###### url_01:` ブロックに本プラグインが対象とするarXivのURLが記載されている。
- 入力されるURLはarXivのURLであり、`https://arxiv.org/abs/{id}`の形式であることを前提とする。

## 想定ユーザフロー

- 各個別機能は以下の通り一連の処理として連続します。

```
- title_extractor

1. ユーザーがObsidianで新しいノートをテンプレートから作成する
2. ユーザーがarXiv論文URLを入力する
3. ユーザーがリボンの本プラグインを押下する
4. タイトルを元ノートのファイル名に反映する（ファイル名リネーム）

- paper_fetcher

5. arXiv論文を取得し指定ディレクトリに保存する

- summary_generator

6. arXiv論文を要約して、元ノートの下に追記する
```

## 個別機能詳細

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
以下は最小テンプレ（`url_01` 抽出に必要な部分）。

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
  - リボンアイコンを押下

#### UX（通知）

- MVP は Obsidian の標準通知で良い。
  - 開始: `Notice` で「開始」
  - 完了: `Notice` で「保存先パス」
  - 失敗: `Notice` で「失敗理由（概要）」
- 詳細は `console.error` 等に出す（ユーザが開発者ツールで追える）。

#### ログ（原因追跡のため必須）
- プラグインの動作履歴を.logとして残す
- PDF/HTML の保存先（`{noteBaseName}/`）のフォルダ作成に失敗した場合でも原因が追跡できるよう、ログは保存先と分離する
- ログ保存先ディレクトリは設定画面でユーザが指定する（Vault内パス、必須）
  - 未設定の場合は `paper_fetcher` は中断する（Noticeで通知）
- ログファイルは日別とし、同一日のログに追記する
  - 保存先: `{logDir}/`
  - ファイル名: `paper_extractor_YYYYMMDD.log`
- ログは1行ごとにタイムスタンプを付与して追記する
  - 例: `2026-01-15T20:14:00.123Z result=OK ...`
- ログには少なくとも以下を含める
  - `notePath`, `noteBaseName`, `folderPath`（作成対象）, `id`
  - `folderCreateError`（フォルダ作成に失敗した場合）
  - HTML/PDF の取得URLとステータス（または例外）
  - 成功時も `result=OK` のような成功ログを必ず1行以上出力する
  - 1回の実行（1操作）が1ブロックになるよう、開始/終了が分かる形式で追記する

##### ログ補強（summary_generator開発時にまとめて実施）

- `summary_generator` 実装に着手するタイミングで、ログの原因追跡性をまとめて補強する
  - 例: HTTP非2xx時の詳細（ステータス別の情報）、例外メッセージの明示、必要ならログのパースしやすさ改善

#### 連打・並行実行（実行中は無効化）

- `paper_fetcher` / `title_extractor` / `summary_generator` は「実行中フラグ」を持ち、二重実行を防ぐ
- 実行中にリボン/コマンドが押下された場合は開始せず、`Notice` で「実行中」を通知する

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
- **ログ**: `{noteTitle}/` とは別の `{logDir}/`（設定必須）に日別ログとして追記
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

### title_extractor

#### 目的
- 論文タイトルを取得して、元ノートのファイル名を更新する（ファイル名リネーム）

#### UX
- 機能のアクティベーションは、paper_extractor共通のリボンアイコンで実行
- title_extractor を先に実行し、成功した場合のみ paper_fetcher に進む
- 通知は、paper_extractor共通の通知で行う

#### 機能詳細
- タイトル取得は `https://arxiv.org/abs/<id>` のメタタグ（`citation_title`）のみを参照する
- フォールバックは実装しない（取得できなければエラー通知し、手運用で対応する）
- Obsidianのノートタイトルで使えない文字は、`_` に置換する

#### 実行順序（安全設計）

- title_extractor は **paper_fetcher より先に**実行する
- 目的:
  - 「無題ノート」等の仮名のままダウンロードして添付フォルダが作られ、後からリネーム/移動/衝突で状況が複雑化するのを避ける

#### 事前検査（副作用ゼロで中断）

- タイトルが取得できること（`citation_title`）
- タイトルをノート名として利用できる形式に正規化（禁止文字を `_` に置換など）
- 正規化後の `newTitle` が空文字にならないこと
- **`/{newTitle}` が既に存在する場合は常に中断**（フォルダ統合を絶対に避ける）
- **`newTitle.md` が既に存在する場合は中断**（ノート名衝突を事前に明示して止める）

#### リネーム

- 事前検査が全て通った場合にのみ、元ノートを `newTitle.md` にリネームする

#### 競合懸念（添付管理プラグインとの整合）

- 既存運用として、ノート `{hoge}.md` の添付は `./{hoge}/` に置く
- Custom Attachment Location の確認結果（前提）:
  - ノートタイトル変更に追随して、対のディレクトリ名変更が実行される
  - 対ディレクトリ名変更に追随して、埋め込みファイルリンクも変更される
  - ノート削除後も対ディレクトリが残る
  - 対ディレクトリが残ったまま同名ノートを作ると、残ったディレクトリが再利用される（添付が混在し得る）
  - 同名の添付が発生した場合、サフィックス（例: `foo 1.jpg`）で別名保存される

#### 準正常系
- メタタグが見つからない、取得できないなどの場合は、エラー通知し、元ノートのタイトルは変更しない

### summary_generator

#### 目的
- 論文を要約して、元ノートの下に追記する

#### 状態
- 未実装

#### 入力（要約対象）

- `paper_fetcher` が保存した HTML ファイルを入力とする
  - `path/to/{noteBaseName}/<id>.html`
- ネットワークからの再取得（`abs` 再取得等）は行わない
- HTML が存在しない（未取得/保存されていない/読めない）場合は要約を諦めて中断する
  - `Notice` で「HTML が無いため要約できない」等を通知する
  - ログに `result=NG` と `reason=<原因コード>` を必ず残す
    - 例: `result=NG reason=HTML_MISSING htmlPath=...`
    - 例: `result=NG reason=HTML_READ_FAILED htmlPath=... error=...`

##### 失敗時ログの reason（原因コード）

- `summary_generator` の失敗時は `result=NG` に加えて `reason=<原因コード>` を必須とする
- `reason` は機械的に集計/検索しやすい短い識別子とし、必要に応じて `error=...` や `path=...` 等の補足情報を付与する
- `reason` の例:
  - `HTML_MISSING`
  - `HTML_READ_FAILED`
  - `PROMPT_READ_FAILED`
  - `ENV_READ_FAILED`
  - `OPENAI_API_KEY_MISSING`
  - `OPENAI_REQUEST_FAILED`
  - `NOTE_WRITE_FAILED`
  - `NOTE_MOVED_OR_DELETED`

#### 出力（挿入位置・再実行時の挙動）

- ノート末尾に要約ブロックを挿入する
- 再実行時は「追記」ではなく「置換」とする
  - 置換の安定性のため、以下の目印コメントで囲む
    - `<!-- paper_extractor:summary:start -->`
    - `<!-- paper_extractor:summary:end -->`
  - 既存ブロックがあればその範囲を置換し、無ければ末尾に追加する

#### 生成方式（OpenAI固定）

- OpenAI API を利用して要約を生成する（OpenAI固定 / Provider切替はしない）

#### システムプロンプト

- システムプロンプトは Vault 内のファイルから読み込む
  - パスは設定で指定する（例: `.obsidian/paper_extractor/system_prompt_summary.md`）
- プロンプトの内容は公開されても問題ない前提

#### APIキー管理（Gitに乗せない）

- APIキーは Vault 内に保存しない
- Vault 外の `.env` ファイルから読み込む
  - 例: `~/.config/paper_extractor/.env`
  - 期待するキー名: `OPENAI_API_KEY`
- OpenAI のモデル名も Vault 外の `.env` ファイルから読み込む
  - 期待するキー名: `OPENAI_MODEL`
  - 未指定の場合はデフォルト値を用いる
- `.env` ファイルのパスは設定で指定する

#### 進捗通知（長時間処理）

- 高性能モデル利用により時間がかかる前提のため、段階的に `Notice` で進捗を通知する
  - 例: `(1/4) reading html` / `(2/4) loading prompt` / `(3/4) requesting OpenAI` / `(4/4) writing note`
- 失敗時は `Notice` に失敗理由（概要）を表示する

#### 非同期中のノート切替の扱い

- 実行開始時点で対象ノート（`TFile` または path）を確定し、そのノートに対して書き込む
- LLM応答待ちの間にユーザが別ノートを開いても、書き込み先は「開始時に確定したノート」を維持する
- 対象ノートが削除/リネームされた場合は失敗として扱い、`Notice` で通知する

## 開発指針

### 実装着手条件

- この文書（`dev_memo.md`）のMVP仕様が合意できた後、**ユーザが「実装を開始して良い」と明示した時点**でコード変更に入る。

### デプロイ手順（手動インストール / ローカル）

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

## 開発進捗

- [x] `paper_fetcher` 実装
- [x] `title_extractor` 実装
  - [x] 要件整理
  - [x] 実装
  - [x] テスト
- [ ] `summary_generator` 実装
  - [x] 要件整理
  - [ ] 実装
  - [ ] テスト
- [ ] ログ補強（`summary_generator` 開発時にまとめて実施）

## テスト

- `title_extractor` のテスト

### 前提

- Vault 内に `paper_extractor` を手動インストール済みであること
- `main.js` を更新した場合は Obsidian をリロードして反映すること
- Custom Attachment Location を利用している場合は、添付が `./{noteBaseName}/` 配下に作られる設定であること

### テストケース: `title_extractor` 単体（成功）

#### 手順

1. 新規ノート `hoge.md` を作成する（テンプレ準拠）
2. `###### url_01:` に arXiv のURLを設定する（例: `https://arxiv.org/abs/2601.05175`）
3. ノートをアクティブにした状態で、コマンド `Fetch arXiv (HTML/PDF) from active note` もしくはリボンアイコンを実行する

#### 期待結果

- `citation_title` から抽出されたタイトルがノート名に反映され、`hoge.md` が `{newTitle}.md` にリネームされる
- （Custom Attachment Location 利用時）対の添付ディレクトリ名も `./{newTitle}/` に追随して更新される
- その後 `paper_fetcher` が実行され、`./{newTitle}/` 配下に `<id>.html` と `<id>.pdf` が保存される

### テストケース: `citation_title` が取得できない（中断）

#### 手順

1. `###### url_01:` を arXiv 以外にする、もしくは arXiv の存在しないURLにする
2. コマンド/リボンを実行する

#### 期待結果

- `Notice` に失敗理由が表示される
- ノート名は変更されない
- `paper_fetcher` は実行されない

### テストケース: `/{newTitle}` が既に存在する（中断）

#### 手順

1. `hoge.md` を作成して `###### url_01:` を設定する
2. 事前に、`hoge.md` と同階層に `/{newTitle}` と同名のフォルダを作成する
   - `newTitle` は実行時にしか分からないため、一度実行して `Notice` のエラーに出たパスを使って再現してよい
3. コマンド/リボンを実行する

#### 期待結果

- `Notice` で `Target folder already exists: ...` が表示される
- ノート名は変更されない（副作用ゼロ）
- `paper_fetcher` は実行されない

### テストケース: `newTitle.md` が既に存在する（中断）

#### 手順

1. `hoge.md` を作成して `###### url_01:` を設定する
2. 事前に、`hoge.md` と同階層に `{newTitle}.md` を作成する
3. コマンド/リボンを実行する

#### 期待結果

- `Notice` で `Target note already exists: ...` が表示される
- ノート名は変更されない（副作用ゼロ）
- `paper_fetcher` は実行されない

### テストケース: タイトル正規化（禁止文字置換）

#### 手順

1. `citation_title` に禁止文字を含み得る論文（例: `:` や `?` を含むタイトル）を選び、`###### url_01:` を設定する
2. コマンド/リボンを実行する

#### 期待結果

- 禁止文字が `_` に置換された形で `{newTitle}.md` が作られる
- `newTitle` が空にならない限り成功する


{EOF}