#!/usr/bin/env bun
/**
 * Quick test script to verify promptAsync + event streaming works
 * Run with: bun run debug-events.ts
 */

import { createOpencode } from '@opencode-ai/sdk';

async function main() {
  console.log('Testing promptAsync event streaming...\n');
  const cwd = process.cwd();

  const opencode = await createOpencode({
    cwd,
    port: 0,
  });

  console.log(`Server: ${opencode.server.url}`);

  const client = opencode.client;

  // Create a session
  const sessionResult = await client.session.create({
    body: { title: 'Test session' },
  });

  if (sessionResult.error) {
    console.error('Failed to create session:', sessionResult.error);
    process.exit(1);
  }

  const session = sessionResult.data;
  console.log(`Session: ${session.id}`);

  // Subscribe to events FIRST
  const events = await client.event.subscribe();
  console.log('Events subscribed');

  // Send prompt ASYNC
  const promptResult = await client.session.promptAsync({
    path: { id: session.id },
    body: {
      parts: [{ type: 'text', text: 'What is 2+2? Reply with just the number.' }],
    },
  });

  if (promptResult.error) {
    console.error('Failed to send prompt:', promptResult.error);
    process.exit(1);
  }

  console.log('Prompt sent async, waiting for events...\n');

  // Wait for events
  const startTime = Date.now();
  let completed = false;

  for await (const event of events.stream) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (event.type === 'session.idle') {
      const sessionID = event.properties?.sessionID;
      if (sessionID === session.id) {
        console.log(`[${elapsed}s] session.idle - COMPLETED!`);
        completed = true;
        break;
      }
    } else if (event.type === 'session.error') {
      const sessionID = event.properties?.sessionID;
      if (sessionID === session.id) {
        console.log(`[${elapsed}s] session.error - FAILED!`);
        break;
      }
    } else if (event.type === 'message.part.updated') {
      const part = event.properties?.part;
      if (part?.sessionID === session.id) {
        if (part?.type === 'text') {
          console.log(`[${elapsed}s] text: "${part.text?.slice(0, 50)}"`);
        } else {
          console.log(`[${elapsed}s] ${part?.type}`);
        }
      }
    }

    if (Date.now() - startTime > 30000) {
      console.log('Timeout!');
      break;
    }
  }

  if (completed) {
    console.log('\n✓ SUCCESS: Event streaming works correctly!');
  } else {
    console.log('\n✗ FAILURE: Did not receive completion event');
  }

  // Clean shutdown
  try {
    await opencode.server.close();
  } catch {
    // Ignore
  }
}

main().catch(console.error);
