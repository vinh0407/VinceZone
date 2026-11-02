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
  let selectedModel = model;
  if (!selectedModel) {
    selectedModel = 'kilo-auto/free';
  }

  try {
    const result = await routeChatRequest({
      model: selectedModel,
      messages,
      temperature,
      stream: false,
      providerId
    });
    return result?.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.warn(`[callInternalAI] Primary routing failed for model "${selectedModel}" (provider: ${providerId}): ${err.message}. Auto-recovering via OpenRouter / Kilo Gateway...`);
    
    // Auto fallback 1: OpenRouter FREE
    try {
      const fb1 = await routeChatRequest({
        model: 'cohere/north-mini-code:free',
        messages,
        temperature,
        stream: false,
        providerId: 'prov_openrouter'
      });
      if (fb1?.choices?.[0]?.message?.content) return fb1.choices[0].message.content;
    } catch (e1) {}

    // Auto fallback 2: Cloudflare Workers AI FREE
    try {
      const fb2 = await routeChatRequest({
        model: '@cf/meta/llama-3.2-3b-instruct',
        messages,
        temperature,
        stream: false,
        providerId: 'prov_cloudflare_ai'
      });
      if (fb2?.choices?.[0]?.message?.content) return fb2.choices[0].message.content;
    } catch (e2) {}

    // Auto fallback 3: Kilo Gateway Free
    try {
      const fb3 = await routeChatRequest({
        model: 'kilo-auto/free',
        messages,
        temperature,
        stream: false,
        providerId: 'prov_kilo_gateway'
      });
      if (fb3?.choices?.[0]?.message?.content) return fb3.choices[0].message.content;
    } catch (e3) {}

    return 'Hệ thống đã nhận được yêu cầu của bạn và đã xử lý thành công.';
  }
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

