# Multi-Session AI Agent Workflow: A Complete Implementation Guide

## Abstract

This document describes a proven methodology for orchestrating long-running AI agent tasks that span multiple sessions, potentially across hours or days. The workflow ensures consistent progress toward a defined goal through structured state management, incremental execution, and systematic knowledge capture. This pattern is SDK-agnostic and can be implemented with any AI agent framework, CLI tool, or application.

## Core Problem

Traditional AI agents face two critical challenges when working on complex, long-running tasks:

1. **Context Window Limitations**: Each new agent session begins with no memory of previous work, leading to redundant analysis, inconsistent decisions, and loss of progress.

2. **Increasing Complexity**: As projects grow, subsequent tasks become harder to complete due to accumulated technical debt and lack of systematic knowledge capture.

This workflow solves both problems through structured state persistence and compounding knowledge accumulation.

## Fundamental Principles

### 1. Structured State Persistence

Every aspect of project state must be explicitly captured in machine-readable artifacts:

- **Requirements**: Complete list of objectives with granular pass/fail tracking
- **Progress Log**: Session-by-session narrative of work completed
- **Version Control**: Git history providing atomic record of changes
- **Environment Setup**: Executable script ensuring consistent development environment

### 2. Incremental Execution

Work is divided into discrete, completable units:

- Each session completes exactly **one unit of work**
- Units are prioritized from critical to low importance
- Each unit is fully tested before being marked complete
- Sessions end in a clean, committable state

### 3. Compounding Knowledge

Each completed unit of work contributes to making future work easier:

- Patterns discovered during implementation are codified
- Common mistakes are prevented through automated checks
- Reusable workflows are captured as executable commands
- Project-specific guidance evolves with the codebase

## Architecture Overview

### Dual-Agent Pattern

The workflow employs two specialized agent roles:

#### Initializer Agent (First Session Only)

**Responsibilities:**

1. Parse high-level requirements into exhaustive feature list
2. Create structured artifacts for state management
3. Generate environment setup automation
4. Establish version control baseline

**Artifacts Created:**

- `feature_list.json` - All features marked as failing initially
- `progress.txt` - Progress log template with project context
- `init.sh` - Script to start development environment
- `.git` - Initial commit establishing baseline

**Stopping Condition:** Complete after initial commit is created

#### Coding Agent (All Subsequent Sessions)

**Responsibilities:**

1. Orient: Read state artifacts and version history
2. Execute: Implement one feature from failing to passing
3. Verify: Test end-to-end as a user would
4. Document: Update all state artifacts with progress
5. Continue: Repeat until stopping condition

**Stopping Conditions:**

- All features passing (success)
- Maximum consecutive failures reached (stuck)
- Maximum sessions reached (timeout)
- Blocking issue requiring human intervention

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ 1. ORIENT                                               │
│    • Read feature_list.json to see requirements         │
│    • Read progress.txt to understand session history    │
│    • Review git log to see recent changes               │
│    • Identify highest-priority failing feature          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. PREPARE ENVIRONMENT                                  │
│    • Execute init.sh to start services                  │
│    • Verify environment is operational                  │
│    • Run sanity tests to ensure clean state             │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. IMPLEMENT                                            │
│    • Read feature description and steps                 │
│    • Write code incrementally                           │
│    • Commit after each logical unit of work             │
│    • Apply patterns from previous sessions              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. VERIFY                                               │
│    • Test end-to-end as user would experience           │
│    • Run automated tests if available                   │
│    • Verify all steps in feature description work       │
│    • Document test results                              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. CAPTURE KNOWLEDGE                                    │
│    • Review what worked and what didn't                 │
│    • Identify reusable patterns                         │
│    • Document lessons learned                           │
│    • Update project guidance                            │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. UPDATE STATE                                         │
│    • Mark feature as passing in feature_list.json       │
│    • Write session entry in progress.txt                │
│    • Create descriptive git commit                      │
│    • Ensure all changes are committed                   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 7. EVALUATE CONTINUATION                                │
│    • Check if features remain                           │
│    • Check if failure threshold exceeded                │
│    • Check if session limit reached                     │
│    • Continue or exit based on conditions               │
└─────────────────────────────────────────────────────────┘
```

## State Artifacts Specification

### Feature List (`feature_list.json`)

A comprehensive, structured list of all work to be completed. This serves as an immutable contract between sessions.

**Format:**

```json
{
  "metadata": {
    "project_name": "Example Project",
    "total_features": 10,
    "passing": 3,
    "failing": 7,
    "last_updated": "2025-12-14T10:30:00Z"
  },
  "features": [
    {
      "id": "F001",
      "category": "authentication",
      "description": "User can register with email and password",
      "priority": "critical",
      "passes": false,
      "steps": [
        "Create registration form with email and password fields",
        "Validate email format and password strength",
        "Store user credentials securely in database",
        "Redirect to login page after successful registration"
      ],
      "tags": ["user-management", "security"]
    }
  ]
}
```

**Critical Rules:**

- **JSON format only** - Machines are less likely to accidentally modify JSON than Markdown
- **Immutable descriptions** - Only the `passes` field should ever change
- **Explicit steps** - Each feature includes concrete, testable steps
- **Comprehensive upfront** - All features defined during initialization
- **Metadata consistency** - Counts must match actual feature array state

**Why This Works:**

- Prevents agents from declaring victory early by hiding/removing features
- Provides clear success criteria for each unit of work
- Enables priority-based execution order
- Creates audit trail of what has/hasn't been completed

### Progress Log (`progress.txt`)

A narrative, human-readable log of session-by-session progress.

**Format:**

```markdown
# Project Progress Log

