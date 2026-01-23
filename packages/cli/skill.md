# /gloss

Search your Gloss highlights, bookmarks, and comments from the command line.

## Prerequisites

Install and authenticate the Gloss CLI:

```bash
# Install globally
npm install -g @gloss/cli

# Authenticate via browser
gloss auth login

# Or set an API key directly
gloss auth set-key gloss_sk_your_key_here
```

## Commands

### Search
Search across all your content:
```bash
gloss search "machine learning"
gloss search "react hooks" --type highlight --format json
gloss search "arxiv papers" --domain arxiv.org --after 2024-01-01
gloss search "reading list" --tag to-read --sortBy created
```

### List Highlights
```bash
gloss highlights
gloss highlights --limit 50 --format markdown
```

### List Bookmarks
```bash
gloss bookmarks
gloss bookmarks --limit 100 --format csv
```

### List Tags
```bash
gloss tags
gloss tags --format json
```

## Output Formats

All commands support `--format` with these options:
- `table` (default) - Human-readable table
- `json` - JSON output for piping to other tools
- `csv` - CSV for spreadsheets
- `markdown` - Markdown for documentation

## MCP Server

For LLM integration via MCP, run the MCP server:

```bash
# Run the MCP server
gloss-mcp

# Or with npx
npx @gloss/cli mcp
```

Configure in Claude Desktop or other MCP clients:

```json
{
  "mcpServers": {
    "gloss": {
      "command": "npx",
      "args": ["@gloss/cli", "mcp"],
      "env": { "GLOSS_API_KEY": "gloss_sk_..." }
    }
  }
}
```

## Environment Variables

- `GLOSS_API_KEY` - API key for authentication (overrides config file)
- `GLOSS_API_URL` - API server URL (default: https://api.gloss.agus.sh)
