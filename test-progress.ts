#!/usr/bin/env bun
/**
 * Simple test script to verify the progress indicator works
 */

import { createProgressIndicator } from './src/progress-indicator';

console.log('Testing progress indicator...\n');

const indicator = createProgressIndicator({
  trackWidth: 20,
  showEmojis: true,
  showElapsed: true,
  showCount: true,
  countLabel: 'actions',
});

const tools = ['write', 'read', 'bash', 'edit', 'git', 'glob', 'grep'];

let count = 0;
const testInterval = setInterval(() => {
  const tool = tools[count % tools.length];
  indicator.update({ action: tool, count: count + 1 });
  count++;
  
  if (count >= 15) {
    clearInterval(testInterval);
    setTimeout(() => {
      indicator.stop();
      console.log('\n\nProgress indicator test complete!');
      process.exit(0);
    }, 1000);
  }
}, 500);