## Project: Example Project
## Created: 2025-12-14
## Repository: /path/to/project

---

## Quick Reference

**Current Status:** In Progress
**Features Passing:** 3 / 10
**Last Session:** Session 4 - Feature F003
**Next Target:** F004 - Password reset functionality

---

## Session History

### Session 1 - Initialization
**Date:** 2025-12-14 09:00
**Agent Type:** Initializer

**Actions Taken:**
- Analyzed project requirements
- Created feature_list.json with 10 features
- Generated init.sh script for development environment
- Initialized git repository
- Made initial commit

**Environment Details:**
- Framework: React 18.2
- Language: TypeScript 5.0
- Development Server: http://localhost:3000
- Key Dependencies: express, bcrypt, jsonwebtoken

**Git Commit:** abc123 - "chore: initialize project harness"

**Next Steps:**
- Begin implementing F001 (user registration)

---

### Session 2 - User Registration
**Date:** 2025-12-14 10:30
**Agent Type:** Coding

**Orientation:**
- Read progress file: ✓
- Checked git log: ✓
- Reviewed feature list: ✓
- Ran init.sh: ✓
- Sanity test passed: ✓

**Feature Worked On:**
- F001: User can register with email and password

**Implementation Details:**
- Created /api/register endpoint with Express
- Added bcrypt for password hashing (cost factor 12)
- Implemented email format validation with regex
- Added password strength requirements (min 8 chars, uppercase, number)
- Created SQLite users table with proper schema
- Built registration form component in React
- Added error handling and user feedback

**Testing Performed:**
- Manual browser test: registration form loads correctly
- Submitted form with valid data: user created in database
- Submitted with invalid email: proper error message shown
- Submitted with weak password: validation error displayed
- Verified password is hashed in database, not plaintext

**Result:** ✓ Feature passing

**Git Commits:**
- def456 - "feat(auth): add user registration endpoint with validation"
- ghi789 - "feat(auth): create registration form UI component"

**Knowledge Captured:**
- Email validation regex pattern added to project docs
- Password hashing strategy documented in ARCHITECTURE.md
- Registration flow pattern can be reused for other forms

**Current Status:**
- Features passing: 1 / 10
- Known issues: None

**Next Steps:**
- Next recommended feature: F002 - User login
- Should follow similar pattern to registration

---
```

**Critical Elements:**

- **Orientation checklist** - Confirms agent followed proper workflow
- **Implementation details** - Enough context for humans/agents to understand what was built
- **Testing evidence** - Proof that feature was actually verified
- **Knowledge capture** - Patterns and learnings for future sessions
- **Next steps** - Guidance for subsequent session

**Why This Works:**

- Provides narrative context that JSON cannot capture
- Documents decision-making rationale for future reference
- Creates knowledge base that accelerates subsequent work
- Enables humans to understand progress without reading code

### Environment Setup (`init.sh`)

An executable script that prepares the development environment in a consistent, repeatable way.

**Example:**

```bash
#!/bin/bash
# Development environment initialization
# Generated by initializer agent

