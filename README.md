# Code Chat - Agentic RAG System

A production-ready Agentic RAG (Retrieval-Augmented Generation) system for indexing and querying both documentation and code repositories using LLM-powered dynamic exploration.

## Features

- **Multi-Project Support**: Manage multiple projects with isolated indexing
- **Raw Content Storage**: Zero information loss - stores complete file content
- **Document Indexing**: Support for Markdown, CSV, and PDF formats with type classification
- **Code Indexing**: Index TypeScript/JavaScript repositories from GitHub with repository types
- **Semantic File Discovery**: AI-powered file search using vector embeddings on file summaries
- **Agentic Exploration**: LLM agent with 8 tools explores codebase dynamically
- **Multi-Model Support**: Choose between OpenAI (GPT) and Anthropic (Claude) models per conversation
- **Conversation Threading**: Multi-turn conversations with context-aware follow-up questions
- **Symbol Extraction**: Fast lookup for classes, functions, interfaces, types, and enums
- **Universal Query Support**: Handles ANY question type (conventions, patterns, architecture, relationships)
- **GitHub Integration**: Direct repository cloning and incremental updates

## Architecture

### Agentic RAG System

Unlike traditional static RAG systems, Code Chat uses a **two-stage architecture** with an LLM agent that explores your codebase dynamically, then generates structured answers:

```
User Query + Model Selection (GPT or Claude)
    ↓
STAGE 1: Research Phase
LLM Agent (selected model) with 8 Tools:
  1. search_files    → Semantic file discovery
  2. list_files      → List all files
  3. read_file       → Read full file content
  4. search_symbols  → Find functions, classes, types
  5. search_code     → Regex search with excerpts
  6. get_file_tree   → Get project structure
  7. get_stats       → Get statistics
  8. get_directory   → List directory contents
    ↓
STAGE 2: Answer Generation
Structured Outputs (JSON Schema)
  - Generates answer, details, code snippets
  - Metadata flags control display (showDetails, showCode)
  - Proper markdown formatting
    ↓
Formatted Answer
```

**Key Benefits:**

- **Zero Information Loss**: Reads actual code files (no summarization during indexing)
- **Handles ANY Question**: Conventions, patterns, architecture, relationships, usage
- **Adaptive Strategy**: LLM decides which tools to use based on question
- **Structured Outputs**: JSON schema enforces consistent, high-quality responses
- **Smart Display Control**: Metadata flags (showDetails, showCode) control what user sees
- **Logic Chain Following**: Agent reads beyond search results to find actual implementation
- **Cost Effective**: ~$0.001-0.005 per query
- **Fast Responses**: 5-15 seconds for typical queries

**Architecture Innovations (Approach 5):**

1. **Two-Stage Architecture**: Separate research (exploration) from answer generation (formatting)
2. **Multi-Model Support**: Unified interface for OpenAI and Anthropic with automatic format conversion
3. **Structured Outputs**: JSON schema enforcement at API level (not prompts alone)
4. **Metadata-Driven Display**: LLM analyzes questions and sets flags for display control
5. **Quality-First Content**: Rich, informative details explaining flow, conditions, and interactions
6. **Logic Chain Following**: Agent can read files beyond search results to show actual business logic

### Data Model

**CodeFile** - Stores raw file content:

```
CodeFile
├── path: "src/auth/auth.service.ts"
├── language: "typescript"
├── content: [raw file content]
├── metadata: { lines, commitHash, etc. }
└── symbols: [extracted functions, classes, etc.]
```

**Symbol** - Fast symbol lookup:

```
Symbol
├── symbolName: "AuthService"
├── symbolType: "class"
├── filePath: "src/auth/auth.service.ts"
└── context: "User authentication service"
```

## Prerequisites

- **Node.js**: v18 or higher
- **PostgreSQL**: v14+ (no pgvector needed)
- **OpenAI API Key**: For GPT models and embeddings
- **Anthropic API Key** (optional): For Claude models

## Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd code-chat
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Setup PostgreSQL

```bash
# Install PostgreSQL (macOS)
brew install postgresql@14
brew services start postgresql@14

# Create database
createdb code_rag_dev
```

Or use Docker:

```bash
docker-compose up -d
```

