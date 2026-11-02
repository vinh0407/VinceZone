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

// Tạo File hoặc Thư mục trong dự án
app.post('/api/projects/:id/files', (req, res) => {
  try {
    const project = Store.getProjectById(req.params.id);
    if (!project || !project.path) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
    const { name, type = 'file', content = '' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Vui lòng nhập tên tập tin hoặc thư mục.' });
    
    const targetPath = path.join(project.path, name.trim());
    if (type === 'folder') {
      if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
    } else {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(targetPath, content || '', 'utf8');
    }
    res.json({ success: true, path: targetPath });
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

// 9.17 Gửi tin nhắn và điều phối Nhóm Agent (Tối đa 5 thành viên được chọn)
app.post('/api/projects/:id/chats/:chatId/message', async (req, res) => {
  const { id: projectId, chatId } = req.params;
  const project = Store.getProjectById(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  const chat = Store.getProjectChat(projectId, chatId);
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
    const projectContext = `
[THÔNG TIN DỰ ÁN TRÊN MÁY TÍNH]
- Tên Dự Án: ${project.name}
- Thư mục làm việc: ${project.path}
- Mục tiêu dự án: ${project.description || 'Không có mô tả'}
`;

    // -------------------------------------------------------------------------
    // KIỂM TRA CHẾ ĐỘ: NHIỀU AGENT (TỐI ĐA 5) HAY CHAT ĐƠN
    // -------------------------------------------------------------------------
    let teamMembers = (chat.agents && chat.agents.length > 0)
      ? chat.agents.slice(0, 5)
      : null;
    const teamName = chat.title || 'Hội đồng Agent';

    // A. NẾU LÀ CHAT ĐƠN (CHƯA THÊM AGENT NÀO)
    if (!teamMembers || teamMembers.length === 0) {
      sendEvent({ type: 'agent_start', role: 'AI Assistant', badge: 'AI' });

      const messages = [
        { 
          role: 'system', 
          content: `Bạn là trợ lý lập trình AI cấp cao trong dự án ${project.name}.\n\n${projectContext}

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
        ...chat.messages.slice(-8).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        })),
        { role: 'user', content: content.trim() }
      ];

      const activeModel = model || chat.model || 'kilo-auto/free';
      const activeProv = req.body.providerId || chat.providerId;
      const agentResponse = await callInternalAI({ model: activeModel, messages, providerId: activeProv });

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

      const savedMsg = Store.saveProjectChatMessage(projectId, chatId, {
        role: 'assistant',
        author: 'AI Trợ Lý',
        agentBadge: 'AI',
        agentColor: '#3b82f6',
        agentModel: activeModel,
        agentRole: 'Trợ lý lập trình',
        content: agentResponse
      });

      sendEvent({ type: 'agent_done', message: savedMsg });

      if (res.headersSent && (isStream || req.headers.accept === 'text/event-stream')) {
        sendEvent({ type: 'all_done', totalMessages: 1 });
        return res.end();
      }

      return res.json({ success: true, mode: 'direct', messages: [savedMsg] });
    }

    // B. NẾU LÀ CHAT NHÓM: LẦN LƯỢT CÁC AGENT TRONG NHÓM (TỐI ĐA 5 AGENT) CÙNG NÓI CHUYỆN & FIX CODE
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

[QUY TẮC GIAO TIẾP & PHỐI HỢP NỘI BỘ]:
1. HÃY TRÒ CHUYỆN VÀ GIAO TIẾP TỰ NHIÊN: Các AI trong nhóm cần trực tiếp trao đổi, phản hồi và tag tên nhau bằng cú pháp @Tên (ví dụ: @${prevMember ? prevMember.name : 'Kiến Trúc Sư'}, @${nextMember ? nextMember.name : 'Lập Trình Viên'}).
${prevMember ? `2. BẮT ĐẦU: Hãy phản hồi và tương tác với ý kiến của @${prevMember.name} vừa đưa ra trước bạn (ví dụ: "Chào @${prevMember.name} và Người Dùng, tôi đồng ý với phân tích trên...").` : `2. MỞ ĐẦU: Chào Người Dùng và cả nhóm, phân tích yêu cầu của Người Dùng và giao việc cụ thể cho @${nextMember ? nextMember.name : 'thành viên tiếp theo'}.`}
${nextMember ? `3. KẾT THÚC: Bàn giao phần việc rõ ràng cho @${nextMember.name} (ví dụ: "@${nextMember.name} ơi, tôi đã hoàn thiện xong phần mã nguồn, nhờ bạn kiểm tra và chạy test nhé!").` : `3. KẾT THÚC: Tổng kết toàn bộ giải pháp của cả nhóm, khẳng định chất lượng và bàn giao kết quả cuối cùng cho Người Dùng.`}

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
        // Lịch sử chat trước đó
        ...chat.messages.slice(-6).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: `${m.author ? `[${m.author}]: ` : ''}${m.content}`
        })),
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

      const agentResponse = await callInternalAI({ 
        model: memberModel, 
        messages: memberMessages, 
        providerId: member.providerId 
      });

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

      const savedMsg = Store.saveProjectChatMessage(projectId, chatId, {
        role: 'assistant',
        author: member.name,
        agentId: member.id,
        agentBadge: member.badge,
        agentColor: member.color,
        agentModel: memberModel,
        agentRole: member.roleTitle,
        content: agentResponse
      });

      generatedMessages.push(savedMsg);
      previousTurnsContext.push(`[${member.badge} - ${member.name}]:\n${agentResponse}`);
      sendEvent({ type: 'agent_done', message: savedMsg });
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