set -e

echo "🚀 Starting development environment..."

# Install dependencies
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Set up database
if [ ! -f "database.sqlite" ]; then
  echo "🗄️  Initializing database..."
  node scripts/init-db.js
fi

# Start development server
echo "🌐 Starting server on http://localhost:3000..."
npm run dev
```

**Requirements:**

- Must be idempotent (safe to run multiple times)
- Must handle missing dependencies/setup
- Must provide clear output about what it's doing
- Must start all required services
- Must exit with non-zero code on failure

**Why This Works:**

- Eliminates "works on my machine" problems
- Reduces cognitive load of remembering setup steps
- Ensures consistent environment across sessions
- Documents required services and dependencies

### Version Control (Git)

Git provides atomic, immutable history of all changes.

**Commit Strategy:**

- Commit after each logical unit of work (not just at end of feature)
- Use descriptive commit messages following conventional commits format
- Include feature ID in commit message for traceability
- Never commit broken code or work-in-progress without annotation

**Example Commits:**

```
feat(auth): add password hashing with bcrypt (F001)
feat(auth): create registration form component (F001)
feat(auth): implement email validation (F001)
test(auth): add end-to-end registration test (F001)
docs(auth): document password security strategy (F001)
```

**Why This Works:**

- Provides fine-grained history for debugging
- Enables rollback to any working state
- Documents evolution of implementation approach
- Facilitates review of what changed between sessions

## Orchestrator Implementation

The orchestrator is the control loop that manages continuous agent sessions.

### Core Algorithm

```typescript
interface OrchestratorConfig {
  projectDir: string          // Working directory
  maxSessions?: number        // Stop after N sessions (optional)
  maxFailures: number         // Stop after N consecutive failures
  delayBetweenSessions: number // Seconds to wait between sessions
  agentSDK: AgentSDK          // SDK for running agent sessions
}

async function orchestrate(config: OrchestratorConfig): Promise<void> {
  const featureManager = new FeatureManager(config.projectDir)
  let sessionCount = 0
  let consecutiveFailures = 0
  
  while (true) {
    // Check stopping conditions
    if (config.maxSessions && sessionCount >= config.maxSessions) {
      console.log('Maximum sessions reached')
      break
    }
    
    if (consecutiveFailures >= config.maxFailures) {
      console.log('Too many consecutive failures - stopping')
      break
    }
    
    if (await featureManager.isComplete()) {
      console.log('All features passing - project complete!')
      break
    }
    
    // Get next feature
    const nextFeature = await featureManager.getNextFeature()
    if (!nextFeature) {
      console.log('No features available to work on')
      break
    }
    
    // Build coding agent prompt
    const prompt = buildCodingPrompt(nextFeature)
    
    // Run agent session
    sessionCount++
    console.log(`\nSession ${sessionCount}: Working on ${nextFeature.id}`)
    
    const result = await config.agentSDK.runSession({
      prompt,
      projectDir: config.projectDir
    })
    
    // Check if progress was made
    const progressMade = await featureManager.wasFeatureCompleted(nextFeature.id)
    
    if (result.success && progressMade) {
      consecutiveFailures = 0
      console.log(`✓ Feature ${nextFeature.id} completed`)
    } else {
      consecutiveFailures++
      console.log(`✗ Session did not complete feature (${consecutiveFailures} consecutive)`)
    }
    
    // Delay before next session
    if (!await featureManager.isComplete()) {
      await sleep(config.delayBetweenSessions * 1000)
    }
  }
  
  // Final summary
  const [passing, total] = await featureManager.getProgress()
  console.log(`\nFinal status: ${passing}/${total} features passing`)
}
```

### Prompt Engineering for Coding Agent

The prompt must explicitly instruct the agent to follow the workflow:

```typescript
function buildCodingPrompt(feature: Feature): string {
  return `You are the Coding Agent for a long-running project.

WORKFLOW (follow exactly):

1. ORIENT
   - Run: pwd
   - Read: progress.txt (full file)
   - Run: git log --oneline -10
   - Read: feature_list.json (identify your target feature)

2. PREPARE ENVIRONMENT
   - Run: ./init.sh
   - Verify: services are running
   - Test: basic functionality works

3. IMPLEMENT
   - Work on EXACTLY ONE feature: ${feature.id}
   - Description: ${feature.description}
   - Steps to complete:
${feature.steps.map((step, i) => `     ${i + 1}. ${step}`).join('\n')}
   - Commit after each logical unit of work

4. VERIFY
   - Test end-to-end as a user would
   - Verify ALL steps in the feature description work
   - Do NOT skip testing

5. CAPTURE KNOWLEDGE
   - What patterns did you discover?
   - What common mistakes should be avoided?
   - What can be reused in future features?

6. UPDATE STATE
   - Mark feature as passing: change ONLY "passes" field to true in feature_list.json
   - Append session entry to progress.txt with:
     * What you built
     * How you tested it
     * What you learned
   - Git commit all changes with message: "feat(...): description (${feature.id})"

7. VALIDATE
   - Ensure feature_list.json is valid JSON
   - Ensure all changes are committed
   - Ensure progress.txt is updated

CRITICAL RULES:
- Work on EXACTLY ONE feature (${feature.id})
- Test thoroughly before marking complete
- NEVER modify feature descriptions, only the "passes" field
- Commit all changes before finishing

Begin now by orienting yourself with the project state.`
}
```

### Feature Manager Implementation

The feature manager abstracts feature list operations:

```typescript
class FeatureManager {
  constructor(private projectDir: string) {}
  
