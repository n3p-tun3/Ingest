// Chat types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ChatRequest {
  message: string;
  cacheKey?: string;
  apiKey?: string;
  conversationHistory?: ChatMessage[];
}

export interface ChatResponse {
  response: string;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
  cacheKey?: string;
}

// Tool types
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolCallResult {
  tool: string;
  arguments: Record<string, any>;
  result?: RepoProcessResult;
  error?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

// Groq types
export interface GroqChatResponse {
  message: ChatMessage;
  usage: TokenUsage;
  finishReason: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Repo types
export interface RepoPackRequest {
  repoUrl: string;
  forceRefresh?: boolean;
}

export interface RepoProcessResult {
  cacheKey: string;
  fromCache: boolean;
  repoUrl?: string;
  commitSha?: string;
  size?: number;
  cachedAt?: string;
}

export interface CachedRepo {
  content: string;
  metadata: RepoMetadata;
}

export interface RepoMetadata {
  repoUrl: string;
  commitSha: string;
  size: number;
  cachedAt: string;
}

export interface RepoStatusResponse {
  exists: boolean;
  cacheKey: string;
  metadata?: RepoMetadata;
}

export interface RepoPackResponse {
  success: boolean;
  cacheKey?: string;
  fromCache?: boolean;
  metadata?: RepoMetadata;
  error?: string;
}