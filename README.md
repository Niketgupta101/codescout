# code-chat

Agentic Q&A over your codebases and documentation. Index a GitHub repository or upload documents, then ask any MCP-capable LLM client (Claude Desktop, Claude Code, Cursor, …) questions about it. The server runs a multi-step research agent — semantic search + symbol lookup + targeted file reads — and returns grounded answers backed by file paths and line ranges.

## Use cases

- Ask "how does X work" or "where is Y defined" inside Claude Desktop / Claude Code without switching tools
- Cross-project discovery — "do we have rate limiting in any of our projects?"
- Ground LLM agents (Claude Code, Cursor) in your own indexed code instead of training data
- Onboard new engineers with Q&A over the codebase and product docs in one place

## Setup

### 1. Run the server

Prerequisites: Node 18+, PostgreSQL 14+, OpenAI API key (Anthropic optional).

```bash
git clone <repository-url>
cd code-chat
yarn install
```

Create `.env`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/code_chat_dev?schema=public"
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."   # optional, for Claude models
```

Apply migrations and start:

```bash
npx prisma migrate deploy
yarn start:dev
```

Server runs on `http://localhost:4000` by default (override with `PORT`).

### 2. Index a project

Create a project and index a repository or upload documents (Markdown / CSV / PDF) via the web UI or REST API. The server clones the repo, parses TypeScript / JavaScript code, generates file summaries + embeddings, and extracts symbols (classes, functions, types, enums) for fast lookup.

### 3. Connect from an LLM client

Generate an API key from your code-chat account. Copy the `cck_`-prefixed token — it isn't shown again.

**Claude Desktop.** The Add Custom Connector UI only accepts OAuth credentials, so configure via the JSON config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "code-chat": {
      "url": "https://<your-deploy>/mcp",
      "headers": { "Authorization": "Bearer cck_..." }
    }
  }
}
```

Restart Claude Desktop.

**Claude Code:**

```bash
claude mcp add code-chat https://<your-deploy>/mcp \
  --transport http \
  --header "Authorization: Bearer cck_..."
```

## License

MIT
