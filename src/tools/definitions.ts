import type { ToolDefinition } from '../types/index.js';

/**
 * Tool definitions for Groq function calling
 */

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'pack_repository',
      description: 'Pack a GitHub repository into context for analysis. Use this when the user provides a GitHub URL or asks to analyze a repository.',
      parameters: {
        type: 'object',
        properties: {
          repoUrl: {
            type: 'string',
            description: 'The GitHub repository URL (e.g., https://github.com/user/repo)'
          },
          forceRefresh: {
            type: 'boolean',
            description: 'Force re-packing even if cached version exists',
            default: false
          }
        },
        required: ['repoUrl']
      }
    }
  }
];

export default toolDefinitions;