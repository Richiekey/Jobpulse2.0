import type { LLMRequestOptions, LLMResponse, LLMProvider } from './types.js';
import { generateMockResponse } from './mock-provider.js';

interface ProviderConfig {
  name: LLMProvider;
  displayName: string;
  getApiKey: () => string | undefined;
  getModel: () => string;
  getUrl: (key: string, model: string) => string;
  getHeaders: (key: string) => Record<string, string>;
  getBody: (opts: {
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
  }) => unknown;
  parseResponse: (data: any) => { text: string; tokensUsed?: number };
}

function createOpenAICompatibleConfig(params: {
  name: LLMProvider;
  displayName: string;
  getApiKey: () => string | undefined;
  getModel: () => string;
  url: string;
}): ProviderConfig {
  return {
    name: params.name,
    displayName: params.displayName,
    getApiKey: params.getApiKey,
    getModel: params.getModel,
    getUrl: () => params.url,
    getHeaders: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    }),
    getBody: ({ model, systemPrompt, userPrompt, temperature, maxTokens, jsonMode }) => {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userPrompt });
      return {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
      };
    },
    parseResponse: (data) => ({
      text: data.choices?.[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens,
    }),
  };
}

const PROVIDERS: Record<Exclude<LLMProvider, 'mock'>, ProviderConfig> = {
  gemini: {
    name: 'gemini',
    displayName: 'Gemini',
    getApiKey: () => process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    getModel: () => process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    getUrl: (key, model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    getHeaders: () => ({ 'Content-Type': 'application/json' }),
    getBody: ({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode }) => {
      const contents: any[] = [];
      if (systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: `[SYSTEM INSTRUCTIONS]:\n${systemPrompt}` }],
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Understood. I will strictly follow all instructions and format requirements.' }],
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }],
      });

      const body: any = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      };
      if (jsonMode) {
        body.generationConfig.responseMimeType = 'application/json';
      }
      return body;
    },
    parseResponse: (data) => ({
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      tokensUsed: data.usageMetadata?.totalTokenCount,
    }),
  },
  groq: createOpenAICompatibleConfig({
    name: 'groq',
    displayName: 'Groq',
    getApiKey: () => process.env.GROQ_API_KEY,
    getModel: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    url: 'https://api.groq.com/openai/v1/chat/completions',
  }),
  deepseek: createOpenAICompatibleConfig({
    name: 'deepseek',
    displayName: 'DeepSeek',
    getApiKey: () => process.env.DEEPSEEK_API_KEY,
    getModel: () => process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    url: 'https://api.deepseek.com/chat/completions',
  }),
  openai: createOpenAICompatibleConfig({
    name: 'openai',
    displayName: 'OpenAI',
    getApiKey: () => process.env.OPENAI_API_KEY,
    getModel: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
    url: 'https://api.openai.com/v1/chat/completions',
  }),
};

/**
 * Unified Multi-Provider LLM Client for JobPulse 2.0.
 * Automatically cascades through available API keys:
 * Gemini -> Groq -> DeepSeek -> OpenAI -> Mock Fallback
 */
export async function callLLM(options: LLMRequestOptions): Promise<LLMResponse> {
  const {
    systemPrompt = 'You are a world-class executive career strategist and ATS optimization expert.',
    userPrompt,
    temperature = 0.3,
    maxTokens = 4000,
    jsonMode = false,
    timeoutMs = 15000,
    preferredProviders,
    fetchFn = fetch,
  } = options;

  const defaultCascade: LLMProvider[] = ['gemini', 'groq', 'deepseek', 'openai'];
  const cascadeOrder = preferredProviders && preferredProviders.length > 0
    ? [...preferredProviders, ...defaultCascade.filter((p) => !preferredProviders.includes(p))]
    : defaultCascade;

  for (const provider of cascadeOrder) {
    if (provider === 'mock') continue;
    const config = PROVIDERS[provider];
    if (!config) continue;

    const apiKey = config.getApiKey();
    if (!apiKey) continue;

    try {
      const model = config.getModel();
      const endpoint = config.getUrl(apiKey, model);
      const headers = config.getHeaders(apiKey);
      const body = config.getBody({ model, systemPrompt, userPrompt, temperature, maxTokens, jsonMode });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = (await res.json()) as any;
        const { text, tokensUsed } = config.parseResponse(data);
        if (text) {
          return {
            content: text,
            provider,
            model,
            tokensUsed,
          };
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[JobPulse AI] ${config.displayName} API returned status ${res.status}: ${errText.slice(0, 120)}`);
      }
    } catch (err: unknown) {
      console.warn(`[JobPulse AI] ${config.displayName} provider failed, trying next provider...`, err instanceof Error ? err.message : String(err));
    }
  }

  // Graceful intelligent fallback if no provider succeeded or no keys are configured
  return generateMockResponse(options);
}
