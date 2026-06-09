# codescout

Agentic Q&A over your codebases and documentation. Index a GitHub repository or upload documents, then ask any MCP-capable LLM client (Claude Desktop, Claude Code, Cursor, …) questions about it. The server runs a multi-step research agent - semantic search + symbol lookup + targeted file reads - and returns grounded answers backed by file paths and line ranges.

## Use cases

- Ask "how does X work" or "where is Y defined" inside Claude Desktop / Claude Code without switching tools
- Cross-project discovery - "do we have rate limiting in any of our projects?"
- Ground LLM agents (Claude Code, Cursor) in your own indexed code instead of training data
- Onboard new engineers with Q&A over the codebase and product docs in one place

## Setup

### 1. Run the server

Prerequisites: Node 18+, PostgreSQL 14+, OpenAI API key (Anthropic optional).

```bash
git clone <repository-url>
cd codescout
yarn install
```

Create `.env`: refer .env.example file at root

Apply migrations and start:

```bash
npx prisma migrate deploy
yarn start:dev
```

Server runs on `http://localhost:4000` by default (override with `PORT`).

### 2. Index a project

Create a project and index a repository or upload documents (Markdown / CSV / PDF) via the web UI or REST API. The server clones the repo, parses TypeScript / JavaScript code, generates file summaries + embeddings, and extracts symbols (classes, functions, types, enums) for fast lookup.

### 3. Connect from an LLM client

The MCP endpoint authenticates with OAuth 2.1 (Stytch as the authorization server). Clients discover the authorization server from the protected-resource metadata and run the login + consent flow themselves - no token to paste. Your Stytch-verified email must match an enabled user in the codescout database.

**Claude Desktop / ChatGPT.** Add a custom connector with the URL `https://<your-deploy>/v1/mcp` and complete the OAuth login when prompted.

**Claude Code:**

```bash
claude mcp add codescout https://<your-deploy>/v1/mcp --transport http
```

On first use the client opens the consent page, you sign in with Stytch, and the connection is authorized.

## License

MIT
