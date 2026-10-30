const Store = require('./store');
const openaiAdapter = require('./adapters/openaiAdapter');
const geminiAdapter = require('./adapters/geminiAdapter');
const anthropicAdapter = require('./adapters/anthropicAdapter');

function getAdapter(type) {
  switch (type) {
    case 'gemini':
      return geminiAdapter;
    case 'anthropic':
      return anthropicAdapter;
    case 'openai':
    case 'openai-compatible':
    default:
      return openaiAdapter;
  }
}

async function routeChatRequest({ model, messages, temperature, max_tokens, stream, res, clientIp = '127.0.0.1', userId = null }) {
  const match = Store.findProviderForModel(model);
  const startTime = Date.now();

  if (!match) {
    const errorMsg = `No active AI provider configured or enabled for model "${model}". Please add and enable a provider in the Workplay Hub.`;
    Store.logRequest({
      endpoint: '/v1/chat/completions',
      model,
      provider: 'None',
      clientIp,
      status: 400,
      latency: Date.now() - startTime,
      error: errorMsg
    });
    throw new Error(errorMsg);
  }

  const { provider, model: resolvedModel } = match;
  const adapter = getAdapter(provider.type);

  // ----------------------------------------------------
  // VINCEZONE USER PROFILE & CRITICAL DIRECTIVES INJECTION (ĐÃ ĐĂNG NHẬP)
  // ----------------------------------------------------
  let enrichedMessages = [...messages];

  if (userId) {
    const userDirectives = Store.formatUserProfileForPrompt(userId);
    if (userDirectives) {
      const sysIdx = enrichedMessages.findIndex(m => m.role === 'system');
      if (sysIdx >= 0) {
        enrichedMessages[sysIdx] = {
          ...enrichedMessages[sysIdx],
          content: `${enrichedMessages[sysIdx].content}\n${userDirectives}`
        };
      } else {
        enrichedMessages.unshift({
          role: 'system',
          content: `You are an AI assistant routed through VinceZone Gateway.${userDirectives}`
        });
      }
    }
  }

  // ----------------------------------------------------
  // VINCEZONE SHARED MEMORY INJECTION
  // ----------------------------------------------------
  const memorySettings = Store.getMemorySettings();

  if (memorySettings.enabled) {
    const memoryPrompt = Store.formatMemoriesForPrompt();
    if (memoryPrompt) {
      const sysIdx = enrichedMessages.findIndex(m => m.role === 'system');
      if (sysIdx >= 0) {
        enrichedMessages[sysIdx] = {
          ...enrichedMessages[sysIdx],
          content: `${enrichedMessages[sysIdx].content}\n${memoryPrompt}`
        };
      } else {
        enrichedMessages.unshift({
          role: 'system',
          content: `You are an AI assistant routed through VinceZone Gateway.${memoryPrompt}`
        });
      }
    }
  }

  // Auto-learning detection
  if (memorySettings.autoLearn && messages && messages.length > 0) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg && lastUserMsg.content) {
      const textToExtract = typeof lastUserMsg.content === 'string'
        ? lastUserMsg.content
        : (Array.isArray(lastUserMsg.content)
            ? lastUserMsg.content.filter(p => p.type === 'text').map(p => p.text).join(' ')
            : '');
      if (textToExtract) {
        Store.autoExtractMemory(textToExtract, resolvedModel);
      }
    }
  }

  try {
    const result = await adapter.callChat({
      provider,
      model: resolvedModel,
      messages: enrichedMessages,
      temperature,
      max_tokens,
      stream,
      res
    });

    const latency = Date.now() - startTime;
    Store.logRequest({
      endpoint: '/v1/chat/completions',
      model: resolvedModel,
      provider: provider.name,
      clientIp,
      status: 200,
      latency,
      stream: Boolean(stream),
      tokens: result?.usage?.total_tokens || null
    });

    return result;
  } catch (err) {
    const latency = Date.now() - startTime;
    Store.logRequest({
      endpoint: '/v1/chat/completions',
      model: resolvedModel,
      provider: provider.name,
      clientIp,
      status: 500,
      latency,
      error: err.message
    });
    throw err;
  }
}

async function testProviderConnection(provider) {
  const adapter = getAdapter(provider.type);
  return await adapter.testConnection(provider);
}

module.exports = {
  routeChatRequest,
  testProviderConnection
};
