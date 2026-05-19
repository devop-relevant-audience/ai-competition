export const OpenRouterConfig = {
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'deepseek/deepseek-v4-pro',
  maxTokens: 800,
  temperature: 0.8,
};

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

export async function callAI(systemPrompt, userPrompt) {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OpenRouterConfig.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OpenRouterConfig.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'LLM Empire Wars',
        },
        body: JSON.stringify({
          model: OpenRouterConfig.model,
          max_tokens: OpenRouterConfig.maxTokens,
          temperature: OpenRouterConfig.temperature,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${body}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`OpenRouter error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenRouter');
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
