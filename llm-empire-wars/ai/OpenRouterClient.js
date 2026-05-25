export const DeepSeekConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-flash',
};

export const OpenRouterConfig = DeepSeekConfig;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

export async function callAI(systemPrompt, userPrompt, options = {}) {
  let lastError = null;
  const model = options.model || DeepSeekConfig.model;

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    // thinking: { type: 'enabled' },
    // reasoning_effort: 'high',
    stream: false,
  };
  
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(DeepSeekConfig.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DeepSeekConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        const respBody = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${respBody}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`DeepSeek error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from DeepSeek');
      }

      return content;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error('AI call failed after retries');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