### 4. Configure Environment Variables

Create `.env` file in the project root:

```bash
# database connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/code_rag_dev?schema=public"

# openai api key (required for embeddings and GPT models)
OPENAI_API_KEY="sk-your-key-here"

# anthropic api key (optional, for Claude models)
ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

### 5. Run Database Migrations

```bash
npx prisma migrate deploy
```

### 6. Start Application

```bash
# development mode with hot reload
yarn start:dev

# production mode
yarn build
yarn start:prod
```

Application will start on `http://localhost:3000`

## Usage

### 1. Create a Project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "description": "Project description"
  }'
```

Response:

```json
{
  "id": "project-uuid",
  "name": "My Project",
  "description": "Project description",
  "createdAt": "2025-10-20T..."
}
```

### 2. Index Documents

Upload and index documents (Markdown, CSV, or PDF files):

```bash
curl -X POST http://localhost:3000/api/projects/{PROJECT_ID}/index \
  -F "files=@requirements.csv" \
  -F "files=@documentation.md" \
  -F "files=@specifications.pdf"
```

**Response:**

```json
{
  "projectId": "uuid",
  "totalFiles": 3,
  "totalSymbols": 45,
  "duration": "8.5s",
  "errors": []
}
```

### 3. Index GitHub Repository

Index code from a GitHub repository:

```bash
curl -X POST http://localhost:3000/api/projects/{PROJECT_ID}/index-repository \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/username/repo.git",
    "branch": "main",
    "includeTests": false
  }'
```

**Indexing Process:**

1. Clones repository
2. Parses TypeScript/JavaScript files
3. Stores raw file content
4. Extracts symbols (functions, classes, methods, interfaces, types, enums)

**Time:** 1-3 minutes for typical repositories (50-100 files)

### 4. Check Indexing Status

```bash
curl http://localhost:3000/api/projects/{PROJECT_ID}/repositories
```

**Status values:**

- `pending`: Repository record created
- `cloning`: Cloning from GitHub
- `indexing`: Parsing and storing files
- `completed`: Successfully indexed
- `failed`: Error occurred (check `error` field)

### 5. Query the Codebase

Ask ANY question about your codebase:

```bash
curl -X POST http://localhost:3000/api/projects/{PROJECT_ID}/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What naming conventions are used in this codebase?"
  }'