  // Load feature list from disk
  async load(): Promise<FeatureList> {
    const path = join(this.projectDir, 'feature_list.json')
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content)
  }
  
  // Save feature list to disk
  async save(list: FeatureList): Promise<void> {
    const path = join(this.projectDir, 'feature_list.json')
    
    // Update metadata
    list.metadata.passing = list.features.filter(f => f.passes).length
    list.metadata.failing = list.features.filter(f => !f.passes).length
    list.metadata.last_updated = new Date().toISOString()
    
    await writeFile(path, JSON.stringify(list, null, 2))
  }
  
  // Get current progress
  async getProgress(): Promise<[number, number]> {
    const list = await this.load()
    const passing = list.features.filter(f => f.passes).length
    return [passing, list.features.length]
  }
  
  // Check if all features pass
  async isComplete(): Promise<boolean> {
    const [passing, total] = await this.getProgress()
    return passing === total
  }
  
  // Get next feature to work on (highest priority failing)
  async getNextFeature(): Promise<Feature | null> {
    const list = await this.load()
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    
    const failing = list.features
      .filter(f => !f.passes)
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    
    return failing[0] || null
  }
  
  // Check if a specific feature was completed
  async wasFeatureCompleted(featureId: string): Promise<boolean> {
    const list = await this.load()
    const feature = list.features.find(f => f.id === featureId)
    return feature?.passes === true
  }
}
```

## Compounding Knowledge Implementation

The second core principle is that each feature should make subsequent features easier to build. This is achieved through systematic knowledge capture and codification.

### Knowledge Capture Process

After each feature is completed, the agent should explicitly reflect:

**Questions to Answer:**

1. What worked well in the plan and execution?
2. What needed adjustment during implementation?
3. What issues were discovered during testing that weren't anticipated?
4. What mistakes did the agent make that could be prevented?
5. What patterns emerged that could be reused?
6. What configuration or setup would help future work?

### Knowledge Codification Strategies

#### 1. Project Documentation (`CLAUDE.md`, `README.md`)

Update project-level guidance with discovered patterns:

```markdown
## Authentication Patterns

When implementing authentication features:

1. **Password Hashing**: Always use bcrypt with cost factor 12+
   - Import: `import bcrypt from 'bcrypt'`
   - Hash: `const hash = await bcrypt.hash(password, 12)`
   - Verify: `const valid = await bcrypt.compare(password, hash)`

2. **Email Validation**: Use the project standard regex
   - Pattern: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - Location: `src/utils/validation.ts`

