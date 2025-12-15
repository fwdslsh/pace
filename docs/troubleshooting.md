# Troubleshooting

## General Issues

**No features progressing:**
Check that:

1. The coding agent prompt is appropriate for your project
2. Features are clearly defined in `feature_list.json`
3. The project environment is properly initialized (see `init.sh`)
4. The selected SDK is properly configured and accessible

## Claude SDK Issues

**Agent SDK not found:**

```bash
bun install @anthropic-ai/claude-agent-sdk
```

**API key not set:**

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

**Permission errors:**
The orchestrator uses `permissionMode: 'acceptEdits'` to auto-accept file edits. Adjust in the code if you need different behavior.

## OpenCode SDK Issues

**OpenCode SDK not found:**

```bash
bun install @opencode-ai/sdk
```

**Cannot connect to OpenCode server:**

1. Make sure OpenCode server is running:

   ```bash
   # Check if server is accessible
   curl http://localhost:4096/health
   ```

2. Set custom server URL if needed:

   ```bash
   export OPENCODE_SERVER_URL=http://your-server:4096
   ```

**Session events not streaming:**

- OpenCode SDK uses event streaming with session ID filtering
- Check that the OpenCode server is properly emitting events
- Verify network connectivity to the server
