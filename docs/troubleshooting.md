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

## Token Usage Tracking Issues

**Missing token data in output:**

Token usage data may not appear for several reasons. Below are common causes and solutions.

### SDK Version Requirements

**OpenCode SDK:**

- **Required:** OpenCode SDK >= 1.2.0 for full token tracking support
- **Partial support:** SDK 1.1.x may provide limited token data
- **No support:** SDK < 1.1.0 does not include token usage tracking

Check your SDK version:

```bash
bun list @opencode-ai/sdk
```

Update if needed:

```bash
bun update @opencode-ai/sdk
```

**Claude SDK:**

- **Required:** Claude Agent SDK >= 0.5.0 for token tracking
- **Note:** Token tracking depends on provider API support

### Why Tokens Might Not Appear

1. **SDK version incompatible:** Using an older SDK version that doesn't support token tracking
2. **External server configuration:** OpenCode server not configured to emit token events
3. **Network interruptions:** Token events lost due to connection issues
4. **Session type:** Some session types (dry-run, validation) intentionally skip token tracking
5. **Provider limitations:** Certain AI providers may not expose token usage data
6. **Configuration disabled:** Token tracking explicitly disabled in configuration

### Verification Steps

**1. Check SDK Compatibility:**

```bash
# Check OpenCode SDK version
npm list @opencode-ai/sdk

# Check Claude SDK version
npm list @anthropic-ai/claude-agent-sdk
```

**2. Verify OpenCode Server Events:**

```bash
# Test event streaming
curl -N http://localhost:4096/events?session=test
```

**3. Check progress.txt for Token Data:**

```bash
# Look for token entries
grep -i "token" progress.txt
```

**4. Test with Known Working Session:**

```bash
# Run a simple test session
pace --dry-run
```

### Manual Token Tracking Workarounds

When automatic token tracking isn't available, use these manual approaches:

#### Method 1: Provider Dashboard Tracking

**Anthropic Claude:**

1. Visit console.anthropic.com
2. Navigate to Usage section
3. Filter by API key and time range
4. Note token usage before/after sessions

**OpenAI GPT:**

1. Visit platform.openai.com/usage
2. Monitor real-time usage during sessions
3. Export usage data for tracking

#### Method 2: Manual Entry with --tokens Flag

```bash
# After completing a session, manually add tokens
pace update F001 pass --tokens-input 1234 --tokens-output 5678

# Or add both at once
pace update F001 pass --tokens 6912
```

#### Method 3: Session Script Wrapper

Create a wrapper script to track tokens manually:

```bash
#!/bin/bash
# track-session.sh

SESSION_START=$(date)
echo "Session started: $SESSION_START"

# Run pace command
pace "$@"

SESSION_END=$(date)
echo "Session ended: $SESSION_END"

echo "Check your provider dashboard for token usage between these times:"
echo "Start: $SESSION_START"
echo "End: $SESSION_END"
```

#### Method 4: Environment Variable Tracking

```bash
# Set session identifier for easier dashboard tracking
export PACE_SESSION_ID="feature-$(date +%Y%m%d-%H%M%S)"
pace run

# Later check dashboard using this session identifier
```

### Configuration Options

**Enable/Disable Token Tracking:**

```json
// pace.json
{
  "tokenTracking": {
    "enabled": true,
    "fallbackToManual": true,
    "warnOnMissing": true
  }
}
```

**Budget Monitoring:**

```json
{
  "tokenTracking": {
    "budget": {
      "daily": 100000,
      "weekly": 500000,
      "warnThreshold": 0.8
    }
  }
}
```

### Debug Mode for Token Issues

Enable debug logging to identify token tracking problems:

```bash
# Enable debug mode
export DEBUG=pace:tokens
pace run --verbose

# Check for debug messages about token extraction
grep "token" /tmp/pace-debug.log
```

### FAQ: Token Usage

**Q: Why do I see "Token tracking not supported" messages?**
A: Your SDK version doesn't support token tracking. Update to OpenCode SDK >= 1.2.0 or Claude SDK >= 0.5.0.

**Q: Token counts show as 0 even during active sessions?**
A: This usually indicates SDK version is too old or external server isn't emitting token events.

**Q: Can I track tokens without SDK support?**
A: Yes, use manual tracking methods: provider dashboards, manual entry with --tokens flag, or session wrappers.

**Q: Why do dry-run sessions show no token data?**
A: Dry-run mode intentionally skips token tracking since no actual API calls are made. The dry-run mode is designed for testing without actual usage.

**Q: My tokens disappeared after a server restart?**
A: Token data is stored in progress.txt. Ensure this file isn't deleted and has proper write permissions.

**Q: How accurate is automatic token tracking?**
A: Very accurate when SDK support is available. Tokens are counted directly from provider API responses.

**Q: Can I export token data for external analysis?**
A: Yes, use the export functionality:

```bash
pace status --export-tokens tokens.csv
```

### Getting Help

If token tracking issues persist:

1. **Check logs:** Look for token-related error messages
2. **Verify dependencies:** Ensure all SDKs are up to date
3. **Test minimal case:** Try with a simple, single session
4. **Report issue:** Include SDK versions, error messages, and configuration

For additional help:

- See [Token Usage Examples](token-usage-examples.md) for working output formats
- See [SDK Event Format](SDK_EVENT_FORMAT_TOKEN_EXTRACTION.md) for technical details
- Check GitHub issues for similar problems
