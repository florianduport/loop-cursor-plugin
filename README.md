# loop-prompt

A **[Cursor plugin](https://cursor.com/docs/reference/plugins)** (and **[Open Plugins](https://open-plugins.com)-aligned** package) that expands one **prompt template** across many **items**—explicit lists, recursive directories, or **git-tracked files**—so you can run **one Agent chat per item** and avoid huge single prompts that lose context or skip files.

## Layout

| Manifest | Tool |
|----------|------|
| [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json) | Cursor |
| [`.plugin/plugin.json`](.plugin/plugin.json) | Open Plugins |

## Install (Cursor)

- Install the plugin from this repository (local path or marketplace when published).
- Optional: enable the **loop-prompt** MCP server in Cursor (the plugin ships [`.mcp.json`](.mcp.json)); if the server fails to start, use the CLI only.

Add `.loop/` to your app repo’s `.gitignore` (generated prompts and manifest).

## CLI: `loop-expand`

Requires **Node 18+**. From your **project root**:

```bash
node /path/to/this-repo/scripts/loop-expand.mjs --help
```

### Placeholders

| Token | Meaning |
|-------|---------|
| `{{item}}` | Value from a list, or absolute path in file modes |
| `{{index}}` | 1-based index |
| `{{path}}` | Absolute file path |
| `{{relpath}}` | Relative path (to `--dir` or repo for git) |
| `{{basename}}` | File name |

Use a literal `{{` as `\{{`.

### Examples

**Comma-separated list**

```bash
node scripts/loop-expand.mjs \
  --template 'Audit route: {{item}}' \
  --values '/login,/dashboard,/settings' \
  --force
```

**Lines or JSON array file**

```bash
# lines.txt = one value per line, or JSON: ["a","b"]
node scripts/loop-expand.mjs --template 'Task: {{item}}' --values-file ./urls.txt --force
```

**Recursive directory** (default ignores `node_modules`, `.git`, `dist`, `build`, `.next`, etc.)

```bash
node scripts/loop-expand.mjs \
  --template 'Refactor only {{relpath}} — do not touch other files.' \
  --dir ./src \
  --glob '**/*.tsx' \
  --force
```

**Git-tracked files only**

```bash
node scripts/loop-expand.mjs \
  --template 'Review {{relpath}} for a11y.' \
  --git-path apps/frontend \
  --glob '**/*.tsx' \
  --project-root . \
  --force
```

### Output

- `.loop/prompts/001-….md`, `002-….md`, … — **one full user message per file**
- `.loop/manifest.json` — `{ "items": [ { "index", "item", "file", "done" } ] }`
- `.loop/state.json` — metadata for MCP

### Flags

| Flag | Purpose |
|------|---------|
| `--out DIR` | Override output directory (default `.loop/prompts`) |
| `--manifest PATH` | Override manifest path |
| `--max-depth N` | With `--dir`, limit recursion depth |
| `--force` | Overwrite existing `*.md` in the output dir |
| `--confirm` | Allow more than **500** items (safety cap) |

### Edge cases

- **0 items** → exits with error (no files written).
- **\>500 items** without `--confirm` → refused; add `--confirm` after reviewing the count.
- **Non-empty output dir** without `--force` → error until you `--force` or clear `*.md`.

## Workflow: one chat per item

1. Run `loop-expand` from the app repo root.
2. Open **new Agent chat** → paste full contents of `.loop/prompts/001-….md` (or `@` that file).
3. Finish that scope only.
4. **New chat** for `002-….md`, and so on.

## Optional MCP

Tools (all require **`projectRoot`**: absolute path to your app repo):

| Tool | Purpose |
|------|---------|
| `loop_expand` | Same as CLI (`sourceType`: `list` \| `dir` \| `git`) |
| `loop_status` | Done / remaining / next index |
| `loop_next_prompt` | Full text of next incomplete prompt |
| `loop_mark_done` | Set `done: true` for a 1-based `index` after a chat completes |

If Cursor does not start the server from a relative path, set MCP command to:

`node` with args `[ "<absolute-path-to-this-plugin>/mcp/server.mjs" ]`.

## Manual test checklist (Cursor)

1. [ ] Install plugin; confirm **prompt-loop** skill / **expand-loop** command appear when relevant.
2. [ ] Run list mode with 2 values; open `001` / `002` in editor; placeholders substituted correctly.
3. [ ] Run `--dir` on a small folder with `--glob`; count matches expected files.
4. [ ] Run `--git-path` in a git repo with `--glob`; only tracked files included.
5. [ ] Without `--force`, re-run into non-empty `.loop/prompts` → error.
6. [ ] With `--confirm`, allow >500 (optional dry run with smaller set first).
7. [ ] If MCP enabled: `loop_expand` → `loop_next_prompt` → `loop_mark_done` → `loop_status` shows progress.

## Publishing

- [Cursor marketplace publish](https://cursor.com/marketplace/publish)
- [Open Plugins](https://open-plugins.com) consumers read `.plugin/plugin.json`.

## License

MIT
