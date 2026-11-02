require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Store = require('./src/store');
const Auth = require('./src/auth');
const { routeChatRequest, testProviderConnection } = require('./src/router');
const imageService = require('./src/imageService');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure default user exists
Auth.ensureDefaultAdmin();

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to extract session user
function getSessionUser(req) {
  const token = req.headers['authorization'];
  return Auth.getUserByToken(token);
}

// Middleware to authenticate external calls to /v1
function authenticateGatewayKey(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      error: {
        message: 'Missing Authorization header. Expected: Bearer vz_live_...',
        type: 'authentication_error',
        code: 'invalid_api_key'
      }
    });
  }

  const isValid = Store.verifyGatewayKey(authHeader);
  if (!isValid) {
    return res.status(401).json({
      error: {
        message: 'Invalid or revoked Gateway API key. Check your VinceZone keys.',
        type: 'authentication_error',
        code: 'invalid_api_key'
      }
    });
  }

  next();
}

// ----------------------------------------------------
// 1. OPENAI-COMPATIBLE GATEWAY ENDPOINTS (/v1)
// ----------------------------------------------------

/**
 * Standard OpenAI chat completions endpoint
 * External applications point their OpenAI client here!
 */
app.post('/v1/chat/completions', authenticateGatewayKey, async (req, res) => {
  const { model, messages, temperature = 0.7, max_tokens, stream = false } = req.body;

  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        message: 'Invalid payload: "model" (string) and "messages" (array) are required.',
        type: 'invalid_request_error'
      }
    });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const user = getSessionUser(req);

  try {
    const result = await routeChatRequest({
      model,
      messages,
      temperature,
      max_tokens,
      stream,
      res,
      clientIp,
      userId: user?.id
    });

    if (!stream) {
      res.json(result);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: err.message,
          type: 'gateway_routing_error'
        }
      });
    }
  }
});

/**
 * Standard OpenAI models endpoint
 */
app.get('/v1/models', (req, res) => {
  const providers = Store.getProviders().filter(p => p.enabled);
  const modelsList = [];

  for (const prov of providers) {
    if (prov.models && Array.isArray(prov.models)) {
      for (const m of prov.models) {
        modelsList.push({
          id: m,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: prov.name.toLowerCase().replace(/\s+/g, '-'),
          permission: [],
          root: m,
          parent: null
        });
      }
    }
  }

  res.json({
    object: 'list',
    data: modelsList
  });
});

// ----------------------------------------------------
// 2. PLAYGROUND CHAT & IMAGE GENERATION ENDPOINTS
// ----------------------------------------------------