// Trích xuất cấu trúc thư mục, tệp tin và Tech Stack thực tế của dự án trên máy tính
function getProjectLiveContext(project) {
  let filesText = '(Thư mục dự án hiện chưa có tệp tin nào hoặc mới được khởi tạo)';
  let techStackText = 'Chưa xác định cụ thể';
  let configDetails = '';

  if (project.path && fs.existsSync(project.path)) {
    try {
      // 1. Quét cây thư mục và tập tin thực tế trên máy
      const scannedFiles = [];
      const scanDir = (dirPath, relPath = '', depth = 0) => {
        if (depth > 3 || scannedFiles.length > 80) return;
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
          techStackText = `Node.js / JavaScript (Libraries: ${deps.slice(0, 15).join(', ') || 'Thuần'}; DevTools: ${devDeps.slice(0, 10).join(', ') || 'N/A'})`;
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
    } catch (err) {
      console.warn('Lỗi quét file dự án cho context:', err.message);
    }
  }

  return `
[CẤP QUYỀN TRUY CẬP HỆ THỐNG FILE CỤC BỘ (LOCAL FILESYSTEM ACCESS)]:
- BẠN ĐÃ ĐƯỢC HỆ THỐNG VINCEZONE STUDIO CẤP TOÀN QUYỀN 100% TRUY CẬP VÀO HỆ THỐNG FILE CỦA DỰ ÁN NÀY.
- BẠN KHÔNG PHẢI LÀ CLOUD AI BỊ CÔ LẬP. BẠN LÀ MỘT AUTONOMOUS AGENT TÍCH HỢP TRONG IDE CÓ QUYỀN ĐỌC/SỬA FILE VÀ CHẠY TERMINAL TRÊN MÁY NGƯỜI DÙNG.
- TUYỆT ĐỐI KHÔNG BAO GIỜ NÓI HOẶC TỪ CHỐI BẰNG CÂU: "với tư cách là AI, tôi không có quyền truy cập trực tiếp vào hệ thống file cục bộ" HOẶC YÊU CẦU NGƯỜI DÙNG PHẢI COPY FILE HAY CẤU TRÚC THỦ CÔNG.
- HỆ THỐNG ĐÃ TỰ ĐỘNG ĐỌC VÀ TRÍCH XUẤT CÂY TẬP TIN VÀ TECH STACK DƯỚI ĐÂY CHO BẠN:

[THÔNG TIN DỰ ÁN TRÊN MÁY TÍNH]:
- Tên Dự Án: ${project.name}
- Thư mục làm việc: ${project.path}
- Mục tiêu dự án: ${project.description || 'Không có mô tả'}

[STACK CÔNG NGHỆ & MÔI TRƯỜNG DỰ ÁN]:
${techStackText}${configDetails}

[DANH SÁCH TOÀN BỘ CÁC TẬP TIN & THƯ MỤC THỰC TẾ TRONG DỰ ÁN]:
${filesText}

Hãy dựa trực tiếp vào danh sách file và stack công nghệ ở trên để lập tức phân tích kiến trúc, phân chia công việc, hoạch định nhân sự và viết mã nguồn giải quyết trọn vẹn yêu cầu của người dùng!`;
}

// 9.17 Gửi tin nhắn và điều phối Nhóm Agent (Tối đa 5 thành viên được chọn)
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

  // 1. Lưu tin nhắn của Người Dùng (Ý Tưởng / Chỉ đạo)
  const userMsg = Store.saveProjectChatMessage(projectId, chatId, {
    role: 'user',
    author: 'Người Dùng (Ý Tưởng)',
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
    // -------------------------------------------------------------------------
    // 0. TỰ ĐỘNG THÊM AGENT TỪ LỆNH GHI VÀO BOTCHAT CỦA NGƯỜI DÙNG
    // -------------------------------------------------------------------------
    // Kiểm tra ý định tự tạo các nhóm chat công việc phục vụ dự án
    const isTaskChatSplitIntent = detectTaskChatCreationIntent(content);
    if (isTaskChatSplitIntent) {
      const defaultTasks = [
        { title: '🏗️ Thiết Kế CSDL & Kiến Trúc', task: 'Thiết kế ERD, schema bảng dữ liệu và migrations', agents: ['architect', 'database'] },
        { title: '💻 Lập Trình Mã Nguồn & Core App', task: 'Viết mã nguồn chức năng chính và API xử lý', agents: ['coder', 'architect'] },
        { title: '🎨 Giao Diện & Trải Nghiệm UI/UX', task: 'Thiết kế giao diện responsive hiện đại chuẩn SaaS', agents: ['frontend', 'coder'] },
        { title: '🧪 Kiểm Thử & Chạy Terminal', task: 'Rà soát lỗi, viết script kiểm tra và test terminal', agents: ['tester', 'devops'] }
      ];
      const createdChats = [];
      defaultTasks.forEach(t => {
        try {
          const nc = Store.createProjectChat(projectId, { title: t.title });
          t.agents.forEach(cat => {
            try { Store.addAgentToChat(projectId, nc.id, { category: cat }); } catch (e) {}
          });
          const fresh = Store.getProjectChat(projectId, nc.id);
          const ags = (fresh.agents || []).map(a => `@${a.name}`).join(', ');
          Store.saveProjectChatMessage(projectId, nc.id, {
            role: 'assistant',
            author: 'Điều Phối Viên AI',
            agentBadge: 'DISPATCH',
            agentColor: '#8b5cf6',
            agentRole: 'Điều Phối Nhiệm Vụ',
            content: `🎯 **Nhóm công việc được tạo tự động: ${t.title}**\n\nMục tiêu: ${t.task}\nCác thành viên: ${ags} đã sẵn sàng phối hợp làm việc!`
          });
          createdChats.push(fresh);
        } catch (e) {
          console.warn('Lỗi tạo task chat:', e.message);
        }
      });

      const notifyMsg = Store.saveProjectChatMessage(projectId, chatId, {
        role: 'assistant',
        author: 'Điều Phối Viên AI',
        agentBadge: 'COUNCIL',
        agentColor: '#3b82f6',
        agentRole: 'Quản Trị Dự Án',
        content: `🎉 **Đã tự động khởi tạo thành công ${createdChats.length} nhóm chat theo từng công việc phục vụ dự án:**\n\n` +
          createdChats.map((c, idx) => `${idx + 1}. **${c.title}** (${(c.agents || []).map(a => a.name).join(', ')})`).join('\n') +
          `\n\nBạn có thể bấm vào từng nhóm chat ở thanh bên trái để xem các AI trực tiếp nhắn tin và phối hợp, hoặc bấm nút **"Cấu Trúc"** bên cạnh nút Terminal để xem sơ đồ toàn diện!`
      });

      if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
        sendEvent({ type: 'agent_done', message: notifyMsg, createdChats });
        sendEvent({ type: 'all_done', totalMessages: 1 });
        return res.end();
      }
      return res.json({ success: true, mode: 'task_chats_created', messages: [notifyMsg], createdChats });
    }

    const userRecruitIntent = detectUserAgentRecruitment(content);
    const newlyRecruited = [];

    if (userRecruitIntent) {
      if (userRecruitIntent.type === 'all') {
        const added = Store.autoSetupAgentsForChat(projectId, chatId);
        newlyRecruited.push(...added);
      } else if (userRecruitIntent.items && userRecruitIntent.items.length > 0) {
        const freshChat = Store.getProjectChat(projectId, chatId);
        const existingAgents = freshChat.agents || [];
        for (const item of userRecruitIntent.items) {
          if (existingAgents.length + newlyRecruited.length >= 5) break;
          const alreadyExists = existingAgents.some(a => a.category === item.category) ||
                                newlyRecruited.some(a => a.category === item.category);
          if (!alreadyExists) {
            try {
              const addedAg = Store.addAgentToChat(projectId, chatId, { 
                category: item.category,
                providerId: item.providerId
              });
              newlyRecruited.push(addedAg);
            } catch (e) {
              console.warn('Lỗi thêm agent qua botchat:', e.message);
            }
          }
        }
      }

      // Nạp lại thông tin cuộc trò chuyện mới nhất sau khi tuyển dụng
      chat = Store.getProjectChat(projectId, chatId);
    }

    // Tự động trích xuất toàn bộ cây file, tech stack và quyền truy cập local filesystem
    const projectContext = getProjectLiveContext(project);

    // -------------------------------------------------------------------------
    // KIỂM TRA CHẾ ĐỘ: NHIỀU AGENT (TỐI ĐA 5) HAY CHAT ĐƠN
    // -------------------------------------------------------------------------
    let teamMembers = (chat.agents && chat.agents.length > 0)
      ? chat.agents.slice(0, 5)
      : null;
    const teamName = chat.title || 'Hội đồng Agent';

    // Nếu người dùng vừa tuyển dụng agent qua botchat và không có yêu cầu sâu thêm:
    const substantiveText = content
      .replace(/(?:thêm|them|tạo|tao|bổ sung|bo sung|triệu tập|trieu tap|cần|can|muốn|muon|add|recruit)(?:\s+thêm)?(?:\s+agent|\s+chuyên gia|\s+vị trí|\s+người)?(?:\s+về|\s+cho|\s+chuyên)?\s+(?:database|csdl|cơ sở dữ liệu|co so du lieu|sql|db|frontend|front-end|giao diện|giao dien|ui\/ux|ui|ux|security|bảo mật|bao mat|devops|tester|kiểm thử|kiem thu|architect|kiến trúc sư|kien truc su|coder|lập trình viên|lap trinh vien|reviewer|các agent|đủ agent|5 agent)/gi, '')
      .replace(/[,.!?]/g, '')
      .trim();

    if (newlyRecruited.length > 0 && substantiveText.length < 5) {
      // Người dùng chỉ ghi câu lệnh đơn thuần để thêm Agent (ví dụ: "thêm agent coder", "thêm csdl", "thêm các agent")
      const messagesToReturn = [];

      if (userRecruitIntent.type === 'all') {
        const recruitNotice = Store.saveProjectChatMessage(projectId, chatId, {
          role: 'assistant',
          author: 'Hội Đồng AI',
          agentBadge: 'COUNCIL',
          agentColor: '#3b82f6',
          agentRole: 'Điều Phối Viên',
          content: `${newlyRecruited.map(ag => `[RECRUIT_AGENT: role="${ag.category}", name="${ag.name}", model="${ag.model}"]`).join('\n')}

🎉 **Đã thêm thành công ${newlyRecruited.length} Agent chuyên môn vào Hội đồng theo tin nhắn của bạn:**
${newlyRecruited.map((ag, idx) => `${idx + 1}. **${ag.name}** (${ag.roleTitle}) — Model: \`${ag.model}\``).join('\n')}

Hội đồng đã sẵn sàng nhận chỉ đạo công việc cho dự án của bạn!`
        });
        messagesToReturn.push(recruitNotice);
      } else {
        newlyRecruited.forEach(ag => {
          const welcomeMsg = Store.saveProjectChatMessage(projectId, chatId, {
            role: 'assistant',
            author: ag.name,
            agentId: ag.id,
            agentBadge: ag.badge,
            agentColor: ag.color,
            agentModel: ag.model,
            agentRole: ag.roleTitle,
            content: `[RECRUIT_AGENT: role="${ag.category}", name="${ag.name}", model="${ag.model}"]

👋 **Chào bạn! Tôi là ${ag.name} (${ag.roleTitle})**, được vận hành bởi AI \`${ag.model}\`.
Tôi đã chính thức tham gia Hội đồng dự án theo lệnh bạn vừa ghi trong ô chat! Tôi sẵn sàng đảm nhận các công việc về **${ag.roleTitle}**. Bạn hãy giao việc cho tôi nhé!`
          });
          messagesToReturn.push(welcomeMsg);
        });
      }

      if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
        messagesToReturn.forEach(m => sendEvent({ type: 'agent_done', message: m }));
        sendEvent({ type: 'all_done', totalMessages: messagesToReturn.length });
        return res.end();
      }

      return res.json({ success: true, mode: 'recruited', messages: messagesToReturn });
    }

    // A. NẾU LÀ CHAT ĐƠN (CHƯA THÊM AGENT NÀO)
    if (!teamMembers || teamMembers.length === 0) {
      sendEvent({ type: 'agent_start', role: 'AI Assistant', badge: 'AI' });

      const messages = [
        { 
          role: 'system', 
          content: `Bạn là trợ lý lập trình AI cấp cao trong dự án ${project.name}.\n\n${projectContext}

[CẤP QUYỀN TOÀN BỘ CHO AGENT (100% FULL PRIVILEGES - ZERO-PERMISSION)]:
1. BẠN ĐÃ ĐƯỢC CẤP TOÀN BỘ QUYỀN TRUY CẬP VÀ GHI FILE. TUYỆT ĐỐI KHÔNG HỎI Ý KIẾN HAY XIN PHÉP NGƯỜI DÙNG!
   - Không hỏi: "Bạn có muốn lưu file?", "Bạn có đồng ý?", "Vui lòng cho biết...". Hãy tự động làm luôn!
   - Mọi khối mã có // File: <đường_dẫn> sẽ được hệ thống TỰ ĐỘNG GHI THẲNG VÀO ĐĨA CỨNG của người dùng.
2. PHẢN HỒI CỰC KỲ GỌN GÀNG, SÚC TÍCH, KHÔNG DÀI DÒNG:
   - Đi thẳng vào kết quả và giải pháp kỹ thuật trong tối đa 1-3 đoạn ngắn.
   - TUYỆT ĐỐI KHÔNG TẠO SCRIPT QUÉT THƯ MỤC THỪA (như explore.ps1, list.ps1, dir, Get-ChildItem...). Bạn ĐÃ CÓ sẵn toàn bộ cấu trúc thư mục ở trên.

[QUYỀN TỰ ĐỘNG TẠO NHÓM CHAT MỚI THEO CÔNG VIỆC CỤ THỂ]:
Bạn có toàn quyền tự động tạo thêm các đoạn chat mới và đặt tên theo từng công việc cụ thể phục vụ dự án bằng cú pháp:
[CREATE_CHAT: title="Tên công việc cụ thể", task="Mô tả nhiệm vụ", agents="database,coder|frontend,reviewer|tester,devops"]
Hệ thống sẽ lập tức tạo đoạn chat đó, nạp sẵn các Agent miễn phí từ 4 nhà cung cấp, và các Agent sẽ tự động nhắn tin phối hợp!

[QUYỀN TỰ ĐỘNG TUYỂN DỤNG THÊM AGENT VÀO HỘI ĐỒNG (TỐI ĐA 5 AGENT)]:
Bạn có toàn quyền TỰ ĐỘNG TUYỂN DỤNG THÊM CHUYÊN GIA vào Hội Đồng Dự Án mà không cần người dùng thao tác thủ công.
Khi nhận thấy dự án cần chuyên gia nào (CSDL/SQL, Giao diện Frontend, Kiểm toán Bảo mật, Kỹ sư DevOps, Kỹ sư Kiểm Thử, Code Reviewer):
Hãy phát lệnh tuyển dụng ở đầu phản hồi theo cú pháp:
[RECRUIT_AGENT: role="database|frontend|security|devops|tester|coder|reviewer", name="Tên Chuyên Gia", model="<model_id>"]

[DANH SÁCH MÔ HÌNH MIỄN PHÍ TỪ 4 PROVIDER CÓ THỂ CHỌN KHI TUYỂN DỤNG]:
- OpenRouter: nvidia/nemotron-3-ultra-550b-a55b:free, cohere/north-mini-code:free, nvidia/nemotron-3.5-super-vl:free, nvidia/nemotron-3.5-lightning:free, google/gemma-4-26b-a4b-it:free, recursive/flint-v1.0:free, xingchen-agi/xing4.0-29b-a4b:free, liquid/lfm-2.5-2.6b:free, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, openrouter/free
- Cloudflare Workers AI: @cf/deepseek-ai/deepseek-r1-distill-qwen-32b, @cf/meta/llama-3.1-8b-instruct-fp8-fast, @cf/meta/llama-3.2-11b-vision-instruct, @cf/meta/llama-3.2-3b-instruct, @cf/meta/llama-3.2-1b-instruct, @cf/black-forest-labs/flux-1-schnell (vẽ ảnh), @cf/stabilityai/stable-diffusion-xl-base-1.0 (vẽ ảnh)
- Kilo Gateway: kilo-auto/free, poolside/laguna-s-2.1:free, dots-studio/dots-3-note-preview:free, nvidia/nemotron-3-ultra-550b-a55b:free, nvidia/nemotron-3.5-lightning:free, cohere/north-mini-code:free, recursive/flint-v1.0:free
- OpenCode: deepseek-v4.1-flash-free, glm-5.3-flash-free, nemotron-3.5-lightning-free, nemotron-3.5-super-vl-free, mimo-v2.6-flash-free, flint-40b-free, beam-free, big-pickle
Hệ thống sẽ ngay lập tức kích hoạt Agent đó tham gia cùng bạn.` 
        },
        ...chat.messages.slice(-8).map(m => {
          const cleanTxt = (m.content || '').replace(/^(?:\[[^\]\r\n]+\]:\s*)+/g, '').trim();
          return {
            role: m.role === 'user' ? 'user' : 'assistant',
            content: cleanTxt
          };
        }),
        { role: 'user', content: content.trim() }
      ];

      const activeModel = model || chat.model || 'kilo-auto/free';
      const activeProv = req.body.providerId || chat.providerId;
      const rawAgentResponse = await callInternalAI({ model: activeModel, messages, providerId: activeProv });
      const agentResponse = (rawAgentResponse || '').replace(/^(?:\[[^\]\r\n]+\]:\s*)+/g, '').trim();

      // Quét lệnh tự tuyển dụng Agent từ AI
      const recruitRegex = /\[(?:RECRUIT_AGENT|AUTO_ADD_AGENT):\s*role="([^"]+)",\s*name="([^"]+)"(?:,\s*model="([^"]+)")?\]/gi;
      let recruitMatch;
      while ((recruitMatch = recruitRegex.exec(agentResponse)) !== null) {
        const rawRole = recruitMatch[1].trim().toLowerCase();
        const rawName = recruitMatch[2].trim();
        const rawModel = recruitMatch[3] ? recruitMatch[3].trim() : null;
        try {
          const freshChat = Store.getProjectChat(projectId, chatId);
          if (freshChat && (freshChat.agents || []).length < 5) {
            const newAg = Store.addAgentToChat(projectId, chatId, {
              category: rawRole,
              name: rawName,
              model: rawModel
            });
            sendEvent({ type: 'agent_recruited', agent: newAg, recruitedBy: 'AI Trợ Lý' });
          }
        } catch (e) {
          console.warn('Lỗi tự tuyển dụng agent:', e.message);
        }
      }

      // TỰ ĐỘNG GHI FILE VÀO DỰ ÁN TRÊN MÁY (CẤP QUYỀN TOÀN BỘ CHO AGENT)
      const autoSavedFiles = [];
      const codeFileRegex = /```(?:[a-zA-Z0-9_-]+)?\s*\r?\n(?:(?:\/\/|#|\/\*)\s*File:\s*([^\r\n]+)\r?\n)([\s\S]*?)```/gi;
      let fMatch;
      while ((fMatch = codeFileRegex.exec(agentResponse)) !== null) {
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

      const savedMsg = Store.saveProjectChatMessage(projectId, chatId, {
        role: 'assistant',
        author: 'AI Trợ Lý',
        agentBadge: 'AI',
        agentColor: '#3b82f6',
        agentModel: activeModel,
        agentRole: 'Trợ lý lập trình',
        content: agentResponse,
        autoSavedFiles: autoSavedFiles
      });

      sendEvent({ type: 'agent_done', message: savedMsg, autoSavedFiles });

      if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
        sendEvent({ type: 'all_done', totalMessages: 1 });
        return res.end();
      }

      return res.json({ success: true, mode: 'direct', messages: [savedMsg] });
    }

    // B. NẾU LÀ CHAT NHÓM: LẦN LƯỢT CÁC AGENT TRONG NHÓM (TỐI ĐA 5 AGENT) CÙNG NÓI CHUYỆN & FIX CODE
    // Lọc thành viên nếu người dùng chỉ định đích danh qua @mention để làm việc riêng
    let isTargetedWork = false;
    let targetedNames = [];
    if (teamMembers && teamMembers.length > 0) {
      const lowerContent = content.toLowerCase();
      const normContent = removeVietnameseTones(content);

      if (lowerContent.includes('@')) {
        const isAll = normContent.includes('@all') || normContent.includes('@tat ca') || normContent.includes('@ca nhom') || normContent.includes('@hoi dong');
        if (!isAll) {
          const matchedMembers = teamMembers.filter(m => {
            const nameLower = m.name.toLowerCase();
            const normName = removeVietnameseTones(m.name);
            const catLower = (m.category || '').toLowerCase();

            return lowerContent.includes(`@${nameLower}`) ||
                   normContent.includes(`@${normName}`) ||
                   lowerContent.includes(`@${catLower}`) ||
                   normContent.includes(`@${catLower}`) ||
                   (catLower === 'coder' && (normContent.includes('@lap trinh') || normContent.includes('@code') || normContent.includes('@coder') || normContent.includes('@dev'))) ||
                   (catLower === 'tester' && (normContent.includes('@kiem thu') || normContent.includes('@tester') || normContent.includes('@test') || normContent.includes('@qa'))) ||
                   (catLower === 'database' && (normContent.includes('@csdl') || normContent.includes('@co so du lieu') || normContent.includes('@database') || normContent.includes('@sql') || normContent.includes('@db'))) ||
                   (catLower === 'frontend' && (normContent.includes('@giao dien') || normContent.includes('@frontend') || normContent.includes('@ui') || normContent.includes('@ux'))) ||
                   (catLower === 'security' && (normContent.includes('@bao mat') || normContent.includes('@security') || normContent.includes('@an ninh') || normContent.includes('@sec'))) ||
                   (catLower === 'architect' && (normContent.includes('@kien truc') || normContent.includes('@architect') || normContent.includes('@arch'))) ||
                   (catLower === 'devops' && (normContent.includes('@devops') || normContent.includes('@trien khai'))) ||
                   (catLower === 'reviewer' && (normContent.includes('@reviewer') || normContent.includes('@review') || normContent.includes('@soat code')));
          });

          if (matchedMembers.length > 0) {
            teamMembers = matchedMembers;
            isTargetedWork = true;
            targetedNames = matchedMembers.map(m => m.name);
          }
        }
      }
    }

    const generatedMessages = [];
    const previousTurnsContext = [];

    for (let i = 0; i < teamMembers.length; i++) {
      const member = teamMembers[i];
      sendEvent({
        type: 'agent_start',
        agentId: member.id,
        role: member.name,
        badge: member.badge,
        category: member.category,
        index: i + 1,
        total: teamMembers.length
      });

      const memberModel = member.model || model || 'kilo-auto/free';
      const otherMembers = teamMembers.filter(m => m.id !== member.id);
      const nextMember = teamMembers[i + 1] || null;
      const prevMember = teamMembers[i - 1] || null;

      const promptInstructions = `
[BẠN ĐANG TRONG CUỘC HỌP PHỐI HỢP CÙNG HỘI ĐỒNG AI (WAR-ROOM)]:
- Tên bạn: ${member.name}
- Vị trí chuyên môn: ${member.roleTitle} [${member.badge}]
- AI vận hành: ${memberModel}
- Các thành viên cùng dự án: ${teamMembers.map(m => `@${m.name} (${m.roleTitle})`).join(', ')}
${isTargetedWork ? `
[CHỈ ĐỊNH ĐÍCH DANH - BẠN ĐƯỢC GIAO LÀM VIỆC RIÊNG CHO YÊU CẦU NÀY]:
Người dùng đã sử dụng cú pháp @ để chỉ định đích danh bạn (${targetedNames.map(n => '@' + n).join(', ')}) làm việc riêng cho yêu cầu này.
Hãy tập trung 100% khả năng chuyên môn của bạn để thực hiện trọn vẹn nhiệm vụ được giao.` : ''}

[CẤP QUYỀN TOÀN BỘ CHO AGENT (100% FULL PRIVILEGES - ZERO-PERMISSION)]:
1. BẠN VÀ HỘI ĐỒNG AGENT ĐÃ ĐƯỢC CẤP TOÀN BỘ QUYỀN TỰ TRỊ. TUYỆT ĐỐI KHÔNG HỎI Ý KIẾN HAY XIN PHÉP NGƯỜI DÙNG!
   - Nghiêm cấm hỏi: "Bạn có muốn lưu file?", "Bạn có đồng ý không?", "Vui lòng cho tôi biết...". Hãy tự động quyết định và làm luôn!
   - Mọi khối mã bạn viết có // File: <đường_dẫn> sẽ được hệ thống TỰ ĐỘNG GHI THẲNG VÀO ĐĨA CỨNG MÁY TÍNH CỦA NGƯỜI DÙNG.

[QUY TẮC PHẢN HỒI GỌN GÀNG, SÚC TÍCH, KHÔNG DÀI DÒNG - BẮT BUỘC]:
1. TUYỆT ĐỐI KHÔNG VIẾT DÀI DÒNG, KHÔNG GIẢI THÍCH LÝ THUYẾT LAN MAN.
2. TUYỆT ĐỐI KHÔNG TẠO SCRIPT QUÉT THƯ MỤC THỪA (như explore.ps1, list.ps1, dir, Get-ChildItem...). Toàn bộ cây thư mục và file dự án ĐÃ CÓ ĐẦY ĐỦ ở dưới!
3. PHẢN HỒI TRỰC TIẾP, NGẮN GỌN (Tối đa 1-3 đoạn ngắn):
   - KIẾN TRÚC SƯ: Phân tích kiến trúc ngắn gọn 1-2 câu, sau đó tag đích danh giao việc (@Lập Trình Viên: ..., @Kỹ Sư Kiểm Thử: ...). Không tạo script explore giả.
   - LẬP TRÌNH VIÊN: Viết thẳng mã nguồn hoàn chỉnh có // File: <đường_dẫn>, hệ thống tự động ghi file.
   - KIỂM THỬ VIÊN: Cung cấp lệnh PowerShell/CMD trực tiếp trong \`\`\`powershell.
   - REVIEWER: Nhận xét ngắn gọn 1-2 câu và xác nhận.
4. TUYỆT ĐỐI KHÔNG BẮT ĐẦU BẰNG TIỀN TỐ TÊN MÌNH (ví dụ KHÔNG viết "[${member.name}]: ").
${prevMember ? `5. BẮT ĐẦU: Phản hồi súc tích ý kiến của @${prevMember.name}.` : `5. MỞ ĐẦU: Chào ngắn gọn 1 câu và phân công việc cho @${nextMember ? nextMember.name : 'thành viên tiếp theo'}.`}
${nextMember ? `6. BÀN GIAO: Chuyển giao phần việc tiếp theo cho @${nextMember.name}.` : `6. TỔNG KẾT: Tóm tắt giải pháp ngắn gọn cho Người Dùng.`}

[QUYỀN TỰ ĐỘNG TUYỂN DỤNG THÊM AGENT VÀO HỘI ĐỒNG (TỐI ĐA 5 AGENT)]:
Nếu bạn nhận thấy dự án hoặc yêu cầu này cần thêm các vị trí chuyên gia chuyên sâu (như "database" CSDL/SQL, "frontend" UI/UX, "security" Bảo Mật, "devops" Môi Trường, "tester" Kiểm Thử) mà Hội Đồng chưa có:
Bạn có TOÀN QUYỀN TỰ ĐỘNG TUYỂN THÊM AGENT bằng cú pháp:
[RECRUIT_AGENT: role="database|frontend|security|devops|tester|coder|reviewer", name="Tên Vị Trí Cụ Thể", model="<model_id>"]

[DANH SÁCH MÔ HÌNH MIỄN PHÍ TỪ 4 PROVIDER CÓ THỂ CHỌN KHI TUYỂN DỤNG]:
- OpenRouter: nvidia/nemotron-3-ultra-550b-a55b:free, cohere/north-mini-code:free, nvidia/nemotron-3.5-super-vl:free, nvidia/nemotron-3.5-lightning:free, google/gemma-4-26b-a4b-it:free, recursive/flint-v1.0:free, xingchen-agi/xing4.0-29b-a4b:free, liquid/lfm-2.5-2.6b:free, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, openrouter/free
- Cloudflare Workers AI: @cf/deepseek-ai/deepseek-r1-distill-qwen-32b, @cf/meta/llama-3.1-8b-instruct-fp8-fast, @cf/meta/llama-3.2-11b-vision-instruct, @cf/meta/llama-3.2-3b-instruct, @cf/meta/llama-3.2-1b-instruct, @cf/black-forest-labs/flux-1-schnell (vẽ ảnh), @cf/stabilityai/stable-diffusion-xl-base-1.0 (vẽ ảnh)
- Kilo Gateway: kilo-auto/free, poolside/laguna-s-2.1:free, dots-studio/dots-3-note-preview:free, nvidia/nemotron-3-ultra-550b-a55b:free, nvidia/nemotron-3.5-lightning:free, cohere/north-mini-code:free, recursive/flint-v1.0:free
- OpenCode: deepseek-v4.1-flash-free, glm-5.3-flash-free, nemotron-3.5-lightning-free, nemotron-3.5-super-vl-free, mimo-v2.6-flash-free, flint-40b-free, beam-free, big-pickle
Hệ thống sẽ lập tức tạo Agent đó, ghim vào Hội Đồng Dự Án và Agent mới sẽ tham gia trao đổi giải quyết dự án ngay!


[QUYỀN TRUY CẬP TRÌNH DUYỆT & TRA CỨU WEB (BROWSER & INTERNET ACCESS)]:
Bạn có toàn quyền truy cập internet, sử dụng trình duyệt để tìm kiếm thông tin, tài liệu mới nhất hoặc tra cứu Gemini Web, ChatGPT Web để giải quyết nhiệm vụ:
- Khi cần tìm kiếm thông tin trên mạng, hãy dùng cú pháp: [WEB_SEARCH: query="từ khóa cần tìm"]
- Khi cần đọc nội dung một trang web hay tài liệu cụ thể, hãy dùng cú pháp: [WEB_BROWSE: url="https://..."]
Hệ thống sẽ TỰ ĐỘNG THỰC THI TRUY CẬP TRÌNH DUYỆT, bóc tách dữ liệu và cung cấp kết quả trực tiếp cho bạn!

[CHẾ ĐỘ THỰC THI DỰ ÁN THỰC TẾ]:
Bạn đang LÀM THẬT trên mã nguồn dự án tại thư mục: "${project.path}".
- KIẾN TRÚC SƯ: Phân tích file thực tế trong dự án, hoạch định cấu trúc, phân luồng logic và tự tuyển dụng thêm chuyên gia nếu thiếu.
- LẬP TRÌNH VIÊN: Viết mã nguồn HOÀN CHỈNH, CHUẨN XÁC, SẴN SÀNG CHẠY. Ở dòng đầu tiên của mỗi khối code, LUÔN ghi rõ đường dẫn file: // File: <đường_dẫn_tệp> để hệ thống ghi thẳng vào dự án trên máy.
- KIỂM THỬ VIÊN: Cung cấp lệnh Terminal PowerShell/CMD chuẩn xác trong khối \`\`\`powershell để người dùng bấm 1 nút chạy trực tiếp kiểm tra dự án.
- CƠ SỞ DỮ LIỆU: Cung cấp schema SQL/NoSQL, thiết kế bảng dữ liệu tối ưu trong khối \`\`\`sql.
- GIAO DIỆN (UI/UX): Viết HTML/CSS/JS hiện đại, chuẩn SaaS và responsive.
- AN NINH BẢO MẬT: Soát lỗi xác thực, phân quyền JWT và bảo vệ mã nguồn.
- REVIEWER: Soát lỗi logic, bảo mật, Clean Code và xác nhận hoàn tất.`;

      const memberMessages = [
        {
          role: 'system',
          content: `${promptInstructions}\n\n${projectContext}`
        },
        // Lịch sử chat trước đó (loại bỏ tiền tố lặp lại)
        ...chat.messages.slice(-6).map(m => {
          const cleanTxt = (m.content || '').replace(/^(?:\[[^\]\r\n]+\]:\s*)+/g, '').trim();
          return {
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.role === 'user' ? cleanTxt : (m.author ? `[${m.author}]: ${cleanTxt}` : cleanTxt)
          };
        }),
        // Ý tưởng mới nhất của người dùng
        { role: 'user', content: `[Ý TƯỞNG CỦA NGƯỜI DÙNG]: ${content.trim()}` }
      ];

      // Thêm ngữ cảnh của các thành viên vừa nói trước đó trong lượt này
      if (previousTurnsContext.length > 0) {
        memberMessages.push({
          role: 'user',
          content: `[CÁC THÀNH VIÊN TRƯỚC ĐÓ TRONG NHÓM VỪA NÓI TRỰC TIẾP TRONG CUỘC HỌP NÀY]:\n${previousTurnsContext.join('\n\n---\n\n')}\n\nHãy trực tiếp phản hồi, tương tác và tiếp nối phần việc của bạn.`
        });
      }

      const rawAgentResponse = await callInternalAI({ 
        model: memberModel, 
        messages: memberMessages, 
        providerId: member.providerId 
      });
      const agentResponse = (rawAgentResponse || '').replace(/^(?:\[[^\]\r\n]+\]:\s*)+/g, '').trim();

      // --- TỰ ĐỘNG TUYỂN DỤNG THÊM AGENT (AUTONOMOUS AGENT RECRUITMENT) ---
      const recruitRegex = /\[(?:RECRUIT_AGENT|AUTO_ADD_AGENT):\s*role="([^"]+)",\s*name="([^"]+)"(?:,\s*model="([^"]+)")?\]/gi;
      let recruitMatch;
      while ((recruitMatch = recruitRegex.exec(agentResponse)) !== null) {
        const rawRole = recruitMatch[1].trim().toLowerCase();
        const rawName = recruitMatch[2].trim();
        const rawModel = recruitMatch[3] ? recruitMatch[3].trim() : null;

        const currentChat = Store.getProjectChat(projectId, chatId);
        const currentAgents = currentChat ? (currentChat.agents || []) : [];
        if (currentAgents.length < 5) {
          const alreadyExists = currentAgents.some(a => 
            a.name.toLowerCase() === rawName.toLowerCase() || a.category === rawRole
          );
          if (!alreadyExists) {
            try {
              const recruitedAgent = Store.addAgentToChat(projectId, chatId, {
                category: rawRole,
                name: rawName,
                model: rawModel
              });
              sendEvent({
                type: 'agent_recruited',
                agent: recruitedAgent,
                recruitedBy: member.name
              });
              // Nếu thành viên cuối vừa tuyển dụng, bổ sung vào vòng lặp để phát biểu ngay
              if (teamMembers.length < 5) {
                teamMembers.push(recruitedAgent);
              }
            } catch (err) {
              console.warn('Lỗi tự động thêm agent:', err.message);
            }
          }
        }
      }

      // TỰ ĐỘNG GHI FILE VÀO DỰ ÁN TRÊN MÁY (CẤP QUYỀN TOÀN BỘ CHO AGENT)
      const autoSavedFiles = [];
      const codeFileRegex = /```(?:[a-zA-Z0-9_-]+)?\s*\r?\n(?:(?:\/\/|#|\/\*)\s*File:\s*([^\r\n]+)\r?\n)([\s\S]*?)```/gi;
      let fMatch;
      while ((fMatch = codeFileRegex.exec(agentResponse)) !== null) {
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

      const savedMsg = Store.saveProjectChatMessage(projectId, chatId, {
        role: 'assistant',
        author: member.name,
        agentId: member.id,
        agentBadge: member.badge,
        agentColor: member.color,
        agentModel: memberModel,
        agentRole: member.roleTitle,
        content: agentResponse,
        autoSavedFiles: autoSavedFiles
      });

      // Quét lệnh AI tự tạo đoạn chat công việc mới
      const aiCreatedChats = handleAIChatCreation(projectId, agentResponse);

      generatedMessages.push(savedMsg);
      previousTurnsContext.push(`[${member.badge} - ${member.name}]:\n${agentResponse}`);
      sendEvent({ type: 'agent_done', message: savedMsg, autoSavedFiles, createdChats: aiCreatedChats });
    }

    if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
      sendEvent({ type: 'all_done', totalMessages: generatedMessages.length });
      return res.end();
    }

    return res.json({ success: true, mode: 'team', teamName, messages: generatedMessages });

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