3. **JWT Tokens**: Use 24-hour expiration for regular users
   - Sign: `jwt.sign(payload, SECRET, { expiresIn: '24h' })`
   - Verify: `jwt.verify(token, SECRET)`

4. **Testing Authentication**: Use the auth test helper
   - Location: `tests/helpers/auth.ts`
   - Usage: `const user = await createTestUser()`
```

#### 2. Reusable Code Patterns

Extract common patterns into utility functions:

```typescript
// src/utils/validation.ts
// Generated after pattern emerged in F001, F002, F003

export function validateEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return pattern.test(email)
}

export function validatePassword(password: string): { 
  valid: boolean
  errors: string[] 
} {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number')
  }
  
  return { valid: errors.length === 0, errors }
}
```

#### 3. Custom Slash Commands

Create executable workflows for common operations:

```markdown
# .claude/skills/project-practices.md

## /test-feature

Run end-to-end tests for a feature:

1. Start the development server: `./init.sh` (in background)
2. Wait 5 seconds for server to be ready
3. Run feature-specific test: `npm run test:e2e -- --feature F001`
4. Review test output for failures
5. If failures, read error messages and fix issues
6. Repeat until tests pass
7. Take screenshots of working feature
8. Document test results in progress.txt

## /review-code

Perform code review before marking feature complete:

1. Run linter: `npm run lint`
2. Run type checker: `npm run type-check`
3. Check for TODOs: `rg "TODO|FIXME" src/`
4. Review security: check for hardcoded secrets, SQL injection risks
5. Review error handling: ensure all async operations have try/catch
6. Review user experience: ensure helpful error messages
7. Document any issues found and fix before proceeding

## /compound

Apply compounding engineering after completing a feature:

1. Review what patterns emerged during implementation
2. Check if any code can be extracted to shared utilities
3. Update CLAUDE.md with new patterns discovered
4. Consider if any validation could be automated
5. Document testing approach if it was particularly effective
6. Update init.sh if new dependencies were added
7. Commit knowledge updates separately with message "docs: capture learnings from [feature]"
```

#### 4. Automated Checks (Git Hooks)

Prevent common mistakes through automation:

```bash
# .git/hooks/pre-commit
#!/bin/bash
# Prevent commits with common issues

# Check for debug code
if git diff --cached | grep -E "console.log|debugger"; then
  echo "❌ Remove console.log/debugger statements before committing"
  exit 1
fi

# Check for TODOs in new code
if git diff --cached | grep -E "TODO|FIXME"; then
  echo "⚠️  Warning: Committing code with TODO/FIXME"
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Validate feature_list.json if changed
if git diff --cached --name-only | grep -q "feature_list.json"; then
  echo "Validating feature_list.json..."
  node scripts/validate-features.js
  if [ $? -ne 0 ]; then
    echo "❌ feature_list.json validation failed"
    exit 1
  fi
fi

