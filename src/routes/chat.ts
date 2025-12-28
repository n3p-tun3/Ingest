import { Hono } from 'hono';
import GroqService from '../services/groq.ts';
import RepomixService from '../services/repomix.ts';
import { toolDefinitions } from '../tools/definitions.ts';
import type { 
  ChatRequest, 
  ChatResponse, 
  ChatMessage,
  ToolCallResult 
} from '../types/index.ts';

const app = new Hono();

/**
 * POST /api/chat
 * Main chat endpoint with tool calling support
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json() as ChatRequest;
    const { message, cacheKey, apiKey, conversationHistory = [] } = body;

    if (!message) {
      return c.json({ error: 'Message is required' }, 400);
    }

    // Initialize services
    const groqService = new GroqService(apiKey);
    const repomixService = new RepomixService();

    // Build messages array
    const messages: ChatMessage[] = [
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Load repo context if cacheKey is provided from previous interaction
    let repoContext: string | null = null;
    let currentCacheKey = cacheKey;

    if (cacheKey) {
      const cached = await repomixService.loadFromCache(cacheKey);
      if (cached) {
        repoContext = cached.content;
      } else {
        // Cache key invalid, will re-pack if needed
        currentCacheKey = undefined;
      }
    }

    // First call to Groq with tools
    let response = await groqService.chat(messages, toolDefinitions, repoContext);

    // Handle tool calls
    const toolCalls: ToolCallResult[] = [];
    let finalCacheKey = currentCacheKey;

    if (groqService.hasToolCalls(response.message)) {
      const parsedCalls = groqService.parseToolCalls(response.message);
      
      for (const call of parsedCalls) {
        if (call.name === 'pack_repository') {
          try {
            const result = await repomixService.processRepo(
              call.arguments.repoUrl,
              call.arguments.forceRefresh || false
            );

            toolCalls.push({
              tool: call.name,
              arguments: call.arguments,
              result
            });

            // Add tool response to conversation
            messages.push(response.message);
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result)
            });

            // Make second call with tool result
            const cachedData = await repomixService.loadFromCache(result.cacheKey);
            if (cachedData) {
              response = await groqService.chat(messages, null, cachedData.content);
              finalCacheKey = result.cacheKey;
            }

          } catch (error) {
            toolCalls.push({
              tool: call.name,
              arguments: call.arguments,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    }

    const chatResponse: ChatResponse = {
      response: response.message.content || '',
      usage: response.usage,
      cacheKey: finalCacheKey
    };

    if (toolCalls.length > 0) {
      chatResponse.toolCalls = toolCalls;
    }

    return c.json(chatResponse);

  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

export default app;