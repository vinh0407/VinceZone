/**
 * Adapter for Anthropic Claude API
 * Converts OpenAI standard payload <-> Anthropic Messages API
 */

function formatMessagesForAnthropic(messages) {
  let systemText = '';
  const anthropicMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const sysStr = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content) ? msg.content.map(p => p.text || '').join('\n') : '');
      systemText += (systemText ? '\n\n' : '') + sysStr;
    } else {
      let content = msg.content || '';
      if (Array.isArray(msg.content)) {
        content = [];
        for (const part of msg.content) {
          if (part.type === 'text') {
            content.push({ type: 'text', text: part.text || '' });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            const dataUrl = part.image_url.url;
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: match[1],
                  data: match[2]
                }
              });
            }
          }
        }
      }
      anthropicMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content
      });
    }
  }

  if (anthropicMessages.length === 0) {
    anthropicMessages.push({ role: 'user', content: 'Hello' });
  }

  return { systemText, anthropicMessages };
}

async function callChat({ provider, model, messages, temperature = 0.7, max_tokens = 2048, stream = false, res }) {
  const modelName = model || 'claude-3-5-sonnet-20241022';
  const apiKey = provider.apiKey ? provider.apiKey.trim() : '';
  const { systemText, anthropicMessages } = formatMessagesForAnthropic(messages);

  const payload = {
    model: modelName,
    messages: anthropicMessages,
    max_tokens: Number(max_tokens) || 2048,
    temperature: Number(temperature),
    stream: Boolean(stream)
  };

  if (systemText) {
    payload.system = systemText;
  }

  const url = `${provider.baseUrl || 'https://api.anthropic.com/v1'}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { parsed = { error: errorText }; }
    throw new Error(`[Anthropic] HTTP ${response.status}: ${parsed.error?.message || errorText}`);
  }

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
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const dataObj = JSON.parse(trimmed.slice(6));
            if (dataObj.type === 'content_block_delta' && dataObj.delta?.text) {
              const openaiChunk = {
                id: 'chatcmpl-' + Date.now(),
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: modelName,
                choices: [
                  {
                    index: 0,
                    delta: { content: dataObj.delta.text },
                    finish_reason: null
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

  const claudeData = await response.json();
  const replyText = claudeData.content?.[0]?.text || '';

  return {
    id: claudeData.id || ('chatcmpl-' + Date.now()),
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
        finish_reason: claudeData.stop_reason || 'stop'
      }
    ],
    usage: {
      prompt_tokens: claudeData.usage?.input_tokens || 0,
      completion_tokens: claudeData.usage?.output_tokens || 0,
      total_tokens: (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0)
    }
  };
}

async function testConnection(provider) {
  const start = Date.now();
  try {
    const testModel = provider.models && provider.models.length > 0 ? provider.models[0] : 'claude-3-5-haiku-20241022';
    const result = await callChat({
      provider,
      model: testModel,
      messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
      max_tokens: 10,
      stream: false
    });
    const latency = Date.now() - start;
    const reply = result.choices?.[0]?.message?.content || 'OK';
    return { ok: true, latency, message: `Connected to Claude (${latency}ms). Reply: "${reply.trim()}"` };
  } catch (err) {
    return { ok: false, latency: Date.now() - start, message: err.message };
  }
}

module.exports = {
  callChat,
  testConnection
};
