# @gloss-space/cli

Share your Gloss library with your agents. A command-line client and local MCP
server for searching and listing your highlights, bookmarks, tags, and
comments on [Gloss](https://gloss.space).

## Install

```bash
npm install -g @gloss-space/cli
```

Then authenticate via the browser (opens a consent screen on gloss.space):

```bash
gloss auth login
```

Or paste an existing API key directly:

```bash
gloss auth set-key gloss_sk_...
```

API keys are minted with read-only scope — the CLI and MCP server can only
search and list. Create/update/delete still requires a web session.

## Commands

### Search

```bash
gloss search "machine learning"
gloss search "react hooks" --type highlight --format json
gloss search "arxiv papers" --domain arxiv.org --after 2024-01-01
gloss search "reading list" --tag to-read --sortBy created
```

### List

```bash
gloss highlights --limit 50
gloss bookmarks --format csv
gloss tags --format json
```

### Other

```bash
gloss auth whoami          # show current user
gloss auth logout          # clear stored API key
```

### Output formats

All commands accept `--format`:

- `table` (default) — human-readable
- `json` — pipe to `jq`, feed to other tools
- `csv` — for spreadsheets
- `markdown` — for notes and docs

## MCP server (Claude Desktop, Cursor, etc.)

The package also ships a local MCP server that exposes the same read
capabilities to any MCP-compatible client.

```json
{
	"mcpServers": {
		"gloss": {
			"command": "npx",
			"args": ["-y", "@gloss-space/cli", "mcp"],
			"env": { "GLOSS_API_KEY": "gloss_sk_..." }
		}
	}
}
```

Or run the server directly:

```bash
gloss-mcp
```

Tools exposed: `search`, `list_highlights`, `list_bookmarks`, `list_tags`.

## Environment

- `GLOSS_API_KEY` — overrides the config-file key
- `GLOSS_API_URL` — overrides the default API endpoint
- `XDG_CONFIG_HOME` — controls where `gloss/config.json` is stored (defaults
  to `~/.config`)

## License

MIT. See `LICENSE`.
