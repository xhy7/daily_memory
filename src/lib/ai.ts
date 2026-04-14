interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIConfig {
  provider: 'minimax' | 'openai' | 'anthropic';
  apiKey: string;
  model: string;
}

interface AIResponse {
  content: string;
  raw?: unknown;
}

function getAIConfig(): AIConfig {
  return {
    provider: (process.env.AI_PROVIDER as AIConfig['provider']) || 'minimax',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'MiniMax-M2.7',
  };
}

async function minimaxChat(config: AIConfig, messages: Message[]): Promise<AIResponse> {
  const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.5,
    }),
  });

  const data = await response.json();

  // MiniMax-specific error extraction
  const errorMsg = data.base_resp?.status_msg || data.error?.message || (response.ok ? null : `HTTP ${response.status}`);
  if (!response.ok || !data.choices || data.choices.length === 0) {
    throw new Error(`MiniMax API error: ${response.status} - ${errorMsg || 'API returned empty'}`);
  }

  return {
    content: data.choices[0].message.content.trim(),
    raw: data,
  };
}

async function openaiChat(config: AIConfig, messages: Message[]): Promise<AIResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.5,
    }),
  });

  const data = await response.json();

  const errorMsg = data.error?.message || (response.ok ? null : `HTTP ${response.status}`);
  if (!response.ok || !data.choices || data.choices.length === 0) {
    throw new Error(`OpenAI API error: ${response.status} - ${errorMsg || 'Unknown error'}`);
  }

  return {
    content: data.choices[0].message.content.trim(),
    raw: data,
  };
}

async function anthropicChat(config: AIConfig, messages: Message[]): Promise<AIResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }),
  });

  const data = await response.json();

  const errorMsg = data.error?.message || (response.ok ? null : `HTTP ${response.status}`);
  if (!response.ok || !data.content || data.content.length === 0) {
    throw new Error(`Anthropic API error: ${response.status} - ${errorMsg || 'Unknown error'}`);
  }

  return {
    content: data.content[0].text.trim(),
    raw: data,
  };
}

export async function chat(config: AIConfig, messages: Message[]): Promise<AIResponse> {
  switch (config.provider) {
    case 'minimax':
      return minimaxChat(config, messages);
    case 'openai':
      return openaiChat(config, messages);
    case 'anthropic':
      return anthropicChat(config, messages);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

export async function chatWithAI(messages: Message[]): Promise<AIResponse> {
  const config = getAIConfig();
  if (!config.apiKey) {
    throw new Error('AI_API_KEY is not configured');
  }
  return chat(config, messages);
}

export { getAIConfig };
export type { AIConfig, Message };
