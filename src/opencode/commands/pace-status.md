---
description: Show current pace project status and progress
---

# /pace-status

Show the current status of the pace project including feature progress, passing/failing counts, and next recommended feature.

## Usage

```
/pace-status
```

## What This Command Does

1. **Reads feature_list.json** - Loads current feature status
2. **Calculates Progress** - Counts passing and failing features
3. **Shows Breakdown** - Progress by category and priority
4. **Recommends Next** - Identifies highest-priority failing feature

## Output Format

```
PACE Project Status
===================

Project: My Project
Progress: 15/50 features passing (30%)

By Priority:
  Critical:  5/5  (100%)
  High:      8/15 (53%)
  Medium:    2/20 (10%)
  Low:       0/10 (0%)

By Category:
  core:           5/8  (63%)
  authentication: 3/5  (60%)
  ui:             4/15 (27%)
  api:            3/12 (25%)
  testing:        0/10 (0%)

Next Feature: F016 - User can reset password
Priority: high
Category: authentication
Steps:
  1. User clicks "Forgot password" link
  2. User enters email address
  3. User receives password reset email
  4. User clicks reset link
  5. User sets new password
  6. User can login with new password
```

## When to Use

- At the start of a new session to understand project state
- To decide what to work on next
- To track overall progress
- To identify blocked areas
