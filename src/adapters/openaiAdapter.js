/**
 * Adapter for OpenAI and OpenAI-Compatible APIs
 * (DeepSeek, Groq, Ollama, Together, OpenRouter, Mistral, Local vLLM, etc.)
 */

async function callChat({ provider, model, messages, temperature = 0.7, max_tokens, stream = false, res }) {
  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json'
  };
  if (provider.apiKey && provider.apiKey.trim() !== '') {
    headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
  }

  const payload = {
    model: model || provider.models[0],
    messages,
    temperature: Number(temperature),
    stream: Boolean(stream)
  };
  if (max_tokens) payload.max_tokens = Number(max_tokens);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = { error: errorText }; }
    throw new Error(`[${provider.name}] HTTP ${response.status}: ${parsed.error?.message || parsed.message || errorText}`);
  }

  if (stream && res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
    res.end();
    return;
  }

  const data = await response.json();
  return data;
}

async function testConnection(provider) {
  const start = Date.now();
  try {
    const testModel = provider.models && provider.models.length > 0 ? provider.models[0] : 'gpt-4o-mini';
    const result = await callChat({
      provider,
      model: testModel,
      messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
      max_tokens: 5,
      stream: false
    });
    const latency = Date.now() - start;
    const reply = result.choices?.[0]?.message?.content || 'OK';
    return { ok: true, latency, message: `Connected successfully (${latency}ms). Reply: "${reply.trim()}"` };
  } catch (err) {
    return { ok: false, latency: Date.now() - start, message: err.message };
  }
}

module.exports = {
  callChat,
  testConnection
};