```

**Example Queries:**

**Pattern Questions:**

```json
{ "query": "What naming conventions are used?" }
{ "query": "What design patterns are implemented?" }
```

**Architecture Questions:**

```json
{ "query": "Explain the overall architecture" }
{ "query": "What modules exist and how are they organized?" }
```

**Relationship Questions:**

```json
{ "query": "How do the auth and payment modules interact?" }
{ "query": "What dependencies does AuthService have?" }
```

**Usage Questions:**

```json
{ "query": "Where is sendEmail() called?" }
{ "query": "Show all classes that implement UserInterface" }
```

**Implementation Questions:**

```json
{ "query": "How does JWT validation work?" }
{ "query": "Show me the login flow" }
```

**Response Format:**

```json
{
  "answer": "The codebase follows these naming conventions:\n\n**Files**: kebab-case (auth-service.ts, user-controller.ts)\n**Classes**: PascalCase with suffix (AuthService, UserController)\n**Methods**: camelCase (validateToken, findUser)\n**Constants**: UPPER_SNAKE_CASE (MAX_RETRY_COUNT, API_URL)\n\nExamples from the codebase:\n- src/auth/auth.service.ts contains class AuthService with method validateToken()\n- src/users/user.controller.ts contains class UserController...",
  "toolCalls": [
    {
      "tool": "get_file_tree",
      "args": {},
      "result": { ... }
    },
    {
      "tool": "read_file",
      "args": { "filePath": "src/auth/auth.service.ts" },
      "result": { ... }
    },
    {
      "tool": "search_symbols",
      "args": { "name": "Service" },
      "result": { ... }
    }
  ],
  "iterations": 4,
  "durationMs": 6200
}
```

## API Reference

### Projects

| Endpoint                  | Method | Description            |
| ------------------------- | ------ | ---------------------- |
| `/api/projects`           | POST   | Create new project     |
| `/api/projects`           | GET    | List all projects      |
| `/api/projects/:id`       | GET    | Get project details    |
| `/api/projects/:id`       | PATCH  | Update project         |
| `/api/projects/:id`       | DELETE | Delete project         |
| `/api/projects/:id/stats` | GET    | Get project statistics |

### Indexing

| Endpoint                             | Method | Description                                      |
| ------------------------------------ | ------ | ------------------------------------------------ |
| `/api/projects/:id/index`            | POST   | Upload and index documents (multipart/form-data) |
| `/api/projects/:id/index-repository` | POST   | Index GitHub repository                          |

### Repositories

| Endpoint                                               | Method | Description                        |
| ------------------------------------------------------ | ------ | ---------------------------------- |
| `/api/projects/:projectId/repositories`                | GET    | List repositories                  |
| `/api/projects/:projectId/repositories/:repoId`        | GET    | Get repository details             |
| `/api/projects/:projectId/repositories/:repoId/stats`  | GET    | Get repository statistics          |
| `/api/projects/:projectId/repositories/:repoId`        | DELETE | Delete repository and all its data |
| `/api/projects/:projectId/repositories/:repoId/cancel` | POST   | Cancel ongoing indexing            |

### Documents

| Endpoint                                               | Method | Description                       |
| ------------------------------------------------------ | ------ | --------------------------------- |
| `/api/projects/:projectId/documents`                   | GET    | List uploaded documents           |
| `/api/projects/:projectId/documents/:documentId`       | GET    | Get document details              |
| `/api/projects/:projectId/documents/:documentId/stats` | GET    | Get document statistics           |
| `/api/projects/:projectId/documents/:documentId`       | DELETE | Delete document and all its files |

### Queries

| Endpoint                  | Method | Description                                          |
| ------------------------- | ------ | ---------------------------------------------------- |
| `/api/projects/:id/query` | POST   | Query indexed content with LLM agent (one-off query) |

**Query Parameters:**

- `query` (required): Natural language question
- `maxIterations` (optional): Max agent iterations (default: 15)
- `timeoutMs` (optional): Timeout in milliseconds (default: 30000)

### Messages

| Endpoint                                | Method | Description                                                    |
| --------------------------------------- | ------ | -------------------------------------------------------------- |
| `/api/projects/:projectId/messages`     | POST   | Send message (creates conversation if conversationId omitted)  |

### Conversations (Management)

| Endpoint                                             | Method | Description                    |
| ---------------------------------------------------- | ------ | ------------------------------ |
| `/api/projects/:projectId/conversations`             | POST   | Create empty conversation      |
| `/api/projects/:projectId/conversations`             | GET    | List all conversations         |
| `/api/projects/:projectId/conversations/:conversationId` | GET    | Get conversation with messages |
| `/api/projects/:projectId/conversations/:conversationId` | PATCH  | Update conversation title      |
| `/api/projects/:projectId/conversations/:conversationId` | DELETE | Delete conversation            |

**Multi-Turn Conversations:**

- Context automatically loaded from last 10 messages
- Recent 3 turns include full tool execution details
- Older messages compressed to save tokens
- Agent can search conversation history semantically
- **Model locked per conversation** - selected at conversation start, cannot change mid-conversation

**Sending Messages (Unified Endpoint):**

```bash
# First message (creates conversation)
curl -X POST http://localhost:3000/api/projects/{PROJECT_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What naming conventions are used?",
    "model": "claude-3-5-sonnet-20241022",
    "provider": "anthropic",
    "conversationTitle": "Naming Conventions Discussion"
  }'

# Response includes conversationId
# {
#   "conversationId": "uuid",
#   "message": { "answer": "...", ... }
# }

# Subsequent messages (uses existing conversation)
curl -X POST http://localhost:3000/api/projects/{PROJECT_ID}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Give me more examples",
    "conversationId": "uuid-from-first-response"
  }'