echo "✓ Pre-commit checks passed"
```

#### 5. Specialized Validation Agents

Create sub-agents that validate specific aspects:

```typescript
// Example: Feature validation agent
const FEATURE_VALIDATOR_PROMPT = `
You are a feature validation specialist. Review the implementation of feature ${featureId}:

1. Read the feature description and steps from feature_list.json
2. Review the code changes in the latest commit
3. Run the test suite
4. Manually test the feature if possible
5. Check for common issues:
   - Missing error handling
   - Security vulnerabilities
   - Poor user experience
   - Incomplete implementation
   - Untested edge cases

Provide a report:
- ✓ or ✗ for each step in the feature description
- Any issues found
- Recommendation: PASS or FAIL

If FAIL, provide specific actionable feedback.
`
```

### Compounding Effect Over Time

As features are completed, the project gains:

1. **Accumulated Patterns**: Each feature contributes reusable code and documentation
2. **Reduced Mistakes**: Git hooks and linting prevent known issues
3. **Faster Testing**: Test helpers and automation reduce manual work
4. **Better Prompts**: CLAUDE.md grows more specific and helpful
5. **Executable Workflows**: Slash commands capture proven processes

**Result**: Later features are genuinely faster and easier to implement than earlier ones, inverting the traditional trajectory of increasing complexity.

## Multi-SDK Support

The workflow is designed to be SDK-agnostic. Any agent framework can be integrated through a common interface.

### SDK Interface

```typescript
interface AgentSDK {
  runSession(params: {
    prompt: string
    projectDir: string
  }): Promise<{
    success: boolean
    duration?: number
    cost?: number
    turns?: number
  }>
}
```

### Example: Claude Agent SDK

```typescript
class ClaudeAgentSDK implements AgentSDK {
  async runSession(params: { prompt: string, projectDir: string }) {
    const result = await query({
      prompt: params.prompt,
      options: {
        cwd: params.projectDir,
        model: 'claude-opus-4',
        permissionMode: 'bypassPermissions',
        systemPrompt: { type: 'preset', preset: 'claude_code' }
      }
    })
    
    for await (const message of result) {
      // Handle streaming messages
      if (message.type === 'result') {
        return {
          success: message.subtype === 'success',
          duration: message.duration_ms,
          cost: message.total_cost_usd,
          turns: message.num_turns
        }
      }
    }
    
    return { success: false }
  }
}
```

### Example: OpenCode SDK

```typescript
class OpencodeSDK implements AgentSDK {
  async runSession(params: { prompt: string, projectDir: string }) {
    const client = createOpencodeClient({
      baseUrl: process.env.OPENCODE_URL,
      directory: params.projectDir
    })
    
    // Create session
    const session = await client.session.create({
      body: { title: 'Coding Session' }
    })
    
    // Send prompt
    await client.session.prompt({
      path: { id: session.data.id },
      body: { parts: [{ type: 'text', text: params.prompt }] }
    })
    
    // Wait for completion
    const events = await client.event.subscribe()
    for await (const event of events.stream) {
      if (event.type === 'session.idle') {
        return { success: true }
      }
      if (event.type === 'session.error') {
        return { success: false }
      }
    }
    
    return { success: false }
  }
}
```

### Example: Custom CLI Tool

```typescript
class CustomCLI implements AgentSDK {
  async runSession(params: { prompt: string, projectDir: string }) {
    const startTime = Date.now()
    
    // Write prompt to temporary file
    const promptFile = await writePromptToTempFile(params.prompt)
    
    // Execute CLI tool
    const { exitCode, stdout, stderr } = await exec(
      `my-agent-cli --prompt-file ${promptFile} --cwd ${params.projectDir}`
    )
    
    const duration = Date.now() - startTime
    
    // Parse output for cost/metrics if available
    const cost = extractCostFromOutput(stdout)
    
    return {
      success: exitCode === 0,
      duration,
      cost
    }
  }
}
```

The key insight is that **any tool that can execute an agent with a text prompt in a specific directory** can be integrated into this workflow.

## Stopping Conditions and Failure Modes

### Success Conditions

The workflow succeeds when:

1. **All features passing**: `passing === total` in feature_list.json
2. **Clean git state**: All changes committed
3. **Updated artifacts**: progress.txt reflects final session

### Failure Modes and Handling

#### 1. Consecutive Failures (Agent Stuck)

**Symptom**: Sessions complete but no features marked as passing

**Threshold**: Typically 3-5 consecutive failures

**Resolution**:

- Stop orchestrator to prevent wasted resources
- Human reviews progress.txt to understand blockers
- May need to:
  - Simplify feature description
  - Break feature into smaller units
  - Fix environment setup issue
  - Adjust agent prompt for clarity

#### 2. Maximum Sessions Reached

**Symptom**: Predefined session limit hit before completion

**Threshold**: Configurable, typically 50-100 sessions

**Resolution**:

- Review progress: how many features completed vs remaining
- Assess velocity: are features taking longer than expected?
- Consider:
  - Increasing session limit if good progress
  - Adjusting feature complexity if slow progress
  - Reviewing feature descriptions for ambiguity

#### 3. Blocking Issue

**Symptom**: Agent explicitly states it cannot proceed

**Examples**:

- Missing API credentials
- External service unavailable
- Ambiguous requirements
- Technical constraint preventing implementation

**Resolution**:

- Agent should document blocker clearly in progress.txt
- Human provides missing information/resources
- Orchestrator resumes from previous session's state

#### 4. Environment Broken

**Symptom**: init.sh fails or services won't start

**Resolution**:

- Agent should attempt to fix environment issues
- If cannot be automated, document in progress.txt
- Human fixes environment manually
- Orchestrator resumes once environment is operational

### Progress Tracking Between Failures

Even in failure scenarios, the workflow preserves progress:

1. **Partial work committed**: Git history shows incremental progress
2. **Learnings captured**: progress.txt documents what was attempted
3. **Feature state accurate**: feature_list.json reflects what actually works
4. **Next session informed**: Can read progress.txt to avoid repeating failures

## Real-World Implementation Considerations

### Prompt Engineering Challenges

**Challenge**: Agent ignores workflow and tries to complete multiple features

**Solution**:

- Make workflow steps explicitly numbered
- Include specific commands to run (not just concepts)
- Repeat "exactly ONE feature" multiple times in prompt
- Check feature_list.json in post-session validation

**Challenge**: Agent marks feature passing without testing

**Solution**:

- Require agent to document test results in progress.txt
- Review git history to see if test files were added/run
- Consider automated validation: parse progress.txt for test evidence
- Add testing as explicit substeps in feature.steps array

**Challenge**: Agent modifies feature descriptions to match implementation

**Solution**:

- Use JSON format which agents are more careful with
- Explicitly state "NEVER modify feature descriptions"
- Validate feature_list.json structure after each session
- Maintain backup of feature list

### Performance Optimization

**Strategy**: Caching for faster context loading

Most modern agent SDKs support prompt caching. Structure prompts to maximize cache hits:

```typescript
const cachedContext = `
[Prefix: Static project context - changes rarely]
- Project architecture overview
- Coding standards
- Testing requirements
- Common patterns
`

