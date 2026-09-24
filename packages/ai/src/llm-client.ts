import type { LLMRequestOptions, LLMResponse, LLMProvider } from './types.js';
import { generateMockResponse } from './mock-provider.js';

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
    if (provider === 'gemini') {
      const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

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

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetchFn(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          }).finally(() => clearTimeout(timer));

          if (res.ok) {
            const data = (await res.json()) as any;
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text || '';
            if (text) {
              return {
                content: text,
                provider: 'gemini',
                model,
                tokensUsed: data.usageMetadata?.totalTokenCount,
              };
            }
          } else {
            const errText = await res.text().catch(() => '');
            console.warn(`[JobPulse AI] Gemini API returned status ${res.status}: ${errText.slice(0, 120)}`);
          }
        } catch (err: unknown) {
          console.warn('[JobPulse AI] Gemini provider failed, trying next provider...', err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (provider === 'groq') {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) {
        try {
          const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
          const messages: any[] = [];
          if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
          messages.push({ role: 'user', content: userPrompt });

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature,
              max_tokens: maxTokens,
              response_format: jsonMode ? { type: 'json_object' } : undefined,
            }),
            signal: controller.signal,
          }).finally(() => clearTimeout(timer));

          if (res.ok) {
            const data = (await res.json()) as any;
            const text = data.choices?.[0]?.message?.content || '';
            if (text) {
              return {
                content: text,
                provider: 'groq',
                model,
                tokensUsed: data.usage?.total_tokens,
              };
            }
          } else {
            const errText = await res.text().catch(() => '');
            console.warn(`[JobPulse AI] Groq API returned status ${res.status}: ${errText.slice(0, 120)}`);
          }
        } catch (err: unknown) {
          console.warn('[JobPulse AI] Groq provider failed, trying next provider...', err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (provider === 'deepseek') {
      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (deepseekKey) {
        try {
          const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
          const messages: any[] = [];
          if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
          messages.push({ role: 'user', content: userPrompt });

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetchFn('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deepseekKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature,
              max_tokens: maxTokens,
              response_format: jsonMode ? { type: 'json_object' } : undefined,
            }),
            signal: controller.signal,
          }).finally(() => clearTimeout(timer));

          if (res.ok) {
            const data = (await res.json()) as any;
            const text = data.choices?.[0]?.message?.content || '';
            if (text) {
              return {
                content: text,
                provider: 'deepseek',
                model,
                tokensUsed: data.usage?.total_tokens,
              };
            }
          } else {
            const errText = await res.text().catch(() => '');
            console.warn(`[JobPulse AI] DeepSeek API returned status ${res.status}: ${errText.slice(0, 120)}`);
          }
        } catch (err: unknown) {
          console.warn('[JobPulse AI] DeepSeek provider failed, trying next provider...', err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (provider === 'openai') {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        try {
          const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
          const messages: any[] = [];
          if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
          messages.push({ role: 'user', content: userPrompt });

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature,
              max_tokens: maxTokens,
              response_format: jsonMode ? { type: 'json_object' } : undefined,
            }),
            signal: controller.signal,
          }).finally(() => clearTimeout(timer));

          if (res.ok) {
            const data = (await res.json()) as any;
            const text = data.choices?.[0]?.message?.content || '';
            if (text) {
              return {
                content: text,
                provider: 'openai',
                model,
                tokensUsed: data.usage?.total_tokens,
              };
            }
          } else {
            const errText = await res.text().catch(() => '');
            console.warn(`[JobPulse AI] OpenAI API returned status ${res.status}: ${errText.slice(0, 120)}`);
          }
        } catch (err: unknown) {
          console.warn('[JobPulse AI] OpenAI provider failed, trying next provider...', err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  // Graceful intelligent fallback if no provider succeeded or no keys are configured
  return generateMockResponse(options);
}