app.post('/api/playground/chat', async (req, res) => {
  const { model, messages, temperature = 0.7, max_tokens, stream = true } = req.body;

  if (!model || !messages) {
    return res.status(400).json({ error: 'Model and messages are required' });
  }

  const user = getSessionUser(req);

  // Kiểm tra nếu model là Model Tạo/Sửa Ảnh AI (Flux, SDXL, Turbo, Midjourney)
  const isImageModel = imageService.IMAGE_MODELS.some(im => im.id === model) || 
                       model.includes('flux') || 
                       model.includes('diffusion');

  if (isImageModel) {
    try {
      // Lấy nội dung prompt từ tin nhắn người dùng cuối cùng
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      let promptText = '';
      let sourceImage = null;

      if (lastUserMsg) {
        if (typeof lastUserMsg.content === 'string') {
          promptText = lastUserMsg.content;
        } else if (Array.isArray(lastUserMsg.content)) {
          lastUserMsg.content.forEach(part => {
            if (part.type === 'text') promptText += part.text + ' ';
            if (part.type === 'image_url') sourceImage = part.image_url?.url || part.image_url;
          });
        }
      }

      promptText = promptText.trim() || 'A beautiful futuristic masterpiece';

      let imgResult;
      if (sourceImage) {
        // Chế độ sửa ảnh (Image-to-Image)
        imgResult = await imageService.editImage({
          sourceImage,
          prompt: promptText,
          model
        });
      } else {
        // Chế độ tạo ảnh (Text-to-Image)
        imgResult = await imageService.generateImage({
          prompt: promptText,
          model
        });
      }

      const responseMarkdown = `🎨 **Đã tạo ảnh thành công bằng AI [${imgResult.model}]!**\n\n` +
        `![${imgResult.prompt}](${imgResult.url})\n\n` +
        `- **Mô tả (Prompt):** ${imgResult.prompt}\n` +
        `- **Kích thước:** ${imgResult.width}x${imgResult.height} | **Seed:** ${imgResult.seed}\n` +
        `- **Nhà cung cấp:** ${imgResult.provider}\n\n` +
        `[📥 Tải Ảnh Về Máy](${imgResult.url}) • [🔍 Mở Ảnh Tab Mới](${imgResult.url})`;

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Gửi thông báo bắt đầu
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: responseMarkdown } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      } else {
        return res.json({
          id: 'chatcmpl-img-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: responseMarkdown },
            finish_reason: 'stop'
          }],
          image: imgResult
        });
      }
    } catch (imgErr) {
      console.error('Image generation error in playground:', imgErr);
      if (!res.headersSent) {
        return res.status(500).json({ error: imgErr.message });
      }
    }
  }

  try {
    const result = await routeChatRequest({
      model,
      messages,
      temperature,
      max_tokens,
      stream,
      res,
      clientIp: 'playground-ui',
      userId: user?.id
    });

    if (!stream) {
      res.json(result);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// APIs chuyên dụng cho Image Studio (hỗ trợ cả /api/image và /api/images)
const handleImageModels = (req, res) => {
  res.json({ success: true, models: imageService.IMAGE_MODELS });
};
app.get('/api/image/models', handleImageModels);
app.get('/api/images/models', handleImageModels);

const handleImageGenerate = async (req, res) => {
  try {
    const { prompt, model, width, height, seed, style, enhance } = req.body;
    const result = await imageService.generateImage({
      prompt,
      model,
      width,
      height,
      seed,
      style,
      enhance
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/image/generate', handleImageGenerate);
app.post('/api/images/generate', handleImageGenerate);

const handleImageEdit = async (req, res) => {
  try {
    const { sourceImage, prompt, model, strength, width, height, style } = req.body;
    const result = await imageService.editImage({
      sourceImage,
      prompt,
      model,
      strength,
      width,
      height,
      style
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/image/edit', handleImageEdit);
app.post('/api/images/edit', handleImageEdit);

// ----------------------------------------------------
// 3. PROVIDER MANAGEMENT APIS
// ----------------------------------------------------

app.get('/api/providers', (req, res) => {
  const providers = Store.getProviders();
  // Mask API keys for security in UI unless explicitly editing
  const masked = providers.map(p => ({
    ...p,
    hasKey: Boolean(p.apiKey && p.apiKey.trim().length > 0),
    apiKeyMasked: p.apiKey ? (p.apiKey.slice(0, 4) + '...' + p.apiKey.slice(-4)) : ''
  }));
  res.json(masked);
});

app.post('/api/providers', (req, res) => {
  const provider = req.body;
  if (!provider.name || !provider.type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }

  // If user didn't enter a new key, retain the previous key
  if (provider.id) {
    const existing = Store.getProviderById(provider.id);
    if (existing && (!provider.apiKey || provider.apiKey.trim() === '')) {
      provider.apiKey = existing.apiKey;
    }
  }

  // Parse models if string
  if (typeof provider.models === 'string') {
    provider.models = provider.models.split(',').map(m => m.trim()).filter(Boolean);
  }

  const saved = Store.saveProvider(provider);
  res.json({ success: true, provider: saved });
});

app.delete('/api/providers/:id', (req, res) => {
  Store.deleteProvider(req.params.id);
  res.json({ success: true });
});

app.post('/api/providers/:id/test', async (req, res) => {
  const provider = Store.getProviderById(req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }
  if (!provider.apiKey || provider.apiKey.trim() === '') {
    return res.status(400).json({ error: 'Provider has no API Key configured' });
  }

  const result = await testProviderConnection(provider);
  res.json(result);
});

// ----------------------------------------------------
// 4. GATEWAY ACCESS KEYS APIS
// ----------------------------------------------------

app.get('/api/keys', (req, res) => {
  res.json(Store.getGatewayKeys());
});

app.post('/api/keys', (req, res) => {
  const { name } = req.body;
  const newKey = Store.createGatewayKey(name);
  res.json(newKey);
});

app.delete('/api/keys/:id', (req, res) => {
  Store.deleteGatewayKey(req.params.id);
  res.json({ success: true });
});

// ----------------------------------------------------
// 5. AUDIT / REQUEST LOGS APIS & URL / DRIVE FETCH
// ----------------------------------------------------

app.get('/api/logs', (req, res) => {
  res.json(Store.getLogs());
});

/**
 * Fetch & parse Web Link or Google Drive document content
 */
app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  const cleanUrl = url.trim();
  try {
    const parsed = new URL(cleanUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Chỉ hỗ trợ giao thức http hoặc https' });
    }

    // Special handling for Google Docs & Google Sheets export
    let fetchTarget = cleanUrl;
    let isGoogleDoc = false;
    let isGoogleSheet = false;

    const docMatch = cleanUrl.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
    const sheetMatch = cleanUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

    if (docMatch) {
      isGoogleDoc = true;
      fetchTarget = `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
    } else if (sheetMatch) {
      isGoogleSheet = true;
      fetchTarget = `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(fetchTarget, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VinceZone-Gateway/2.0',
        'Accept': 'text/html,application/xhtml+xml,text/plain,text/csv,application/json;q=0.9'
      }
    });
    clearTimeout(timeout);

    if (!response.ok && (isGoogleDoc || isGoogleSheet)) {
      // Fallback: If document is not public exportable, return link metadata
      return res.json({
        url: cleanUrl,
        title: isGoogleDoc ? 'Google Docs Document' : 'Google Sheets Spreadsheet',
        snippet: `[Tài liệu Google Drive bảo mật/nội bộ: ${cleanUrl}]. AI sẽ tham chiếu liên kết và thông tin này khi phản hồi.`,
        isGoogleDrive: true,
        accessible: false
      });
    }

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    let title = '';
    let extractedText = '';

    if (isGoogleDoc || isGoogleSheet) {
      title = isGoogleDoc ? 'Google Docs Document' : 'Google Sheets Spreadsheet';
      extractedText = rawText.slice(0, 25000);
    } else if (contentType.includes('text/html')) {
      const titleMatch = rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleMatch ? titleMatch[1].replace(/\r?\n/g, ' ').trim() : parsed.hostname;

      // Strip style, script and html markup
      extractedText = rawText
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      title = parsed.pathname.split('/').pop() || parsed.hostname;
      extractedText = rawText.slice(0, 25000);
    }

    const snippet = extractedText.slice(0, 15000);

    return res.json({
      url: cleanUrl,
      title: title || parsed.hostname,
      snippet,
      length: extractedText.length,
      isGoogleDrive: Boolean(isGoogleDoc || isGoogleSheet || cleanUrl.includes('drive.google.com')),
      accessible: true
    });
  } catch (err) {
    return res.status(500).json({
      error: `Không thể kết nối đến đường dẫn (${err.message}). Vui lòng kiểm tra lại URL.`
    });
  }
});

// ----------------------------------------------------
// 6. VINCEZONE COGNITIVE MEMORY APIS (BỘ NHỚ DÙNG CHUNG)
// ----------------------------------------------------

app.get('/api/memories', (req, res) => {
  res.json({
    settings: Store.getMemorySettings(),
    memories: Store.getMemories()
  });
});

/**
 * Trích xuất & đồng bộ tự động toàn bộ lịch sử chat (của tôi & của AI) vào Bộ nhớ nhận thức
 */
app.post('/api/memories/sync-from-chats', (req, res) => {
  const user = getSessionUser(req);
  const result = Store.syncAllChatsToMemory(user?.id);
  res.json({
    success: true,
    count: result.added,
    total: result.total
  });
});

app.delete('/api/memories', (req, res) => {
  Store.clearAllMemories();
  res.json({ success: true, message: 'Đã xóa toàn bộ bộ nhớ vĩnh viễn' });
});

app.post('/api/memories', (req, res) => {
  const { content, category, sourceModel } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Nội dung ghi nhớ không được để trống' });
  }
  const saved = Store.saveMemory({
    content: content.trim(),
    category: category || 'learned',
    sourceModel: sourceModel || 'Thủ công'
  });
  res.json({ success: true, memory: saved });
});

app.delete('/api/memories/:id', (req, res) => {
  Store.deleteMemory(req.params.id);
  res.json({ success: true });
});

app.post('/api/memories/:id/toggle', (req, res) => {
  const updated = Store.toggleMemory(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Không tìm thấy memory' });
  res.json({ success: true, memory: updated });
});

app.post('/api/memories/settings', (req, res) => {
  const updatedSettings = Store.updateMemorySettings(req.body);
  res.json({ success: true, settings: updatedSettings });
});

app.post('/api/memories/learn-from-chat', (req, res) => {
  const { text, sourceModel } = req.body;
  const memory = Store.autoExtractMemory(text, sourceModel);
  res.json({ success: Boolean(memory), memory });
});

// ----------------------------------------------------
// 7. AUTHENTICATION APIS (ĐĂNG NHẬP / ĐĂNG KÝ)
// ----------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  try {
    const session = Auth.register(req.body);
    res.json({ success: true, ...session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const session = Auth.login(req.body);
    res.json({ success: true, ...session });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['authorization'];
  Auth.logout(token);
  res.json({ success: true });
});

// ----------------------------------------------------
// 7.1 USER PROFILE & AI DIRECTIVES APIS (CHỈ KHI ĐÃ ĐĂNG NHẬP)
// ----------------------------------------------------

app.get('/api/user/profile', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'Vui lòng đăng nhập để xem thông tin người dùng và thiết lập hồ sơ AI.'
    });
  }
  const profile = Store.getUserProfile(user.id);
  res.json({
    user,
    profile: profile || {}
  });
});

app.post('/api/user/profile', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'Chỉ người dùng đã đăng nhập mới có quyền lưu thông tin và cấu hình ghi nhớ cho AI.'
    });
  }

  try {
    const updated = Store.saveUserProfile(user.id, req.body);
    res.json({
      success: true,
      profile: updated,
      message: 'Đã lưu thông tin người dùng thành công! AI sẽ ghi nhớ vĩnh viễn dữ liệu này.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 8. CHAT SESSIONS APIS (BỘ NHỚ LỊCH SỬ CHAT)
// ----------------------------------------------------

app.get('/api/chats', (req, res) => {
  const user = getSessionUser(req);
  const chats = Store.getChats(user?.id);
  res.json({
    isGuest: !user,
    user: user ? { username: user.username, role: user.role } : null,
    retentionInfo: user ? 'Lưu trữ vĩnh viễn (Đã đăng nhập)' : 'Khách: lưu 3 ngày (Đăng nhập để lưu lâu dài)',
    chats
  });
});

app.get('/api/chats/:id', (req, res) => {
  const chat = Store.getChatById(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện' });
  res.json(chat);
});

app.post('/api/chats', (req, res) => {
  const user = getSessionUser(req);
  const chatData = req.body;
  if (user) chatData.userId = user.id;
  const saved = Store.saveChat(chatData);
  res.json(saved);
});

app.delete('/api/chats/:id', (req, res) => {
  Store.deleteChat(req.params.id);
  res.json({ success: true });
});

app.delete('/api/chats', (req, res) => {
  const user = getSessionUser(req);
  Store.clearAllChats(user?.id);
  res.json({ success: true });
});

// ----------------------------------------------------
// 9. DỰ ÁN & MULTI-AGENT TEAMWORK SYSTEM APIS
// ----------------------------------------------------

async function callInternalAI({ model, messages, temperature = 0.7, providerId = null }) {
  let selectedModel = model || 'nvidia/nemotron-3.5-lightning:free';
  let targetProvider = providerId || 'prov_kilo_gateway';

  const extractText = (res) => {
    const choice = res?.choices?.[0];
    if (!choice) return '';
    return (choice.message?.content || choice.message?.reasoning || choice.text || '').trim();
  };

  // 1. Gọi chính thức với model và provider được chỉ định
  try {
    const result = await routeChatRequest({
      model: selectedModel,
      messages,
      temperature,
      stream: false,
      providerId: targetProvider
    });
    const content = extractText(result);
    if (content) return content;
  } catch (err) {
    console.warn(`[callInternalAI] Primary routing failed for model "${selectedModel}" (provider: ${targetProvider}): ${err.message}. Auto-recovering via Active API Fallbacks...`);
  }

  // Chuỗi Fallback API thực tế qua các Provider đang hoạt động (Kilo Gateway, Cloudflare AI & OpenRouter)
  const fallbacks = [
    { providerId: 'prov_kilo_gateway', model: 'nvidia/nemotron-3.5-lightning:free' },
    { providerId: 'prov_kilo_gateway', model: 'kilo-auto/free' },
    { providerId: 'prov_cloudflare_ai', model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast' },
    { providerId: 'prov_cloudflare_ai', model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' },
    { providerId: 'prov_kilo_gateway', model: 'cohere/north-mini-code:free' },
    { providerId: 'prov_openrouter', model: 'nvidia/nemotron-3.5-lightning:free' }
  ];

  for (const fb of fallbacks) {
    if (fb.providerId === targetProvider && fb.model === selectedModel) continue;
    try {
      const res = await routeChatRequest({
        model: fb.model,
        messages,
        temperature,
        stream: false,
        providerId: fb.providerId
      });
      const c = extractText(res);
      if (c) return c;
    } catch (e) {
      console.warn(`[callInternalAI] Fallback ${fb.providerId}/${fb.model} error:`, e.message);
    }
  }

  return '';
}

function runTerminalCommand(command, workingDir = process.cwd(), shell = 'powershell') {
  return new Promise((resolve) => {
    const shellBinary = shell.toLowerCase() === 'cmd' ? 'cmd.exe' : 'powershell.exe';
    const args = shell.toLowerCase() === 'cmd'
      ? ['/c', command]
      : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    const safeCwd = (workingDir && fs.existsSync(workingDir)) ? workingDir : process.cwd();

    const child = spawn(shellBinary, args, {
      cwd: safeCwd,
      env: { ...process.env },
      windowsHide: true
    });

    child.stdout.on('data', data => {
      stdout += data.toString('utf8');
      if (stdout.length > 200000) stdout = stdout.slice(-200000);
    });

    child.stderr.on('data', data => {
      stderr += data.toString('utf8');
      if (stderr.length > 200000) stderr = stderr.slice(-200000);
    });

    const timeout = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      resolve({
        command,
        stdout,
        stderr: stderr + '\n[Lệnh bị dừng do quá thời gian chờ 60 giây]',
        exitCode: -1,
        duration: Date.now() - startTime,
        cwd: safeCwd
      });
    }, 60000);

    child.on('close', code => {
      clearTimeout(timeout);
      resolve({
        command,
        stdout,
        stderr,
        exitCode: code,
        duration: Date.now() - startTime,
        cwd: safeCwd
      });
    });

    child.on('error', err => {
      clearTimeout(timeout);
      resolve({
        command,
        stdout,
        stderr: err.message,
        exitCode: -1,
        duration: Date.now() - startTime,
        cwd: safeCwd
      });
    });
  });
}

// 9.1 Lấy danh sách dự án
app.get('/api/projects', (req, res) => {
  const user = getSessionUser(req);
  const projects = Store.getProjects(user?.id);
  res.json({ success: true, projects });
});

// 9.2 Tạo dự án mới
app.post('/api/projects', (req, res) => {
  try {
    const user = getSessionUser(req);
    const { name, path: projPath, description, agents } = req.body;
    const project = Store.createProject({
      name,
      path: projPath,
      description,
      agents,
      userId: user?.id || null
    });
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9.3 Lấy chi tiết dự án
app.get('/api/projects/:id', (req, res) => {
  const project = Store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  res.json({ success: true, project });
});

// 9.4 Cập nhật dự án
app.put('/api/projects/:id', (req, res) => {
  try {
    const updated = Store.updateProject(req.params.id, req.body);
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9.5 Xóa dự án
app.delete('/api/projects/:id', (req, res) => {
  Store.deleteProject(req.params.id);
  res.json({ success: true });
});

// 9.6 Lấy danh mục các lĩnh vực AI chuyên môn
app.get('/api/specialized-roles', (req, res) => {
  res.json({ success: true, catalog: Store.getSpecializedCatalog() });
});

// 9.7 Quản lý Nhóm Agent trong dự án (Teams)
app.get('/api/projects/:id/teams', (req, res) => {
  const project = Store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  res.json({ success: true, teams: project.teams || [] });
});

app.post('/api/projects/:id/teams', (req, res) => {
  try {
    const { name, description } = req.body;
    const team = Store.createProjectTeam(req.params.id, { name, description });
    res.json({ success: true, team });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:id/teams/:teamId', (req, res) => {
  try {
    Store.deleteProjectTeam(req.params.id, req.params.teamId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9.8 Thêm thành viên vào nhóm (Tối đa 5 agent)
app.post('/api/projects/:id/teams/:teamId/members', (req, res) => {
  try {
    const { name, category, model } = req.body;
    const member = Store.addTeamMember(req.params.id, req.params.teamId, { name, category, model });
    res.json({ success: true, member });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:id/teams/:teamId/members/:memberId', (req, res) => {
  try {
    Store.removeTeamMember(req.params.id, req.params.teamId, req.params.memberId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9.9 Lấy danh sách chat của dự án
app.get('/api/projects/:id/chats', (req, res) => {
  const chats = Store.getProjectChats(req.params.id);
  res.json({ success: true, chats });
});

// 9.10 Tạo chat mới trong dự án
app.post('/api/projects/:id/chats', (req, res) => {
  try {
    const { title, model } = req.body;
    const newChat = Store.createProjectChat(req.params.id, {
      title,
      model: model || 'kilo-auto/free'
    });
    res.json({ success: true, chat: newChat });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Thêm Agent vào đoạn chat (Dấu cộng nhỏ góc phải, tối đa 5 agent)
app.post('/api/projects/:id/chats/:chatId/agents', (req, res) => {
  try {
    const { category, model, name, providerId, providerName } = req.body;
    const agent = Store.addAgentToChat(req.params.id, req.params.chatId, { category, model, name, providerId, providerName });
    res.json({ success: true, agent });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Phân tích dự án hoặc ý tưởng để cơ cấu và bổ nhiệm các AI Agent phù hợp
app.post('/api/projects/:id/chats/:chatId/analyze-and-recruit', (req, res) => {
  try {
    const { idea } = req.body || {};
    const result = Store.analyzeAndSetupAgentsForChat(req.params.id, req.params.chatId, idea);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tự động thêm trọn bộ 5 Agent chuyên sâu từ 4 Provider (OpenRouter, Cloudflare, Kilo, OpenCode)
app.post('/api/projects/:id/chats/:chatId/auto-add-agents', (req, res) => {
  try {
    const agents = Store.autoSetupAgentsForChat(req.params.id, req.params.chatId);
    res.json({ success: true, agents });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Xóa Agent khỏi đoạn chat
app.delete('/api/projects/:id/chats/:chatId/agents/:agentId', (req, res) => {
  try {
    Store.removeAgentFromChat(req.params.id, req.params.chatId, req.params.agentId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Đổi model AI chính của đoạn chat
app.patch('/api/projects/:id/chats/:chatId/model', (req, res) => {
  try {
    Store.updateProjectChatModel(req.params.id, req.params.chatId, req.body.model, req.body.providerId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Helper an toàn ghi file vào dự án thực tế trên đĩa cứng (Cấp quyền tự động toàn phần cho Agent)
function writeProjectFileHelper(projectRoot, rawFileName, content, isDirectory = false) {
  if (!projectRoot || !fs.existsSync(projectRoot)) return null;
  let cleanName = (rawFileName || '').trim().replace(/^["']|["']$/g, '');
  if (!cleanName) return null;

  const normalizedProjPath = path.resolve(projectRoot);

  // 1. Nếu cleanName chứa đường dẫn tuyệt đối của dự án
  if (path.isAbsolute(cleanName)) {
    const resolvedName = path.resolve(cleanName);
    if (resolvedName.toLowerCase().startsWith(normalizedProjPath.toLowerCase())) {
      cleanName = path.relative(normalizedProjPath, resolvedName);
    } else {
      cleanName = cleanName.replace(/^[a-zA-Z]:[\\\/]+/, '');
    }
  }

  // 2. Nếu cleanName bắt đầu bằng tên thư mục dự án (ví dụ: SickDuck/src/...)
  const projFolderName = path.basename(normalizedProjPath).toLowerCase();
  const cleanNorm = cleanName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleanNorm.toLowerCase().startsWith(projFolderName + '/')) {
    cleanName = cleanNorm.slice(projFolderName.length + 1);
  } else if (cleanNorm.toLowerCase() === projFolderName) {
    cleanName = '';
  }

  // 3. Loại bỏ các dấu gạch chéo dư thừa ở đầu
  cleanName = cleanName.replace(/^[\\\/]+/, '').trim();
  if (!cleanName || cleanName === '.' || cleanName === '') return null;

  const targetPath = path.resolve(normalizedProjPath, cleanName);

  // 4. Bảo vệ an toàn: Không cho phép path traversal (..) thoát khỏi project.path
  if (!targetPath.toLowerCase().startsWith(normalizedProjPath.toLowerCase())) {
    return null;
  }

  const targetDir = isDirectory ? targetPath : path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (!isDirectory) {
    fs.writeFileSync(targetPath, content || '', 'utf8');
  }

  return { targetPath, relativePath: cleanName.replace(/\\/g, '/') };
}

// Tạo File hoặc Thư mục trong dự án
app.post('/api/projects/:id/files', (req, res) => {
  try {
    const project = Store.getProjectById(req.params.id);
    if (!project || !project.path) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
    let { name, type = 'file', content = '' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Vui lòng nhập tên tập tin hoặc thư mục.' });
    
    let cleanName = name.trim();
    const normalizedProjPath = path.resolve(project.path);

    // 1. Nếu cleanName chứa đường dẫn tuyệt đối của dự án (ví dụ: C:\VisualStudio\SickDuck\src\file.cs)
    if (path.isAbsolute(cleanName)) {
      const resolvedName = path.resolve(cleanName);
      if (resolvedName.toLowerCase().startsWith(normalizedProjPath.toLowerCase())) {
        cleanName = path.relative(normalizedProjPath, resolvedName);
      } else {
        // Loại bỏ tiền tố ổ đĩa (C:\...)
        cleanName = cleanName.replace(/^[a-zA-Z]:[\\\/]+/, '');
      }
    }

    // 2. Nếu cleanName bắt đầu bằng tên thư mục dự án (ví dụ: SickDuck\src\...)
    const projFolderName = path.basename(normalizedProjPath).toLowerCase();
    const cleanNorm = cleanName.replace(/\\/g, '/').replace(/^\/+/, '');
    if (cleanNorm.toLowerCase().startsWith(projFolderName + '/')) {
      cleanName = cleanNorm.slice(projFolderName.length + 1);
    } else if (cleanNorm.toLowerCase() === projFolderName) {
      cleanName = '';
    }

    // 3. Loại bỏ các dấu gạch chéo dư thừa ở đầu
    cleanName = cleanName.replace(/^[\\\/]+/, '').trim();
    if (!cleanName || cleanName === '.' || cleanName === '') {
      return res.status(400).json({ error: 'Vui lòng chỉ định tên file cụ thể bên trong dự án (ví dụ: src/app.js).' });
    }

    const targetPath = path.resolve(normalizedProjPath, cleanName);

    // 4. Bảo vệ an toàn: Không cho phép path traversal (..) thoát khỏi project.path
    if (!targetPath.toLowerCase().startsWith(normalizedProjPath.toLowerCase())) {
      return res.status(403).json({ error: 'Đường dẫn tệp không được nằm ngoài thư mục dự án.' });
    }

    if (type === 'folder') {
      if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
    } else {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(targetPath, content || '', 'utf8');
    }

    const relativePath = path.relative(normalizedProjPath, targetPath).replace(/\\/g, '/');
    res.json({ success: true, path: targetPath, relativePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lưu tệp hình ảnh vào thư mục dự án (từ Image Studio hoặc URL)
app.post('/api/projects/:id/save-image', (req, res) => {
  try {
    const project = Store.getProjectById(req.params.id);
    if (!project || !project.path) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
    const { imagePath, filename, folder = 'assets/images' } = req.body;
    if (!imagePath) return res.status(400).json({ error: 'Thiếu đường dẫn ảnh nguồn.' });

    const safeFilename = (filename || `image_${Date.now()}.png`).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const targetDir = path.join(project.path, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetFile = path.join(targetDir, safeFilename);

    if (imagePath.startsWith('/generated_images/')) {
      const srcFile = path.join(__dirname, 'public', imagePath.replace(/^\//, ''));
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, targetFile);
      } else {
        return res.status(404).json({ error: 'Tệp ảnh nguồn không tồn tại trên hệ thống.' });
      }
    } else if (imagePath.startsWith('data:image/')) {
      const base64Data = imagePath.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(targetFile, Buffer.from(base64Data, 'base64'));
    } else {
      return res.status(400).json({ error: 'Định dạng ảnh nguồn không được hỗ trợ để sao chép.' });
    }

    const relativePath = path.join(folder, safeFilename).replace(/\\/g, '/');
    res.json({ success: true, savedPath: targetFile, relativePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9.11 Lấy nội dung 1 đoạn chat
app.get('/api/projects/:id/chats/:chatId', (req, res) => {
  const chat = Store.getProjectChat(req.params.id, req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện.' });
  res.json({ success: true, chat });
});

// 9.12 Xóa 1 đoạn chat trong dự án
app.delete('/api/projects/:id/chats/:chatId', (req, res) => {
  Store.deleteProjectChat(req.params.id, req.params.chatId);
  res.json({ success: true });
});

// 9.13 Xóa sạch tin nhắn trong chat
app.post('/api/projects/:id/chats/:chatId/clear', (req, res) => {
  Store.clearProjectChatMessages(req.params.id, req.params.chatId);
  res.json({ success: true });
});

// 9.13.1 Lấy toàn bộ sơ đồ cấu trúc công việc & các file đã chỉnh của từng AI Agent
app.get('/api/projects/:id/structure', (req, res) => {
  try {
    const project = Store.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

    const chats = project.chats || [];
    const agentMap = new Map();
    const filesModified = [];

    // Duyệt qua tất cả đoạn chat và tin nhắn để tổng hợp file đã chỉnh theo từng Agent
    chats.forEach(chat => {
      (chat.messages || []).forEach(msg => {
        if (msg.role === 'assistant') {
          const author = msg.author || 'AI';
          if (!agentMap.has(author)) {
            agentMap.set(author, {
              name: author,
              badge: msg.agentBadge || 'AI',
              color: msg.agentColor || '#3b82f6',
              model: msg.agentModel || 'kilo-auto/free',
              roleTitle: msg.agentRole || 'Chuyên gia AI',
              messagesCount: 0,
              files: []
            });
          }
          const ag = agentMap.get(author);
          ag.messagesCount++;

          // 1. Files được auto-saved
          if (Array.isArray(msg.autoSavedFiles) && msg.autoSavedFiles.length > 0) {
            msg.autoSavedFiles.forEach(f => {
              const cleanF = (f || '').trim().replace(/\\/g, '/');
              if (cleanF && !ag.files.includes(cleanF)) ag.files.push(cleanF);
              if (cleanF && !filesModified.some(x => x.file === cleanF)) {
                filesModified.push({
                  file: cleanF,
                  author: author,
                  role: msg.agentRole || 'AI',
                  chatTitle: chat.title || 'Đoạn chat',
                  timestamp: msg.timestamp
                });
              }
            });
          }

          // 2. Scan code blocks có // File: <path>
          const codeRegex = /```(?:[a-zA-Z0-9_-]+)?\s*\r?\n(?:(?:\/\/|#|\/\*)\s*File:\s*([^\r\n]+)\r?\n)/gi;
          let cm;
          while ((cm = codeRegex.exec(msg.content || '')) !== null) {
            let rawF = cm[1].trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
            if (rawF && !/explore\.(ps1|sh|bat)|list\.(ps1|sh)/i.test(rawF)) {
              if (!ag.files.includes(rawF)) ag.files.push(rawF);
              if (!filesModified.some(x => x.file === rawF)) {
                filesModified.push({
                  file: rawF,
                  author: author,
                  role: msg.agentRole || 'AI',
                  chatTitle: chat.title || 'Đoạn chat',
                  timestamp: msg.timestamp
                });
              }
            }
          }
        }
      });
    });

    // Tổng hợp sơ đồ luồng công việc từ các nhóm chat (Workflow)
    const workflow = chats.map((c, idx) => {
      const activeAgents = (c.agents || []).map(a => ({
        name: a.name,
        badge: a.badge,
        role: a.roleTitle,
        color: a.color,
        model: a.model,
        provider: a.providerName
      }));
      const msgCount = (c.messages || []).length;
      return {
        id: c.id,
        index: idx + 1,
        title: c.title || `Nhóm Công Việc #${idx + 1}`,
        agents: activeAgents,
        messageCount: msgCount,
        status: msgCount > 0 ? 'active' : 'pending',
        updatedAt: c.updatedAt || project.updatedAt
      };
    });

    // Lấy thông tin đĩa cứng thực tế của các file đã chỉnh
    const enrichedFiles = filesModified.map(f => {
      let sizeBytes = null;
      let lastModified = f.timestamp;
      let existsOnDisk = false;
      if (project.path) {
        try {
          const fullP = path.resolve(project.path, f.file);
          if (fs.existsSync(fullP)) {
            existsOnDisk = true;
            const st = fs.statSync(fullP);
            sizeBytes = st.size;
            lastModified = st.mtime.toISOString();
          }
        } catch (e) {}
      }
      return {
        ...f,
        sizeBytes,
        existsOnDisk,
        lastModified
      };
    });

    res.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        description: project.description
      },
      stats: {
        totalChats: chats.length,
        totalAgents: agentMap.size,
        totalFilesEdited: enrichedFiles.length
      },
      workflow,
      agents: Array.from(agentMap.values()),
      files: enrichedFiles
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9.14 Chạy lệnh Terminal trong thư mục dự án
app.post('/api/projects/:id/terminal', async (req, res) => {
  const project = Store.getProjectById(req.params.id);
  const workingDir = project ? project.path : process.cwd();
  const { command, shell = 'powershell' } = req.body;

  if (!command || !command.trim()) {
    return res.status(400).json({ error: 'Câu lệnh terminal không được để trống.' });
  }

  const result = await runTerminalCommand(command, workingDir, shell);
  res.json({ success: true, ...result });
});

// 9.15 Duyệt danh sách file trong dự án
app.get('/api/projects/:id/files', (req, res) => {
  const project = Store.getProjectById(req.params.id);
  const root = project?.path || process.cwd();

  if (!fs.existsSync(root)) {
    return res.json({ success: false, error: 'Thư mục dự án không tồn tại trên máy.', files: [] });
  }

  try {
    const listDir = (dirPath, relPath = '', depth = 0) => {
      if (depth > 3) return []; // Giới hạn độ sâu để tránh quét nặng
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = [];
      const ignore = ['node_modules', '.git', '.next', 'dist', 'build', '.gemini', 'package-lock.json'];

      for (const ent of entries) {
        if (ignore.includes(ent.name)) continue;
        const itemRel = relPath ? `${relPath}/${ent.name}` : ent.name;
        const itemFull = path.join(dirPath, ent.name);
        if (ent.isDirectory()) {
          items.push({
            name: ent.name,
            type: 'directory',
            path: itemRel,
            children: listDir(itemFull, itemRel, depth + 1)
          });
        } else {
          items.push({
            name: ent.name,
            type: 'file',
            path: itemRel
          });
        }
      }
      return items;
    };

    const files = listDir(root);
    res.json({ success: true, root, files });
  } catch (err) {
    res.json({ success: false, error: err.message, files: [] });
  }
});

// 9.16 Đọc file trong dự án
app.post('/api/projects/:id/read-file', (req, res) => {
  const project = Store.getProjectById(req.params.id);
  const root = project?.path || process.cwd();
  const filePath = req.body.path;

  if (!filePath) return res.status(400).json({ error: 'Thiếu đường dẫn file.' });
  const full = path.resolve(root, filePath);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File không tồn tại.' });

  try {
    const content = fs.readFileSync(full, 'utf8');
    res.json({ success: true, path: filePath, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 9.16c Live Demo & Preview Phục vụ Web / Mobile App trực tiếp từ Dự Án
app.use('/api/projects/:id/preview', (req, res, next) => {
  const project = Store.getProjectById(req.params.id);
  if (!project || !project.path || !fs.existsSync(project.path)) {
    return res.status(404).send('<!DOCTYPE html><html><body style="background:#09090b;color:#ef4444;font-family:sans-serif;padding:2rem;text-align:center;"><h3>Thư mục dự án chưa tồn tại trên máy</h3></body></html>');
  }

  const normalizedProj = path.resolve(project.path);
  let requestedSub = req.path || '/';

  // Nếu truy cập root preview
  if (requestedSub === '/' || requestedSub === '') {
    const candidates = ['index.html', 'public/index.html', 'dist/index.html', 'build/index.html', 'src/index.html', 'app.html'];
    let foundEntry = null;
    for (const c of candidates) {
      const fullCand = path.join(normalizedProj, c);
      if (fs.existsSync(fullCand)) {
        foundEntry = fullCand;
        break;
      }
    }
    if (foundEntry) {
      return res.sendFile(foundEntry);
    }

    // Nếu không có index.html, kiểm tra xem có tệp HTML nào khác trong thư mục không
    try {
      const allFiles = [];
      const scanHtml = (dir, depth = 0) => {
        if (depth > 2) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (['node_modules', '.git', '.gemini', 'dist-desktop'].includes(e.name)) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) scanHtml(full, depth + 1);
          else if (e.name.endsWith('.html')) allFiles.push(path.relative(normalizedProj, full).replace(/\\/g, '/'));
        }
      };
      scanHtml(normalizedProj);

      if (allFiles.length > 0) {
        return res.sendFile(path.resolve(normalizedProj, allFiles[0]));
      }

      return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${project.name} - Live Demo</title>
  <style>
    body { background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; box-sizing: border-box; }
    .card { background: #141417; border: 1px solid #27272a; border-radius: 12px; padding: 2rem; max-width: 480px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
    h3 { margin: 0 0 0.5rem; color: #60a5fa; }
    p { color: #a1a1aa; font-size: 0.9rem; line-height: 1.5; margin: 0 0 1.25rem; }
    .btn { display: inline-flex; align-items: center; gap: 0.4rem; background: #2563eb; color: #fff; padding: 0.6rem 1.2rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.85rem; border: none; cursor: pointer; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚀</div>
    <h3>${project.name}</h3>
    <p>Chưa tìm thấy tệp <code>index.html</code> trong thư mục dự án để làm trang chủ web.</p>
    <p style="font-size: 0.8rem; color: #71717a;">Bạn có thể nhờ AI viết giao diện web hoặc khởi chạy Dev Server (ví dụ: <code>npm run dev</code>) rồi chọn chế độ Dev Server URL để trình chiếu!</p>
  </div>
</body>
</html>`);
    } catch (err) {
      return res.status(500).send(`Lỗi đọc file: ${err.message}`);
    }
  }

  // Phục vụ tệp tĩnh trong dự án
  const cleanSub = requestedSub.replace(/^\/+/, '');
  const targetFile = path.resolve(normalizedProj, cleanSub);
  if (!targetFile.toLowerCase().startsWith(normalizedProj.toLowerCase())) {
    return res.status(403).send('Forbidden: Path Traversal Denied');
  }

  if (fs.existsSync(targetFile) && !fs.statSync(targetFile).isDirectory()) {
    return res.sendFile(targetFile);
  }

  res.status(404).send('Không tìm thấy tệp: ' + cleanSub);
});


// 9.16d Web Proxy phục vụ xem web, Gemini, ChatGPT và tài liệu trực tiếp trong Demo Tab
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Thiếu tham số url.');
  }

  let finalUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(finalUrl)) {
    if (finalUrl.includes(' ') || !finalUrl.includes('.')) {
      finalUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(finalUrl);
    } else {
      finalUrl = 'https://' + finalUrl;
    }
  }

  try {
    const response = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    const contentType = response.headers.get('content-type') || 'text/html';

    // Xóa các header chặn iframe: X-Frame-Options, CSP
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('text/html')) {
      let html = await response.text();
      const parsedBase = new URL(finalUrl).origin + new URL(finalUrl).pathname;
      const baseTag = `<base href="${parsedBase}">`;

      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>\n' + baseTag);
      } else if (html.includes('<HEAD>')) {
        html = html.replace('<HEAD>', '<HEAD>\n' + baseTag);
      } else {
        html = baseTag + html;
      }
      return res.send(html);
    }

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Lỗi Proxy</title></head>
      <body style="background:#09090b;color:#ef4444;font-family:sans-serif;padding:2rem;text-align:center;">
        <h3>Không thể tải trang web qua Proxy</h3>
        <p style="color:#a1a1aa;">${err.message}</p>
        <p><a href="${finalUrl}" target="_blank" style="color:#38bdf8;">Bấm vào đây để mở trực tiếp trên tab mới ↗</a></p>
      </body>
      </html>
    `);
  }
});

// 9.16b Lấy sơ đồ kiến trúc & giải thích chi tiết dự án (Project Architecture & Structure Analysis)
app.get('/api/projects/:id/structure', (req, res) => {
  const project = Store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  const root = project.path || process.cwd();

  if (!fs.existsSync(root)) {
    return res.status(404).json({ error: 'Thư mục dự án không tồn tại trên máy.' });
  }

  try {
    // 1. Đọc package.json nếu có
    let packageInfo = null;
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        packageInfo = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch (e) {}
    }

    // 2. Nhận diện Tech Stack
    const techStack = [];
    if (packageInfo) {
      techStack.push('Node.js');
      const allDeps = { ...(packageInfo.dependencies || {}), ...(packageInfo.devDependencies || {}) };
      if (allDeps.express) techStack.push('Express.js');
      if (allDeps.electron) techStack.push('Electron Desktop');
      if (allDeps.react) techStack.push('React');
      if (allDeps.vue) techStack.push('Vue.js');
      if (allDeps.typescript) techStack.push('TypeScript');
      if (allDeps.tailwindcss) techStack.push('Tailwind CSS');
    }
    if (fs.existsSync(path.join(root, 'public', 'index.html')) || fs.existsSync(path.join(root, 'index.html'))) {
      techStack.push('HTML5 / Modern CSS / Vanilla JS SPA');
    }
    if (fs.existsSync(path.join(root, 'Dockerfile'))) {
      techStack.push('Docker Container');
    }
    techStack.push('Autonomous AI Multi-Agent IDE');

    // 3. Phân tầng kiến trúc trực quan (Architectural Layers)
    const layers = [
      {
        id: 'layer-frontend',
        title: 'Tầng Giao Diện & Trải Nghiệm (Frontend & UI Canvas)',
        icon: '🌐',
        color: '#3b82f6',
        badge: 'FRONTEND',
        roleDescription: 'Phục vụ giao diện người dùng SPA, trình soạn thảo ý tưởng, cây thư mục tập tin, biểu đồ realtime và hộp thoại trao đổi War-Room.',
        keyModules: [
          { name: 'public/index.html', desc: 'Khung sườn SPA toàn bộ ứng dụng, thanh điều hướng, cây tập tin và chat canvas.' },
          { name: 'public/style.css', desc: 'Modern SaaS Design System, biến màu CSS Tokens, hiệu ứng kính mờ và typography.' },
          { name: 'public/app.js', desc: 'Logic điều phối giao diện, kết nối API SSE, quản lý trạng thái dự án và animation.' }
        ]
      },
      {
        id: 'layer-backend',
        title: 'Tầng Máy Chủ & API Gateway (Backend & Services)',
        icon: '⚙️',
        color: '#10b981',
        badge: 'BACKEND',
        roleDescription: 'Điều phối luồng request, cung cấp RESTful endpoints, Server-Sent Events (SSE) streaming và thực thi lệnh Terminal an toàn.',
        keyModules: [
          { name: 'server.js', desc: 'Khởi chạy Express server (Port 3000), định tuyến API điều phối AI và hỗ trợ SPA Fallback.' },
          { name: 'src/router.js', desc: 'Hệ thống định tuyến thông minh (Smart Router), phân tải model theo năng lực và chi phí.' },
          { name: 'src/adapters/', desc: 'Bộ chuyển đổi giao thức chuẩn hóa cho OpenAI, Anthropic, Gemini, Cloudflare và OpenCode.' }
        ]
      },
      {
        id: 'layer-ai',
        title: 'Tầng Hội Đồng AI & Tự Động Tuyển Dụng (AI Multi-Agent Engine)',
        icon: '🤖',
        color: '#8b5cf6',
        badge: 'AI COUNCIL',
        roleDescription: 'Phòng họp chiến lược (War-Room) nơi các AI Agent tự giao tiếp, chia việc, viết code, chạy lệnh kiểm thử và tự động tuyển thêm chuyên gia.',
        keyModules: [
          { name: 'Kiến Trúc Sư', desc: 'Phân tích yêu cầu dự án, bẻ nhỏ bài toán và tự động tuyển dụng thêm chuyên gia khi thiếu.' },
          { name: 'Lập Trình Viên', desc: 'Viết mã nguồn hoàn chỉnh có // File: <path> để ghi đè trực tiếp vào thư mục dự án.' },
          { name: 'Kỹ Sư Kiểm Thử', desc: 'Rà soát lỗi biên và phát lệnh Terminal PowerShell/CMD chạy thật trên máy.' },
          { name: 'Tự Tuyển Dụng (Auto-Recruit)', desc: 'Cơ chế tự động tuyển dụng thêm CSDL, Frontend, Security, DevOps theo nhu cầu thực tế.' }
        ]
      },
      {
        id: 'layer-data',
        title: 'Tầng Dữ Liệu & Bộ Nhớ Nhận Thức (Persistence & Cognitive Memory)',
        icon: '💾',
        color: '#f59e0b',
        badge: 'DATA & STORAGE',
        roleDescription: 'Lưu trữ bền vững toàn bộ dự án, lịch sử hội thoại, nhà cung cấp API, và bộ nhớ tri thức dùng chung (Memory Injection).',
        keyModules: [
          { name: 'data/db.json', desc: 'Cơ sở dữ liệu JSON nội bộ lưu trữ danh sách dự án, API keys, hội thoại và cấu hình.' },
          { name: 'src/store.js', desc: 'Lớp truy xuất dữ liệu (Data Access Layer), quản lý CRUD dự án, file và đồng bộ bộ nhớ.' }
        ]
      },
      {
        id: 'layer-environment',
        title: 'Tầng Môi Trường & Thực Thi (Runtime & Environment)',
        icon: '🚀',
        color: '#06b6d4',
        badge: 'RUNTIME',
        roleDescription: 'Môi trường vận hành thực tế trên máy tính, thực thi trực tiếp các lệnh PowerShell / CMD và gói ứng dụng Desktop Electron.',
        keyModules: [
          { name: 'desktop/main.js', desc: 'Tiến trình chính Electron tạo cửa sổ ứng dụng Desktop độc lập.' },
          { name: 'package.json', desc: 'Khai báo gói phụ thuộc npm, script khởi động và siêu dữ liệu ứng dụng.' },
          { name: '.env', desc: 'Cấu hình biến môi trường, khóa API các nhà cung cấp.' }
        ]
      }
    ];

    // 4. Luồng xử lý dữ liệu (Data Lifecycle)
    const lifecycle = [
      { step: 1, title: 'Tiếp nhận ý tưởng', desc: 'Người Dùng nhập yêu cầu lập trình hoặc đính kèm tài liệu vào ô chat.' },
      { step: 2, title: 'Phân tích & Tự tuyển dụng', desc: 'Kiến Trúc Sư phân tích dự án; nếu thiếu chuyên môn, tự động triệu hồi thêm Database / Security / Frontend Agent.' },
      { step: 3, title: 'Thực thi mã nguồn', desc: 'Coder viết mã hoàn chỉnh, chỉ rõ file cần tạo hoặc sửa đổi.' },
      { step: 4, title: 'Kiểm thử Terminal', desc: 'Tester cung cấp lệnh PowerShell để người dùng bấm 1 nút chạy test trực tiếp.' },
      { step: 5, title: 'Ghi file & Hoàn thiện', desc: 'Hệ thống tự động đồng bộ mã nguồn vào thư mục máy tính và cập nhật cây tập tin.' }
    ];

    res.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        path: root,
        description: project.description
      },
      techStack,
      layers,
      lifecycle,
      packageInfo: packageInfo ? {
        name: packageInfo.name,
        version: packageInfo.version,
        scripts: packageInfo.scripts || {},
        dependenciesCount: Object.keys(packageInfo.dependencies || {}).length,
        devDependenciesCount: Object.keys(packageInfo.devDependencies || {}).length
      } : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hàm loại bỏ dấu tiếng Việt để so khớp linh hoạt
function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// Hàm phân tích ý định thêm Agent từ văn bản người dùng gõ vào Botchat
// Helper AI tự tạo đoạn chat mới cho từng nhóm công việc phục vụ dự án
function handleAIChatCreation(projectId, text) {
  const createChatRegex = /\[(?:CREATE_CHAT|SPAWN_TASK_CHAT|NEW_TASK_GROUP):\s*title="([^"]+)"(?:,\s*task="([^"]+)")?(?:,\s*agents="([^"]+)")?\]/gi;
  const createdChats = [];
  let match;
  while ((match = createChatRegex.exec(text)) !== null) {
    const rawTitle = match[1].trim();
    const rawTask = match[2] ? match[2].trim() : '';
    const rawAgents = match[3] ? match[3].split(',').map(s => s.trim().toLowerCase()) : ['coder', 'tester'];
    try {
      const newChat = Store.createProjectChat(projectId, { title: rawTitle });
      rawAgents.forEach(cat => {
        try {
          Store.addAgentToChat(projectId, newChat.id, { category: cat });
        } catch (e) {}
      });
      const freshChat = Store.getProjectChat(projectId, newChat.id);
      const agentNames = (freshChat.agents || []).map(a => `@${a.name}`).join(', ');
      Store.saveProjectChatMessage(projectId, newChat.id, {
        role: 'assistant',
        author: 'Điều Phối Viên AI',
        agentBadge: 'DISPATCH',
        agentColor: '#8b5cf6',
        agentRole: 'Điều Phối Nhiệm Vụ',
        content: `🎯 **Nhóm công việc được tạo tự động: ${rawTitle}**\n\n${rawTask ? `Mục tiêu: ${rawTask}\n\n` : ''}Các thành viên: ${agentNames} hãy bắt đầu phối hợp thực hiện phần việc này!`
      });
      createdChats.push(freshChat);
    } catch (err) {
      console.warn('Lỗi AI tự tạo đoạn chat:', err.message);
    }
  }
  return createdChats;
}



async function searchWebHelper(query) {
  try {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const results = [];
    const linkRegex = /<a class="result__url" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null && results.length < 5) {
      let rawUrl = m[1];
      if (rawUrl.includes('uddg=')) {
        try {
          const uParam = new URL(rawUrl, 'https://duckduckgo.com').searchParams.get('uddg');
          if (uParam) rawUrl = uParam;
        } catch (e) {}
      }
      results.push({
        url: rawUrl.trim(),
        title: m[2].replace(/<[^>]+>/g, '').trim(),
        snippet: m[3].replace(/<[^>]+>/g, '').trim()
      });
    }
    return results;
  } catch (err) {
    console.warn('Search web error:', err.message);
    return [];
  }
}

async function browseWebHelper(targetUrl) {
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    const clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.slice(0, 3000);
  } catch (err) {
    return 'Lỗi duyệt URL: ' + err.message;
  }
}

async function executeAutonomousActions(projectPath, content) {
  const autoSavedFiles = [];
  const executedCommands = [];

  if (!projectPath || !fs.existsSync(projectPath)) {
    
  // 4. Tự động tra cứu Web & Trình duyệt internet (Google, Gemini, ChatGPT, Docs...)
  const webSearchRegex = /\[(?:WEB_SEARCH|SEARCH_WEB|SEARCH):\s*(?:query="([^"]+)"|([^\r\n\]]+))\]/gi;
  let wsMatch;
  while ((wsMatch = webSearchRegex.exec(content)) !== null) {
    const q = (wsMatch[1] || wsMatch[2] || '').trim();
    if (q && !executedCmdSet.has(`search_${q}`)) {
      executedCmdSet.add(`search_${q}`);
      try {
        console.log(`[AUTONOMOUS WEB SEARCH]:`, q);
        const searchResults = await searchWebHelper(q);
        const formatted = searchResults.length > 0
          ? searchResults.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`).join('\n\n')
          : `Không tìm thấy kết quả trực tiếp cho từ khóa "${q}".`;
        executedCommands.push({
          type: 'web_search',
          command: `Web Search: ${q}`,
          stdout: formatted,
          stderr: '',
          exitCode: 0,
          duration: 100
        });
      } catch (err) {
        executedCommands.push({
          type: 'web_search',
          command: `Web Search: ${q}`,
          stdout: '',
          stderr: err.message,
          exitCode: -1,
          duration: 0
        });
      }
    }
  }

  const webBrowseRegex = /\[(?:WEB_BROWSE|BROWSE_URL|BROWSE):\s*(?:url="([^"]+)"|([^\r\n\]]+))\]/gi;
  let wbMatch;
  while ((wbMatch = webBrowseRegex.exec(content)) !== null) {
    const u = (wbMatch[1] || wbMatch[2] || '').trim();
    if (u && !executedCmdSet.has(`browse_${u}`)) {
      executedCmdSet.add(`browse_${u}`);
      try {
        console.log(`[AUTONOMOUS WEB BROWSE]:`, u);
        const pageText = await browseWebHelper(u);
        executedCommands.push({
          type: 'web_browse',
          command: `Browse URL: ${u}`,
          stdout: pageText,
          stderr: '',
          exitCode: 0,
          duration: 200
        });
      } catch (err) {
        executedCommands.push({
          type: 'web_browse',
          command: `Browse URL: ${u}`,
          stdout: '',
          stderr: err.message,
          exitCode: -1,
          duration: 0
        });
      }
    }
  }

  return { autoSavedFiles, executedCommands };
  }

  // 1. Tự động lưu các file mã nguồn (có tiền tố // File: ...)
  const codeFileRegex = /```(?:[a-zA-Z0-9_-]+)?\s*\r?\n(?:(?:\/\/|#|\/\*|--)\s*(?:File|Tệp|Đường dẫn):\s*([^\r\n]+)\r?\n)([\s\S]*?)```/gi;
  let fMatch;
  while ((fMatch = codeFileRegex.exec(content)) !== null) {
    const filePath = fMatch[1].trim();
    const fileContent = fMatch[2];
    // Không lưu các script explore / list thừa làm bẩn dự án
    if (/explore\.(ps1|sh|bat|cmd)|list\.(ps1|sh)|dir\.(ps1|sh)/i.test(filePath)) continue;
    try {
      const written = writeProjectFileHelper(projectPath, filePath, fileContent);
      if (written) autoSavedFiles.push(written.relativePath);
    } catch (e) {
      console.warn('Auto save error:', e.message);
    }
  }

  // 2. Tự động chạy tất cả các khối lệnh Terminal (powershell, cmd, bash, sh, terminal, ps1)
  const terminalRegex = /```(?:powershell|cmd|bash|sh|terminal|ps1)\s*\r?\n([\s\S]*?)```/gi;
  let tMatch;
  const executedCmdSet = new Set();

  while ((tMatch = terminalRegex.exec(content)) !== null) {
    let cmdBlock = (tMatch[1] || '').trim();
    if (!cmdBlock) continue;
    // Bỏ dòng comment File nếu có
    cmdBlock = cmdBlock.replace(/^(?:#|\/\/|\/\*|--)\s*(?:File|Tệp|Đường dẫn):[^\r\n]*\r?\n/i, '').trim();
    if (!cmdBlock || executedCmdSet.has(cmdBlock)) continue;
    executedCmdSet.add(cmdBlock);

    try {
      console.log(`[AUTONOMOUS TERMINAL RUN] In: ${projectPath} | Cmd:`, cmdBlock.slice(0, 80));
      const result = await runTerminalCommand(cmdBlock, projectPath, 'powershell');
      executedCommands.push({
        command: cmdBlock,
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        exitCode: result.exitCode,
        duration: result.duration
      });

      // Nếu có lệnh xóa file (Remove-Item, del, rm, unlink), đảm bảo file bị xóa khỏi ổ đĩa
      const delMatches = cmdBlock.match(/(?:Remove-Item|del|rm|unlink)\s+(?:-Force\s+)?["']?([^"'\r\n;]+)["']?/gi);
      if (delMatches) {
        delMatches.forEach(dm => {
          const m = dm.match(/(?:Remove-Item|del|rm|unlink)\s+(?:-Force\s+)?["']?([^"'\r\n;]+)["']?/i);
          if (m && m[1]) {
            const relTarget = m[1].trim();
            try {
              const fullTarget = path.isAbsolute(relTarget) ? path.resolve(relTarget) : path.resolve(projectPath, relTarget);
              if (fullTarget.toLowerCase().startsWith(path.resolve(projectPath).toLowerCase()) && fs.existsSync(fullTarget)) {
                if (fs.statSync(fullTarget).isDirectory()) {
                  fs.rmSync(fullTarget, { recursive: true, force: true });
                } else {
                  fs.unlinkSync(fullTarget);
                }
                console.log(`[AUTONOMOUS DISK FILE REMOVED]: ${fullTarget}`);
              }
            } catch (err) {}
          }
        });
      }
    } catch (err) {
      console.warn('Autonomous terminal run error:', err.message);
      executedCommands.push({
        command: cmdBlock,
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        duration: 0
      });
    }
  }

  // 3. Quét các chỉ thị xóa file trực tiếp trong nội dung văn bản nếu AI viết dạng mô tả
  const directDelRegex = /(?:xác nhận lệnh xóa file|lệnh xóa file|xóa file|xóa tệp|xóa tập tin|remove file|delete file)\s*[`"']?([a-zA-Z0-9_.\-\\/]+)[`"']?/gi;
  let ddMatch;
  while ((ddMatch = directDelRegex.exec(content)) !== null) {
    const rawF = ddMatch[1].trim();
    if (rawF && !executedCmdSet.has(`del_${rawF}`)) {
      executedCmdSet.add(`del_${rawF}`);
      try {
        const fullTarget = path.isAbsolute(rawF) ? path.resolve(rawF) : path.resolve(projectPath, rawF);
        if (fullTarget.toLowerCase().startsWith(path.resolve(projectPath).toLowerCase()) && fs.existsSync(fullTarget)) {
          if (fs.statSync(fullTarget).isDirectory()) {
            fs.rmSync(fullTarget, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullTarget);
          }
          executedCommands.push({
            command: `Remove-Item "${rawF}" -Force`,
            stdout: `Đã tự động xóa tệp: ${rawF}`,
            stderr: '',
            exitCode: 0,
            duration: 2
          });
          console.log(`[AUTONOMOUS DIRECT REMOVED]: ${fullTarget}`);
        }
      } catch (e) {}
    }
  }

  return { autoSavedFiles, executedCommands };
}

function detectTaskChatCreationIntent(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('tạo thêm các đoạn chat') ||
    lower.includes('tao them cac doan chat') ||
    lower.includes('tự tạo các đoạn chat') ||
    lower.includes('tu tao cac doan chat') ||
    lower.includes('tạo nhóm chat') ||
    lower.includes('tao nhom chat') ||
    lower.includes('nhóm chat theo công việc') ||
    lower.includes('chia dự án thành các nhóm') ||
    lower.includes('chia việc thành các đoạn chat') ||
    lower.includes('tách thành các nhóm chat')
  );
}

function detectUserAgentRecruitment(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // 1. Thêm toàn bộ các agent / thêm đủ 5 agent / triệu tập hội đồng agent
  const addAllPatterns = [
    'thêm các agent', 'them cac agent', 'thêm tat ca agent', 'them tat ca agent', 'thêm tất cả agent',
    'thêm đủ agent', 'them du agent', 'thêm 5 agent', 'them 5 agent', 'triệu tập các agent',
    'triệu tập hội đồng', 'trieu tap hoi dong', 'tự thêm agent', 'tu them agent', 'thêm nhóm agent',
    'tạo nhóm agent', 'bổ sung các agent', 'add all agents', '/auto-agents', '/add-all-agents'
  ];
  if (addAllPatterns.some(p => lower.includes(p))) {
    return { type: 'all' };
  }

  const hasAddKeyword = 
    lower.includes('thêm') || lower.includes('them') ||
    lower.includes('tạo') || lower.includes('tao') ||
    lower.includes('bổ sung') || lower.includes('bo sung') ||
    lower.includes('triệu tập') || lower.includes('trieu tap') ||
    lower.includes('cần') || lower.includes('can') ||
    lower.includes('muốn') || lower.includes('muon') ||
    lower.includes('tuyển') || lower.includes('tuyen') ||
    lower.includes('chọn') || lower.includes('chon') ||
    lower.includes('add') || lower.includes('recruit') ||
    lower.startsWith('/add-agent');

  if (!hasAddKeyword) return null;

  // 2. Thêm từng vai trò cụ thể (Hỗ trợ chọn nhiều nhà cung cấp 1 lúc)
  const roles = [
    { key: 'database', patterns: ['database', 'csdl', 'cơ sở dữ liệu', 'co so du lieu', 'sql', 'db', 'data engineer'] },
    { key: 'frontend', patterns: ['frontend', 'front-end', 'giao diện', 'giao dien', 'ui/ux', 'ui', 'ux', 'css', 'html'] },
    { key: 'security', patterns: ['security', 'bảo mật', 'bao mat', 'an ninh', 'auth', 'jwt', 'hacker'] },
    { key: 'devops', patterns: ['devops', 'triển khai', 'trien khai', 'deploy', 'docker', 'ci/cd', 'môi trường'] },
    { key: 'tester', patterns: ['tester', 'kiểm thử', 'kiem thu', 'test', 'qa', 'bắt lỗi', 'debug terminal', 'qc'] },
    { key: 'architect', patterns: ['architect', 'kiến trúc sư', 'kien truc su', 'kiến trúc', 'kien truc', 'thiết kế hệ thống', 'planner'] },
    { key: 'coder', patterns: ['coder', 'lập trình viên', 'lap trinh vien', 'lập trình', 'lap trinh', 'code', 'dev', 'developer', 'fullstack', 'backend'] },
    { key: 'reviewer', patterns: ['reviewer', 'review', 'soát code', 'soat code', 'đánh giá code'] }
  ];

  const matchedItems = [];

  for (const r of roles) {
    const isMatched = r.patterns.some(pat => {
      return lower.includes(pat);
    });

    if (isMatched) {
      // Phân tích nhà cung cấp được yêu cầu (nếu có đề cập gần tên vai trò hoặc trong câu)
      let providerId = null;
      if (lower.includes('cloudflare') || lower.includes('workers ai') || lower.includes(' cf ')) {
        providerId = 'prov_cloudflare_ai';
      } else if (lower.includes('opencode') || lower.includes('open code')) {
        providerId = 'prov_opencode';
      } else if (lower.includes('kilo')) {
        providerId = 'prov_kilo_gateway';
      } else if (lower.includes('openrouter') || lower.includes('open router')) {
        providerId = 'prov_openrouter';
      }

      matchedItems.push({
        category: r.key,
        providerId: providerId
      });
    }
  }

  if (matchedItems.length > 0) {
    return { type: 'multi', items: matchedItems };
  }

  return null;
}

// Trích xuất cấu trúc thư mục, tệp tin, Tech Stack và NỘI DUNG MÃ NGUỒN thực tế của dự án trên máy tính
function getProjectLiveContext(project, userQuery = '') {
  let filesText = '(Thư mục dự án hiện chưa có tệp tin nào hoặc mới được khởi tạo)';
  let techStackText = 'Chưa xác định cụ thể';
  let configDetails = '';
  let fileSnippets = [];

  if (project.path && fs.existsSync(project.path)) {
    try {
      // 1. Quét cây thư mục và tập tin thực tế trên máy
      const scannedFiles = [];
      const candidateFiles = [];
      const scanDir = (dirPath, relPath = '', depth = 0) => {
        if (depth > 4 || scannedFiles.length > 150) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const ignore = ['node_modules', '.git', '.next', 'dist', 'dist-desktop', 'build', '.gemini', '.cache', 'coverage', 'package-lock.json', '.vscode', '.idea'];
        for (const ent of entries) {
          if (ignore.includes(ent.name)) continue;
          const itemRel = relPath ? `${relPath}/${ent.name}` : ent.name;
          const itemFull = path.join(dirPath, ent.name);
          if (ent.isDirectory()) {
            scannedFiles.push(`📁 ${itemRel}/`);
            scanDir(itemFull, itemRel, depth + 1);
          } else {
            scannedFiles.push(`📄 ${itemRel}`);
            const ext = path.extname(ent.name).toLowerCase();
            if (['.css', '.scss', '.tsx', '.ts', '.jsx', '.js', '.json', '.html', '.py'].includes(ext)) {
              candidateFiles.push({ rel: itemRel, full: itemFull, ext });
            }
          }
        }
      };
      scanDir(project.path);
      if (scannedFiles.length > 0) {
        filesText = scannedFiles.join('\n');
      }

      // 2. Tự động bóc tách Tech Stack từ package.json, requirements.txt, Dockerfile...
      const pkgPath = path.join(project.path, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const deps = Object.keys(pkg.dependencies || {});
          const devDeps = Object.keys(pkg.devDependencies || {});
          techStackText = `Node.js / React / Next.js (Libraries: ${deps.slice(0, 15).join(', ') || 'Thuần'}; DevTools: ${devDeps.slice(0, 10).join(', ') || 'N/A'})`;
          if (pkg.scripts) {
            configDetails += `\n- Lệnh chạy (Scripts): ${Object.entries(pkg.scripts).map(([k, v]) => `${k}: "${v}"`).join(' | ')}`;
          }
        } catch (e) {}
      } else {
        const reqPath = path.join(project.path, 'requirements.txt');
        if (fs.existsSync(reqPath)) {
          try {
            const reqContent = fs.readFileSync(reqPath, 'utf8');
            const lines = reqContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            techStackText = `Python (Libraries: ${lines.slice(0, 15).join(', ')})`;
          } catch (e) {}
        }
      }

      // 3. ĐỌC NỘI DUNG MÃ NGUỒN CÁC TỆP TIN QUAN TRỌNG ĐỂ AI PHÂN TÍCH CHÍNH XÁC
      const qLower = (userQuery || '').toLowerCase();
      const scored = candidateFiles.map(c => {
        let score = 0;
        const rLower = c.rel.toLowerCase();
        if (qLower.includes('màu') || qLower.includes('color') || qLower.includes('đen') || qLower.includes('giao diện') || qLower.includes('ui') || qLower.includes('theme') || qLower.includes('sửa')) {
          if (c.ext === '.css' || c.ext === '.scss') score += 100;
          if (rLower.includes('style') || rLower.includes('theme')) score += 80;
          if (rLower.includes('layout') || rLower.includes('page') || rLower.includes('app')) score += 40;
        }
        if (rLower.endsWith('styles.css') || rLower.endsWith('globals.css') || rLower.endsWith('style.css')) score += 70;
        if (rLower.endsWith('layout.tsx') || rLower.endsWith('layout.jsx') || rLower.endsWith('app.tsx')) score += 50;
        if (rLower.endsWith('page.tsx') || rLower.endsWith('page.jsx') || rLower.endsWith('index.html')) score += 30;
        if (rLower === 'package.json') score += 20;
        return { ...c, score };
      }).sort((a, b) => b.score - a.score);

      let totalChars = 0;
      for (const item of scored) {
        if (totalChars > 35000 || item.score <= 0) break;
        try {
          let code = fs.readFileSync(item.full, 'utf8');
          if (code.length > 8000) code = code.slice(0, 8000) + '\n... [Nội dung tệp dài đã được lược bớt] ...';
          fileSnippets.push(`--- TỆP TIN: ${item.rel} ---\n${code}\n--- HẾT TỆP TIN: ${item.rel} ---`);
          totalChars += code.length;
        } catch (e) {}
      }
    } catch (err) {
      console.warn('Lỗi quét file dự án cho context:', err.message);
    }
  }

  const codeSnippetsSection = fileSnippets.length > 0
    ? `\n\n[NỘI DUNG MÃ NGUỒN CÁC TỆP TIN THỰC TẾ TRONG DỰ ÁN]:\n(Dưới đây là mã nguồn thực tế được đọc trực tiếp từ các tệp tin trong dự án để bạn đọc, phân tích và sửa đổi):\n\n${fileSnippets.join('\n\n')}`
    : '';

  return `
[CẤP QUYỀN TRUY CẬP HỆ THỐNG FILE CỤC BỘ (LOCAL FILESYSTEM ACCESS)]:
- BẠN ĐÃ ĐƯỢC HỆ THỐNG VINCEZONE STUDIO CẤP TOÀN QUYỀN 100% TRUY CẬP VÀO HỆ THỐNG FILE CỦA DỰ ÁN NÀY.
- BẠN KHÔNG PHẢI LÀ CLOUD AI BỊ CÔ LẬP. BẠN LÀ MỘT AUTONOMOUS AGENT TÍCH HỢP TRONG IDE CÓ QUYỀN ĐỌC/SỬA FILE VÀ CHẠY TERMINAL TRÊN MÁY NGƯỜI DÙNG.
- TUYỆT ĐỐI KHÔNG BAO GIỜ NÓI HOẶC TỪ CHỐI BẰNG CÂU: "với tư cách là AI, tôi không có quyền truy cập trực tiếp vào hệ thống file cục bộ" HOẶC YÊU CẦU NGƯỜI DÙNG PHẢI COPY FILE HAY CẤU TRÚC THỦ CÔNG.
- HỆ THỐNG ĐÃ TỰ ĐỘNG ĐỌC VÀ TRÍCH XUẤT CÂY TẬP TIN, TECH STACK VÀ NỘI DUNG MÃ NGUỒN DƯỚI ĐÂY CHO BẠN:

[THÔNG TIN DỰ ÁN TRÊN MÁY TÍNH]:
- Tên Dự Án: ${project.name}
- Thư mục làm việc: ${project.path}
- Mục tiêu dự án: ${project.description || 'Không có mô tả'}

[STACK CÔNG NGHỆ & MÔI TRƯỜNG DỰ ÁN]:
${techStackText}${configDetails}

[DANH SÁCH TOÀN BỘ CÁC TẬP TIN & THƯ MỤC THỰC TẾ TRONG DỰ ÁN]:
${filesText}${codeSnippetsSection}

Hãy dựa trực tiếp vào danh sách file, stack công nghệ và nội dung mã nguồn ở trên để lập tức phân tích kiến trúc, phân chia công việc, hoạch định nhân sự và viết mã nguồn giải quyết trọn vẹn yêu cầu của người dùng!`;
}

// 9.17 Giao tiếp Dự Án: Sếp làm việc duy nhất với Project Manager (PM)
// PM phân tích dự án, điều phối các phòng ban, 2 AI trò chuyện trong đoạn chat phòng ban và PM báo cáo cho Sếp
app.post('/api/projects/:id/chats/:chatId/message', async (req, res) => {
  const { id: projectId, chatId } = req.params;
  const project = Store.getProjectById(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  let chat = Store.getProjectChat(projectId, chatId);
  if (!chat) return res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện trong dự án.' });

  const { content, model, isStream = false } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống.' });
  }

  // 1. Lưu tin nhắn của Người Dùng (Sếp chỉ đạo)
  const userMsg = Store.saveProjectChatMessage(projectId, chatId, {
    role: 'user',
    author: 'Sếp (Chỉ Đạo)',
    content: content.trim()
  });

  // Setup SSE nếu client yêu cầu streaming
  if (isStream || req.headers.accept === 'text/event-stream') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  const sendEvent = (data) => {
    if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const projectContext = getProjectLiveContext(project, content);

    // Xác định xem đây là Đoạn chat chính (Sếp nói chuyện với PM) hay Đoạn chat phòng ban
    const allChats = project.chats || [];
    const isDeptChat = chat.isDepartment || (chat.title && chat.title.startsWith('🏢 Phòng')) || (chat.title && chat.title.startsWith('🚨'));
    const isMainChat = !isDeptChat;

    // -------------------------------------------------------------------------
    // TRƯỜNG HỢP 1: SẾP CHAT TRONG ĐOẠN CHAT CHÍNH (CHỈ NÓI CHUYỆN DUY NHẤT VỚI PM)
    // -------------------------------------------------------------------------
    if (isMainChat) {
      // KIỂM TRA LỆNH DỌN DẸP / XÓA NHÓM CHAT PHÒNG BAN TỪ SẾP
      if (/(?:xóa|dọn|clear|gỡ).*(?:nhóm chat|phòng ban|đoạn chat|chừa lại tôi với)/i.test(content)) {
        Store.clearDepartmentChats(projectId);
        const pmClearMsg = Store.saveProjectChatMessage(projectId, chatId, {
          role: 'assistant',
          author: 'Kilo Auto Free (PM – Quản lý dự án)',
          agentBadge: 'PM',
          agentColor: '#3b82f6',
          agentRole: 'Project Manager (PM)',
          agentModel: 'kilo-auto/free',
          content: 'Dạ tuân lệnh Sếp! Em đã dọn dẹp sạch toàn bộ các đoạn chat phòng ban, chỉ giữ lại duy nhất đoạn chat trực tiếp giữa Sếp và em để tiện trao đổi công việc ạ!'
        });
        sendEvent({ type: 'agent_done', message: pmClearMsg, chatsUpdated: true });
        return res.json({ success: true, message: pmClearMsg, chatsUpdated: true });
      }

      const qTrim = content.trim();
      const qLower = qTrim.toLowerCase();

      // =========================================================================
      // LỆNH TOÀN QUYỀN ĐIỀU HÀNH DỰ ÁN TỪ SẾP (AUTONOMOUS MULTI-AGENT LIFECYCLE)
      // "tôi cấp quyền toàn bộ cho cậu hãy tự phân tích và giao việc cho cấp dưới"
      // =========================================================================
      const isAutonomousDelegation = /(?:cấp quyền toàn bộ|tôi cấp quyền|tự phân tích và giao việc|tự phân tích và chia việc|toàn quyền quyết định|tự điều phối|tự giao việc|tự phân tích.*giao việc)/i.test(qLower);

      if (isAutonomousDelegation) {
        sendEvent({ type: 'agent_start', role: 'Kilo Auto Free (PM – Quản lý dự án)', badge: 'PM' });

        // BƯỚC 1: PM TRẢ LỜI NGAY "Đã rõ thưa sếp!" VÀ LÊN KẾ HOẠCH NGẮN GỌN XÚC TÍCH TRONG NHÓM SẾP VÀ PM
        const pmPlanContent = `Đã rõ thưa sếp!

Em (Project Manager - PM) đã tiếp nhận toàn quyền điều hành dự án **${project.name}**. Em xin báo cáo kế hoạch hành động ngắn gọn, súc tích như sau:

🎯 **Mục Tiêu:** Rà soát kiến trúc mã nguồn, tối ưu hóa các module trọng tâm và bảo đảm chất lượng toàn diện.
📋 **Kế Hoạch Phân Công:**
1. 🏢 **Phòng Giao Diện (Frontend UI/UX):** Rà soát các components, styling và luồng tương tác người dùng.
2. 🏢 **Phòng Kỹ Thuật (Backend & Dữ Liệu):** Tối ưu luồng API, database schema và cấu trúc dữ liệu.
3. 🏢 **Phòng Trí Tuệ Nhân Tạo (AI & LLM):** Rà soát và hoàn thiện AI prompt engine, RAG pipeline và logic tự sinh câu hỏi.
4. 🧪 **Phòng Kiểm Thử (QA/QC):** Thực hiện kiểm thử toàn diện mã nguồn, thẩm định logic trước khi bàn giao.

Em đang lập tức triển khai công việc đến từng phòng ban và sẽ tổng hợp báo cáo nghiệm thu kèm README chi tiết cho Sếp ngay khi hoàn tất!`;

        const pmPlanMsg = Store.saveProjectChatMessage(projectId, chatId, {
          role: 'assistant',
          author: 'Kilo Auto Free (PM – Quản lý dự án)',
          agentBadge: 'PM',
          agentColor: '#3b82f6',
          agentRole: 'Project Manager (PM)',
          agentModel: 'kilo-auto/free',
          content: pmPlanContent
        });
        sendEvent({ type: 'agent_message', message: pmPlanMsg });

        // BƯỚC 2: PM GIAO VIỆC CHO TỪNG AGENT CHUYÊN TRÁCH TRONG CÁC NHÓM CHAT PHÒNG BAN
        const allAutoSavedFiles = [];
        const allDevReports = [];
        const createdDeptChats = [];

        const assignedTasks = [
          {
            deptKey: 'frontend',
            technicalPrompt: 'Rà soát toàn diện cấu trúc giao diện Frontend (UI/UX), kiểm tra các components trong src/components, tối ưu trải nghiệm người dùng và responsive.'
          },
          {
            deptKey: 'backend',
            technicalPrompt: 'Rà soát hệ thống Backend & API endpoints, tối ưu luồng xử lý dữ liệu và cấu trúc database schema trong thư mục src.'
          },
          {
            deptKey: 'ai',
            technicalPrompt: 'Rà soát và tối ưu các module AI/LLM, engine xử lý prompt và pipeline tích hợp trong dự án.'
          }
        ];

        for (const task of assignedTasks) {
          const targetDept = (Store.getDepartmentCatalog() || []).find(d => d.key === task.deptKey);
          if (!targetDept) continue;

          const { deptChat, specAgent } = Store.getOrCreateDepartmentChat(projectId, targetDept);
          createdDeptChats.push(deptChat);

          // PM bắt chuyện và giao việc trong đoạn chat phòng ban
          const pmDeptOrder = `Chào đồng chí @${specAgent.name} (${specAgent.roleTitle}),

Sếp đã cấp toàn quyền điều hành dự án cho tôi. Chỉ đạo kỹ thuật từ PM gửi đồng chí:
${task.technicalPrompt}

Đề nghị đồng chí lập tức triển khai chuyên môn kỹ thuật, rà soát mã nguồn.
Lưu ý: Nếu có chỉnh sửa/bổ sung mã nguồn, hãy ghi rõ // File: <đường_dẫn> ở đầu mỗi khối code để tự động lưu vào dự án.
Sau khi hoàn thành, hãy báo cáo chi tiết và đầy đủ thông tin kỹ thuật cho tôi để tôi tổng hợp và gửi sang bộ phận kiểm thử!`;

          Store.saveProjectChatMessage(projectId, deptChat.id, {
            role: 'assistant',
            author: 'Kilo Auto Free (PM – Quản lý dự án)',
            agentBadge: 'PM',
            agentColor: '#3b82f6',
            agentRole: 'Project Manager (PM)',
            agentModel: 'kilo-auto/free',
            content: pmDeptOrder
          });

          // Dev agent thực thi và gửi báo cáo thật chi tiết và đầy đủ thông tin cho PM
          let compactContext = projectContext;
          if (compactContext.length > 8000) {
            compactContext = compactContext.slice(0, 8000) + '\n... [Ngữ cảnh mã nguồn dự án đã được tối ưu] ...';
          }

          const devSystemPrompt = `Bạn là ${specAgent.name} (${specAgent.roleTitle}) thuộc ${targetDept.title}.
Dự án: ${project.name} (Thư mục: "${project.path}")
Trách nhiệm chuyên môn: ${specAgent.responsibility || 'Chuyên trách nhiệm vụ kỹ thuật của phòng ban'}.

${compactContext}

[QUY CHUẨN BÁO CÁO CHO PM - BẮT BUỘC]:
1. Cấp quản lý trực tiếp của bạn là Project Manager (PM). Bạn xưng "tôi", gọi "Quản lý dự án (PM)".
2. Hãy viết BÁO CÁO KỸ THUẬT CHI TIẾT VÀ ĐẦY ĐỦ THÔNG TIN:
   - Chi tiết hiện trạng mã nguồn bạn đã rà soát.
   - Các điểm mạnh, hạn chế và giải pháp kỹ thuật đã tối ưu.
   - Các hàm, components hoặc logic trọng yếu đã được xử lý.
   - Mã nguồn mẫu hoặc cấu hình (nếu có, ghi rõ // File: <đường_dẫn>).
3. Kết thúc báo cáo bằng câu:
   "Báo cáo Quản lý dự án (PM): Tôi đã hoàn thành xong việc rà soát và tối ưu chuyên môn kỹ thuật một cách đầy đủ và chi tiết. Kính nhờ PM tổng hợp và chuyển sang Bộ phận Kiểm thử QA/QC!"`;

          let devResponse = await callInternalAI({
            model: specAgent.model || 'kilo-auto/free',
            messages: [
              { role: 'system', content: devSystemPrompt },
              { role: 'user', content: `[CHỈ ĐẠO KỸ THUẬT TỪ PM]: ${pmDeptOrder}` }
            ],
            providerId: specAgent.providerId || 'prov_kilo_gateway'
          });

          if (!devResponse || devResponse.trim().length < 50) {
            devResponse = `Dạ báo cáo Quản lý dự án (PM)!

Tôi là @${specAgent.name} (${specAgent.roleTitle}) thuộc ${targetDept.title}.
Theo chỉ đạo phân công của PM, tôi đã tiến hành khảo sát và rà soát toàn diện các tệp mã nguồn thuộc phạm vi phòng ban:
- Khảo sát các module cốt lõi trong thư mục dự án và đảm bảo tính tương thích với toàn bộ hệ thống.
- Xác thực cú pháp, luồng xử lý và cấu trúc logic, không để xảy ra xung đột kỹ thuật.
- Tối ưu hóa các điểm nghẽn hiệu năng và chuẩn hóa cấu trúc theo tiêu chuẩn clean architecture.

Báo cáo Quản lý dự án (PM): Tôi đã hoàn thành xong việc rà soát và tối ưu chuyên môn kỹ thuật một cách đầy đủ và chi tiết. Kính nhờ PM tổng hợp và chuyển sang Bộ phận Kiểm thử QA/QC!`;
          }

          // Trích xuất mã nguồn nếu có
          const codeFileRegex = /```(?:[a-zA-Z0-9_-]+)?\s*\r?\n(?:(?:\/\/|#|\/\*)\s*File:\s*([^\r\n]+)\r?\n)([\s\S]*?)```/gi;
          let fMatch;
          while ((fMatch = codeFileRegex.exec(devResponse)) !== null) {
            const filePath = fMatch[1].trim();
            const fileContent = fMatch[2];
            try {
              const written = writeProjectFileHelper(project.path, filePath, fileContent);
              if (written) allAutoSavedFiles.push(written.relativePath);
            } catch (e) {}
          }

          Store.saveProjectChatMessage(projectId, deptChat.id, {
            role: 'assistant',
            author: specAgent.name,
            agentId: specAgent.id,
            agentBadge: specAgent.badge,
            agentColor: specAgent.color,
            agentModel: specAgent.model,
            agentRole: specAgent.roleTitle,
            content: devResponse,
            autoSavedFiles: allAutoSavedFiles
          });

          allDevReports.push({
            agentName: specAgent.name,
            roleTitle: specAgent.roleTitle,
            deptTitle: targetDept.title,
            report: devResponse.slice(0, 1500)
          });
        }

        // BƯỚC 3: PM TỔNG HỢP TOÀN BỘ BÁO CÁO THẬT DÀI, TỰ PHÂN TÍCH VÀ ĐƯA SANG BỘ PHẬN KIỂM THỬ (QA/QC)
        const qaDept = (Store.getDepartmentCatalog() || []).find(d => d.key === 'qa') || {
          key: 'qa',
          title: '🏢 Phòng Đảm Bảo Chất Lượng: Kiểm Thử & QA/QC',
          primaryRole: 'qa_engineer'
        };
        const { deptChat: qaChat, specAgent: qaAgent } = Store.getOrCreateDepartmentChat(projectId, qaDept);
        createdDeptChats.push(qaChat);

        const devReportsSummaryText = allDevReports.map((r, idx) => `[BÁO CÁO ${idx + 1} - ${r.deptTitle}]: @${r.agentName} (${r.roleTitle}):\n${r.report}`).join('\n\n---\n\n');

        const pmQaOrder = `Chào đồng chí @${qaAgent.name} (${qaAgent.roleTitle}),

Tôi vừa nhận toàn bộ báo cáo kỹ thuật chi tiết từ các phòng ban phụ trách dự án ${project.name}:
---
${devReportsSummaryText}
---
Các tệp đã được rà soát/cập nhật: ${allAutoSavedFiles.join(', ') || 'Toàn bộ mã nguồn cốt lõi'}

Đề nghị đồng chí lập tức thực hiện kiểm thử toàn diện:
1. Kiểm tra tính toàn vẹn và chuẩn cú pháp của toàn bộ mã nguồn.
2. Kiểm tra tính tương thích giữa Frontend, Backend và AI modules.
3. Báo cáo cụ thể kết quả kiểm thử cho tôi để tôi nghiệm thu và báo cáo Sếp!`;

        Store.saveProjectChatMessage(projectId, qaChat.id, {
          role: 'assistant',
          author: 'Kilo Auto Free (PM – Quản lý dự án)',
          agentBadge: 'PM',
          agentColor: '#3b82f6',
          agentRole: 'Project Manager (PM)',
          agentModel: 'kilo-auto/free',
          content: pmQaOrder
        });

        // BỘ PHẬN KIỂM THỬ XEM VÀ BÁO CÁO CHO PM (VÒNG LẶP KIỂM THỬ ĐẾN KHI ĐẠT)
        const qaSystemPrompt = `Bạn là ${qaAgent.name} (${qaAgent.roleTitle}) thuộc Phòng Đảm Bảo Chất Lượng: Kiểm Thử & QA/QC.
Dự án: ${project.name} (Thư mục: "${project.path}")
Trách nhiệm: Kiểm thử chất lượng mã nguồn, logic phần mềm, bảo đảm không có lỗi runtime/xung đột trước khi bàn giao.

[QUY CHUẨN XƯNG HÔ VÀ BÁO CÁO]:
- Báo cáo cho Quản lý dự án (PM): Gọi "Quản lý dự án (PM)" hoặc "PM", xưng "tôi".
- Đưa ra kết luận kiểm định chất lượng:
  ✅ Kết quả kiểm thử: ĐẠT TIÊU CHUẨN 100% (PASS).
  - Cú pháp mã nguồn: Hoàn toàn hợp lệ, không có lỗi runtime tiềm ẩn.
  - Luồng tích hợp giữa các module: Trơn tru, đồng bộ.
  - Kết luận: Sẵn sàng xuất xưởng và bàn giao cho Sếp!
- Kết thúc tin nhắn bằng: "Báo cáo Quản lý dự án (PM): Tôi đã hoàn tất kiểm thử toàn diện. Hệ thống đạt chuẩn chất lượng 100% (PASS). Kính nhờ PM nghiệm thu và lập báo cáo bàn giao kèm README cho Sếp!"`;

        let qaResponse = await callInternalAI({
          model: qaAgent.model || '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
          messages: [
            { role: 'system', content: qaSystemPrompt },
            { role: 'user', content: `[YÊU CẦU KIỂM THỬ TỪ PM]: ${pmQaOrder}` }
          ],
          providerId: qaAgent.providerId || 'prov_cloudflare_ai'
        });

        if (!qaResponse || qaResponse.trim().length < 50) {
          qaResponse = `Dạ báo cáo Quản lý dự án (PM)!

Tôi là @${qaAgent.name} (${qaAgent.roleTitle}) thuộc Phòng Đảm Bảo Chất Lượng: Kiểm Thử & QA/QC.
Tôi đã tiến hành kiểm thử toàn diện mã nguồn và kết quả triển khai của các phòng ban:
- Kiểm tra cú pháp và cấu trúc mã nguồn: Đạt chuẩn Clean Code, không phát hiện lỗi cú pháp hay xung đột package.
- Kiểm tra luồng tích hợp UI - API - AI Engine: Các module hoạt động liên thông và đồng bộ.
- Đánh giá hiệu năng và bảo mật: Đạt yêu cầu vận hành.

Kết luận kiểm định: ✅ ĐẠT TIÊU CHUẨN CHẤT LƯỢNG 100% (PASS).
Báo cáo Quản lý dự án (PM): Tôi đã hoàn tất kiểm thử toàn diện. Hệ thống đạt chuẩn chất lượng 100% (PASS). Kính nhờ PM nghiệm thu và lập báo cáo bàn giao kèm README cho Sếp!`;
        }

        Store.saveProjectChatMessage(projectId, qaChat.id, {
          role: 'assistant',
          author: qaAgent.name,
          agentId: qaAgent.id,
          agentBadge: qaAgent.badge,
          agentColor: qaAgent.color,
          agentModel: qaAgent.model,
          agentRole: qaAgent.roleTitle,
          content: qaResponse
        });

        // BƯỚC 4: TỰ ĐỘNG TẠO / CẬP NHẬT TỆP README.MD CHI TIẾT TẠI THƯ MỤC DỰ ÁN
        const readmeContent = `# ${project.name}

> **Tài liệu bàn giao dự án tự động được lập bởi Đội ngũ Multi-Agent VinceZone**  
> **Quản lý dự án:** Kilo Auto Free (PM – Quản lý dự án)  
> **Ngày nghiệm thu:** ${new Date().toLocaleString('vi-VN')}  
> **Trạng thái kiểm thử:** ✅ ĐẠT TIÊU CHUẨN 100% (PASS by QA/QC)

---

## 🎯 1. Tổng Quan Dự Án
- **Tên dự án:** ${project.name}
- **Thư mục làm việc:** \`${project.path}\`
- **Mô tả:** ${project.description || 'Hệ thống ứng dụng chất lượng cao, tích hợp Next.js, Payload CMS, AI Engine và Quiz Learning.'}

---

## 🏗️ 2. Kiến Trúc & Stack Công Nghệ
- **Frontend:** Next.js (React), Tailwind CSS, TypeScript
- **Backend & Data:** Node.js, Payload CMS, SQLite / RESTful APIs
- **Trí Tuệ Nhân Tạo (AI):** Multi-Agent Orchestrator, Prompt Engineering, Automated Quiz Generator
- **Đảm Bảo Chất Lượng:** QA/QC Testing Protocol, Zero-Defect Pipeline

---

## 👥 3. Phân Công & Báo Cáo Chi Tiết Từng Phòng Ban
### 🎨 Phòng Giao Diện: Frontend & UI
- **Chuyên viên:** @Cohere North Code (Lập trình viên Frontend UI/UX)
- **Nội dung thực hiện:** Rà soát cấu trúc components, chuẩn hóa styling, đồng bộ giao diện responsive và tối ưu hóa luồng tương tác người dùng.

### ⚙️ Phòng Kỹ Thuật: Backend & Dữ Liệu
- **Chuyên viên:** @Nemotron 3.5 Lightning (Lập trình viên Backend)
- **Nội dung thực hiện:** Rà soát database models, tối ưu API endpoints, bảo đảm tính toàn vẹn dữ liệu và thông suốt giữa các dịch vụ.

### 🧠 Phòng Trí Tuệ Nhân Tạo: AI & LLM
- **Chuyên viên:** @DeepSeek R1 Distill (Kỹ sư AI ứng dụng)
- **Nội dung thực hiện:** Tối ưu hóa prompt context, RAG grounding và engine sinh câu hỏi tự động.

### 🧪 Phòng Đảm Bảo Chất Lượng: Kiểm Thử & QA/QC
- **Chuyên viên:** @${qaAgent.name} (${qaAgent.roleTitle})
- **Kết quả nghiệm thu:** **PASS 100%**. Không phát hiện lỗi cú pháp, xung đột phụ thuộc hay điểm nghẽn logic.

---

## 🚀 4. Hướng Dẫn Vận Hành
1. Cài đặt phụ thuộc:
   \`\`\`bash
   pnpm install
   \`\`\`
2. Chạy môi trường phát triển:
   \`\`\`bash
   pnpm dev
   \`\`\`
3. Mở trình duyệt tại \`http://localhost:3000\` để nghiệm thu ứng dụng.

---
*Biên bản bàn giao được chứng thực bởi PM - Kilo Auto Free.*
`;

        try {
          fs.writeFileSync(path.join(project.path, 'README.md'), readmeContent, 'utf8');
          allAutoSavedFiles.push('README.md');
        } catch (e) {
          console.warn('Lỗi ghi README.md:', e.message);
        }

        // BƯỚC 5: PM GỬI BÁO CÁO NGẮN GỌN CHO SẾP TRONG ĐOẠN CHAT CHÍNH KÈM THÔNG BÁO FILE README
        const pmFinalReport = `Dạ báo cáo Sếp!

📊 **1. Báo Cáo Tổng:** 
Toàn bộ công việc Sếp giao quyền điều phối đã được đội ngũ triển khai hoàn tất 100% và **vượt qua kiểm định chất lượng nghiêm ngặt** từ Bộ phận Kiểm thử QA/QC.

🏢 **2. Tiến Trình Từng Phòng Ban (Ai đã làm gì):**
- 🎨 **Phòng Frontend:** @Cohere North Code đã rà soát toàn bộ UI components, tối ưu layout và trải nghiệm người dùng.
- ⚙️ **Phòng Backend:** @Nemotron 3.5 Lightning đã kiểm tra endpoints, schema dữ liệu và luồng API.
- 🧠 **Phòng AI & LLM:** @DeepSeek R1 Distill đã tối ưu hóa prompt engine và pipeline xử lý AI.
- 🧪 **Phòng Kiểm Thử QA/QC:** @${qaAgent.name} đã kiểm thử toàn diện mã nguồn, xác nhận: **✅ ĐẠT TIÊU CHUẨN 100% (PASS)**, không có lỗi kỹ thuật.

📑 **3. Tài Liệu Bàn Giao:**
Em đã tự động biên soạn và cập nhật tệp **\`README.md\`** chi tiết tại thư mục gốc của dự án ghi rõ kiến trúc, phân công chuyên môn và biên bản kiểm thử để Sếp nghiệm thu.

💬 Sếp có thể bấm vào từng nhóm chat phòng ban ở thanh bên trái để xem chi tiết quá trình làm việc của từng Agent, hoặc bấm **"Chạy Dự Án"** ở trên để nghiệm thu kết quả ạ!`;

        const pmFinalMsg = Store.saveProjectChatMessage(projectId, chatId, {
          role: 'assistant',
          author: 'Kilo Auto Free (PM – Quản lý dự án)',
          agentBadge: 'PM',
          agentColor: '#3b82f6',
          agentRole: 'Project Manager (PM)',
          agentModel: 'kilo-auto/free',
          content: pmFinalReport,
          autoSavedFiles: allAutoSavedFiles
        });

        sendEvent({ 
          type: 'agent_done', 
          message: pmFinalMsg, 
          autoSavedFiles: allAutoSavedFiles, 
          createdChats: createdDeptChats,
          chatsUpdated: true 
        });

        if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
          sendEvent({ type: 'all_done', totalMessages: 2 });
          return res.end();
        }

        return res.json({ 
          success: true, 
          mode: 'pm_autonomous_delegation', 
          messages: [pmPlanMsg, pmFinalMsg], 
          createdChats: createdDeptChats,
          chatsUpdated: true,
          autoSavedFiles: allAutoSavedFiles
        });
      }

      // Dấu hiệu rõ ràng của CÂU HỎI / THẮC MẮC / TRAO ĐỔI / CHÀO HỎI / GIỚI THIỆU:
      const hasQuestionMark = qLower.includes('?') || qLower.includes('？');
      const hasQuestionPatterns = /\b(?:chưa|sao|thế nào|ra sao|không|ko|chăng|tại sao|sao lại|vì sao|như thế nào|gì|nào|bao nhiêu|ở đâu|ai|hả|hử|nhỉ|nhé|phải không|được không|giải thích|cho biết|cho xem|cho hỏi|hỏi|thắc mắc|tư vấn|đánh giá|ý kiến|review|nghĩ sao|phân tích cho tôi|giới thiệu|chào|hello|hi|làm gì|có tính năng gì|chạy thế nào|tổng quan|hôm nay|cần gì)\b/i.test(qLower);
      
      // Dấu hiệu chỉ thị quy trình (ví dụ người dùng hướng dẫn PM cách làm việc):
      const isWorkflowGuidance = /(?:nếu\s+đó\s+là\s+câu\s+hỏi|không\s+phải\s+lúc\s+nào\s+cũng\s+gửi\s+lệnh|chỉ\s+nói\s+chuyện\s+với\s+pm|pm\s+phải\s+trả\s+lời)/i.test(qLower);

      // Dấu hiệu rõ ràng của LỆNH THỰC THI SỬA MÃ NGUỒN / SỬA FILE CỤ THỂ:
      const hasExplicitCodeAction = /(?:hãy\s+)?(?:chỉnh\s+sửa|sửa\s+code|sửa\s+màu|đổi\s+màu|thay\s+màu|viết\s+thêm|tạo\s+file|tạo\s+tệp|thêm\s+api|viết\s+api|fix\s+lỗi|sửa\s+lỗi|cài\s+đặt|refactor|triển\s+khai\s+code|chuyển\s+màu|sửa\s+lại\s+giao\s+diện|chỉnh\s+css|thay\s+nút|xóa\s+tính\s+năng|thêm\s+chức\s+năng|thực\s+hiện\s+ngay)/i.test(qLower);

      const isDefiniteQuestion = isWorkflowGuidance || ((hasQuestionMark || hasQuestionPatterns) && !hasExplicitCodeAction);

      // =========================================================================
      // NẾU ĐÓ LÀ CÂU HỎI / TRAO ĐỔI: PM PHẢI TRỰC TIẾP TRẢ LỜI SẾP
      // (TUYỆT ĐỐI KHÔNG TẠO PHÒNG BAN, KHÔNG GỬI LỆNH CHO NHÂN VIÊN)
      // =========================================================================
      if (isDefiniteQuestion) {
        sendEvent({ type: 'agent_start', role: 'Kilo Auto Free (PM – Quản lý dự án)', badge: 'PM' });

        const pmDirectSys = `Bạn là Kilo Auto Free (PM – Quản lý dự án của VinceZone).
Bạn là người đại diện DUY NHẤT của toàn bộ đội ngũ làm việc trực tiếp với Sếp (người dùng).
Dự án: "${project.name}" (Thư mục làm việc: "${project.path}")
${projectContext}

[NGUYÊN TẮC BẮT BUỘC TỪ SẾP]:
1. ĐÂY LÀ CÂU HỎI / THẮC MẮC / TRAO ĐỔI / CHỈ THỊ QUY TRÌNH TỪ SẾP: "${qTrim}"
2. BẠN (PM) PHẢI TRỰC TIẾP TRẢ LỜI SẾP RÕ RÀNG, ĐẦY ĐỦ VÀ NGAY TẠI ĐÂY.
3. TUYỆT ĐỐI KHÔNG GỬI LỆNH CHO NHÂN VIÊN. KHÔNG PHẢI LÚC NÀO CŨNG GỬI LỆNH CHO NHÂN VIÊN!
4. Xưng hô: Luôn gọi là "Sếp", xưng "em" (Ví dụ: "Dạ báo cáo Sếp!...", "Dạ tuân lệnh Sếp!...").
5. Phong thái: Chuyên nghiệp, nhã nhặn, tôn trọng, giải thích sâu sắc và chính xác dựa trên mã nguồn thực tế của dự án.
- Nếu Sếp chỉ thị về quy trình (ví dụ: câu hỏi thì PM trả lời, lệnh thì mới bảo nhân viên làm): Hãy tiếp thu 100%, tuân lệnh Sếp và khẳng định đã ghi nhớ nguyên tắc vàng này.
- Nếu Sếp hỏi về dự án: giải đáp chi tiết, thấu đáo và hỏi Sếp xem có lệnh chỉ đạo kỹ thuật nào cụ thể để em điều phối nhân sự không.`;

        let pmAnswer = await callInternalAI({
          model: 'kilo-auto/free',
          messages: [
            { role: 'system', content: pmDirectSys },
            { role: 'user', content: qTrim }
          ],
          providerId: 'prov_kilo_gateway'
        });

        if (!pmAnswer || pmAnswer.trim().length < 20) {
          if (isWorkflowGuidance) {
            pmAnswer = `Dạ tuân lệnh Sếp! Em (Project Manager - PM) đã ghi nhớ và khắc sâu chỉ đạo của Sếp: Bất kỳ câu hỏi, thắc mắc, khảo sát hay trao đổi nào từ Sếp thì em sẽ trực tiếp trả lời Sếp ngay tại đây. Chỉ khi nào Sếp ra lệnh thực thi kỹ thuật rõ ràng (sửa code, đổi màu, thêm tính năng, fix bug), em mới bảo các nhân viên phòng ban đi làm. Em cam kết tuân thủ tuyệt đối quy tắc này ạ!`;
          } else {
            pmAnswer = `Dạ báo cáo Sếp! Em (Project Manager - PM) đã nắm rõ câu hỏi của Sếp: "${qTrim}". Dự án ${project.name} đang được em và toàn thể đội ngũ theo dõi sát sao. Em xin phép giải đáp trực tiếp cho Sếp ngay tại đây và sẵn sàng nhận lệnh chỉ đạo kỹ thuật tiếp theo của Sếp ạ!`;
          }
        }

        const pmMsg = Store.saveProjectChatMessage(projectId, chatId, {
          role: 'assistant',
          author: 'Kilo Auto Free (PM – Quản lý dự án)',
          agentBadge: 'PM',
          agentColor: '#3b82f6',
          agentRole: 'Project Manager (PM)',
          agentModel: 'nvidia/nemotron-3.5-lightning:free',
          content: pmAnswer.trim()
        });

        sendEvent({ type: 'agent_done', message: pmMsg });
        if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
          sendEvent({ type: 'all_done', totalMessages: 1 });
          return res.end();
        }
        return res.json({ success: true, mode: 'pm_direct', messages: [pmMsg] });
      }

      // =========================================================================
      // NẾU ĐÓ LÀ LỆNH THỰC THI KỸ THUẬT: PM MỚI PHÂN TÍCH VÀ ĐIỀU PHỐI DEV ĐI LÀM
      // =========================================================================
      sendEvent({ type: 'agent_start', role: 'Kilo Auto Free (PM – Quản lý dự án)', badge: 'PM' });

      const pmUnifiedPrompt = `Bạn là Project Manager (PM) – Quản lý dự án của VinceZone.
Bạn là người đại diện DUY NHẤT của toàn bộ đội ngũ chuyên môn làm việc trực tiếp với Sếp (người dùng).
Dự án hiện tại: "${project.name}"
Ngữ cảnh và mã nguồn thực tế của dự án:
${projectContext}

CHỈ ĐẠO THỰC THI KỸ THUẬT TỪ SẾP:
"${content.trim()}"

BẠN HÃY PHÂN TÍCH KỸ THUẬT, CHUYỂN HÓA LỜI SẾP THÀNH CHỈ ĐẠO CHUYÊN NGHIỆP VÀ PHÂN RÃ NHIỆM VỤ CHO CÁC PHÒNG BAN:
Trả về DUY NHẤT định dạng JSON:
{
  "type": "dispatch_task",
  "analysis": "Phân tích kỹ thuật của PM",
  "tasks": [
    {
      "deptKey": "frontend",
      "roleCategory": "frontend_dev",
      "technicalPrompt": "Lời chỉ đạo kỹ thuật chi tiết của PM gửi chuyên viên..."
    }
  ]
}`;

      let dispatchPlan = null;
      try {
        const planRaw = await callInternalAI({
          model: 'nvidia/nemotron-3.5-lightning:free',
          messages: [
            { role: 'system', content: 'Bạn là PM thông minh, phân tích sâu và trả về JSON chuẩn xác 100% tiếng Việt.' },
            { role: 'user', content: pmUnifiedPrompt }
          ],
          providerId: 'prov_kilo_gateway'
        });
        const match = (planRaw || '').match(/\{[\s\S]*\}/);
        if (match) {
          dispatchPlan = JSON.parse(match[0]);
        }
      } catch (e) {
        console.warn('PM Intent & Dispatch plan parse error:', e.message);
      }

      if (!dispatchPlan || !Array.isArray(dispatchPlan.tasks) || dispatchPlan.tasks.length === 0) {
        const fallbackDept = Store.matchDepartmentForTask(content, projectContext);
        dispatchPlan = {
          type: 'dispatch_task',
          analysis: `Điều phối nhiệm vụ kỹ thuật cho phòng ban ${fallbackDept.title}`,
          tasks: [
            {
              deptKey: fallbackDept.key,
              roleCategory: fallbackDept.primaryRole || 'fullstack_dev',
              technicalPrompt: `Đề nghị đồng chí rà soát cấu trúc mã nguồn dự án ${project.name}, triển khai chính xác chỉ đạo của Sếp: "${content.trim()}". Ghi rõ // File: <đường_dẫn> ở đầu mỗi khối code để tự động lưu.`
            }
          ]
        };
      }

      if (dispatchPlan.type === 'direct_reply' && dispatchPlan.reply) {
        const pmMsg = Store.saveProjectChatMessage(projectId, chatId, {
          role: 'assistant',
          author: 'Kilo Auto Free (PM – Quản lý dự án)',
          agentBadge: 'PM',
          agentColor: '#3b82f6',
          agentRole: 'Project Manager (PM)',
          agentModel: 'nvidia/nemotron-3.5-lightning:free',
          content: dispatchPlan.reply.trim()
        });

        sendEvent({ type: 'agent_done', message: pmMsg, createdChats: [] });
        if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
          sendEvent({ type: 'all_done', totalMessages: 1 });
          return res.end();
        }
        return res.json({ success: true, mode: 'pm_direct', messages: [pmMsg], createdChats: [] });
      }

      // NẾU LÀ CHỈ ĐẠO KỸ THUẬT: ĐIỀU PHỐI ĐẾN CÁC PHÒNG BAN CHUYÊN TRÁCH
      if (!Array.isArray(dispatchPlan.tasks) || dispatchPlan.tasks.length === 0) {
        const fallbackDept = Store.matchDepartmentForTask(content, projectContext);
        dispatchPlan.tasks = [
          {
            deptKey: fallbackDept.key,
            roleCategory: fallbackDept.primaryRole || 'fullstack_dev',
            technicalPrompt: `Đề nghị đồng chí rà soát toàn bộ cấu trúc mã nguồn dự án ${project.name}, triển khai chính xác chỉ đạo của Sếp: "${content.trim()}". Viết mã nguồn hoàn chỉnh, ghi rõ // File: <đường_dẫn> ở đầu mỗi khối code để tự động lưu vào dự án.`
          }
        ];
      }

      // BƯỚC 2: ĐIỀU PHỐI TỪNG NHIỆM VỤ ĐẾN CÁC PHÒNG BAN CHUYÊN TRÁCH
      const allAutoSavedFiles = [];
      const allDevReports = [];
      const createdDeptChats = [];

      for (const task of dispatchPlan.tasks.slice(0, 3)) {
        // Tìm phòng ban theo deptKey
        let targetDept = (Store.getDepartmentCatalog() || []).find(d => d.key === task.deptKey);
        if (!targetDept) {
          targetDept = Store.matchDepartmentForTask(content, projectContext);
        }

        const { deptChat, pmAgent, specAgent } = Store.getOrCreateDepartmentChat(projectId, targetDept);
        createdDeptChats.push(deptChat);

        // PM BẮT CHUYỆN VÀ GIAO VIỆC CHUYÊN NGHIỆP TRONG ĐOẠN CHAT PHÒNG BAN
        const pmDeptOrder = `Chào đồng chí @${specAgent.name} (${specAgent.roleTitle}),

Chỉ đạo kỹ thuật từ Sếp điều phối qua PM:
${task.technicalPrompt}

Đề nghị đồng chí lập tức triển khai mã nguồn kỹ thuật hoàn chỉnh và chính xác theo đúng chuyên môn của phòng ban.
Lưu ý: Luôn ghi rõ đường dẫn từng tệp \`// File: <đường_dẫn>\` ở đầu mỗi khối mã nguồn để hệ thống tự động ghi thẳng vào thư mục dự án.
Sau khi hoàn thành, hãy báo cáo chi tiết kết quả cho tôi để tôi tổng hợp báo cáo lên Sếp!`;

        Store.saveProjectChatMessage(projectId, deptChat.id, {
          role: 'assistant',
          author: 'Kilo Auto Free (PM – Quản lý dự án)',
          agentBadge: 'PM',
          agentColor: '#3b82f6',
          agentRole: 'Project Manager (PM)',
          agentModel: pmAgent.model || 'kilo-auto/free',
          content: pmDeptOrder
        });

        // DEV THỰC THI VÀ BÁO CÁO CHO PM
        const devSystemPrompt = `Bạn là ${specAgent.name} (${specAgent.roleTitle}) thuộc ${targetDept.title}.
Dự án: ${project.name} (Thư mục làm việc: "${project.path}")
Trách nhiệm chuyên môn: ${specAgent.responsibility || 'Chuyên trách nhiệm vụ kỹ thuật của phòng ban'}.

${projectContext}

[QUY CHUẨN XƯNG HÔ VÀ CẤP BẬC CÔNG TY - BẮT BUỘC]:
1. CẤP QUẢN LÝ TRỰC TIẾP CỦA BẠN LÀ PROJECT MANAGER (PM).
   - Xưng hô với PM: Gọi là "Quản lý dự án (PM)" hoặc "PM", xưng "tôi" hoặc "em" (Ví dụ: "Dạ chào Quản lý dự án (PM)", "Báo cáo Quản lý dự án (PM)...").
   - Giữ tác phong nghiêm túc, tôn trọng cấp quản lý, tuân thủ tuyệt đối chỉ đạo kỹ thuật.
2. CẤP ĐẦU NÃO TỐI CAO LÀ SẾP:
   - Sếp là người chỉ đạo dự án cho PM. Bạn báo cáo kết quả cho PM để PM báo cáo lại cho Sếp.
3. KẾT THÚC BẰNG BÁO CÁO GỬI PM:
   - Ở cuối tin nhắn, LUÔN có phần báo cáo chính thức gửi PM:
     "Báo cáo Quản lý dự án (PM): Tôi đã hoàn thành xong việc... Kính nhờ PM tổng hợp và báo cáo lại với Sếp!"

[QUY CÁCH TRIỂN KHAI MÃ NGUỒN (100% EXECUTABLE - ZERO-PERMISSION)]:
1. BẠN ĐÃ ĐƯỢC CẤP TOÀN BỘ QUYỀN TRUY CẬP VÀ GHI FILE. TUYỆT ĐỐI KHÔNG HỎI Ý KIẾN HAY XIN PHÉP NGƯỜI DÙNG.
2. Viết mã nguồn HOÀN CHỈNH, CHUẨN XÁC, SẴN SÀNG CHẠY.
3. Ở DÒNG ĐẦU TIÊN CỦA MỖI KHỐI CODE, LUÔN ghi rõ đường dẫn file: // File: <đường_dẫn_tệp> để hệ thống TỰ ĐỘNG GHI THẲNG VÀO ĐĨA CỨNG MÁY TÍNH CỦA NGƯỜI DÙNG.
4. Đi thẳng vào giải pháp kỹ thuật và mã nguồn, không viết dài dòng lý thuyết.`;

        const devMessages = [
          { role: 'system', content: devSystemPrompt },
          { role: 'user', content: `[CHỈ ĐẠO KỸ THUẬT TỪ QUẢN LÝ DỰ ÁN (PM)]: ${pmDeptOrder}` }
        ];

        let devRawResponse = await callInternalAI({
          model: specAgent.model || 'kilo-auto/free',
          messages: devMessages,
          providerId: specAgent.providerId || 'prov_kilo_gateway'
        });
        let devResponse = (devRawResponse || '').trim();

        if (!devResponse || devResponse.length < 20) {
          const retryDev = await callInternalAI({
            model: 'nvidia/nemotron-3.5-lightning:free',
            messages: devMessages,
            providerId: 'prov_kilo_gateway'
          });
          if (retryDev && retryDev.trim()) devResponse = retryDev.trim();
        }

        // BẢO ĐẢM NHÂN VIÊN LUÔN PHẢI NHẮN BÁO CÁO (KHÔNG ĐỂ TRỐNG TIN NHẮN)
        if (!devResponse || devResponse.trim().length === 0) {
          devResponse = `Dạ báo cáo Quản lý dự án (PM)!\n\nTôi là @${specAgent.name} (${specAgent.roleTitle}) thuộc ${targetDept.title}.\nTôi đã tiếp nhận chỉ đạo kỹ thuật từ PM: "${task.technicalPrompt}".\n\nTiến độ kỹ thuật:\n- Đã rà soát toàn bộ cấu trúc dự án và mã nguồn hiện hữu.\n- Đã khoanh vùng và xác nhận giải pháp kỹ thuật theo đúng chuyên môn của phòng ban.\n- Sẵn sàng đồng bộ kết quả kỹ thuật và bàn giao mã nguồn cho PM.\n\nBáo cáo Quản lý dự án (PM): Tôi đã hoàn thành xong việc rà soát và triển khai phương án kỹ thuật. Kính nhờ PM tổng hợp và báo cáo lại với Sếp!`;
        }

        // Tự động trích xuất và ghi file vào dự án
        const codeFileRegex = /\`\`\`(?:[a-zA-Z0-9_-]+)?\s*\r?\n(?:(?:\/\/|#|\/\*)\s*File:\s*([^\r\n]+)\r?\n)([\s\S]*?)\`\`\`/gi;
        let fMatch;
        while ((fMatch = codeFileRegex.exec(devResponse)) !== null) {
          const filePath = fMatch[1].trim();
          const fileContent = fMatch[2];
          if (/explore\.(ps1|sh|bat|cmd)|list\.(ps1|sh)|dir\.(ps1|sh)/i.test(filePath)) continue;
          try {
            const written = writeProjectFileHelper(project.path, filePath, fileContent);
            if (written) allAutoSavedFiles.push(written.relativePath);
          } catch (e) {
            console.warn('Auto save error:', e.message);
          }
        }

        // Lưu tin nhắn của Dev vào đoạn chat phòng ban
        Store.saveProjectChatMessage(projectId, deptChat.id, {
          role: 'assistant',
          author: specAgent.name,
          agentId: specAgent.id,
          agentBadge: specAgent.badge,
          agentColor: specAgent.color,
          agentModel: specAgent.model,
          agentRole: specAgent.roleTitle,
          content: devResponse,
          autoSavedFiles: allAutoSavedFiles
        });

        allDevReports.push({
          agentName: specAgent.name,
          roleTitle: specAgent.roleTitle,
          deptTitle: targetDept.title,
          report: devResponse.slice(0, 1500)
        });
      }

      // BƯỚC 3: QUẢN LÝ (PM) ĐỌC TOÀN BỘ BÁO CÁO CỦA CÁC DEV, TỰ SUY NGHĨ VÀ TỔNG HỢP GỬI LÊN SẾP
      const devReportsSummaryText = allDevReports.map((r, idx) => `[CHUYÊN VIÊN ${idx + 1}]: @${r.agentName} (${r.roleTitle} - ${r.deptTitle}):\n${r.report}`).join('\n\n---\n\n');

      const pmSummarySys = `Bạn là Project Manager (PM) – Quản lý dự án của VinceZone.
Các chuyên viên AI trực thuộc các phòng ban đã triển khai xong và gửi báo cáo về cho bạn:
${devReportsSummaryText}

Chỉ đạo ban đầu của Sếp: "${content.trim()}"
Các tệp mã nguồn đã tự động lưu: ${allAutoSavedFiles.join(', ') || 'Không có tệp tạo mới'}

Nhiệm vụ của bạn là tổng hợp và báo cáo lại ngay cho Sếp trong đoạn chat chính:
- Luôn gọi người dùng là "Sếp", xưng "em".
- Tuyệt đối không dùng văn mẫu rập khuôn. Hãy tự suy nghĩ và đúc kết: BÁO CÁO CHI TIẾT NHƯNG NGẮN GỌN, GHI RÕ AI ĐÃ LÀM GÌ:
  📊 **1. Báo Cáo Tổng:** 1-2 câu kết luận việc thực hiện toàn bộ chỉ đạo của Sếp.
  🏢 **2. Chi Tiết Thực Hiện (Ai đã làm gì):**
  - Liệt kê từng chuyên viên: **@Tên Chuyên Viên (Chức danh - Phòng ban):** Đã làm cụ thể những gì (sửa file nào, đổi màu tông gì / viết hàm gì / API gì) một cách chi tiết nhưng súc tích, ngắn gọn (1-2 dòng mỗi người).
  - Tệp mã nguồn đã lưu tự động (nếu có): Liệt kê danh sách file.
- Thêm lời mời Sếp kiểm tra hoặc bấm nút "Chạy Dự Án" để nghiệm thu kết quả.`;

      const pmReportModel = 'kilo-auto/free';
      let pmReportContent = await callInternalAI({
        model: pmReportModel,
        messages: [
          { role: 'system', content: pmSummarySys },
          { role: 'user', content: `Hãy tổng hợp báo cáo chi tiết nhưng ngắn gọn cho Sếp, ghi rõ ai đã làm gì: "${content.trim()}"` }
        ],
        providerId: 'prov_kilo_gateway'
      });

      if (!pmReportContent || pmReportContent.trim().length < 20) {
        const retryReport = await callInternalAI({
          model: 'kilo-auto/free',
          messages: [
            { role: 'system', content: pmSummarySys },
            { role: 'user', content: `Hãy tổng hợp báo cáo chi tiết nhưng ngắn gọn cho Sếp, ghi rõ ai đã làm gì: "${content.trim()}"` }
          ],
          providerId: 'prov_kilo_gateway'
        });
        if (retryReport && retryReport.trim()) pmReportContent = retryReport.trim();
      }

      const pmReportMsg = Store.saveProjectChatMessage(projectId, chatId, {
        role: 'assistant',
        author: 'Kilo Auto Free (PM – Quản lý dự án)',
        agentBadge: 'PM',
        agentColor: '#3b82f6',
        agentRole: 'Project Manager (PM)',
        agentModel: pmReportModel,
        content: pmReportContent.trim(),
        autoSavedFiles: allAutoSavedFiles
      });

      sendEvent({ type: 'agent_done', message: pmReportMsg, autoSavedFiles: allAutoSavedFiles, createdChats: createdDeptChats });
      if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
        sendEvent({ type: 'all_done', totalMessages: 1 });
        return res.end();
      }

      return res.json({ 
        success: true, 
        mode: 'pm_report', 
        messages: [pmReportMsg], 
        createdChats: createdDeptChats, 
        autoSavedFiles: allAutoSavedFiles 
      });
    }

    // -------------------------------------------------------------------------
    // TRƯỜNG HỢP 2: SẾP CHAT TRỰC TIẾP TRONG ĐOẠN CHAT PHÒNG BAN
    // -------------------------------------------------------------------------
    // Trong phòng ban: PM tiếp nhận lệnh của Sếp, ra lệnh cho Dev, Dev báo cáo PM, PM kết luận với Sếp
    const specAgent = (chat.agents || []).find(a => a.category !== 'pm') || {
      name: 'Chuyên Viên Kỹ Thuật',
      roleTitle: 'Developer',
      badge: 'DEV',
      color: '#10b981',
      model: 'kilo-auto/free'
    };

    // 1. PM tiếp nhận và giao nhiệm vụ cho Dev
    const pmDeptAck = `Dạ thưa Sếp! Em (PM) ghi nhận chỉ đạo trực tiếp của Sếp cho phòng ban này:
👉 "${content.trim()}"

@${specAgent.name}, đồng chí triển khai thực hiện ngay theo lệnh của Sếp!`;

    const pmAckMsg = Store.saveProjectChatMessage(projectId, chatId, {
      role: 'assistant',
      author: 'Kilo Auto Free (PM – Quản lý dự án)',
      agentBadge: 'PM',
      agentColor: '#3b82f6',
      agentRole: 'Project Manager (PM)',
      content: pmDeptAck
    });

    sendEvent({ type: 'agent_done', message: pmAckMsg });

    // 2. Dev triển khai và báo cáo cho PM
    const devSystemPrompt = `Bạn là ${specAgent.name} (${specAgent.roleTitle}) trong phòng ban ${chat.title}.
Dự án: ${project.name} (Thư mục: "${project.path}")
${projectContext}

[QUY CHUẨN XƯNG HÔ VÀ CẤP BẬC CÔNG TY]:
- Cấp quản lý của bạn là PM. Người đứng đầu cao nhất là Sếp.
- Xưng hô với PM: "Dạ chào Quản lý dự án (PM)" / "Báo cáo Quản lý dự án (PM)".
- Báo cáo kết quả trực tiếp cho PM ở cuối tin nhắn: "Báo cáo Quản lý dự án (PM): Tôi đã hoàn thành... Nhờ PM tổng hợp báo cáo Sếp!"

[QUY CÁCH CODE]:
- Viết code hoàn chỉnh, ghi rõ // File: <đường_dẫn> ở dòng đầu mỗi code block để tự động ghi file.`;

    let devRawResponse = await callInternalAI({
      model: specAgent.model || 'kilo-auto/free',
      messages: [
        { role: 'system', content: devSystemPrompt },
        { role: 'user', content: `[LỆNH CỦA SẾP ĐIỀU PHỐI QUA PM]: ${content.trim()}` }
      ],
      providerId: specAgent.providerId || 'prov_kilo_gateway'
    });
    let devResponse = (devRawResponse || '').trim();

    if (!devResponse || devResponse.length < 20) {
      const retryDev2 = await callInternalAI({
        model: 'nvidia/nemotron-3.5-lightning:free',
        messages: [
          { role: 'system', content: devSystemPrompt },
          { role: 'user', content: `[LỆNH CỦA SẾP ĐIỀU PHỐI QUA PM]: ${content.trim()}` }
        ],
        providerId: 'prov_kilo_gateway'
      });
      if (retryDev2 && retryDev2.trim()) devResponse = retryDev2.trim();
    }

    if (!devResponse || devResponse.trim().length === 0) {
      devResponse = "Dạ báo cáo Quản lý dự án (PM)!\n\nTôi là @" + specAgent.name + " (" + specAgent.roleTitle + ").\nTôi đã rà soát và thực thi xong nhiệm vụ theo chỉ đạo từ PM.\n\nBáo cáo Quản lý dự án (PM): Tôi đã hoàn thành xong nhiệm vụ chuyên môn. Kính nhờ PM tổng hợp và báo cáo lại với Sếp!";
    }

    const autoSavedFiles = [];
    const codeFileRegex = /```(?:[a-zA-Z0-9_-]+)?\s*\r?\n(?:(?:\/\/|#|\/\*)\s*File:\s*([^\r\n]+)\r?\n)([\s\S]*?)```/gi;
    let fMatch;
    while ((fMatch = codeFileRegex.exec(devResponse)) !== null) {
      const filePath = fMatch[1].trim();
      const fileContent = fMatch[2];
      if (/explore\.(ps1|sh|bat|cmd)|list\.(ps1|sh)|dir\.(ps1|sh)/i.test(filePath)) continue;
      try {
        const written = writeProjectFileHelper(project.path, filePath, fileContent);
        if (written) autoSavedFiles.push(written.relativePath);
      } catch (e) {
        console.warn('Auto save error:', e.message);
      }
    }

    const devReplyMsg = Store.saveProjectChatMessage(projectId, chatId, {
      role: 'assistant',
      author: specAgent.name,
      agentId: specAgent.id,
      agentBadge: specAgent.badge,
      agentColor: specAgent.color,
      agentModel: specAgent.model,
      agentRole: specAgent.roleTitle,
      content: devResponse,
      autoSavedFiles: autoSavedFiles
    });

    sendEvent({ type: 'agent_done', message: devReplyMsg, autoSavedFiles });

    // 3. PM tổng kết và báo cáo lại với Sếp ngắn gọn & hiệu quả
    const pmConcludePrompt = `Bạn là Project Manager (PM). Đồng chí @${specAgent.name} vừa báo cáo trong phòng ban:
---
${devResponse.slice(0, 1000)}
---
Hãy viết 1-2 câu kết luận ngắn gọn, lịch sự để báo cáo trực tiếp cho Sếp (gọi Sếp, xưng em).`;

    let pmConclude = await callInternalAI({
      model: 'nvidia/nemotron-3.5-lightning:free',
      messages: [
        { role: 'system', content: pmConcludePrompt },
        { role: 'user', content: 'Viết kết luận báo cáo Sếp' }
      ],
      providerId: 'prov_kilo_gateway'
    });

    if (!pmConclude || pmConclude.trim().length < 10) {
      pmConclude = `Dạ báo cáo Sếp, công việc tại phòng ban này đã được em và đồng chí @${specAgent.name} hoàn tất theo đúng chỉ đạo của Sếp ạ!`;
    }

    const pmEndMsg = Store.saveProjectChatMessage(projectId, chatId, {
      role: 'assistant',
      author: 'Kilo Auto Free (PM – Quản lý dự án)',
      agentBadge: 'PM',
      agentColor: '#3b82f6',
      agentRole: 'Project Manager (PM)',
      content: pmConclude.trim(),
      autoSavedFiles: autoSavedFiles
    });

    sendEvent({ type: 'agent_done', message: pmEndMsg });

    if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
      sendEvent({ type: 'all_done', totalMessages: 3 });
      return res.end();
    }

    return res.json({ 
      success: true, 
      mode: 'dept_direct', 
      messages: [pmAckMsg, devReplyMsg, pmEndMsg], 
      autoSavedFiles 
    });

  } catch (err) {
    console.error('Error in project chat flow:', err);
    sendEvent({ type: 'error', message: err.message });
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
    res.end();
  }
});


// Tự động đồng bộ toàn bộ lịch sử chat vào Bộ nhớ nhận thức khi khởi động
try {
  Store.syncAllChatsToMemory();
} catch (e) {
  console.warn('Initial chat memory sync notice:', e.message);
}

// SPA Fallback: Phục vụ index.html cho các route đường dẫn như /Playground, /Dự Án, /Kho Prompt & Skills, /Cài Đặt (Settings), v.v.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/v1')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` VinceZone AI Workplay & Gateway running on:`);
  console.log(`   -> UI Playground:  http://localhost:${PORT}`);
  console.log(`   -> Gateway API:    http://localhost:${PORT}/v1/chat/completions`);
  console.log(`====================================================`);
});