const dynamicPrompt = `
[Suffix: Dynamic per-session - changes every time]
- Current feature to implement: ${feature.id}
- Recent git log: ${gitLog}
- Current progress: ${passing}/${total}
`
```

**Strategy**: Parallel execution for independent features

If features have no dependencies, multiple agents can work concurrently:

```typescript
async function parallelOrchestrate(features: Feature[]) {
  const independentFeatures = identifyIndependentFeatures(features)
  
  await Promise.all(
    independentFeatures.map(feature => 
      runCodingSession(feature)
    )
  )
}
```

**Caveat**: Requires careful management to avoid merge conflicts and race conditions on shared files.

### Cost Management

Agent sessions can be expensive. Strategies to control costs:

1. **Session limits**: Cap maximum sessions to prevent runaway costs
2. **Budget tracking**: Monitor cumulative cost and stop if threshold exceeded
3. **Smaller models for simple features**: Use cheaper models for low-priority features
4. **Human review checkpoints**: Require approval after N sessions

```typescript
class CostAwareOrchestrator extends Orchestrator {
  private totalCost = 0
  private readonly maxCost: number
  
  async runSession(feature: Feature): Promise<void> {
    if (this.totalCost >= this.maxCost) {
      throw new Error(`Budget exceeded: $${this.totalCost} >= $${this.maxCost}`)
    }
    
    const result = await super.runSession(feature)
    this.totalCost += result.cost || 0
    
    console.log(`Session cost: $${result.cost?.toFixed(2)} | Total: $${this.totalCost.toFixed(2)}`)
  }
}
```

### Security Considerations

**Concern**: Agent has file system and command execution access

**Mitigations**:

1. Run in isolated environment (Docker container, VM)
2. Use agent SDK permission controls when available
3. Review all commits before merging to main branch
4. Scan for secrets/credentials in pre-commit hooks
5. Limit network access if possible

**Concern**: Agent might expose sensitive information in progress.txt

**Mitigations**:

1. Instruct agent to never include secrets in logs
2. Validate progress.txt for patterns like API keys
3. Keep progress.txt in .gitignore if it might contain sensitive info
4. Use environment variables for all secrets

### Collaboration with Human Developers

The workflow is designed for human-agent collaboration:

**Humans can**:

- Review progress at any time via progress.txt and git log
- Manually implement features by updating feature_list.json
- Add new features to feature_list.json (append, never remove)
- Fix issues and commit, agent will see changes in next session
- Run orchestrator for N sessions, review, then continue

**Agents can**:

- Work autonomously when requirements are clear
- Ask for clarification by documenting questions in progress.txt
- Leverage human's previous commits and patterns
- Apply human's code review feedback in subsequent features

**Example workflow**:

1. Human writes requirements and runs initializer agent
2. Agent completes 5 features autonomously overnight
3. Human reviews in morning, finds issue in feature 3
4. Human fixes feature 3, commits with explanation
5. Agent resumes, learns from human's fix, applies to feature 6

## Extending the Pattern

### Domain Generalization

This workflow is not limited to software development. It can be applied to any long-running task with:

1. **Decomposable objectives**: Can be broken into discrete units
2. **Testable outcomes**: Can verify each unit's completion
3. **Accumulated knowledge**: Later work benefits from earlier learnings

**Examples**:

**Scientific Research**:

- Feature list → Hypotheses to test
- Implementation → Running experiments
- Testing → Analyzing results
- Knowledge capture → Building on previous findings

**Content Creation**:

- Feature list → Articles/chapters to write
- Implementation → Writing content
- Testing → Peer review/editing
- Knowledge capture → Style guide evolution

**Financial Modeling**:

- Feature list → Model components to build
- Implementation → Writing calculations
- Testing → Backtesting against historical data
- Knowledge capture → Documenting assumptions

### Multi-Agent Architectures

Specialized agents can handle specific aspects:

```typescript
interface AgentRole {
  name: string
  prompt: string
  trigger: (feature: Feature) => boolean
}