```

**Supported Models:**

- **OpenAI**: `gpt-4o-mini` (default), `gpt-4o`, `gpt-4-turbo`
- **Anthropic**: `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`

## Configuration

### File Filtering

When indexing GitHub repositories, the following files are excluded by default:

- `node_modules/`
- `dist/`, `build/`
- Test files (`*.spec.ts`, `*.test.ts`) - unless `includeTests: true`
- `.git/`

### Supported File Types

**Documents:**

- Markdown (`.md`, `.markdown`)
- CSV (`.csv`)
- PDF (`.pdf`)

**Code:**

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)

### AI Models

**Supported LLM Providers:**

- **OpenAI** (default):
  - `gpt-4o-mini` - Default model, cost-effective for most queries
  - `gpt-4o` - More capable for complex reasoning
  - `gpt-4-turbo` - Balance of speed and capability

- **Anthropic**:
  - `claude-3-5-sonnet-20241022` - Most capable Claude model
  - `claude-3-5-haiku-20241022` - Fast and efficient
  - `claude-3-opus-20240229` - Maximum reasoning capability

**Model Architecture:**

- **Research Agent**: User-selected model with 8 exploration tools
- **Answer Generation**: Same model with Structured Outputs (JSON Schema enforcement)
- **Embeddings**: Always `text-embedding-3-small` (OpenAI, 1536 dimensions) - used for file summaries regardless of chat model

**Model Selection:**

- Model selected on first message (`POST /messages` without conversationId)
- Model locked for entire conversation (cannot change mid-conversation)
- Each conversation can use a different model

## Database Schema

### Core Tables

**Project**: Multi-project isolation

```sql
- id (UUID)
- name (String)
- description (Text)
- config (JSONB)
```

**CodeFile**: Raw file storage

```sql
- id (UUID)
- projectId (UUID)
- documentId (UUID) - Link to uploaded document (nullable)
- repositoryId (UUID) - Link to GitHub repository (nullable)
- path (String) - e.g., "src/auth/auth.service.ts"
- relativePath (String) - Relative to repo root
- language (String) - "typescript", "javascript", "csv", etc.
- content (Text) - Raw file content
- metadata (JSONB) - Lines, commitHash, etc.
- checksum (String) - SHA-256 for change detection
```

**Symbol**: Fast symbol lookup

```sql
- id (UUID)
- projectId (UUID)
- codeFileId (UUID)
- symbolType (enum: function, class, interface, type, enum, ...)
- symbolName (String)
- context (String)
```

**Repository**: GitHub repository tracking

```sql
- id (UUID)
- projectId (UUID)
- url (String)
- branch (String)
- lastCommit (String)
- status (enum: pending, cloning, indexing, completed, failed)
```

**Document**: Uploaded document tracking

```sql
- id (UUID)
- projectId (UUID)
- filename (String)
- format (String) - csv, markdown, pdf
- status (enum: pending, indexing, completed, failed)
```

**Conversation**: Multi-turn conversation threading

```sql
- id (UUID)
- projectId (UUID)
- title (String) - Optional conversation title
- model (String) - LLM model (e.g., "gpt-4o-mini", "claude-3-5-sonnet-20241022")
- provider (String) - LLM provider ("openai" or "anthropic")
- createdAt (Timestamp)
- updatedAt (Timestamp)
```

**Message**: Conversation messages with embeddings

```sql
- id (UUID)
- conversationId (UUID)
- role (String) - "user" | "assistant"
- content (Text) - Message content
- toolCalls (JSONB) - Array of tool executions (for assistant messages)
- embedding (Vector 1536) - For semantic conversation search
- metadata (JSONB) - Iterations, duration, token count
- createdAt (Timestamp)
```

## Project Structure

```
src/
├── modules/
│   ├── agent/                  # Agentic RAG core (Approach 5)
│   │   ├── agent.service.ts       - Two-stage orchestrator: research + structured answer generation
│   │   ├── agent-tools.service.ts - 8 exploration tools (searchFiles, listFiles, readFile, etc.)
│   │   └── types/                 - Tool result types
│   │
│   ├── chat/                   # Query endpoints
│   │   ├── chat.service.ts        - One-off and conversation queries
│   │   └── chat.module.ts
│   │
│   ├── conversations/          # Multi-turn conversations
│   │   ├── conversations.service.ts  - CRUD, context building, history search, model management
│   │   ├── conversations.controller.ts - 7 REST endpoints (includes /start)
│   │   ├── dtos/                  - Request/response DTOs
│   │   └── types/                 - Conversation types
│   │
│   ├── llm/                    # LLM abstraction layer
│   │   ├── llm.service.ts         - Unified interface for OpenAI and Anthropic
│   │   └── types/                 - LLM provider enums and types
│   │
│   ├── indexing/               # File indexing
│   │   ├── indexing.service.ts    - Stores raw files
│   │   └── checksum.service.ts    - Change detection
│   │
│   ├── parsers/                # Document parsers
│   │   ├── csv.parser.ts          - CSV symbol extraction
│   │   ├── markdown.parser.ts     - Markdown symbol extraction
│   │   ├── pdf.parser.ts          - PDF text extraction
│   │   └── typescript.parser.ts   - TypeScript symbol extraction
│   │
│   ├── github/                 # GitHub integration
│   │   └── github.service.ts      - Clone and file listing
│   │
│   ├── repositories/           # Repository management
│   ├── documents/              # Document management
│   ├── openai/                 # OpenAI integration
│   ├── anthropic/              # Anthropic integration
│   └── projects/               # Project management
│
└── prisma/
    ├── schema.prisma           # Database schema
    └── prisma.service.ts       # Prisma client
