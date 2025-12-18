# OpenCode SDK: Programmatic Usage Guide

This comprehensive guide covers how to use the OpenCode SDK to embed AI-powered coding assistance in your own applications, build custom integrations, and automate development workflows.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Core Concepts](#core-concepts)
5. [Entry Points](#entry-points)
6. [API Reference](#api-reference)
7. [Real-Time Events](#real-time-events)
8. [Integration Patterns](#integration-patterns)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)

---

## Overview

The OpenCode SDK (`@opencode-ai/sdk`) provides a TypeScript/JavaScript client for programmatically interacting with OpenCode's AI capabilities. Use cases include:

- **Chatbots & Assistants**: Build Slack, Discord, or custom chat integrations
- **Automation**: Batch process files, automate code reviews, or run AI-assisted CI/CD pipelines
- **Custom UIs**: Build your own frontend for OpenCode
- **IDE Extensions**: Create editor plugins with AI coding assistance
- **Headless Operations**: Run AI coding tasks without the TUI

## Installation

```bash
# Using bun
bun add @opencode-ai/sdk

# Using npm
npm install @opencode-ai/sdk

# Using pnpm
pnpm add @opencode-ai/sdk
```

## Quick Start

### Embedded Server + Client (Recommended)

The simplest way to get started is using `createOpencode()`, which starts an embedded server and returns a connected client:

```typescript
import { createOpencode } from "@opencode-ai/sdk"

// Start OpenCode with embedded server
const opencode = await createOpencode({
  cwd: "/path/to/project", // Working directory (defaults to process.cwd())
  port: 0, // Use 0 for random available port
})

// Create a session
const session = await opencode.client.session.create({
  body: { title: "My automation session" },
})

if (session.error) {
  console.error("Failed to create session:", session.error)
  process.exit(1)
}

// Send a prompt
const response = await opencode.client.session.prompt({
  path: { id: session.data.id },
  body: {
    parts: [{ type: "text", text: "Explain the main function in this project" }],
  },
})

// Get the response text
const text = response.data?.parts
  ?.filter((p) => p.type === "text")
  .map((p) => p.text)
  .join("\n")

console.log("Response:", text)

// Clean up when done
await opencode.server.kill()
```

### Connect to Existing Server

If OpenCode is already running, connect with `createOpencodeClient()`:

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:48372", // OpenCode server URL
})

const sessions = await client.session.list()
console.log("Active sessions:", sessions.data)
```

---

## Core Concepts

### Sessions

Sessions are the fundamental unit of conversation in OpenCode. Each session:

- Contains a sequence of messages (user prompts and AI responses)
- Maintains context across multiple exchanges
- Can be forked, shared, summarized, or reverted
- Tracks file changes made during the session

### Messages and Parts

Messages are composed of **parts**, which can be:

- `text`: Plain text content
- `tool`: Tool execution (file edits, bash commands, etc.)
- `file`: File attachments
- `step`: Multi-step reasoning

### Events

OpenCode emits real-time events via Server-Sent Events (SSE) for:

- Message streaming and updates
- Tool execution progress
- Session state changes
- File modifications

---

## Entry Points

The SDK provides three main entry points depending on your use case:

### `createOpencode(options)`

**Use when**: You want to start an embedded OpenCode server and get a connected client.

```typescript
import { createOpencode } from "@opencode-ai/sdk"

const opencode = await createOpencode({
  cwd: "/path/to/project", // Project directory
  port: 0, // 0 = random available port
})

// Returns:
// - opencode.client: Connected SDK client
// - opencode.server: Server process handle (for cleanup)
```

### `createOpencodeServer(options)`

**Use when**: You only need to start the server (e.g., for external clients).

```typescript
import { createOpencodeServer } from "@opencode-ai/sdk"

const server = await createOpencodeServer({
  cwd: "/path/to/project",
  port: 8080,
})

console.log("Server running at:", server.url)

// Later: server.kill() to stop
```

### `createOpencodeClient(options)`

**Use when**: Connecting to an already-running OpenCode server.

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:48372",
})
```

---

## API Reference

The client is organized into namespaces corresponding to different functionality areas.

### Session API (`client.session`)

Manage AI conversation sessions.

#### `session.list()`

List all sessions, sorted by most recently updated.

```typescript
const result = await client.session.list()
// result.data: Session[]
```

#### `session.create(options)`

Create a new session.

```typescript
const result = await client.session.create({
  body: {
    title: "My session", // Optional title
    parentID: "ses_abc123", // Optional parent for forking
  },
})
// result.data: Session { id, title, time, share, ... }
```

#### `session.get(options)`

Get session details.

```typescript
const result = await client.session.get({
  path: { id: "ses_abc123" },
})
```

#### `session.update(options)`

Update session properties.

```typescript
await client.session.update({
  path: { id: "ses_abc123" },
  body: { title: "New title" },
})
```

#### `session.delete(options)`

Delete a session and all its data.

```typescript
await client.session.delete({
  path: { id: "ses_abc123" },
})
```

#### `session.prompt(options)`

Send a message to the AI. This is the primary method for interaction.

```typescript
const result = await client.session.prompt({
  path: { id: "ses_abc123" },
  body: {
    parts: [
      { type: "text", text: "Fix the bug in auth.ts" },
      { type: "file", path: "/path/to/file.ts" }, // Attach files
    ],
    model: {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-20250514",
    },
    agent: "code", // Optional: specify agent
    noReply: false, // Set true to not wait for response
  },
})

// result.data: { info: AssistantMessage, parts: Part[] }
```

#### `session.messages(options)`

Get all messages in a session.

```typescript
const result = await client.session.messages({
  path: { id: "ses_abc123" },
  query: { limit: 50 }, // Optional limit
})

// result.data: Array<{ info: Message, parts: Part[] }>
```

#### `session.abort(options)`

Stop an in-progress AI response.

```typescript
await client.session.abort({
  path: { id: "ses_abc123" },
})
```

#### `session.fork(options)`

Create a new session from a specific point in conversation history.

```typescript
const forked = await client.session.fork({
  path: { id: "ses_abc123" },
  body: { messageID: "msg_xyz789" },
})
// forked.data: new Session
```

#### `session.share(options)` / `session.unshare(options)`

Create or remove a shareable link.

```typescript
const shared = await client.session.share({
  path: { id: "ses_abc123" },
})
console.log("Share URL:", shared.data?.share?.url)

await client.session.unshare({
  path: { id: "ses_abc123" },
})
```

#### `session.diff(options)`

Get all file changes made during the session.

```typescript
const diffs = await client.session.diff({
  path: { id: "ses_abc123" },
  query: { messageID: "msg_xyz789" }, // Optional: changes up to this message
})
// diffs.data: FileDiff[]
```

#### `session.summarize(options)`

Compact session history using AI summarization.

```typescript
await client.session.summarize({
  path: { id: "ses_abc123" },
  body: {
    providerID: "anthropic",
    modelID: "claude-sonnet-4-20250514",
  },
})
```

#### `session.todo(options)`

Get the todo list for a session.

```typescript
const todos = await client.session.todo({
  path: { id: "ses_abc123" },
})
// todos.data: Todo[]
```

#### `session.status()`

Get status of all sessions (active, idle, etc.).

```typescript
const status = await client.session.status()
// status.data: Record<sessionID, SessionStatus>
```

---

### Event API (`client.event`)

Subscribe to real-time events via Server-Sent Events.

#### `event.subscribe()`

Subscribe to all events for the current project.

```typescript
const subscription = await client.event.subscribe()

for await (const event of subscription.stream) {
  switch (event.type) {
    case "message.part.updated":
      const part = event.properties.part
      console.log("Part updated:", part.type, part.id)
      break

    case "session.updated":
      console.log("Session changed:", event.properties.info.id)
      break

    case "session.idle":
      console.log("Session finished:", event.properties.id)
      break

    case "file.updated":
      console.log("File changed:", event.properties.path)
      break
  }
}
```

---

### Project API (`client.project`)

Manage projects.

```typescript
// List all projects
const projects = await client.project.list()

// Get current project
const current = await client.project.current()

// Update project properties
await client.project.update({
  path: { id: "proj_abc123" },
  body: {
    name: "My Project",
    icon: { url: "https://example.com/icon.png", color: "#ff0000" },
  },
})
```

---

### Config API (`client.config`)

Read and update OpenCode configuration.

```typescript
// Get current config
const config = await client.config.get()

// Update config
await client.config.update({
  body: {
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    },
    autosave: true,
  },
})
```

---

### Provider API (`client.provider`)

Manage AI providers and authentication.

```typescript
// List available providers
const providers = await client.provider.list()
// providers.data: Provider[] with models, status, etc.

// Get auth methods for a provider
const methods = await client.provider.methods({
  path: { provider: "anthropic" },
})

// Authenticate with API key
await client.auth.set({
  body: {
    provider: "anthropic",
    key: "sk-ant-...",
  },
})
```

---

### File API (`client.file`)

Read files and check file status.

```typescript
// List files in project
const files = await client.file.list()

// Read file contents
const content = await client.file.read({
  path: { file: "src/index.ts" },
})

// Get file status (modified, staged, etc.)
const status = await client.file.status({
  path: { file: "src/index.ts" },
})
```

---

### Find API (`client.find`)

Search code and files.

```typescript
// Search file contents
const results = await client.find.text({
  query: { pattern: "function.*export", limit: 50 },
})

// Search file paths
const files = await client.find.file({
  query: { pattern: "*.test.ts" },
})

// Search symbols (functions, classes, etc.)
const symbols = await client.find.symbol({
  query: { pattern: "handleAuth" },
})
```

---

### MCP API (`client.mcp`)

Manage Model Context Protocol servers.

```typescript
// List MCP servers
const servers = await client.mcp.list()

// Get server details
const server = await client.mcp.get({
  path: { server: "my-mcp-server" },
})

// Enable/disable server
await client.mcp.enable({ path: { server: "my-server" } })
await client.mcp.disable({ path: { server: "my-server" } })
```

---

### PTY API (`client.pty`)

Manage pseudo-terminal sessions for shell access.

```typescript
// Create PTY session
const pty = await client.pty.create({
  body: {
    command: "/bin/bash",
    args: [],
    cwd: "/path/to/project",
    title: "My terminal",
  },
})

// List PTY sessions
const sessions = await client.pty.list()

// Connect to PTY (WebSocket)
await client.pty.connect({ path: { id: pty.data.id } })

// Remove PTY session
await client.pty.remove({ path: { id: pty.data.id } })
```

---

### Other APIs

#### Path API (`client.path`)

```typescript
const paths = await client.path.get()
// paths.data: { cwd, root, ... }
```

#### VCS API (`client.vcs`)

```typescript
const vcs = await client.vcs.get()
// vcs.data: { branch, dirty, ... }
```

#### LSP API (`client.lsp`)

```typescript
const status = await client.lsp.status()
// status.data: LSP server status
```

#### Tool API (`client.tool`) - Experimental

```typescript
const tools = await client.tool.list({
  query: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
})

const toolIds = await client.tool.ids()
```

#### App API (`client.app`)

```typescript
// List available agents
const agents = await client.app.agents()

// Access logs
const logs = await client.app.logs({ query: { level: "info" } })
```

#### Instance/Global APIs

```typescript
// Dispose current instance
await client.instance.dispose()

// Dispose all instances (global)
await client.global.dispose()

// Subscribe to global events
const events = await client.global.event()
```

---

## Real-Time Events

OpenCode uses Server-Sent Events (SSE) for real-time updates. Here are the key event types:

### Event Types

| Event                  | Description                        | Properties                   |
| ---------------------- | ---------------------------------- | ---------------------------- |
| `message.part.updated` | A message part was created/updated | `{ part: Part }`             |
| `session.updated`      | Session metadata changed           | `{ info: Session }`          |
| `session.idle`         | Session finished processing        | `{ id: string }`             |
| `file.updated`         | A file was modified                | `{ path: string }`           |
| `provider.updated`     | Provider config changed            | `{ info: Provider }`         |
| `config.updated`       | Config changed                     | `{ info: Config }`           |
| `mcp.updated`          | MCP server status changed          | `{ info: McpServer }`        |
| `permission.ask`       | Permission requested               | `{ permission: Permission }` |
| `pty.updated`          | PTY session changed                | `{ info: Pty }`              |

### Handling Tool Execution Updates

Tool parts have a `state` property that indicates execution status:

```typescript
const subscription = await client.event.subscribe()

for await (const event of subscription.stream) {
  if (event.type === "message.part.updated") {
    const part = event.properties.part

    if (part.type === "tool") {
      switch (part.state.status) {
        case "pending":
          console.log(`Tool ${part.tool} waiting...`)
          break
        case "running":
          console.log(`Tool ${part.tool} executing...`)
          break
        case "completed":
          console.log(`Tool ${part.tool}: ${part.state.title}`)
          console.log("Output:", part.state.output)
          break
        case "error":
          console.error(`Tool ${part.tool} failed:`, part.state.error)
          break
      }
    }
  }
}
```

---

## Integration Patterns

### Pattern 1: Slack Bot Integration

Complete example from `packages/slack/src/index.ts`:

```typescript
import { App } from "@slack/bolt"
import { createOpencode, type ToolPart } from "@opencode-ai/sdk"

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
})

// Start embedded OpenCode server
const opencode = await createOpencode({ port: 0 })

// Track sessions per Slack thread
const sessions = new Map<string, { sessionId: string; channel: string; thread: string }>()

// Subscribe to events for tool updates
;(async () => {
  const events = await opencode.client.event.subscribe()
  for await (const event of events.stream) {
    if (event.type === "message.part.updated") {
      const part = event.properties.part
      if (part.type === "tool" && part.state.status === "completed") {
        // Find session and post tool update to Slack
        for (const [, session] of sessions.entries()) {
          if (session.sessionId === part.sessionID) {
            await app.client.chat.postMessage({
              channel: session.channel,
              thread_ts: session.thread,
              text: `*${part.tool}* - ${part.state.title}`,
            })
            break
          }
        }
      }
    }
  }
})()

// Handle incoming messages
app.message(async ({ message, say }) => {
  if (!("text" in message) || !message.text) return

  const channel = message.channel
  const thread = message.thread_ts || message.ts
  const sessionKey = `${channel}-${thread}`

  let session = sessions.get(sessionKey)

  // Create session if needed
  if (!session) {
    const result = await opencode.client.session.create({
      body: { title: `Slack thread ${thread}` },
    })
    if (result.error) {
      await say({ text: "Failed to create session", thread_ts: thread })
      return
    }

    session = { sessionId: result.data.id, channel, thread }
    sessions.set(sessionKey, session)

    // Share session link
    const shared = await opencode.client.session.share({
      path: { id: result.data.id },
    })
    if (shared.data?.share?.url) {
      await app.client.chat.postMessage({
        channel,
        thread_ts: thread,
        text: shared.data.share.url,
      })
    }
  }

  // Send prompt
  const response = await opencode.client.session.prompt({
    path: { id: session.sessionId },
    body: { parts: [{ type: "text", text: message.text }] },
  })

  // Reply with response
  const text =
    response.data?.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n") || "No response"

  await say({ text, thread_ts: thread })
})

await app.start()
```

### Pattern 2: Batch File Processing

Process multiple files with AI assistance:

```typescript
import { createOpencode } from "@opencode-ai/sdk"

async function processFiles(files: string[], prompt: string) {
  const opencode = await createOpencode({ port: 0 })

  const session = await opencode.client.session.create({
    body: { title: "Batch processing" },
  })

  const results = []

  for (const file of files) {
    console.log(`Processing: ${file}`)

    const response = await opencode.client.session.prompt({
      path: { id: session.data!.id },
      body: {
        parts: [{ type: "text", text: `${prompt}\n\nFile: ${file}` }],
      },
    })

    results.push({
      file,
      response: response.data?.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n"),
    })
  }

  await opencode.server.kill()
  return results
}

// Usage
const results = await processFiles(
  ["src/auth.ts", "src/api.ts", "src/utils.ts"],
  "Review this file for security issues and suggest improvements",
)
```

### Pattern 3: Waiting for Session Completion

For automation, wait until the AI finishes processing:

```typescript
async function promptAndWait(client, sessionId: string, prompt: string) {
  // Start the prompt (non-blocking)
  await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: "text", text: prompt }] },
  })

  // Wait for completion via events
  const events = await client.event.subscribe()

  for await (const event of events.stream) {
    if (event.type === "session.idle" && event.properties.id === sessionId) {
      break
    }
  }

  // Get final messages
  const messages = await client.session.messages({
    path: { id: sessionId },
  })

  return messages.data
}
```

### Pattern 4: Permission Handling

Handle tool permission requests programmatically:

```typescript
const events = await client.event.subscribe()

for await (const event of events.stream) {
  if (event.type === "permission.ask") {
    const permission = event.properties.permission

    // Auto-approve or deny based on rules
    const approved = permission.tool === "Read" || permission.tool === "Glob" || permission.tool === "Grep"

    await client.session.command({
      path: { id: permission.sessionID },
      body: {
        command: approved ? "/allow" : "/deny",
        args: [permission.id],
      },
    })
  }
}
```

---

## Error Handling

All SDK methods return a result object with `data` and `error` properties:

```typescript
const result = await client.session.create({
  body: { title: "Test" },
})

if (result.error) {
  // Handle error
  console.error("Error:", result.error.code, result.error.message)

  switch (result.error.code) {
    case 400:
      console.error("Bad request - check your parameters")
      break
    case 404:
      console.error("Resource not found")
      break
    case 500:
      console.error("Server error")
      break
  }
} else {
  // Success
  console.log("Created session:", result.data.id)
}
```

### Common Error Types

- `BadRequestError` (400): Invalid parameters or request body
- `NotFoundError` (404): Session, project, or resource not found
- `ServerError` (500): Internal server error

---

## Best Practices

### 1. Clean Up Resources

Always clean up server processes when done:

```typescript
const opencode = await createOpencode({ port: 0 })

try {
  // Your code here
} finally {
  await opencode.server.kill()
}
```

### 2. Use Events for Real-Time Updates

Don't poll for status - subscribe to events:

```typescript
// Bad: Polling
while (true) {
  const status = await client.session.status()
  if (status.data[sessionId]?.status === "idle") break
  await sleep(1000)
}

// Good: Events
const events = await client.event.subscribe()
for await (const event of events.stream) {
  if (event.type === "session.idle") break
}
```

### 3. Handle Connection Errors

The event stream can disconnect. Implement reconnection logic:

```typescript
async function subscribeWithReconnect(client) {
  while (true) {
    try {
      const events = await client.event.subscribe()
      for await (const event of events.stream) {
        handleEvent(event)
      }
    } catch (error) {
      console.error("Event stream disconnected, reconnecting...")
      await sleep(1000)
    }
  }
}
```

### 4. Specify Models Explicitly

For consistent behavior, specify the model in your prompts:

```typescript
await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: prompt }],
    model: {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-20250514",
    },
  },
})
```

### 5. Use Appropriate Port Settings

- `port: 0` for embedded/automated use (random available port)
- Fixed port for external clients that need a known address

---

## TypeScript Types

The SDK exports comprehensive types for all entities:

```typescript
import type {
  Session,
  Message,
  Part,
  TextPart,
  ToolPart,
  Project,
  Provider,
  Model,
  Config,
  Event,
  Permission,
  FileDiff,
  Todo,
  Pty,
} from "@opencode-ai/sdk"
```

For the complete type definitions, see `/packages/sdk/js/src/gen/types.gen.ts`.

---

## Additional Resources

- **SDK Source**: `/packages/sdk/js/`
- **OpenAPI Spec**: `/packages/sdk/openapi.json`
- **Plugin API**: See `/docs/PLUGIN_EXTENSION_POINTS.md` for plugin development
- **Slack Example**: `/packages/slack/src/index.ts`
- **Official Docs**: https://opencode.ai/docs/sdk
