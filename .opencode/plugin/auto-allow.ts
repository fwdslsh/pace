/**
 * Auto-allow plugin for pace CLI
 *
 * This plugin automatically approves all tool permissions for pace CLI usage.
 * Since pace is designed for autonomous operation without user interaction,
 * all tools should be allowed to execute without prompting.
 */

import type { Plugin } from '@opencode-ai/plugin';

export const AutoAllow: Plugin = async () => {
  return {
    config: async (config) => {
      // Set global permission config to allow all tools
      config.permission = {
        bash: 'allow',
        edit: 'allow',
        webfetch: 'allow',
        external_directory: 'allow',
        doom_loop: 'allow',
      };
    },
  };
};

export default AutoAllow;
