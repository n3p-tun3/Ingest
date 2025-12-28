import Groq from 'groq-sdk';
import type { 
  ChatMessage, 
  GroqChatResponse, 
  ParsedToolCall, 
  ToolDefinition 
} from '../types/index.js';

export class GroqService {
  private client: Groq;
  private model: string = 'llama-3.3-70b-versatile';

  constructor(apiKey: string = process.env.GROQ_API_KEY || '') {
    if (!apiKey) {
      throw new Error('Groq API key is required');
    }
    this.client = new Groq({ apiKey });
  }

  /**
   * Send a chat message with optional tool calling
   */
  async chat(
    messages: ChatMessage[], 
    tools: ToolDefinition[] | null = null, 
    repoContext: string | null = null
  ): Promise<GroqChatResponse> {
    try {
      // If we have repo context, inject it into the system message
      const systemMessage: ChatMessage = repoContext 
        ? {
            role: 'system',
            content: `You are an expert developer assistant. You have access to a packed repository context below. Use this context to answer questions about the codebase accurately.\n\n<REPO_CONTEXT>\n${repoContext}\n</REPO_CONTEXT>`
          }
        : {
            role: 'system',
            content: 'You are an expert developer assistant. Help users understand and work with their code.'
          };

      const allMessages: ChatMessage[] = [systemMessage, ...messages];

      const params: any = {
        model: this.model,
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 8000
      };

      // Add tools if provided
      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      const completion = await this.client.chat.completions.create(params);

      return {
        message: completion.choices[0].message as ChatMessage,
        usage: {
          prompt_tokens: completion.usage?.prompt_tokens || 0,
          completion_tokens: completion.usage?.completion_tokens || 0,
          total_tokens: completion.usage?.total_tokens || 0
        },
        finishReason: completion.choices[0].finish_reason || 'stop'
      };
    } catch (error) {
      console.error('Groq API error:', error);
      throw new Error(`Groq API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stream chat response (for future use)
   */
  async chatStream(
    messages: ChatMessage[], 
    tools: ToolDefinition[] | null = null
  ): Promise<any> {
    try {
      const params: any = {
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 8000,
        stream: true
      };

      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      return await this.client.chat.completions.create(params);
    } catch (error) {
      console.error('Groq streaming error:', error);
      throw new Error(`Groq streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a message contains tool calls
   */
  hasToolCalls(message: ChatMessage): boolean {
    return !!(message.tool_calls && message.tool_calls.length > 0);
  }

  /**
   * Parse tool calls from a message
   */
  parseToolCalls(message: ChatMessage): ParsedToolCall[] {
    if (!this.hasToolCalls(message)) {
      return [];
    }

    return message.tool_calls!.map(call => ({
      id: call.id,
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments)
    }));
  }
}

export default GroqService;