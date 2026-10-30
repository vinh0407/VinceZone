/**
 * Adapter for Google Gemini API
 * Converts OpenAI standard payload <-> Gemini 1.5/2.5 REST format
 */

function formatMessagesForGemini(messages) {
  let systemText = '';
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const sysStr = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content) ? msg.content.map(p => p.text || '').join('\n') : '');
      systemText += (systemText ? '\n\n' : '') + sysStr;
    } else {
      const parts = [];
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content || '' });
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') {
            parts.push({ text: item.text || '' });
          } else if (item.type === 'image_url' && item.image_url?.url) {
            const dataUrl = item.image_url.url;
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2]
                }
              });
            }
          }
        }
      }
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: parts.length > 0 ? parts : [{ text: '' }]
      });
    }
  }

  // Gemini requires at least one user turn
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  return { systemText, contents };
}

async function callChat({ provider, model, messages, temperature = 0.7, max_tokens, stream = false, res }) {
  const modelName = model || 'gemini-2.5-flash';
  const apiKey = provider.apiKey ? provider.apiKey.trim() : '';
  const { systemText, contents } = formatMessagesForGemini(messages);

  const payload = {
    contents,
    generationConfig: {
      temperature: Number(temperature)
    }
  };

  if (max_tokens) {
    payload.generationConfig.maxOutputTokens = Number(max_tokens);
  }

  if (systemText) {
    payload.systemInstruction = {
      parts: [{ text: systemText }]
    };
  }

  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const url = `${provider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${modelName}:${action}&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = { error: errorText }; }
    throw new Error(`[Gemini] HTTP ${response.status}: ${parsed.error?.message || errorText}`);
  }

  // Handle streaming SSE
  if (stream && res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep remainder

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const dataObj = JSON.parse(trimmed.slice(6));
            const chunkText = dataObj.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunkText) {
              const openaiChunk = {
                id: 'chatcmpl-' + Date.now(),
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: modelName,
                choices: [
                  {
                    index: 0,
                    delta: { content: chunkText },
                    finish_reason: dataObj.candidates?.[0]?.finishReason || null
                  }
                ]
              };
              res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
            }
          } catch {
            // pass
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // Non-streaming response
  const geminiData = await response.json();
  const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const totalTokens = geminiData.usageMetadata?.totalTokenCount || 0;

  return {
    id: 'chatcmpl-' + Date.now(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: replyText
        },
        finish_reason: geminiData.candidates?.[0]?.finishReason || 'stop'
      }
    ],
    usage: {
      prompt_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
      completion_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: totalTokens
    }
  };
}

async function testConnection(provider) {
  const start = Date.now();
  try {
    const testModel = provider.models && provider.models.length > 0 ? provider.models[0] : 'gemini-2.5-flash';
    const result = await callChat({
      provider,
      model: testModel,
      messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
      max_tokens: 5,
      stream: false
    });
    const latency = Date.now() - start;
    const reply = result.choices?.[0]?.message?.content || 'OK';
    return { ok: true, latency, message: `Connected to Gemini (${latency}ms). Reply: "${reply.trim()}"` };
  } catch (err) {
    return { ok: false, latency: Date.now() - start, message: err.message };
  }
}

module.exports = {
  callChat,
  testConnection
};