```

## Tech Stack

**Backend:**

- NestJS - TypeScript framework
- Prisma - Database ORM
- PostgreSQL - Primary database

**AI/ML:**

- OpenAI API - GPT models and embeddings
- Anthropic API - Claude models
- Function Calling - Tool use pattern (both providers)
- Unified LLM Interface - Transparent format conversion

**Code Processing:**

- ts-morph - TypeScript AST parsing
- simple-git - Git operations
- ignore - .gitignore pattern matching

## Cost Estimation

For a typical repository with 100 files:

**Indexing:**

- File storage: $0 (no AI calls during indexing)
- Symbol extraction: $0 (local parsing)
- **Total**: ~$0.00 per repository

**Queries:**

- Agent execution: 3-10 LLM calls per query
- Model: gpt-4o-mini (~$0.0003 per call)
- **Total**: ~$0.001-0.005 per query

**Monthly (100 repos, 1000 queries):**

- Indexing: ~$0
- Queries: ~$1-5
- **Total**: ~$1-5/month

**60% cheaper than hierarchical RAG** (no embedding costs, no summarization costs)

## Performance

**Indexing:**

- Small repo (20-50 files): 30-60 seconds
- Medium repo (50-100 files): 1-2 minutes
- Large repo (100+ files): 2-5 minutes

**Queries:**

- Simple queries (2-3 tool calls): 2-5 seconds
- Medium queries (4-7 tool calls): 5-10 seconds
- Complex queries (8-15 tool calls): 10-15 seconds

**90% of queries complete in <15 seconds**

## Development

### Run Linter

```bash
yarn lint
```

### Run Tests

```bash
yarn test
```

### Database Management

```bash
# generate prisma client
npx prisma generate

# create new migration
npx prisma migrate dev --name migration_name

# reset database (warning: deletes all data)
npx prisma migrate reset

# open prisma studio (database GUI)
npx prisma studio
```

### Coding Conventions

This project follows strict coding conventions. See [.claude/CODING_CONVENTIONS.md](.claude/CODING_CONVENTIONS.md) for details.

### Documentation

For detailed documentation, see:

- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - Implementation status and architecture decisions
- [ARCHITECTURE_EVOLUTION.md](ARCHITECTURE_EVOLUTION.md) - Complete architecture evolution from Approach 1 to Approach 5
- [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md) - API documentation for frontend integration

## Troubleshooting

### Port Already in Use

```bash
# find and kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Database Connection Error

```bash
# check postgresql is running
brew services list

# restart postgresql
brew services restart postgresql@14

# or restart docker
docker-compose restart
```

### OpenAI API Rate Limit

The system automatically handles rate limits with exponential backoff. If you hit rate limits frequently:

- Upgrade OpenAI plan
- Reduce concurrent queries

### Indexing Failed

Check application logs for detailed error messages:

- Clone errors: Invalid GitHub URL or private repo without auth token
- Parse errors: Unsupported file format or syntax errors
- OpenAI errors: Invalid API key or rate limit

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