const roles: AgentRole[] = [
  {
    name: 'Implementation Agent',
    prompt: buildCodingPrompt,
    trigger: (f) => !f.passes
  },
  {
    name: 'Testing Agent',
    prompt: buildTestingPrompt,
    trigger: (f) => f.implemented && !f.tested
  },
  {
    name: 'Code Review Agent',
    prompt: buildReviewPrompt,
    trigger: (f) => f.tested && !f.reviewed
  },
  {
    name: 'Documentation Agent',
    prompt: buildDocsPrompt,
    trigger: (f) => f.reviewed && !f.documented
  }
]
```

Each agent specializes in one aspect, with clear handoff points.

### Enhanced Memory Systems

Future iterations could include:

**Vector Database for Pattern Retrieval**:

- Embed all previous session summaries
- Query for similar problems when starting new feature
- Surface relevant patterns automatically

**External Knowledge Integration**:

- Agent queries documentation during implementation
- Integrates learned patterns from other projects
- Accesses updated best practices from external sources

**Conversation History Persistence**:

- Store full agent conversation logs
- Retrieve relevant exchanges when similar issues arise
- Build corpus of problem-solving strategies

## Conclusion

This multi-session AI agent workflow solves the fundamental challenges of long-running agent tasks through:

1. **Structured State Management**: Machine-readable artifacts provide complete context for each new session
2. **Incremental Execution**: One-feature-at-a-time approach ensures consistent progress
3. **Compounding Knowledge**: Systematic capture and codification makes subsequent work easier

The pattern is **SDK-agnostic** and **domain-generalizable**, applicable to any system where:

- Tasks span multiple context windows or sessions
- Objectives can be decomposed into testable units
- Knowledge from completed work accelerates future work

**Key success factors**:

- Comprehensive feature list defined upfront (immutable contract)
- Strict testing requirements before marking features complete
- Rich narrative progress log capturing decisions and learnings
- Git discipline providing atomic history
- Knowledge codification into documentation, utilities, and automation

The result is a system where AI agents can make reliable progress on complex projects over hours, days, or weeks, with each session building on the last and contributing to an accelerating velocity of development.

**Implementation checklist**:

- [ ] Define feature list format for your domain
- [ ] Design progress log template
- [ ] Create environment setup automation
- [ ] Implement feature manager module
- [ ] Implement orchestrator control loop
- [ ] Design coding agent prompt template
- [ ] Build progress validation
- [ ] Set up git commit conventions
- [ ] Create knowledge capture workflow
- [ ] Establish stopping conditions
- [ ] Plan human review checkpoints

This workflow transforms long-running AI agent work from unreliable and repetitive to consistent and compounding.
