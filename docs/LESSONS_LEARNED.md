# Lessons Learned: Building the Pace CLI

**Project**: Pace - Pragmatic Agent for Compounding Engineering  
**Timeline**: Development through December 2025  
**Document Purpose**: Capture key insights, challenges, and solutions from building a production-grade AI orchestration CLI

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture & Design Lessons](#architecture--design-lessons)
3. [Event Streaming & Real-Time Output](#event-streaming--real-time-output)
4. [Token Usage & Cost Management](#token-usage--cost-management)
5. [Context Management & Optimization](#context-management--optimization)
6. [SDK Integration Challenges](#sdk-integration-challenges)
7. [Testing & Quality Assurance](#testing--quality-assurance)
8. [Performance & Caching](#performance--caching)
9. [Developer Experience](#developer-experience)
10. [Production Readiness](#production-readiness)

---

## Executive Summary

### What Went Well

- **Modular Architecture**: Separation of concerns (feature-manager, validators, status-reporter) enabled independent testing and maintenance
- **Comprehensive Testing**: 100+ tests with 69 CLI integration tests caught regressions early
- **Token Tracking**: Automatic extraction from SDK events provided visibility into costs
- **Workflow Design**: Multi-session agent pattern with structured state management proved robust
- **Progressive Enhancement**: Started simple, added features incrementally without breaking existing functionality

### What We'd Do Differently

- **Event Deduplication from Day 1**: Would have implemented deduplication logic immediately rather than after observing duplicates in production
- **Context Optimization Earlier**: 90% token waste went undetected until systematic analysis; should have profiled context size from the start
- **Unified Parser Upfront**: Four separate parsing implementations created tech debt that took significant effort to consolidate
- **Caching Strategy**: Would have designed caching layer before implementing multiple file-reading operations

### Key Metrics

- **Token Usage Reduction**: 90% reduction (150KB → 15KB context) through smart optimization
- **Parse Performance**: 4-5x faster (65-115ms → 15-25ms) with unified parser
- **Code Reduction**: 340 lines eliminated by consolidating four parsers into one
- **Test Coverage**: 100+ tests across unit, integration, and E2E scenarios
- **Bug Detection**: Duplicate output issues caught and fixed before major user impact

---

## Architecture & Design Lessons

### Lesson 1: Modular Design Pays Dividends

**What We Did:**

```
src/
├── feature-manager.ts     # Feature CRUD operations
├── validators.ts          # Validation logic
├── status-reporter.ts     # Status display
├── token-exporter.ts      # Token data export
├── progress-parser.ts     # Unified progress parsing (Phase 2)
└── opencode/
    ├── pace-config.ts     # Configuration loading
    ├── agents/            # Agent prompts
    └── commands/          # Command definitions
```

**Why It Worked:**

- Each module had a single, well-defined responsibility
- Changes to one module rarely required changes to others
- Testing was straightforward with clear boundaries
- New features could be added without modifying existing code

**Lesson Learned:**

> **Start with separation of concerns from day one.** Even if it feels like "over-engineering" for a small project, the modular structure made it trivial to add new features like token tracking, export functionality, and archive management without refactoring existing code.

**Anti-Pattern to Avoid:**  
Putting all logic in `cli.ts` would have created a 3000+ line monolith. We avoided this by extracting modules early.

---

### Lesson 2: Domain Models Should Be Immutable

**What We Did:**

```json
{
  "features": [
    {
      "id": "F001",
      "description": "Implement user authentication", // ← IMMUTABLE
      "priority": "critical", // ← IMMUTABLE
      "steps": ["..."], // ← IMMUTABLE
      "passes": false // ← ONLY THIS CHANGES
    }
  ]
}
```

**Why It Worked:**

- Prevented agents from modifying feature descriptions to match what they built
- Created audit trail of what was originally requested vs. what was delivered
- Made it impossible to "hide" incomplete work by removing features
- Enabled reliable progress tracking across sessions

**Lesson Learned:**

> **Immutable contracts prevent drift.** By making feature descriptions immutable and only allowing the `passes` field to change, we prevented the common pattern where AI agents gradually redefine requirements to match their implementation.

**Alternative We Rejected:**  
Markdown-based feature lists where agents could more easily modify descriptions. JSON's structure made it clear what should/shouldn't change.

---

### Lesson 3: Configuration Should Be Layered

**What We Did:**

```typescript
// Layer 1: Hard-coded defaults
const DEFAULT_CONFIG = {
  sessionTimeout: 1800000,
  maxSessions: 10,
  maxFailures: 3,
};

// Layer 2: File-based config (pace.json)
const fileConfig = await loadConfig();

// Layer 3: CLI arguments (highest priority)
const finalConfig = {
  ...DEFAULT_CONFIG,
  ...fileConfig.pace?.orchestrator,
  ...cliArgs,
};
```

**Why It Worked:**

- Users could run `pace` with zero configuration for quick testing
- Power users could customize via `pace.json` for project-specific settings
- CLI flags provided per-run overrides without modifying files
- Clear precedence order (CLI > File > Defaults) was intuitive

**Lesson Learned:**

> **Provide sensible defaults, but allow overrides at every level.** The three-layer configuration approach meant beginners could get started immediately while advanced users had full control.

**Gotcha We Hit:**  
Initially forgot to document the configuration precedence. Added explicit documentation after user confusion about why their `pace.json` settings weren't taking effect (they were using CLI flags that overrode the file).

---

## Event Streaming & Real-Time Output

### Lesson 4: SDK Events Often Duplicate - Plan for Deduplication

**Problem:**

```
[07:21:33] 💰 Tokens: +555 in, +1,001 out
[07:21:33] 💰 Tokens: +555 in, +1,001 out  ← DUPLICATE
[07:21:33] 💰 Tokens: +555 in, +1,001 out  ← DUPLICATE
```

**Root Cause:**
OpenCode SDK emits the same events multiple times due to:

- Event broadcasting to all listeners
- Multiple subscriptions being active
- SDK internal retry/replay logic

**Solution:**

```typescript
let lastLoggedTokens = { input: 0, output: 0, reasoning: 0, timestamp: 0 };

const now = Date.now();
const isDuplicate =
  input === lastLoggedTokens.input &&
  output === lastLoggedTokens.output &&
  reasoning === lastLoggedTokens.reasoning &&
  now - lastLoggedTokens.timestamp < 100; // 100ms window

if (!isDuplicate) {
  console.log(`[${timestamp}] 💰 +${input} in, +${output} out`);
  lastLoggedTokens = { input, output, reasoning, timestamp: now };
}
```

**Lesson Learned:**

> **Never assume SDK events are emitted exactly once.** Always implement deduplication logic for any event-driven system. Use a time window (e.g., 100ms) rather than exact matching to handle timing variations.

**Why 100ms Window:**

- Events sometimes arrive with slight timing differences
- 100ms is short enough to catch true duplicates
- Long enough to handle network/processing jitter
- Empirically validated through testing

**Broader Principle:**  
This applies to any event stream: Kafka, WebSockets, Server-Sent Events. Always deduplicate on the consumer side.

---

### Lesson 5: Zero-Value Events Are Noise - Filter Them Out

**Problem:**

```
[07:21:28] 💰 Tokens: +0 in, +0 out  ← USELESS
[07:21:28] 💰 Tokens: +7 in, +362 out  ← USEFUL
```

**Why This Happened:**
SDK emits token events even when no tokens were consumed (e.g., during initialization, between steps)

**Solution:**

```typescript
const isZeroTokenEvent = input === 0 && output === 0 && reasoning === 0;
if (!isZeroTokenEvent && !isDuplicate) {
  // Log only meaningful events
}
```

**Lesson Learned:**

> **Filter out zero-value events at the source.** Don't just rely on formatting to hide them - prevent them from being processed at all to reduce noise and improve performance.

**Performance Impact:**  
Zero-token events accounted for ~30% of all token events. Filtering them reduced log volume significantly and made output more scannable.

---

### Lesson 6: Running Totals Provide Context

**Before:**

```
[07:21:28] 💰 +7 in, +362 out
[07:21:33] 💰 +555 in, +1,001 out
```

(How many tokens have I used total? User has to manually add.)

**After:**

```
[07:21:28] 💰 +7 in, +362 out (369 total)
[07:21:33] 💰 +555 in, +1,001 out (1,927 total)
```

(Immediate context of cumulative usage)

**Lesson Learned:**

> **Incremental metrics are less useful than cumulative totals.** Users care about "how much have I spent" more than "how much did this step cost." Provide both when possible, but prioritize cumulative totals.

**Implementation:**

```typescript
const sessionTokens = { input: 0, output: 0, reasoning: 0 };

// On each event:
sessionTokens.input += input;
sessionTokens.output += output;
const runningTotal = sessionTokens.input + sessionTokens.output + sessionTokens.reasoning;

console.log(`+${input} in, +${output} out (${runningTotal} total)`);
```

---

## Token Usage & Cost Management

### Lesson 7: Token Tracking Requires SDK-Specific Implementation

**Challenge:**
Different AI SDKs expose token data in different ways:

**OpenCode SDK:**

```typescript
// Token data in message.updated events
event.properties?.info?.tokens: {
  input: number,
  output: number,
  reasoning?: number
}
```

**Claude SDK:**

```typescript
// Token data in API response
response.usage: {
  input_tokens: number,
  output_tokens: number
}
```

**Solution - Unified Interface:**

```typescript
interface TokenUsage {
  input: number;
  output: number;
  total: number;
  reasoning?: number;
}

// Adapter pattern for each SDK
function extractTokens(event: SDKEvent): TokenUsage | null {
  if (isOpencodeEvent(event)) {
    return extractOpencodeTokens(event);
  } else if (isClaudeEvent(event)) {
    return extractClaudeTokens(event);
  }
  return null;
}
```

**Lesson Learned:**

> **Create abstraction layers for cross-SDK features.** Don't couple your business logic to a specific SDK's data structures. Use adapters to normalize data into a common interface.

**Benefit:**  
When OpenCode SDK changed token format between versions, we only had to update the adapter function, not the entire codebase.

---

### Lesson 8: Cost Calculation Needs Model-Specific Pricing

**Initial Approach (Wrong):**

```typescript
const cost = tokens * 0.00001; // Fixed price per token
```

**Reality:**

- Different models have different pricing
- Input tokens priced differently than output tokens
- Reasoning tokens (extended thinking) priced separately
- Prices change over time

**Correct Approach:**

```typescript
interface ModelPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
  reasoningCostPer1M?: number;
}

const PRICING: Record<string, ModelPricing> = {
  'anthropic/claude-sonnet-4': {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },
  'anthropic/claude-opus-4': {
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
  },
};

function calculateCost(tokens: TokenUsage, model: string): number {
  const pricing = PRICING[model] || PRICING['default'];
  const inputCost = (tokens.input / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (tokens.output / 1_000_000) * pricing.outputCostPer1M;
  const reasoningCost = tokens.reasoning
    ? (tokens.reasoning / 1_000_000) * (pricing.reasoningCostPer1M || 0)
    : 0;
  return inputCost + outputCost + reasoningCost;
}
```

**Lesson Learned:**

> **Never hardcode pricing.** Make it configurable and model-specific. Provide a way for users to update pricing as providers change rates.

**User-Facing Feature:**
Allow users to override pricing in config:

```json
{
  "pace": {
    "tokenTracking": {
      "costs": {
        "pricing": {
          "anthropic/claude-sonnet-4": {
            "inputCostPer1M": 3.0,
            "outputCostPer1M": 15.0
          }
        }
      }
    }
  }
}
```

---

### Lesson 9: Token Budget Warnings Prevent Cost Overruns

**Feature:**

```typescript
interface TokenBudget {
  maxTokens: number;
  warningThreshold: number; // 0.8 = warn at 80%
  criticalThreshold: number; // 0.95 = critical at 95%
}

const usage = sessionTokens.input + sessionTokens.output;
const percentUsed = usage / config.budget.maxTokens;

if (percentUsed >= config.budget.criticalThreshold) {
  console.error(`🚨 Token budget critical: ${percentUsed.toFixed(1)}% used`);
} else if (percentUsed >= config.budget.warningThreshold) {
  console.warn(`⚠️  Token budget warning: ${percentUsed.toFixed(1)}% used`);
}
```

**Lesson Learned:**

> **Proactive warnings prevent budget surprises.** Users appreciate knowing when they're approaching limits before they hit them. Provide warnings at meaningful thresholds (80%, 95%).

**User Feedback:**  
Several users reported that budget warnings saved them from accidental cost overruns during long overnight sessions.

---

## Context Management & Optimization

### Lesson 10: Context Size Directly Impacts Costs - Profile It

**Discovery:**
We were sending **150KB of context** per session:

- `feature_list.json`: 45KB (60 features with full details)
- `progress.txt`: 100KB (complete history)
- Git history: 5KB (last 20 commits)

**Impact:**

- ~40,000 tokens per session
- ~90% of tokens were unnecessary context
- Costs scaling linearly with project growth

**Root Cause:**
Agent prompt instructed:

```bash
cat progress.txt        # Loads entire 100KB file
cat feature_list.json   # Loads entire 45KB file
```

**Solution - Smart Context Tool:**

```typescript
{
  name: 'pace_get_context',
  description: 'Get optimized project context',
  async execute({ featureId }) {
    return {
      summary: {
        passing: 5,
        total: 60,
        percentage: '8.3%'
      },
      currentFeature: {
        id: 'F006',
        description: 'Add password reset',
        steps: ['...']
      },
      recentProgress: '...last 2 sessions only...',
      failingSummary: {
        critical: 3,
        high: 12,
        medium: 30,
        low: 10
      }
    };
  }
}
```

**Result:**

- Context size: 150KB → 15KB (90% reduction)
- Token usage: 40K → 4K per session (90% reduction)
- Cost reduction: ~90% (varies by model)

**Lesson Learned:**

> **Profile context size early and often.** What seems like "just reading a few files" can balloon into massive token consumption. Provide summary/query tools instead of raw file access.

**When to Optimize:**

- When context exceeds 10KB per session
- When token costs scale non-linearly with project size
- When you have historical data that's rarely needed

---

### Lesson 11: Redundant Parsing Is a Code Smell

**Problem We Had:**
Four different files parsing `progress.txt`:

1. `status-reporter.ts:extractTokenUsage()` - 140 lines
2. `token-exporter.ts:parseProgressData()` - 80 lines
3. `token-efficiency.ts:extractFeatureEfficiencyData()` - 70 lines
4. `archive-manager.ts:extractTokenUsageForArchive()` - 50 lines

**Total:** 340 lines of duplicated regex logic

**Issues This Caused:**

- Bugs in one parser, not others
- Inconsistent handling of edge cases
- Performance degradation (parsing same file 4 times)
- Maintenance nightmare when format changed

**Solution - Unified Parser:**

```typescript
// src/progress-parser.ts
export class ProgressParser {
  static async parse(projectDir: string): Promise<ProgressData> {
    // Single-pass parsing with caching
    const sessions = this.parseContent(content);
    const totals = this.aggregateTotals(sessions);
    return { sessions, totals, lastSession: sessions[sessions.length - 1] };
  }
}

// All modules now use:
const progressData = await ProgressParser.parse(projectDir);
const tokens = progressData.totals.tokens;
```

**Results:**

- 340 lines → 0 (replaced by single 200-line parser)
- Parse time: 65-115ms → 15-25ms (4-5x faster)
- Cache hit rate: 0% → 80%+
- Bugs: Fixed once, fixed everywhere

**Lesson Learned:**

> **One source of truth for data parsing.** If you find yourself writing similar parsing logic in multiple places, extract it into a shared module immediately. The refactoring cost is always less than the ongoing maintenance burden.

**Refactoring Strategy:**

1. Create new unified parser
2. Write comprehensive tests
3. Migrate one module at a time
4. Compare output with old implementation
5. Delete old code only after full migration

---

### Lesson 12: Caching Must Invalidate Correctly

**Naive Caching (Wrong):**

```typescript
// Cache forever with no invalidation
const cache = new Map<string, FeatureList>();

async load(): Promise<FeatureList> {
  if (cache.has(this.filePath)) {
    return cache.get(this.filePath);  // ← Stale data!
  }
  const data = await readFile(this.filePath);
  cache.set(this.filePath, data);
  return data;
}
```

**Problem:**

- External changes (manual edits, git pull) not detected
- Cache grows indefinitely
- No TTL means stale data persists

**Correct Approach:**

```typescript
interface CacheEntry<T> {
  data: T;
  mtime: number;
}

private static cache = new Map<string, CacheEntry<FeatureList>>();
private static CACHE_TTL = 5000; // 5 seconds

async load(): Promise<FeatureList> {
  const cached = FeatureManager.cache.get(filePath);

  // Check TTL
  if (cached && Date.now() - cached.mtime < FeatureManager.CACHE_TTL) {
    return cached.data;
  }

  // Load fresh data
  const data = JSON.parse(await readFile(filePath));
  FeatureManager.cache.set(filePath, {
    data,
    mtime: Date.now()
  });

  return data;
}

async save(data: FeatureList): Promise<void> {
  await writeFile(filePath, JSON.stringify(data));

  // Invalidate cache after write
  FeatureManager.cache.delete(filePath);
}
```

**Lesson Learned:**

> **Cache invalidation is hard - make it explicit.** Always invalidate caches after writes. Use short TTLs (5-10s) for files that might be externally modified. Provide manual invalidation methods for testing.

**Testing Cache Behavior:**

```typescript
it('invalidates cache after save', async () => {
  const fm = new FeatureManager('/test');

  // Load data (populates cache)
  const data1 = await fm.load();

  // Modify and save
  data1.features[0].passes = true;
  await fm.save(data1);

  // Modify file externally (simulate git pull)
  await writeFile('/test/feature_list.json', differentData);

  // Load should see new data, not cached
  const data2 = await fm.load();
  expect(data2).not.toEqual(data1);
});
```

---

## SDK Integration Challenges

### Lesson 13: SDK Event Formats Change - Version Defensively

**Problem:**
OpenCode SDK changed token format between versions:

**v1.1.x:**

```typescript
event.properties.tokens: {
  input: number,
  output: number
}
```

**v1.2.0+:**

```typescript
event.properties.info.tokens: {
  input: number,
  output: number,
  reasoning: number  // ← NEW
}
```

**Brittle Code (Wrong):**

```typescript
const tokens = event.properties.tokens; // ← Breaks in v1.2+
const input = tokens.input;
```

**Defensive Code (Correct):**

```typescript
function extractTokens(event: unknown): TokenUsage | null {
  try {
    // Try v1.2+ format first
    const info = (event as any)?.properties?.info;
    if (info?.tokens) {
      return {
        input: info.tokens.input ?? 0,
        output: info.tokens.output ?? 0,
        reasoning: info.tokens.reasoning ?? 0,
        total: (info.tokens.input ?? 0) + (info.tokens.output ?? 0) + (info.tokens.reasoning ?? 0),
      };
    }

    // Fall back to v1.1.x format
    const tokens = (event as any)?.properties?.tokens;
    if (tokens) {
      return {
        input: tokens.input ?? 0,
        output: tokens.output ?? 0,
        reasoning: 0,
        total: (tokens.input ?? 0) + (tokens.output ?? 0),
      };
    }

    return null; // No token data available
  } catch (error) {
    console.error('Failed to extract tokens:', error);
    return null;
  }
}
```

**Lesson Learned:**

> **Assume SDK formats will change.** Use optional chaining (`?.`), default values (`?? 0`), and graceful degradation. Test with multiple SDK versions when possible.

**Broader Principle:**  
This applies to any external dependency: APIs, libraries, databases. Always handle missing/changed fields gracefully.

---

### Lesson 14: Session Timeouts Prevent Infinite Hangs

**Problem:**
Sessions would occasionally hang indefinitely, never emitting `session.idle` or `session.error` events:

```
[10:30:15] 🔧 Tool: read
[10:30:16] ✓ Tool: read - completed
... [2 hours of silence] ...
```

**Root Cause:**

- Network interruptions
- Server crashes
- Event stream bugs
- Model stalls (rare but happens)

**Naive Solution (Wrong):**
"Just wait until the session completes"  
→ Results in infinite hangs, wasted resources, confused users

**Correct Solution:**

```typescript
const timeoutMs = 30 * 60 * 1000; // 30 minutes
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => {
    reject(new Error(`Session timeout after 30 minutes`));
  }, timeoutMs);
});

const result = await Promise.race([timeoutPromise, processEventStream(session)]);
```

**Lesson Learned:**

> **Always set timeouts for long-running operations.** Don't assume the remote system will behave correctly. Use `Promise.race()` to implement timeouts cleanly.

**Configuration:**
Make timeout configurable:

```json
{
  "pace": {
    "orchestrator": {
      "sessionTimeout": 1800000 // 30 minutes in ms
    }
  }
}
```

**User Feedback:**
Timeout errors helped users identify infrastructure problems (server crashes) that would have otherwise been silent failures.

---

### Lesson 15: Permission Models Vary - Abstract Them

**Challenge:**
Different agent SDKs have different permission systems:

**OpenCode:**

- Permission requests come via events: `permission.ask`
- Must send approval via command: `/allow <permission-id>`

**Claude:**

- Permission mode set at session start: `permissionMode: 'acceptEdits'`
- No per-request approval needed

**Abstraction:**

```typescript
interface PermissionHandler {
  configure(session: Session): Promise<void>;
  handleRequest(request: PermissionRequest): Promise<void>;
}

class OpencodePermissionHandler implements PermissionHandler {
  async configure(session: Session): Promise<void> {
    // No upfront configuration needed
  }

  async handleRequest(request: PermissionRequest): Promise<void> {
    // Auto-approve by sending /allow command
    await client.session.command({
      path: { id: session.id },
      body: { command: '/allow', arguments: request.id },
    });
  }
}

class ClaudePermissionHandler implements PermissionHandler {
  async configure(session: Session): Promise<void> {
    // Set permission mode at session start
    session.permissionMode = 'acceptEdits';
  }

  async handleRequest(request: PermissionRequest): Promise<void> {
    // No action needed - auto-approved at session start
  }
}
```

**Lesson Learned:**

> **Abstract cross-cutting concerns like permissions.** Different SDKs handle security differently. Create an adapter layer so your business logic doesn't need to know the specifics.

---

## Testing & Quality Assurance

### Lesson 16: Integration Tests Catch What Unit Tests Miss

**What We Tested:**

**Unit Tests (60 tests):**

```typescript
describe('FeatureManager', () => {
  it('loads feature list from file', async () => { ... });
  it('calculates progress correctly', async () => { ... });
  it('finds next feature by priority', async () => { ... });
});
```

**Integration Tests (69 tests):**

```typescript
describe('CLI end-to-end', () => {
  it('runs orchestrator with dry-run flag', async () => {
    const result = await runCLI(['--dry-run', '--max-sessions', '5']);
    expect(result.sessionsRun).toBe(0); // Dry-run should not execute
  });

  it('respects max-failures threshold', async () => {
    const result = await runCLI(['--max-failures', '2']);
    expect(result.stoppedDueToFailures).toBe(true);
  });
});
```

**Bugs Found by Integration Tests:**

1. CLI arguments not overriding config file settings
2. Progress file not created if directory doesn't exist
3. Token tracking disabled when `--json` flag used
4. Session timeout not respecting config value

**Lesson Learned:**

> **Integration tests find bugs unit tests can't.** They test the _integration_ of components, configuration loading, flag parsing, and real file I/O. Aim for at least 50/50 split between unit and integration tests.

**Test Organization:**

```
tests/
├── unit/
│   ├── feature-manager.test.ts
│   ├── validators.test.ts
│   └── status-reporter.test.ts
└── integration/
    ├── cli.test.ts           # End-to-end CLI scenarios
    ├── config.test.ts        # Configuration loading
    └── archive.test.ts       # Archive workflow
```

---

### Lesson 17: Test the Unhappy Paths

**What We Tested:**

**Happy Path:**

```typescript
it('loads valid feature list', async () => {
  const features = await fm.load();
  expect(features.features).toHaveLength(10);
});
```

**Unhappy Paths We Should Have Tested Earlier:**

```typescript
it('handles missing feature_list.json gracefully', async () => {
  await expect(fm.load()).rejects.toThrow('Feature list not found');
});

it('handles corrupted JSON with helpful error', async () => {
  await writeFile('feature_list.json', '{ broken json }');
  await expect(fm.load()).rejects.toThrow(/Invalid JSON/);
});

it('handles concurrent writes without data loss', async () => {
  await Promise.all([fm.save(data1), fm.save(data2)]);
  const result = await fm.load();
  expect(result).toBeDefined();
});

it('handles disk full error during save', async () => {
  // Mock writeFile to throw ENOSPC error
  await expect(fm.save(data)).rejects.toThrow(/No space left/);
});
```

**Bugs Found:**

- Unhelpful error messages ("undefined") instead of "File not found"
- Concurrent writes causing race conditions
- No handling for disk space errors

**Lesson Learned:**

> **Unhappy paths are where users get frustrated.** Test error conditions explicitly: missing files, corrupted data, concurrent access, disk full, network errors. Good error messages are features, not afterthoughts.

**Error Message Guidelines:**

```typescript
// Bad
throw new Error('Error');

// Good
throw new Error(
  `Feature list not found: ${filePath}\n` + `Run 'pace init' to create a new project.`,
);
```

---

### Lesson 18: Snapshot Testing for Complex Output

**Challenge:**
Testing CLI output with multiple sections, colors, formatting:

```
Progress: 12/15 features passing (80.0%)
💎 Token Usage:
  Last Session: 2,345 input, 8,901 output (11,246 total)
  All Sessions: 45,678 input, 123,456 output (169,134 total)
```

**Naive Approach (Wrong):**

```typescript
it('displays status correctly', () => {
  const output = generateStatus();
  expect(output).toContain('12/15');
  expect(output).toContain('2,345');
  expect(output).toContain('8,901');
  // ... 20 more assertions
});
```

**Better Approach - Snapshots:**

```typescript
it('displays status correctly', () => {
  const output = generateStatus();
  expect(output).toMatchSnapshot();
});
```

**Benefits:**

- Catches unintended formatting changes
- Easy to review changes (diff in test output)
- Faster to write tests
- More comprehensive coverage

**When We Update Snapshots:**

```bash
# Review the diff carefully
bun test -- -u  # Update snapshots

# Commit the updated snapshot files
git add tests/__snapshots__/
git commit -m "Update snapshots for new status format"
```

**Lesson Learned:**

> **Snapshot testing is perfect for complex output.** Don't write brittle string assertions for formatted output. Use snapshots and review diffs carefully when updating.

**Caveat:**  
Don't snapshot external API responses or timestamps - these change constantly. Use snapshots for deterministic output only.

---

## Performance & Caching

### Lesson 19: Measure Before Optimizing

**What We Did Right:**

Before implementing the unified parser, we benchmarked existing performance:

```typescript
console.time('parse-progress');
const data1 = await statusReporter.extractTokenUsage(content);
const data2 = await tokenExporter.parseProgressData(content);
const data3 = await tokenEfficiency.extractData(content);
const data4 = await archiveManager.extractTokens(content);
console.timeEnd('parse-progress');
// parse-progress: 115.2ms
```

After implementing unified parser:

```typescript
console.time('parse-progress-unified');
const data = await ProgressParser.parse(projectDir);
console.timeEnd('parse-progress-unified');
// parse-progress-unified: 24.8ms
```

**Result:** 4.6x speedup confirmed by benchmarks

**Lesson Learned:**

> **Measure, don't guess.** Use `console.time()`, profiling tools, or benchmarks to establish baseline performance before optimizing. Otherwise, you're just guessing.

**Benchmarking Pattern:**

```typescript
// tests/benchmarks/progress-parser.bench.ts
import { bench, describe } from 'bun:test';

describe('Progress Parsing Performance', () => {
  bench('old implementation', async () => {
    await oldParser.parse(largeProgressFile);
  });

  bench('new implementation', async () => {
    await ProgressParser.parse(projectDir);
  });
});

// Run with: bun test benchmarks/
```

---

### Lesson 20: Caching Strategy Depends on Access Patterns

**Our Access Patterns:**

| Operation     | Frequency | Reads                | Writes                   |
| ------------- | --------- | -------------------- | ------------------------ |
| `pace run`    | High      | Many (every session) | Few (after each session) |
| `pace status` | Medium    | Many                 | None                     |
| `pace update` | Low       | One                  | One                      |

**Caching Strategies:**

**Feature List (High Read, Low Write):**

```typescript
// Short TTL (5s) with explicit invalidation
private static CACHE_TTL = 5000;

async save(data: FeatureList): Promise<void> {
  await writeFile(filePath, JSON.stringify(data));
  FeatureManager.cache.delete(filePath);  // Explicit invalidation
}
```

**Progress Parsing (High Read, Append-Only Writes):**

```typescript
// Longer TTL (5s) since writes are rare and append-only
// Invalidate on write
ProgressParser.invalidate(projectDir);
```

**Config Loading (Rarely Changes):**

```typescript
// Cache until process exit
// No TTL, no invalidation
private static configCache: PaceConfig | null = null;

async function loadConfig(): Promise<PaceConfig> {
  if (configCache) return configCache;
  configCache = await readConfig();
  return configCache;
}
```

**Lesson Learned:**

> **Match caching strategy to access patterns.** Read-heavy with infrequent writes = longer TTL with explicit invalidation. Write-heavy = shorter TTL or no cache. Immutable data = cache forever.

---

## Developer Experience

### Lesson 21: Verbose Mode Should Be Actually Verbose

**What Users Want from `--verbose`:**

1. See what the agent is doing in real-time
2. Understand why something failed
3. Track token consumption
4. Debug configuration issues

**What We Provided:**

```
[15:26:56] 🔧 Tool: task
  Input: { "description": "Get project context", ... }
[15:26:57] 🧠 Step: +14,331 in, +59 out (521,306 total)
[15:27:02] ✓ Tool: task - completed (5.23s)
  Output: ...

[15:27:03] 🔓 Permission requested for: edit
  Auto-approving...

[15:27:10] 💰 +7 in, +362 out (521,675 total)
```

**Lesson Learned:**

> **Verbose mode is for power users - don't hold back.** Show tool calls, inputs, outputs, timing, token usage, permissions. But keep it structured and scannable with timestamps and emojis.

**Anti-Pattern:**
"Verbose" mode that just adds `console.log('Starting X')` everywhere. That's not verbose, that's debug spam.

---

### Lesson 22: JSON Output for Automation

**Why We Added `--json` Flag:**
Users wanted to:

- Parse pace output in CI/CD pipelines
- Build dashboards tracking progress
- Integrate with monitoring tools
- Script bulk operations

**Implementation:**

```typescript
if (this.json) {
  console.log(
    JSON.stringify({
      sessionsRun: 5,
      featuresCompleted: 4,
      finalProgress: '12/15',
      completionPercentage: 80,
      totalTokens: 58023,
      success: true,
    }),
  );
} else {
  // Human-readable output
  console.log('Sessions run: 5');
  console.log('Features completed: 4');
  // ...
}
```

**Lesson Learned:**

> **Provide machine-readable output for CLI tools.** If your tool might be used in scripts or CI/CD, add a `--json` flag. Make the JSON schema stable and documented.

**Schema Stability:**

```typescript
// Version the JSON schema
interface CLIOutput {
  version: 1; // Increment when breaking changes
  data: {
    sessionsRun: number;
    // ...
  };
}
```

---

### Lesson 23: Error Messages Should Be Actionable

**Bad Error Messages:**

```
Error: Invalid feature list
Error: Failed to save
Error: Timeout
```

**Good Error Messages:**

```
❌ Feature list validation failed: feature_list.json

   Issues found:
   - Feature F001: Missing required field 'description'
   - Feature F002: Invalid priority 'urgent' (must be: critical, high, medium, low)

   → Fix these issues and run 'pace validate' to check again.
```

```
❌ Failed to save feature list: /path/to/feature_list.json

   Error: ENOSPC: no space left on device

   → Free up disk space and try again.
   → Current usage: 98% of 500GB
```

```
⏱️  Session timeout after 30 minutes with no completion event
   Last activity: 15 tool calls, 8 text parts
   Session ID: ses_abc123

   → This usually indicates:
      • Network interruption
      • Server crashed
      • Model stalled

   → Try running again, or increase timeout in pace.json:
      { "pace": { "orchestrator": { "sessionTimeout": 3600000 } } }
```

**Lesson Learned:**

> **Great error messages tell users what went wrong AND how to fix it.** Include context, suggest solutions, show examples. Error messages are part of the product.

**Error Message Template:**

```typescript
function formatError(error: Error, context: Context): string {
  return `
❌ ${error.message}: ${context.file}

${error.details}

→ Suggested fix:
   ${error.suggestion}

→ Learn more: ${error.docsUrl}
  `.trim();
}
```

---

## Production Readiness

### Lesson 24: Archive Before Destructive Operations

**What We Did:**
Before `pace init` overwrites existing project files, automatically archive them:

```typescript
async initializeProject() {
  if (await exists('feature_list.json')) {
    console.log('📂 Existing project files found');

    // Create timestamped archive
    const archiveDir = `.fwdslsh/pace/history/${timestamp}`;
    await mkdir(archiveDir, { recursive: true });

    // Move existing files
    await rename('feature_list.json', `${archiveDir}/feature_list.json`);
    await rename('progress.txt', `${archiveDir}/progress.txt`);

    console.log(`📦 Archived to ${archiveDir}/`);
  }

  // Now safe to create new files
  await createNewProject();
}
```

**Lesson Learned:**

> **Never destroy user data, even when they ask you to.** Archive, backup, or prompt for confirmation. Users will thank you when they realize they needed that data.

**User Feedback:**  
Multiple users reported relying on the automatic archive feature to compare different project runs or recover from mistakes.

---

### Lesson 25: Provide Multiple Installation Methods

**What We Supported:**

1. **Quick Install Script** (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/fwdslsh/pace/main/install.sh | bash
```

2. **NPM** (for Node.js projects):

```bash
npm install -g @fwdslsh/pace
```

3. **Direct Binary Download**:

```bash
wget https://github.com/fwdslsh/pace/releases/latest/download/pace-linux-x64
chmod +x pace-linux-x64
mv pace-linux-x64 /usr/local/bin/pace
```

4. **From Source** (for developers):

```bash
git clone https://github.com/fwdslsh/pace.git
cd pace
bun install
bun run cli.ts
```

**Lesson Learned:**

> **Different users have different preferences and constraints.** Provide installation options for: quick start (curl), ecosystem integration (npm), offline use (binary), and development (source).

**What Worked Best:**

- 60% of users chose the curl install script (easiest)
- 30% used npm (already in Node.js ecosystem)
- 10% used binaries (corporate environments, no npm)

---

### Lesson 26: Pre-commit Hooks Catch Mistakes

**What We Added:**

```bash
# .husky/pre-commit
#!/bin/bash

# Run linter
bun run lint
if [ $? -ne 0 ]; then
  echo "❌ Linting failed. Fix errors before committing."
  exit 1
fi

# Run tests
bun test
if [ $? -ne 0 ]; then
  echo "❌ Tests failed. Fix tests before committing."
  exit 1
fi

# Check for debug code
if git diff --cached | grep -E "console.log|debugger"; then
  echo "⚠️  Warning: Found console.log or debugger statements"
  read -p "Commit anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
```

**Bugs Prevented:**

- Committing broken tests (happened 3 times early on)
- Committing with linting errors
- Committing debug console.logs that made it to production

**Lesson Learned:**

> **Automate quality gates.** Pre-commit hooks prevent mistakes before they enter the codebase. Make them fast (<30s) so developers don't disable them.

**Performance Tip:**

```bash
# Only run tests on changed files for speed
git diff --cached --name-only --diff-filter=ACM | grep '\.test\.ts$' | xargs bun test
```

---

## Key Takeaways

### Top 10 Lessons

1. **Modular architecture** pays off immediately and compounds over time
2. **Event deduplication** should be implemented from day one in event-driven systems
3. **Context optimization** can reduce costs by 90% - profile early
4. **Unified parsers** eliminate tech debt and improve performance 4-5x
5. **Cache invalidation** must be explicit and tested
6. **SDK integration** requires defensive coding and version tolerance
7. **Integration tests** catch what unit tests miss
8. **Error messages** are features - make them actionable
9. **Verbose mode** should show everything; `--json` enables automation
10. **Archive before destructive operations** - never destroy user data

### Metrics That Matter

| Metric           | Target          | Achieved   | Impact               |
| ---------------- | --------------- | ---------- | -------------------- |
| Context size     | <20KB           | 15KB       | 90% token reduction  |
| Parse time       | <50ms           | 25ms       | 4x faster            |
| Code duplication | 0 parsers       | Unified    | 340 lines eliminated |
| Test coverage    | >80%            | 100+ tests | High confidence      |
| Cache hit rate   | >70%            | 80%+       | Reduced I/O          |
| Error clarity    | 100% actionable | Yes        | Better UX            |

### What's Next

**Improvements We're Considering:**

1. **Streaming Parser**: For projects >500 sessions (>500KB progress.txt)
2. **Vector Search**: Semantic search over session history
3. **Multi-Agent Coordination**: Specialized agents for implementation, testing, review
4. **Real-time Dashboard**: Web UI showing live progress
5. **Cost Predictions**: Estimate remaining budget based on velocity
6. **Pattern Library**: Auto-extraction of reusable patterns

**Lessons We're Still Learning:**

1. How to balance automation vs. human control
2. Optimal session timeout for different model types
3. When to split features vs. accept complexity
4. How to measure "code quality" from agent sessions

---

## Conclusion

Building Pace taught us that:

1. **Event-driven systems require defensive coding** - deduplicate, filter, timeout
2. **Context is expensive** - optimize aggressively
3. **Caching is powerful but tricky** - invalidate explicitly
4. **Testing is insurance** - integration tests especially
5. **Developer experience matters** - verbose mode, JSON output, error messages
6. **SDK integration requires abstraction** - formats will change
7. **Modular design enables iteration** - refactor one module at a time

The most valuable lesson: **Measure everything, assume nothing.**

Token usage, parse time, cache hit rates, error rates - if we didn't measure it, we couldn't optimize it.

---

**Document Version**: 1.0  
**Last Updated**: December 18, 2025  
**Contributors**: Pace development team  
**Feedback**: Create an issue on GitHub or submit a PR to improve this document
