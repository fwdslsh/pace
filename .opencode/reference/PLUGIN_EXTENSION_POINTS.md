# OpenCode Plugin Extension Points

A comprehensive reference for all extension points available to plugin developers.

---

## Table of Contents

- [1. Plugin Input Context](#1-plugin-input-context)
- [2. Available Hooks](#2-available-hooks)
  - [2.1 Configuration Hook](#21-configuration-hook-config)
  - [2.2 Event Hook](#22-event-hook-event)
  - [2.3 Tool Hook](#23-tool-hook-tool)
  - [2.4 Authentication Hook](#24-authentication-hook-auth)
  - [2.5 Chat Message Hook](#25-chat-message-hook-chatmessage)
  - [2.6 Chat Parameters Hook](#26-chat-parameters-hook-chatparams)
  - [2.7 Permission Hook](#27-permission-hook-permissionask)
  - [2.8 Tool Execution Before Hook](#28-tool-execution-before-hook-toolexecutebefore)
  - [2.9 Tool Execution After Hook](#29-tool-execution-after-hook-toolexecuteafter)
  - [2.10 Experimental: Messages Transform](#210-experimental-messages-transform)
  - [2.11 Experimental: Text Complete](#211-experimental-text-complete)
- [3. Custom Tool Extension Points](#3-custom-tool-extension-points)
- [4. Configuration Extension Points](#4-configuration-extension-points)
- [5. SDK Client Access](#5-sdk-client-access)
- [6. Shell Access](#6-shell-access)
- [7. Plugin Loading Mechanisms](#7-plugin-loading-mechanisms)
- [8. Tool Registry Extension](#8-tool-registry-extension)
- [9. Bus Event System](#9-bus-event-system)
- [Summary](#summary)

---

## 1. Plugin Input Context

When a plugin is initialized, it receives a `PluginInput` object containing everything needed to interact with OpenCode:

```ts
type PluginInput = {
  client: ReturnType<typeof createOpencodeClient> // SDK client for API calls
  project: Project // Project metadata
  directory: string // Current working directory
  worktree: string // Git worktree root
  $: BunShell // Bun's shell API
}
```

| Property    | Type                | Description                                      |
| ----------- | ------------------- | ------------------------------------------------ |
| `client`    | OpenCode SDK Client | Full API access to sessions, messages, providers |
| `project`   | `Project`           | Project metadata including name, git info, paths |
| `directory` | `string`            | Absolute path to current working directory       |
| `worktree`  | `string`            | Git worktree root path                           |
| `$`         | `BunShell`          | Bun's shell API for executing commands           |

---

## 2. Available Hooks

OpenCode provides 11 distinct hooks for extending functionality.

### 2.1 Configuration Hook (`config`)

Modify OpenCode configuration at startup.

- **Timing**: After config files are loaded, before full initialization
- **Input**: Full `Config` object
- **Returns**: `Promise<void>`

**Modifiable properties:**

- `theme` - UI theme
- `model` - Default model
- `agent` - Agent configurations
- `command` - Custom slash commands
- `permission` - Permission settings
- `keybinds` - Keyboard shortcuts
- `plugin` - Plugin list
- `provider` - Provider configurations
- `mcp` - MCP server settings
- `formatter` - Code formatters
- `lsp` - LSP settings
- `experimental` - Experimental features

```ts
export const MyPlugin: Plugin = async (ctx) => {
  return {
    config: async (config) => {
      config.theme = "custom-theme"
      config.model = "anthropic/claude-sonnet-4-20250514"

      if (!config.agent) config.agent = {}
      config.agent["custom"] = {
        prompt: "You are a helpful assistant",
        model: "anthropic/claude-sonnet-4-20250514",
      }
    },
  }
}
```

---

### 2.2 Event Hook (`event`)

Subscribe to system-wide events.

- **Input**: `{ event: Event }`
- **Returns**: `Promise<void>`

**Available event types:**

| Category     | Event Type               | Description                          |
| ------------ | ------------------------ | ------------------------------------ |
| Command      | `command.executed`       | Command finished executing           |
| File         | `file.edited`            | File was edited                      |
| File         | `file.watcher.updated`   | File system changes detected         |
| Installation | `installation.updated`   | OpenCode installation updated        |
| LSP          | `lsp.client.diagnostics` | LSP diagnostics received             |
| LSP          | `lsp.updated`            | LSP server status changed            |
| Message      | `message.part.removed`   | Message part was removed             |
| Message      | `message.part.updated`   | Message part was updated             |
| Message      | `message.removed`        | Message was removed                  |
| Message      | `message.updated`        | Message was updated                  |
| Permission   | `permission.replied`     | User responded to permission request |
| Permission   | `permission.updated`     | Permission settings changed          |
| Server       | `server.connected`       | Connected to OpenCode server         |
| Session      | `session.created`        | New session created                  |
| Session      | `session.compacted`      | Session was compacted                |
| Session      | `session.deleted`        | Session was deleted                  |
| Session      | `session.diff`           | Session diff generated               |
| Session      | `session.error`          | Session encountered an error         |
| Session      | `session.idle`           | Session became idle                  |
| Session      | `session.status`         | Session status changed               |
| Session      | `session.updated`        | Session was updated                  |
| Todo         | `todo.updated`           | Todo item was updated                |
| TUI          | `tui.prompt.append`      | Text appended to prompt              |
| TUI          | `tui.command.execute`    | Command executed in TUI              |
| TUI          | `tui.toast.show`         | Toast notification shown             |

```ts
export const EventLogger: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        console.log("Session completed:", event)
      }
    },
  }
}
```

---

### 2.3 Tool Hook (`tool`)

Add custom tools that OpenCode can use.

- **Format**: Object mapping tool names to `ToolDefinition`
- **Tool definition properties**:
  - `description`: String describing when to use the tool
  - `args`: Zod schema for arguments
  - `execute`: Async function receiving args and context

```ts
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomTools: Plugin = async (ctx) => {
  return {
    tool: {
      get_weather: tool({
        description: "Get current weather for a location",
        args: {
          location: tool.schema.string().describe("City name or zip code"),
          units: tool.schema.enum(["celsius", "fahrenheit"]).optional(),
        },
        async execute(args, context) {
          // context: { sessionID, messageID, agent, abort }
          const weather = await fetch(`https://api.weather.com/v1/current?location=${args.location}`)
          return `Weather in ${args.location}: ${await weather.text()}`
        },
      }),
    },
  }
}
```

---

### 2.4 Authentication Hook (`auth`)

Add custom authentication providers.

- **Structure**:
  - `provider`: Provider ID string
  - `loader`: Optional function to transform auth into provider options
  - `methods`: Array of authentication methods

**Method types:**

| Type    | Description                      |
| ------- | -------------------------------- |
| `oauth` | OAuth flow with URL and callback |
| `api`   | Direct API key entry             |

```ts
export const CustomAuth: Plugin = async (ctx) => {
  return {
    auth: {
      provider: "custom-provider",
      loader: async (auth, provider) => {
        const token = await auth()
        return {
          headers: { Authorization: `Bearer ${token.token}` },
        }
      },
      methods: [
        {
          type: "api",
          label: "Use API Key",
          prompts: [
            {
              type: "text",
              key: "apiKey",
              message: "Enter your API key",
              placeholder: "sk-...",
            },
          ],
          async authorize(inputs) {
            return {
              type: "success",
              key: inputs?.apiKey || "",
            }
          },
        },
        {
          type: "oauth",
          label: "Sign in with OAuth",
          async authorize(inputs) {
            return {
              method: "auto",
              url: "https://provider.com/oauth",
              instructions: "Sign in via browser",
              async callback() {
                return {
                  type: "success",
                  key: "auth-token",
                  provider: "custom-provider",
                }
              },
            }
          },
        },
      ],
    },
  }
}
```

---

### 2.5 Chat Message Hook (`chat.message`)

Process new user messages before they're handled.

- **Input**: `{ sessionID, agent?, model?, messageID? }`
- **Output** (mutable): `{ message: UserMessage, parts: Part[] }`

```ts
export const MessageProcessor: Plugin = async (ctx) => {
  return {
    "chat.message": async (input, output) => {
      console.log(`New message in session ${input.sessionID}`)

      // Modify message parts before processing
      for (const part of output.parts) {
        if (part.type === "text") {
          // Pre-process text
        }
      }
    },
  }
}
```

---

### 2.6 Chat Parameters Hook (`chat.params`)

Modify LLM parameters before requests.

- **Input**: `{ sessionID, agent, model, provider, message }`
- **Output** (mutable): `{ temperature, topP, options }`

```ts
export const ParamsModifier: Plugin = async (ctx) => {
  return {
    "chat.params": async (input, output) => {
      // Adjust temperature based on agent
      if (input.agent === "explore") {
        output.temperature = 0.9
      }

      // Add custom provider options
      output.options["custom_header"] = "value"
    },
  }
}
```

---

### 2.7 Permission Hook (`permission.ask`)

Control permission requests programmatically.

- **Input**: Full `Permission` object with `type`, `pattern`, `metadata`
- **Output** (mutable): `{ status: "ask" | "deny" | "allow" }`

```ts
export const AutoAllow: Plugin = async (ctx) => {
  return {
    "permission.ask": async (input, output) => {
      // Auto-allow safe tools
      if (input.type === "read" && !input.metadata?.filePath?.includes(".env")) {
        output.status = "allow"
      }

      // Auto-deny dangerous operations
      if (input.type === "bash" && input.metadata?.command?.includes("rm -rf /")) {
        output.status = "deny"
      }
    },
  }
}
```

---

### 2.8 Tool Execution Before Hook (`tool.execute.before`)

Intercept tool calls before execution.

- **Input**: `{ tool, sessionID, callID }`
- **Output** (mutable): `{ args }`

```ts
export const ToolInterceptor: Plugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      console.log(`About to execute: ${input.tool}`)

      // Block dangerous commands
      if (input.tool === "bash" && output.args.command.includes("rm -rf")) {
        throw new Error("Dangerous command blocked")
      }
    },
  }
}
```

---

### 2.9 Tool Execution After Hook (`tool.execute.after`)

Intercept tool calls after execution.

- **Input**: `{ tool, sessionID, callID }`
- **Output** (mutable): `{ title, output, metadata }`

```ts
export const ToolLogger: Plugin = async (ctx) => {
  return {
    "tool.execute.after": async (input, output) => {
      console.log(`Tool ${input.tool} completed`)

      // Modify output
      if (input.tool === "bash") {
        output.output = `[Logged] ${output.output}`
      }
    },
  }
}
```

---

### 2.10 Experimental: Messages Transform

> **Warning**: Experimental hooks may change without notice.

Transform message history before sending to LLM.

- **Input**: `{}`
- **Output** (mutable): `{ messages: { info: Message, parts: Part[] }[] }`

```ts
"experimental.chat.messages.transform": async (input, output) => {
  // Filter out system messages
  output.messages = output.messages.filter(m => m.info.role !== "system")
}
```

---

### 2.11 Experimental: Text Complete

> **Warning**: Experimental hooks may change without notice.

Modify text completion results.

- **Input**: `{ sessionID, messageID, partID }`
- **Output** (mutable): `{ text }`

```ts
"experimental.text.complete": async (input, output) => {
  output.text = output.text.trim()
}
```

---

## 3. Custom Tool Extension Points

### 3.1 Tool Context

Tools receive a context object during execution:

```ts
type ToolContext = {
  sessionID: string // Current session ID
  messageID: string // Current message ID
  agent: string // Active agent name
  abort: AbortSignal // Signal for cancellation
}
```

### 3.2 Zod Schema Integration

Full Zod schema support for argument validation:

```ts
import { tool } from "@opencode-ai/plugin"

tool({
  description: "Example tool",
  args: {
    name: tool.schema.string().describe("User name"),
    age: tool.schema.number().optional(),
    tags: tool.schema.array(tool.schema.string()),
    type: tool.schema.enum(["a", "b", "c"]),
  },
  async execute(args, context) {
    // args is fully typed
    return `Hello, ${args.name}`
  },
})
```

### 3.3 Return Format

| Plugin Type | Return Format                               |
| ----------- | ------------------------------------------- |
| Plugin tool | String (becomes tool output)                |
| MCP tool    | `{ title, output, metadata, attachments? }` |

---

## 4. Configuration Extension Points

Plugins can extend or modify these configuration areas through the `config` hook:

### 4.1 Agent Configuration

```ts
config.agent["my-agent"] = {
  name: "my-agent",
  description: "When to use this agent",
  model: "anthropic/claude-sonnet-4-20250514",
  prompt: "Custom system prompt",
  tools: { bash: false, edit: true },
  permission: { edit: "allow", bash: { "*": "ask" } },
  mode: "primary", // "primary" | "subagent" | "all"
  color: "#FF5733",
  temperature: 0.7,
  topP: 0.9,
  maxSteps: 50,
}
```

### 4.2 Command Configuration

```ts
config.command["my-command"] = {
  template: "Do something with $1",
  description: "Description shown in command list",
  agent: "build",
  model: "anthropic/claude-sonnet-4-20250514",
  subtask: true,
}
```

### 4.3 Provider Configuration

```ts
config.provider["my-provider"] = {
  name: "My Provider",
  env: ["MY_PROVIDER_API_KEY"],
  api: "https://api.provider.com",
  npm: "@ai-sdk/my-provider",
  options: { apiKey: "..." },
  models: {
    "model-1": {
      name: "Model One",
      limit: { context: 128000, output: 4096 },
      cost: { input: 0.001, output: 0.002 },
    },
  },
  whitelist: ["model-1"],
  blacklist: ["deprecated-model"],
}
```

### 4.4 MCP Server Configuration

```ts
// Local MCP server
config.mcp["local-server"] = {
  type: "local",
  command: ["node", "server.js"],
  environment: { DEBUG: "true" },
  enabled: true,
  timeout: 5000,
}

// Remote MCP server
config.mcp["remote-server"] = {
  type: "remote",
  url: "https://mcp.example.com",
  headers: { Authorization: "Bearer token" },
  oauth: { clientId: "...", scope: "read write" },
}
```

### 4.5 Permission Configuration

```ts
config.permission = {
  edit: "allow", // "ask" | "allow" | "deny"
  bash: {
    "*": "ask", // Default for all commands
    "git *": "allow", // Allow git commands
    "rm -rf *": "deny", // Block dangerous commands
  },
  webfetch: "allow",
  doom_loop: "ask",
  external_directory: "ask",
}
```

### 4.6 Keybind Configuration

```ts
config.keybinds = {
  leader: "ctrl+x",
  app_exit: "ctrl+c,ctrl+d,<leader>q",
  editor_open: "<leader>e",
  theme_list: "<leader>t",
  // ... many more keybinds available
}
```

### 4.7 Tool Enable/Disable

```ts
// Global tool settings
config.tools = {
  bash: true,
  edit: true,
  webfetch: false,
}

// Per-agent tool settings
config.agent["my-agent"].tools = {
  bash: false,
  todowrite: false,
}
```

---

## 5. SDK Client Access

Plugins receive the OpenCode SDK client for programmatic access:

```ts
export const SDKExample: Plugin = async ({ client }) => {
  return {
    tool: {
      example: tool({
        description: "Example using SDK",
        args: { sessionID: tool.schema.string() },
        async execute(args) {
          // Session operations
          const session = await client.session.get(args.sessionID)
          const sessions = await client.session.list()

          // Message operations
          const messages = await client.message.list({ sessionID: args.sessionID })

          // Provider information
          const providers = await client.provider.list()
          const models = await client.model.list()

          return "Done"
        },
      }),
    },
  }
}
```

---

## 6. Shell Access

Plugins receive Bun's `$` shell API:

```ts
export const ShellExample: Plugin = async ({ $ }) => {
  return {
    tool: {
      run_command: tool({
        description: "Run a shell command",
        args: { command: tool.schema.string() },
        async execute(args) {
          const result = await $`${args.command}`.text()
          return result
        },
      }),
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`osascript -e 'display notification "Done!" with title "OpenCode"'`
      }
    },
  }
}
```

---

## 7. Plugin Loading Mechanisms

### 7.1 Local Plugins

Automatically loaded from these directories:

| Location                              | Scope   |
| ------------------------------------- | ------- |
| `.opencode/plugin/*.{ts,js}`          | Project |
| `~/.config/opencode/plugin/*.{ts,js}` | Global  |

### 7.2 Config-based Plugins

Specify in `opencode.json` or `opencode.jsonc`:

```json
{
  "plugin": ["opencode-wakatime@1.0.0", "github:username/my-plugin-repo", "file:///absolute/path/to/plugin.ts"]
}
```

| Format                   | Description       |
| ------------------------ | ----------------- |
| `package@version`        | npm package       |
| `github:user/repo`       | GitHub repository |
| `file:///path/to/plugin` | Local file path   |

### 7.3 Default Plugins

Loaded unless `OPENCODE_DISABLE_DEFAULT_PLUGINS` is set:

- `opencode-copilot-auth@0.0.9`
- `opencode-anthropic-auth@0.0.5`

---

## 8. Tool Registry Extension

Custom tools can be registered through multiple mechanisms:

| Method                              | Priority | Description               |
| ----------------------------------- | -------- | ------------------------- |
| Plugin `tool` hook                  | 1        | Recommended approach      |
| `.opencode/tool/*.{ts,js}`          | 2        | Project-level tool files  |
| `~/.config/opencode/tool/*.{ts,js}` | 3        | Global tool files         |
| MCP servers                         | 4        | External MCP tool servers |

Tool files export tool definitions:

```ts
// .opencode/tool/my-tool.ts
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "My custom tool",
  args: { input: tool.schema.string() },
  async execute(args) {
    return `Processed: ${args.input}`
  },
})
```

---

## 9. Bus Event System

All internal events flow through the Bus system:

### 9.1 Event Structure

```ts
interface BusEvent {
  type: string // Event type identifier
  properties: object // Event-specific data
}
```

### 9.2 Subscribing to Events

Plugins subscribe via the `event` hook:

```ts
export const EventSubscriber: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created":
          console.log("New session:", event.properties.info.id)
          break
        case "file.edited":
          console.log("File edited:", event.properties.path)
          break
        case "tool.execute.after":
          console.log("Tool completed:", event.properties.tool)
          break
      }
    },
  }
}
```

### 9.3 Event Categories

| Category     | Events                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| Command      | `executed`                                                                      |
| File         | `edited`, `watcher.updated`                                                     |
| Installation | `updated`                                                                       |
| LSP          | `client.diagnostics`, `updated`                                                 |
| Message      | `part.removed`, `part.updated`, `removed`, `updated`                            |
| Permission   | `replied`, `updated`                                                            |
| Server       | `connected`                                                                     |
| Session      | `created`, `compacted`, `deleted`, `diff`, `error`, `idle`, `status`, `updated` |
| Todo         | `updated`                                                                       |
| TUI          | `prompt.append`, `command.execute`, `toast.show`                                |

---

## Summary

OpenCode provides a comprehensive plugin system with 11 distinct hooks:

| Hook                                   | Purpose                        |
| -------------------------------------- | ------------------------------ |
| `config`                               | Configuration modification     |
| `event`                                | Event subscription             |
| `tool`                                 | Custom tool registration       |
| `auth`                                 | Authentication providers       |
| `chat.message`                         | Message processing             |
| `chat.params`                          | LLM parameter modification     |
| `permission.ask`                       | Permission control             |
| `tool.execute.before`                  | Pre-execution interception     |
| `tool.execute.after`                   | Post-execution interception    |
| `experimental.chat.messages.transform` | Message history transformation |
| `experimental.text.complete`           | Text completion modification   |

Combined with:

- **Configuration extensions** for agents, commands, providers, MCP, permissions, keybinds
- **SDK access** for session, message, and provider operations
- **Shell access** via Bun's `$` API
- **Multiple loading mechanisms** for project and global plugins
- **Tool registry** for custom tool registration
- **Bus event system** for system-wide event handling

This enables plugins to deeply customize nearly every aspect of OpenCode's behavior.
