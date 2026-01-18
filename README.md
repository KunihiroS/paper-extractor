# paper_extractor

paper_extractor is an Obsidian plugin that helps you create a paper note from an arXiv URL and then:

- Renames the note based on the paper title (from `citation_title`).
- Downloads arXiv HTML/PDF and saves them next to the note.
- Generates a summary and appends/replaces it in the note.

The plugin is designed to be used from the **Command Palette**.

## How it works

1. Run the command **Create paper note from arXiv URL**.
2. Enter an arXiv URL (e.g. `https://arxiv.org/abs/2601.05175`).
3. The plugin creates a new note in the Vault root from a user-defined template.
4. The note is renamed to the extracted paper title.
5. HTML/PDF are downloaded into a sibling folder.
6. A summary is generated and written into the note.

## Settings

Open **Settings → Community plugins → paper_extractor**.

### Required

- **Log directory (Vault path)** (`logDir`)
  - Example: `paper_extractor/logs`
- **Template path (Vault path)** (`templatePath`)
  - Example: `templates/paper_extractor.md`
  - The template must contain `{{url}}`.
- **System prompt path (Vault path)** (`systemPromptPath`)
  - Required for `summary_generator`.
  - Example: `.obsidian/paper_extractor/system_prompt_summary.md`
- **.env path (absolute path)** (`envPath`)
  - Required for `summary_generator`.
  - Example: `/home/you/.config/paper_extractor/.env`

`.env` file example:

```dotenv
# Required
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Optional
# - If empty or missing: summary generation is disabled (no AI request is sent)
# - Otherwise: used as the model name
OPENAI_MODEL="gpt-5.2"
```

## Template format

Your template file is a regular Markdown file stored inside the Vault. The plugin replaces these placeholders:

- `{{url}}` (required)
- `{{date}}` (optional, replaced as `YYYY-MM-DD`)
- `{{time}}` (optional, replaced as `HH:mm`)

Template example:

```text
###### Created:
{{date}} {{time}}
###### Tags:
#paper
###### url_01:
{{url}}
###### memo:

---
```

The summary is appended after the `---` line.

### Note

- A new note is created in the **Vault root**.
- Temporary name: `untitled_<timestamp>.md` (collision-safe)
- Then renamed based on `citation_title`.

### Attachments (HTML/PDF)

If the note path is:

- `path/to/<noteBaseName>.md`

Then downloaded files are saved to:

- Folder: `path/to/<noteBaseName>/`
- Files:
  - `<arxivId>.html`
  - `<arxivId>.pdf`

### Logs

- Logs are appended daily into `logDir`.
- File name: `paper_extractor_YYYYMMDD.log`
- Sensitive values are redacted before writing logs.

## Troubleshooting

- **"logDir is required"**
  - Set **Log directory (Vault path)**.
- **"templatePath is required" / "Template missing {{url}} placeholder"**
  - Set **Template path (Vault path)** and ensure your template contains `{{url}}`.
- **"Failed to read template"**
  - Verify the template path exists and is Vault-relative (not absolute).
- **Summary generation fails**
  - Verify `systemPromptPath` (Vault path) exists.
  - Verify `envPath` (absolute path) exists.
  - If you want summary generation enabled, set `OPENAI_MODEL` and `OPENAI_API_KEY` in `.env`.
  - If `OPENAI_MODEL` is empty, the plugin skips the AI request by design.
- **"Already running"**
  - The plugin prevents concurrent runs. Wait for the current run to finish.

## Security & privacy

- API keys must not be stored inside the Vault.
- The plugin reads OpenAI credentials from an external `.env` file.
- Logs enforce redaction to avoid accidentally writing secrets into files.

## Development

### Install

```bash
pnpm install
```

### Watch build

```bash
pnpm run dev
```

### Production build

```bash
pnpm run build
```

### Manual install (local)

Copy these files into your Vault:

- `main.js`
- `manifest.json`
- `styles.css` (if present)

Target folder:

`<Vault>/.obsidian/plugins/paper_extractor/`

Reload Obsidian and enable the plugin.

## Releasing

- Update `manifest.json` version.
- Update `versions.json` (plugin version → minimum Obsidian version).
- Create a GitHub release and attach `main.js`, `manifest.json`, and `styles.css`.

## Future development

- **External API / programmatic invocation**
  - Expose a stable API surface so other plugins (and optionally the Console/Templater) can run the same workflow programmatically.
  - Example direction:
    - `app.plugins.getPlugin("paper_extractor")` and a public method like `createPaperNoteFromUrl(url)`.
    - Optional `window` exposure behind an opt-in setting.
