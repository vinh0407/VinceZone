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

async function routeChatRequest({ model, messages, temperature, max_tokens, stream, res, clientIp = '127.0.0.1', userId = null, providerId = null }) {
  // Chuẩn hóa alias cho các model free của OpenRouter
  const MODEL_ALIASES = {
    'x-ai/xing4.0-29b-a4b:free': 'xingchen-agi/xing4.0-29b-a4b:free',
    'liquid/lfm2.5-2.6b:free': 'liquid/lfm-2.5-2.6b:free',
    'recursive/flint:free': 'recursive/flint-v1.0:free',
    'flint:free': 'recursive/flint-v1.0:free'
  };
  if (model && MODEL_ALIASES[model]) {
    model = MODEL_ALIASES[model];
  }

  let match = null;
  if (providerId) {
    const prov = Store.getProviderById(providerId);
    const isFree = prov && (prov.id === 'prov_kilo_gateway' || prov.id === 'prov_opencode' || (prov.baseUrl && prov.baseUrl.includes('kilo.ai')));
    if (prov && (prov.apiKey || isFree)) {
      match = { provider: prov, model: model || (prov.models && prov.models[0]) };
    }
  }
  if (!match) {
    match = Store.findProviderForModel(model);
  }
  if (!match) {
    // Fallback to any enabled provider with valid API key or free gateway
    const allProviders = Store.getProviders();
    const active = allProviders.filter(p => p.enabled && (p.apiKey || p.id === 'prov_kilo_gateway' || p.id === 'prov_opencode'));
    if (active.length > 0) {
      const fallback = active.find(p => p.id === 'prov_openrouter') || active.find(p => p.id === 'prov_cloudflare_ai') || active[0];
      match = { provider: fallback, model: fallback.models?.[0] || 'kilo-auto/free' };
    }
  }
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
    const isRateLimit = err.message && (
      err.message.includes('429') || 
      err.message.includes('Free usage limit reached') || 
      err.message.includes('quota') ||
      err.message.includes('rate limit')
    );

    const hasImageInput = enrichedMessages.some(m => 
      Array.isArray(m.content) && m.content.some(part => part.type === 'image_url')
    );
    const isVisionError = err.message && (
      err.message.includes('supports text input only') ||
      err.message.includes('image input') ||
      err.message.includes('This conversation contains an image')
    );

    // 1. TỰ ĐỘNG CHUYỂN TIẾP SANG MÔ HÌNH VISION NẾU ĐÍNH KÈM ẢNH MÀ MODEL KHÔNG HỖ TRỢ
    if (hasImageInput && isVisionError && (!res || !res.headersSent)) {
      const allActiveProviders = Store.getProviders().filter(p => p.enabled && p.apiKey);
      for (const p of allActiveProviders) {
        const vModel = (p.models || []).find(m => 
          m.includes('omni') || 
          m.includes('dots-3-note') || 
          m.includes('super-vl') || 
          m.includes('gemini') || 
          m.includes('gpt-4o') || 
          m.includes('claude')
        );

        if (vModel) {
          console.warn(`[Auto-Vision-Failover] Mô hình "${resolvedModel}" không hỗ trợ ảnh. Đang tự động chuyển tiếp sang mô hình Vision "${vModel}" của "${p.name}"...`);
          try {
            const vAdapter = getAdapter(p.type);
            const vResult = await vAdapter.callChat({
              provider: p,
              model: vModel,
              messages: enrichedMessages,
              temperature,
              max_tokens,
              stream,
              res
            });

            Store.logRequest({
              endpoint: '/v1/chat/completions',
              model: `${resolvedModel}  ${vModel} (Chuyển sang Vision)`,
              provider: `${provider.name} -> ${p.name}`,
              clientIp,
              status: 200,
              latency: Date.now() - startTime,
              stream: Boolean(stream),
              tokens: vResult?.usage?.total_tokens || null
            });

            return vResult;
          } catch (vErr) {
            console.error('[Auto-Vision-Failover] Chuyển đổi Vision thất bại:', vErr.message);
          }
        }
      }
    }

    // 2. TỰ ĐỘNG CHUYỂN ĐỔI DỰ PHÒNG (SMART FAILOVER) KHI GẶP LỖI 429 HẠN MỨC
    if (isRateLimit && (!res || !res.headersSent)) {
      const allProviders = Store.getProviders().filter(p => p.enabled && p.id !== provider.id && p.apiKey);
      const fallbackProvider = allProviders.find(p => 
        p.id === 'prov_kilo_gateway' || 
        (p.baseUrl && p.baseUrl.includes('kilo')) || 
        (p.name && p.name.toLowerCase().includes('kilo'))
      ) || allProviders[0];

      if (fallbackProvider && fallbackProvider.models && fallbackProvider.models.length > 0) {
        const fallbackModel = fallbackProvider.models.find(m => m.includes('auto') || m.includes('free')) || fallbackProvider.models[0];
        console.warn(`[Auto-Failover] Nhà cung cấp "${provider.name}" (${resolvedModel}) gặp lỗi 429 (Hết hạn mức). Hệ thống tự động chuyển sang "${fallbackProvider.name}" (${fallbackModel})...`);

        try {
          const fallbackAdapter = getAdapter(fallbackProvider.type);
          const fallbackResult = await fallbackAdapter.callChat({
            provider: fallbackProvider,
            model: fallbackModel,
            messages: enrichedMessages,
            temperature,
            max_tokens,
            stream,
            res
          });

          Store.logRequest({
            endpoint: '/v1/chat/completions',
            model: `${resolvedModel} -> ${fallbackModel} (Tự động chuyển tiếp)`,
            provider: `${provider.name} -> ${fallbackProvider.name}`,
            clientIp,
            status: 200,
            latency: Date.now() - startTime,
            stream: Boolean(stream),
            tokens: fallbackResult?.usage?.total_tokens || null
          });

          return fallbackResult;
        } catch (fallbackErr) {
          console.error(`[Auto-Failover] Chuyển đổi sang "${fallbackProvider.name}" không thành công:`, fallbackErr.message);
        }
      }
    }

    let userFacingError = err.message;
    if (isVisionError) {
      userFacingError = `[Tác vụ Thị giác] Mô hình "${resolvedModel}" chỉ hỗ trợ văn bản (text-only). Bạn hãy chọn tác vụ "Phân tích hình ảnh (Vision)" ở bước 2 để chọn mô hình đọc ảnh (như "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" hoặc Google Gemini / GPT-4o).`;
    } else if (err.message && (err.message.includes('Free usage limit reached') || (err.message.includes('429') && err.message.includes('OpenCode')))) {
      userFacingError = `[OpenCode] Đã đạt giới hạn gọi miễn phí (HTTP 429: Free usage limit reached). Bạn hãy chuyển sang chọn Provider "Kilo Gateway" (chọn model "kilo-auto/free" hoặc "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free") ở cột bên phải để tiếp tục sử dụng miễn phí không giới hạn.`;
    }

    Store.logRequest({
      endpoint: '/v1/chat/completions',
      model: resolvedModel,
      provider: provider.name,
      clientIp,
      status: 500,
      latency,
      error: userFacingError
    });
    throw new Error(userFacingError);
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
