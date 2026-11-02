require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DATA_DIR;
try {
  const electron = require('electron');
  const electronApp = electron.app || (electron.remote && electron.remote.app);
  if (electronApp && typeof electronApp.getPath === 'function') {
    DATA_DIR = path.join(electronApp.getPath('userData'), 'data');
  } else {
    DATA_DIR = path.join(__dirname, '..', 'data');
  }
} catch (e) {
  DATA_DIR = path.join(__dirname, '..', 'data');
}
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Default initial state - Chỉ giữ 2 Provider Miễn Phí (OpenRouter & Cloudflare Workers AI) + Kilo Gateway Fallback
const defaultData = {
  providers: [
    {
      id: 'prov_openrouter',
      name: 'OpenRouter',
      type: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      models: [
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'nvidia/nemotron-3.5-super-vl:free',
        'nvidia/nemotron-3.5-lightning:free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'kilo-auto/free',
        'kilo-auto/free',
        'cohere/north-mini-code:free',
        'kilo-auto/free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'openrouter/free'
      ],
      enabled: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_cloudflare_ai',
      name: 'Cloudflare Workers AI',
      type: 'openai-compatible',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/e155cf04b558472645b9444756a0deed/ai/v1',
      apiKey: process.env.CLOUDFLARE_API_TOKEN || '',
      models: [
        'kilo-auto/free',
        '@cf/meta/llama-3.2-3b-instruct',
        '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
        '@cf/meta/llama-3.2-11b-vision-instruct',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        '@cf/baai/bge-m3',
        '@cf/baai/bge-reranker-base',
        '@cf/black-forest-labs/flux-1-schnell'
      ],
      enabled: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_kilo_gateway',
      name: 'Kilo Gateway',
      type: 'openai-compatible',
      baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
      apiKey: '',
      models: [
        'kilo-auto/free',
        'cohere/north-mini-code:free',
        'dots-studio/dots-3-note-preview:free',
        'kilo-auto/free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'nvidia/nemotron-3.5-lightning:free',
        'kilo-auto/free'
      ],
      enabled: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_opencode',
      name: 'OpenCode',
      type: 'openai-compatible',
      baseUrl: 'https://opencode.ai/zen/v1',
      apiKey: process.env.OPENCODE_API_KEY || '',
      models: [
        'deepseek-v4.1-flash-free',
        'kilo-auto/free',
        'nemotron-3.5-lightning-free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'mimo-v2.6-flash-free',
        'flint-40b-free',
        'beam-free',
        'big-pickle'
      ],
      enabled: true,
      createdAt: new Date().toISOString()
    }
  ],
  gatewayKeys: [
    {
      id: 'key_master',
      name: 'Default Master Key',
      key: 'vz_live_' + crypto.randomBytes(16).toString('hex'),
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    }
  ],
  logs: []
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const templateDb = path.join(__dirname, '..', 'data', 'db.json');
    if (fs.existsSync(templateDb)) {
      try {
        fs.copyFileSync(templateDb, DB_FILE);
        return;
      } catch (e) {}
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.providers)) {
      data.providers.forEach(p => {
        if (p.id === 'prov_openrouter' && (!p.apiKey || p.apiKey === '')) {
          p.apiKey = process.env.OPENROUTER_API_KEY || '';
        }
        if (p.id === 'prov_cloudflare_ai' && (!p.apiKey || p.apiKey === '')) {
          p.apiKey = process.env.CLOUDFLARE_API_TOKEN || '';
        }
        if (p.id === 'prov_kilo_gateway' && (!p.apiKey || p.apiKey === '')) {
          p.apiKey = process.env.KILO_GATEWAY_API_KEY || '';
        }
        if (p.id === 'prov_opencode' && (!p.apiKey || p.apiKey === '')) {
          p.apiKey = process.env.OPENCODE_API_KEY || '';
        }
      });
    }
    return data;
  } catch (err) {
    console.error('Error reading db.json:', err);
    return defaultData;
  }
}

function writeDb(data) {
  ensureDb();
  const tmpFile = DB_FILE + '.tmp';
  // Loại bỏ các API key nhạy cảm khi ghi xuống đĩa để tránh GitHub push protection
  const toSave = JSON.parse(JSON.stringify(data));
  if (Array.isArray(toSave.providers)) {
    toSave.providers.forEach(p => {
      p.apiKey = '';
    });
  }
  fs.writeFileSync(tmpFile, JSON.stringify(toSave, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

// Helper methods
const Store = {
  readDb,
  writeDb,

  getProviders() {
    const db = readDb();
    const list = db.providers || [];
    list.forEach(p => {
      if (p.id === 'prov_openrouter' && (!p.apiKey || p.apiKey === '')) {
        p.apiKey = process.env.OPENROUTER_API_KEY || '';
      }
      if (p.id === 'prov_cloudflare_ai' && (!p.apiKey || p.apiKey === '')) {
        p.apiKey = process.env.CLOUDFLARE_API_TOKEN || '';
      }
      if (p.id === 'prov_opencode' && (!p.apiKey || p.apiKey === '')) {
        p.apiKey = process.env.OPENCODE_API_KEY || '';
      }
    });

    // Tự động kích hoạt Provider Tạo & Sửa ảnh Pollinations AI (100% Free không cần Key)
    let hasPollinations = list.find(p => p.id === 'prov_pollinations');
    if (!hasPollinations) {
      hasPollinations = {
        id: 'prov_pollinations',
        name: 'Pollinations AI (Tạo & Sửa Ảnh FREE)',
        type: 'image-studio',
        baseUrl: 'https://image.pollinations.ai',
        apiKey: '',
        models: [
          'flux',
          'flux-realism',
          'flux-anime',
          'flux-3d',
          'turbo',
          'midjourney'
        ],
        enabled: true,
        createdAt: new Date().toISOString()
      };
      list.push(hasPollinations);
      db.providers = list;
      writeDb(db);
    }

    // Đảm bảo Cloudflare có model tạo ảnh Flux & SDXL
    const cfProv = list.find(p => p.id === 'prov_cloudflare_ai');
    if (cfProv && Array.isArray(cfProv.models)) {
      if (!cfProv.models.includes('@cf/black-forest-labs/flux-1-schnell')) {
        cfProv.models.push('@cf/black-forest-labs/flux-1-schnell');
      }
      if (!cfProv.models.includes('@cf/stabilityai/stable-diffusion-xl-base-1.0')) {
        cfProv.models.push('@cf/stabilityai/stable-diffusion-xl-base-1.0');
      }
    }

    return list;
  },

  getProviderById(id) {
    const providers = this.getProviders();
    return providers.find(p => p.id === id);
  },

  findProviderForModel(modelName) {
    const providers = this.getProviders().filter(p => p.enabled && (p.apiKey || p.id === 'prov_kilo_gateway' || p.id === 'prov_opencode' || p.id === 'prov_pollinations')).sort((a, b) => (a.id === 'prov_kilo_gateway' ? -1 : (b.id === 'prov_kilo_gateway' ? 1 : 0)));
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normTarget = normalize(modelName);

    // 1. Direct or normalized match in models array
    for (const p of providers) {
      if (p.models && Array.isArray(p.models)) {
        for (const m of p.models) {
          if (m === modelName || normalize(m) === normTarget) {
            return { provider: p, model: m };
          }
        }
      }
    }
    // 2. Prefix match (e.g. "opencode/beam-free" or "gemini/gemini-2.5-flash")
    if (modelName.includes('/')) {
      const [prefix, actualModel] = modelName.split('/');
      const match = providers.find(p => 
        p.name.toLowerCase().includes(prefix.toLowerCase()) || 
        p.type.toLowerCase().includes(prefix.toLowerCase())
      );
      if (match) {
        // also check if actualModel matches in this provider
        for (const m of (match.models || [])) {
          if (m === actualModel || normalize(m) === normalize(actualModel)) {
            return { provider: match, model: m };
          }
        }
        return { provider: match, model: actualModel };
      }
    }
    // 3. Fallback: inspect model name patterns
    for (const p of providers) {
      if (modelName.startsWith('gpt-') || modelName.startsWith('o1') || modelName.startsWith('o3')) {
        if (p.type === 'openai') return { provider: p, model: modelName };
      }
      if (modelName.startsWith('claude-')) {
        if (p.type === 'anthropic') return { provider: p, model: modelName };
      }
      if (modelName.startsWith('gemini-')) {
        if (p.type === 'gemini') return { provider: p, model: modelName };
      }
      if (modelName.startsWith('deepseek-')) {
        if (p.name.toLowerCase().includes('deepseek')) return { provider: p, model: modelName };
      }
    }
    // 4. Return first enabled provider if still not matched
    if (providers.length > 0) {
      return { provider: providers[0], model: modelName };
    }
    return null;
  },

  saveProvider(provider) {
    const data = readDb();
    const index = data.providers.findIndex(p => p.id === provider.id);
    if (index >= 0) {
      data.providers[index] = { ...data.providers[index], ...provider, updatedAt: new Date().toISOString() };
    } else {
      provider.id = provider.id || 'prov_' + crypto.randomBytes(6).toString('hex');
      provider.createdAt = new Date().toISOString();
      data.providers.push(provider);
    }
    writeDb(data);
    return provider;
  },

  deleteProvider(id) {
    const data = readDb();
    data.providers = data.providers.filter(p => p.id !== id);
    writeDb(data);
  },

  getGatewayKeys() {
    return readDb().gatewayKeys || [];
  },

  verifyGatewayKey(rawKey) {
    if (!rawKey) return false;
    const cleanKey = rawKey.replace(/^Bearer\s+/i, '').trim();
    const keys = this.getGatewayKeys();
    const found = keys.find(k => k.key === cleanKey);
    if (found) {
      // update lastUsedAt
      const data = readDb();
      const target = data.gatewayKeys.find(k => k.id === found.id);
      if (target) {
        target.lastUsedAt = new Date().toISOString();
        writeDb(data);
      }
      return true;
    }
    return false;
  },

  createGatewayKey(name) {
    const data = readDb();
    const newKey = {
      id: 'key_' + crypto.randomBytes(6).toString('hex'),
      name: name || 'API Key',
      key: 'vz_live_' + crypto.randomBytes(16).toString('hex'),
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };
    data.gatewayKeys.push(newKey);
    writeDb(data);
    return newKey;
  },

  deleteGatewayKey(id) {
    const data = readDb();
    data.gatewayKeys = data.gatewayKeys.filter(k => k.id !== id);
    writeDb(data);
  },

  logRequest(entry) {
    const data = readDb();
    data.logs = data.logs || [];
    data.logs.unshift({
      id: 'log_' + crypto.randomBytes(6).toString('hex'),
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Keep last 300 logs
    if (data.logs.length > 300) {
      data.logs = data.logs.slice(0, 300);
    }
    writeDb(data);
  },

  getLogs() {
    return (readDb().logs || []).slice(0, 100);
  },

  // ----------------------------------------------------
  // VINCEZONE COGNITIVE MEMORY SYSTEM (BỘ NHỚ DÙNG CHUNG)
  // ----------------------------------------------------

  getMemorySettings() {
    const data = readDb();
    return data.memorySettings || {
      enabled: true,
      autoLearn: true
    };
  },

  updateMemorySettings(settings) {
    const data = readDb();
    data.memorySettings = { ...(data.memorySettings || {}), ...settings };
    writeDb(data);
    return data.memorySettings;
  },

  getMemories() {
    const data = readDb();
    return data.memories || [];
  },

  saveMemory(mem) {
    const data = readDb();
    data.memories = data.memories || [];
    
    if (mem.id) {
      const idx = data.memories.findIndex(m => m.id === mem.id);
      if (idx >= 0) {
        data.memories[idx] = {
          ...data.memories[idx],
          ...mem,
          updatedAt: new Date().toISOString()
        };
        writeDb(data);
        return data.memories[idx];
      }
    }

    const newMem = {
      id: 'mem_' + crypto.randomBytes(6).toString('hex'),
      content: mem.content.trim(),
      category: mem.category || 'learned', // 'preference', 'project', 'rule', 'learned'
      sourceModel: mem.sourceModel || 'VinceZone',
      enabled: mem.enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.memories.unshift(newMem);
    writeDb(data);
    return newMem;
  },

  deleteMemory(id) {
    const data = readDb();
    data.memories = (data.memories || []).filter(m => m.id !== id);
    writeDb(data);
  },

  clearAllMemories() {
    const data = readDb();
    data.memories = [];
    writeDb(data);
  },

  toggleMemory(id) {
    const data = readDb();
    data.memories = data.memories || [];
    const target = data.memories.find(m => m.id === id);
    if (target) {
      target.enabled = !target.enabled;
      target.updatedAt = new Date().toISOString();
      writeDb(data);
      return target;
    }
    return null;
  },

  formatMemoriesForPrompt() {
    const settings = this.getMemorySettings();
    if (!settings.enabled) return '';

    const activeMemories = this.getMemories().filter(m => m.enabled && m.content);
    if (activeMemories.length === 0) return '';

    const explicitMemories = activeMemories.filter(m => m.category !== 'conversation');
    const chatMemories = activeMemories.filter(m => m.category === 'conversation');

    const lines = [];

    if (explicitMemories.length > 0) {
      lines.push('--- [QUY TẮC, SỞ THÍCH & KIẾN THỨC DÙNG CHUNG] ---');
      explicitMemories.forEach(m => {
        let tag = '[Ghi nhớ]';
        if (m.category === 'preference') tag = '[Sở thích]';
        if (m.category === 'project') tag = '[Dự án]';
        if (m.category === 'rule') tag = '[Quy tắc]';
        if (m.category === 'learned') tag = '[Tri thức đã học]';
        lines.push(`- ${tag}: ${m.content}`);
      });
    }

    if (chatMemories.length > 0) {
      lines.push('\n--- [KÝ ỨC CÁC ĐOẠN CHAT TRƯỚC ĐÂY (VẪN LƯU KỂ CẢ KHI XÓA LỊCH SỬ CHAT)]: ---');
      // Lấy 25 lượt tương tác gần nhất để AI hiểu mạch ngữ cảnh mà không làm quá tải token
      const recentTurns = chatMemories.slice(0, 25);
      recentTurns.forEach(m => {
        lines.push(`- ${m.content}`);
      });
    }

    return `\n\n### [BỘ NHỚ NHẬN THỨC VINCEZONE - DÙNG CHUNG QUA CÁC AI]:\n` +
           `Hệ thống VinceZone đã ghi nhớ toàn bộ thông tin và các cuộc trò chuyện trước đây của người dùng. Dù bạn là AI nào, hãy luôn vận dụng các ký ức này để phản hồi nhất quán, chính xác và không lặp lại câu hỏi cũ:\n` +
           lines.join('\n') +
           `\n### [HẾT BỘ NHỚ VINCEZONE]\n`;
  },

  autoExtractMemory(text, sourceModel = 'AI') {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();

    // Check for explicit memory keywords in Vietnamese and English
    const triggers = [
      { regex: /(?:hãy nhớ|nhớ rằng|ghi nhớ là|lưu ý là|tôi tên là|tên tôi là|mình tên là|gọi tôi là)\s+(.+)/i, defaultCat: 'preference' },
      { regex: /(?:dự án của tôi|tôi đang làm dự án|project của tôi|chúng tôi đang phát triển|tôi đang viết code|dự án này là)\s+(.+)/i, defaultCat: 'project' },
      { regex: /(?:quy tắc là|luôn luôn|từ nay hãy|từ giờ hãy|không bao giờ|hãy trả lời bằng)\s+(.+)/i, defaultCat: 'rule' },
      { regex: /(?:tôi thích|tôi quen dùng|phong cách của tôi|ưu tiên của tôi|tôi là lập trình viên)\s+(.+)/i, defaultCat: 'preference' },
      { regex: /(?:công nghệ đang dùng|database là|ngôn ngữ chính là|hệ điều hành là|backend là|frontend là)\s+(.+)/i, defaultCat: 'project' },
      { regex: /(?:remember that|please note that|my name is|my project is|i prefer|always reply in)\s+(.+)/i, defaultCat: 'learned' }
    ];

    for (const item of triggers) {
      const match = clean.match(item.regex);
      if (match && match[1]) {
        let content = match[1].replace(/[.!?]+$/, '').trim();
        if (content.length > 5 && content.length < 350) {
          let category = item.defaultCat;
          if (/tên|sở thích|thích|prefer|gọi tôi/i.test(clean)) category = 'preference';
          else if (/dự án|project|app|hệ thống|backend|frontend/i.test(clean)) category = 'project';
          else if (/quy tắc|luôn|rule|never|từ nay hãy/i.test(clean)) category = 'rule';

          return this.saveMemory({
            content,
            category,
            sourceModel
          });
        }
      }
    }
    return null;
  },

  /**
   * Trích xuất & học hỏi kiến thức toàn diện từ lịch sử chat
   */
  extractMemoriesFromAllChats(userId = null) {
    const chats = this.getChats(userId);
    const existing = this.getMemories();
    const existingTexts = existing.map(m => m.content.toLowerCase().trim());
    const extracted = [];

    const patterns = [
      { regex: /(?:hãy nhớ|nhớ rằng|ghi nhớ là|lưu ý là|tôi tên là|tên tôi là|mình tên là)\s+([^.\n]+)/gi, cat: 'preference' },
      { regex: /(?:dự án của tôi|tôi đang làm dự án|project của tôi|dự án này là|chúng tôi làm)\s+([^.\n]+)/gi, cat: 'project' },
      { regex: /(?:quy tắc là|luôn luôn|từ nay hãy|từ giờ hãy|không bao giờ|lưu ý quy tắc)\s+([^.\n]+)/gi, cat: 'rule' },
      { regex: /(?:tôi thích|phong cách|ưu tiên|tôi thường dùng)\s+([^.\n]+)/gi, cat: 'preference' },
      { regex: /(?:database là|công nghệ là|backend là|frontend là|ngôn ngữ là|dùng stack)\s+([^.\n]+)/gi, cat: 'project' }
    ];

    for (const chat of chats) {
      if (!chat.messages || !Array.isArray(chat.messages)) continue;

      for (const msg of chat.messages) {
        if (msg.role !== 'user' || !msg.content) continue;

        const text = typeof msg.content === 'string'
          ? msg.content
          : (Array.isArray(msg.content) ? msg.content.filter(p => p.type === 'text').map(p => p.text).join(' ') : '');

        if (!text) continue;

        for (const p of patterns) {
          const matches = [...text.matchAll(p.regex)];
          for (const match of matches) {
            if (match && match[1]) {
              const fact = match[1].trim();
              if (fact.length >= 6 && fact.length <= 300) {
                const norm = fact.toLowerCase();
                const isDup = existingTexts.some(ex => ex.includes(norm) || norm.includes(ex));
                if (!isDup) {
                  const saved = this.saveMemory({
                    content: fact,
                    category: p.cat,
                    sourceModel: `Chat: ${chat.title || 'Lịch sử'}`
                  });
                  existingTexts.push(norm);
                  extracted.push(saved);
                }
              }
            }
          }
        }
      }
    }

    return extracted;
  },

  // ----------------------------------------------------
  // CHAT SESSIONS / LỊCH SỬ HỘI THOẠI (CHAT MEMORY)
  // Quy định lưu trữ:
  // - Khách (chưa đăng nhập): Lưu tối đa 3 ngày (72 giờ)
  // - Đã đăng nhập: Lưu lâu dài / vĩnh viễn
  // ----------------------------------------------------
  getChats(userId = null) {
    const data = readDb();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    // Dọn dẹp các đoạn chat khách đã quá 3 ngày
    let rawSessions = data.chatSessions || [];
    let hasPurged = false;
    const validSessions = [];

    for (const c of rawSessions) {
      if (c.userId) {
        // Đã đăng nhập: Lưu lâu dài vĩnh viễn
        validSessions.push(c);
      } else {
        // Khách chưa đăng nhập: Kiểm tra thời hạn 3 ngày
        const createdMs = new Date(c.updatedAt || c.createdAt).getTime();
        const ageMs = nowMs - createdMs;
        if (ageMs <= THREE_DAYS_MS) {
          validSessions.push(c);
        } else {
          hasPurged = true;
        }
      }
    }

    if (hasPurged) {
      data.chatSessions = validSessions;
      writeDb(data);
    }

    // Lọc theo người dùng hiện tại
    let chats = validSessions;
    if (userId) {
      // Đã đăng nhập: Lấy các đoạn chat của tài khoản này
      chats = chats.filter(c => c.userId === userId);
    } else {
      // Chưa đăng nhập: Lấy các đoạn chat của khách
      chats = chats.filter(c => !c.userId);
    }

    // Đính kèm metadata thời hạn lưu trữ
    return chats.map(c => {
      if (c.userId) {
        return {
          ...c,
          isGuest: false,
          retention: 'Vĩnh viễn (Đã đăng nhập)'
        };
      } else {
        const createdMs = new Date(c.updatedAt || c.createdAt).getTime();
        const remainingMs = Math.max(0, THREE_DAYS_MS - (nowMs - createdMs));
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        return {
          ...c,
          isGuest: true,
          retention: `Tài khoản khách (còn ${remainingHours}h)`
        };
      }
    }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  },

  getChatById(id) {
    const data = readDb();
    return (data.chatSessions || []).find(c => c.id === id);
  },

  saveChat(chat) {
    const data = readDb();
    data.chatSessions = data.chatSessions || [];

    const now = new Date().toISOString();
    let target = null;

    if (chat.id) {
      const idx = data.chatSessions.findIndex(c => c.id === chat.id);
      if (idx >= 0) {
        data.chatSessions[idx] = {
          ...data.chatSessions[idx],
          ...chat,
          updatedAt: now
        };
        target = data.chatSessions[idx];
      }
    }

    if (!target) {
      const newChat = {
        id: chat.id || 'chat_' + crypto.randomBytes(6).toString('hex'),
        title: chat.title || 'Cuộc trò chuyện mới',
        model: chat.model || 'AI Model',
        provider: chat.provider || 'Gateway',
        userId: chat.userId || null,
        messages: chat.messages || [],
        createdAt: now,
        updatedAt: now
      };
      data.chatSessions.unshift(newChat);
      target = newChat;
    }

    if (data.chatSessions.length > 250) {
      data.chatSessions = data.chatSessions.slice(0, 250);
    }

    writeDb(data);

    // ----------------------------------------------------
    // TỰ ĐỘNG GHI NHỚ TOÀN BỘ ĐOẠN CHAT (CẢ CỦA TÔI VÀ CỦA AI)
    // Toàn bộ các mục trong lịch sử chat được lưu trực tiếp vào Bộ nhớ nhận thức (data.memories).
    // Kể cả khi người dùng xóa lịch sử chat, các ghi nhớ này vẫn nằm nguyên trong bộ nhớ!
    // Chỉ khi người dùng bấm xóa bộ nhớ thì mới mất vĩnh viễn.
    // ----------------------------------------------------
    if (target.messages && target.messages.length > 0) {
      this.autoRecordChatTurnsToMemory(target);
    }

    return target;
  },

  /**
   * Tự động lưu từng lượt chat (User & AI) vào Bộ nhớ nhận thức vĩnh viễn
   */
  autoRecordChatTurnsToMemory(chat) {
    if (!chat || !chat.messages || !Array.isArray(chat.messages)) return;
    const data = readDb();
    data.memories = data.memories || [];
    const now = new Date().toISOString();
    let changed = false;

    chat.messages.forEach((msg, idx) => {
      if (!msg || !msg.content) return;
      const rawText = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content) ? msg.content.filter(p => p.type === 'text').map(p => p.text).join(' ') : '');
      const text = rawText.trim();
      if (!text) return;

      // Tạo ID ổn định theo chat.id, index, role để không bị trùng lặp khi chat tự lưu nhiều lần
      const safeId = 'mem_chat_' + crypto.createHash('md5').update(`${chat.id}_${idx}_${msg.role}_${text.slice(0, 100)}`).digest('hex').slice(0, 14);

      const isUser = msg.role === 'user';
      const formattedContent = isUser
        ? `[Tôi hỏi]: ${text}`
        : `[AI (${chat.model || msg.model || 'Trợ lý'}) trả lời]: ${text}`;

      const existingIdx = data.memories.findIndex(m => m.id === safeId);
      if (existingIdx >= 0) {
        if (data.memories[existingIdx].content !== formattedContent) {
          data.memories[existingIdx].content = formattedContent;
          data.memories[existingIdx].updatedAt = now;
          changed = true;
        }
      } else {
        const newMem = {
          id: safeId,
          content: formattedContent,
          category: 'conversation',
          sourceModel: isUser ? `Đoạn chat: ${chat.title || 'Hội thoại'}` : `${chat.model || msg.model || 'AI Model'}`,
          role: msg.role,
          chatId: chat.id,
          enabled: true,
          createdAt: now,
          updatedAt: now
        };
        data.memories.unshift(newMem);
        changed = true;
      }
    });

    if (changed) {
      writeDb(data);
    }
  },

  /**
   * Đồng bộ toàn bộ các cuộc trò chuyện từ trước đến nay vào Bộ nhớ nhận thức
   */
  syncAllChatsToMemory(userId = null) {
    const chats = this.getChats(userId);
    const beforeCount = (readDb().memories || []).length;
    for (const chat of chats) {
      this.autoRecordChatTurnsToMemory(chat);
    }
    const afterCount = (readDb().memories || []).length;
    return { added: Math.max(0, afterCount - beforeCount), total: afterCount };
  },

  deleteChat(id) {
    const data = readDb();
    data.chatSessions = (data.chatSessions || []).filter(c => c.id !== id);
    writeDb(data);
    // GHI CHÚ QUAN TRỌNG:
    // Tuyệt đối KHÔNG xóa trong data.memories!
    // Khi xóa lịch sử chat, bộ nhớ nhận thức vẫn còn nguyên vẹn.
  },

  clearAllChats(userId = null) {
    const data = readDb();
    if (userId) {
      data.chatSessions = (data.chatSessions || []).filter(c => c.userId && c.userId !== userId);
    } else {
      data.chatSessions = [];
    }
    writeDb(data);
    // GHI CHÚ QUAN TRỌNG:
    // Tuyệt đối KHÔNG xóa trong data.memories!
    // Kể cả khi xóa tất cả lịch sử chat, bộ nhớ nhận thức vẫn còn nguyên vẹn.
  },

  // ----------------------------------------------------
  // USER PROFILE & PERMANENT AI DIRECTIVES
  // ----------------------------------------------------

  getUserProfile(userId) {
    if (!userId) return null;
    const data = readDb();
    const user = (data.users || []).find(u => u.id === userId);
    if (!user) return null;
    return user.profile || {
      displayName: user.displayName || user.username || '',
      pronoun: '',
      role: '',
      activeProjects: '',
      techStack: '',
      preferredStyle: '',
      criticalRules: '',
      customNotes: '',
      updatedAt: null
    };
  },

  saveUserProfile(userId, profile) {
    if (!userId) throw new Error('Yêu cầu định danh người dùng.');
    const data = readDb();
    data.users = data.users || [];
    const userIndex = data.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      throw new Error('Không tìm thấy người dùng trong hệ thống.');
    }

    const currentProfile = data.users[userIndex].profile || {};
    const updatedProfile = {
      ...currentProfile,
      displayName: (profile.displayName !== undefined ? profile.displayName : currentProfile.displayName || '').trim(),
      pronoun: (profile.pronoun !== undefined ? profile.pronoun : currentProfile.pronoun || '').trim(),
      role: (profile.role !== undefined ? profile.role : currentProfile.role || '').trim(),
      activeProjects: (profile.activeProjects !== undefined ? profile.activeProjects : currentProfile.activeProjects || '').trim(),
      techStack: (profile.techStack !== undefined ? profile.techStack : currentProfile.techStack || '').trim(),
      preferredStyle: (profile.preferredStyle !== undefined ? profile.preferredStyle : currentProfile.preferredStyle || '').trim(),
      criticalRules: (profile.criticalRules !== undefined ? profile.criticalRules : currentProfile.criticalRules || '').trim(),
      customNotes: (profile.customNotes !== undefined ? profile.customNotes : currentProfile.customNotes || '').trim(),
      updatedAt: new Date().toISOString()
    };

    data.users[userIndex].profile = updatedProfile;
    if (updatedProfile.displayName) {
      data.users[userIndex].displayName = updatedProfile.displayName;
    }

    writeDb(data);
    return updatedProfile;
  },

  formatUserProfileForPrompt(userId) {
    if (!userId) return '';
    const profile = this.getUserProfile(userId);
    if (!profile) return '';

    const lines = [];
    if (profile.displayName) {
      lines.push(`- Tên người dùng / Xưng hô: ${profile.displayName}${profile.pronoun ? ` (Cách xưng hô mong muốn: ${profile.pronoun})` : ''}`);
    }
    if (profile.role) {
      lines.push(`- Nghề nghiệp / Vai trò & Chuyên môn: ${profile.role}`);
    }
    if (profile.activeProjects) {
      lines.push(`- Dự án chính đang làm: ${profile.activeProjects}`);
    }
    if (profile.techStack) {
      lines.push(`- Bộ công nghệ & Ngôn ngữ ưu tiên: ${profile.techStack}`);
    }
    if (profile.preferredStyle) {
      lines.push(`- Phong cách & Định dạng phản hồi mong muốn: ${profile.preferredStyle}`);
    }
    if (profile.criticalRules) {
      lines.push(`- QUY TẮC BẮT BUỘC - TUYỆT ĐỐI KHÔNG ĐƯỢC SAI HOẶC BỎ QUA:\n  ${profile.criticalRules.split('\n').join('\n  ')}`);
    }
    if (profile.customNotes) {
      lines.push(`- Ghi chú cá nhân khác: ${profile.customNotes}`);
    }

    if (lines.length === 0) return '';

    return `\n\n### [THÔNG TIN & QUY TẮC NGƯỜI DÙNG BẮT BUỘC - USER PROFILE DIRECTIVES]\n(Đây là hồ sơ cá nhân và các nguyên tắc bắt buộc do người dùng cấu hình vĩnh viễn trong Cài Đặt. Mọi mô hình AI BẮT BUỘC phải ghi nhớ chính xác và tuân thủ tuyệt đối, không được tự ý thay đổi hoặc làm sai lệch):\n${lines.join('\n')}\n### [HẾT PHẦN HỒ SƠ NGƯỜI DÙNG - HÃY TUÂN THỦ CHÍNH XÁC KHI TRẢ LỜI]\n`;
  },

  // ----------------------------------------------------
  // 12. DỰ ÁN & HỆ THỐNG NHÓM AGENT (TỐI ĐA 5 THÀNH VIÊN)
  // ----------------------------------------------------

  
  // ---------------------------------------------------------------------------
  // 20 CHỨC DANH CHUYÊN MÔN THEO 7 LĨNH VỰC CHUẨN DOANH NGHIỆP
  // ---------------------------------------------------------------------------
  getTwentyRolesList() {
    return [
      // 1. Management & Project Management – Quản lý dự án
      {
        stt: '01',
        category: 'cto',
        name: 'Giám đốc công nghệ',
        roleTitle: 'Chief Technology Officer (CTO)',
        badge: 'CTO',
        domain: 'Management & Project Management',
        desc: 'Định hướng công nghệ, phê duyệt chiến lược và giải pháp kỹ thuật.',
        color: '#6366f1',
        defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '02',
        category: 'pm',
        name: 'Quản lý dự án',
        roleTitle: 'Project Manager (PM)',
        badge: 'PM',
        domain: 'Management & Project Management',
        desc: 'Tiếp nhận dự án, lập kế hoạch, quản lý tiến độ và điều phối nhân sự.',
        color: '#3b82f6',
        defaultModel: 'nvidia/nemotron-3.5-lightning:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '03',
        category: 'ba',
        name: 'Phân tích nghiệp vụ',
        roleTitle: 'Business Analyst (BA)',
        badge: 'BA',
        domain: 'Management & Project Management',
        desc: 'Phân tích yêu cầu, nghiên cứu nghiệp vụ và đặc tả chức năng.',
        color: '#06b6d4',
        defaultModel: 'kilo-auto/free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },

      // 2. Architecture & Technical Leadership – Kiến trúc và chuyên gia kỹ thuật
      {
        stt: '04',
        category: 'solution_architect',
        name: 'Kiến trúc sư giải pháp',
        roleTitle: 'Solution Architect',
        badge: 'SOL-ARCH',
        domain: 'Architecture & Technical Leadership',
        desc: 'Thiết kế kiến trúc tổng thể, lựa chọn công nghệ và định hướng giải pháp.',
        color: '#8b5cf6',
        defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '05',
        category: 'software_architect',
        name: 'Kiến trúc sư phần mềm',
        roleTitle: 'Software Architect',
        badge: 'SOFT-ARCH',
        domain: 'Architecture & Technical Leadership',
        desc: 'Thiết kế cấu trúc phần mềm, Design Patterns, Scalability và Maintainability.',
        color: '#a855f7',
        defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '06',
        category: 'tech_lead',
        name: 'Trưởng nhóm kỹ thuật',
        roleTitle: 'Technical Lead',
        badge: 'TECH-LEAD',
        domain: 'Architecture & Technical Leadership',
        desc: 'Review code, định hướng Developer, xử lý vấn đề kỹ thuật phức tạp.',
        color: '#d946ef',
        defaultModel: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '07',
        category: 'principal_engineer',
        name: 'Chuyên gia kỹ thuật cấp cao',
        roleTitle: 'Principal Software Engineer',
        badge: 'PRINCIPAL',
        domain: 'Architecture & Technical Leadership',
        desc: 'Thẩm định source code, phản biện giải pháp, tối ưu hệ thống và tư vấn kỹ thuật chuyên sâu.',
        color: '#ec4899',
        defaultModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },

      // 3. Software Development – Phát triển phần mềm
      {
        stt: '08',
        category: 'frontend_dev',
        name: 'Lập trình viên Frontend',
        roleTitle: 'Frontend Developer',
        badge: 'FRONTEND',
        domain: 'Software Development',
        desc: 'Phát triển giao diện Web, Responsive, tương tác và tích hợp API.',
        color: '#10b981',
        defaultModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '09',
        category: 'senior_frontend_dev',
        name: 'Lập trình viên Frontend cấp cao',
        roleTitle: 'Senior Frontend Developer',
        badge: 'SR-FRONT',
        domain: 'Software Development',
        desc: 'Xây dựng kiến trúc Frontend, tối ưu hiệu năng và review code giao diện.',
        color: '#059669',
        defaultModel: 'kilo-auto/free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '10',
        category: 'backend_dev',
        name: 'Lập trình viên Backend',
        roleTitle: 'Backend Developer',
        badge: 'BACKEND',
        domain: 'Software Development',
        desc: 'Phát triển API, xử lý nghiệp vụ, Authentication và Server.',
        color: '#0284c7',
        defaultModel: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '11',
        category: 'senior_backend_dev',
        name: 'Lập trình viên Backend cấp cao',
        roleTitle: 'Senior Backend Developer',
        badge: 'SR-BACK',
        domain: 'Software Development',
        desc: 'Thiết kế Backend, tối ưu Database, bảo mật và hiệu năng.',
        color: '#0369a1',
        defaultModel: 'kilo-auto/free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '12',
        category: 'fullstack_dev',
        name: 'Lập trình viên Full-stack',
        roleTitle: 'Full-stack Developer',
        badge: 'FULLSTACK',
        domain: 'Software Development',
        desc: 'Phát triển toàn diện Frontend, Backend và tích hợp hệ thống.',
        color: '#14b8a6',
        defaultModel: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },

      // 4. Mobile & Cross-platform Development – Phát triển ứng dụng di động
      {
        stt: '13',
        category: 'android_dev',
        name: 'Lập trình viên Android',
        roleTitle: 'Android Developer',
        badge: 'ANDROID',
        domain: 'Mobile & Cross-platform Development',
        desc: 'Phát triển ứng dụng Android bằng Kotlin/Java.',
        color: '#84cc16',
        defaultModel: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '14',
        category: 'ios_dev',
        name: 'Lập trình viên iOS',
        roleTitle: 'iOS Developer',
        badge: 'IOS',
        domain: 'Mobile & Cross-platform Development',
        desc: 'Phát triển ứng dụng iOS bằng Swift.',
        color: '#64748b',
        defaultModel: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '15',
        category: 'flutter_dev',
        name: 'Lập trình viên đa nền tảng',
        roleTitle: 'Flutter Developer',
        badge: 'FLUTTER',
        domain: 'Mobile & Cross-platform Development',
        desc: 'Phát triển ứng dụng Android/iOS và đa nền tảng bằng Flutter.',
        color: '#0284c7',
        defaultModel: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },

      // 5. AI & Data Engineering – Trí tuệ nhân tạo và dữ liệu
      {
        stt: '16',
        category: 'ai_ml_engineer',
        name: 'Kỹ sư AI',
        roleTitle: 'AI/ML Engineer',
        badge: 'AI-ML',
        domain: 'AI & Data Engineering',
        desc: 'Phát triển Machine Learning, Deep Learning, Computer Vision và NLP.',
        color: '#f59e0b',
        defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '17',
        category: 'applied_ai_engineer',
        name: 'Kỹ sư AI ứng dụng',
        roleTitle: 'Applied AI / LLM Engineer',
        badge: 'LLM-ENG',
        domain: 'AI & Data Engineering',
        desc: 'Tích hợp LLM, AI Agent, RAG, AI API và tự động hóa quy trình.',
        color: '#eab308',
        defaultModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },

      // 6. Desktop & Game Development – Phát triển Desktop và Game
      {
        stt: '18',
        category: 'desktop_game_dev',
        name: 'Lập trình viên Desktop & Game',
        roleTitle: 'Desktop / Game Developer',
        badge: 'GAME-DEV',
        domain: 'Desktop & Game Development',
        desc: 'Phát triển ứng dụng Windows/macOS, game 2D/3D bằng Unity, Unreal hoặc các framework phù hợp.',
        color: '#e11d48',
        defaultModel: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },

      // 7. Quality Assurance & Infrastructure – Kiểm thử và hạ tầng
      {
        stt: '19',
        category: 'qa_engineer',
        name: 'Kỹ sư kiểm thử',
        roleTitle: 'QA/QC Engineer',
        badge: 'QA-QC',
        domain: 'Quality Assurance & Infrastructure',
        desc: 'Kiểm thử chức năng, API, hiệu năng, tự động hóa test và kiểm soát chất lượng.',
        color: '#f97316',
        defaultModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        stt: '20',
        category: 'devops_security',
        name: 'Kỹ sư hạ tầng và bảo mật',
        roleTitle: 'DevOps & Security Engineer',
        badge: 'DEVOPS-SEC',
        domain: 'Quality Assurance & Infrastructure',
        desc: 'Cloud, Server, Docker, CI/CD, triển khai, giám sát và bảo mật hệ thống.',
        color: '#71717a',
        defaultModel: 'kilo-auto/free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      }
    ];
  },

  getSpecializedCatalog() {
    return {
      coder: {
        category: 'coder',
        roleTitle: 'Lập Trình (Coder / Developer)',
        badge: 'CODER',
        color: '#10b981',
        description: 'Chuyên gia viết mã nguồn, xử lý logic thuật toán, fix bugs, sửa và cập nhật files.',
        defaultModel: 'cohere/north-mini-code:free',
        recommendedModels: [
          { id: 'cohere/north-mini-code:free', name: 'Cohere North Mini Code [FREE OpenRouter]' },
          { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B [FREE Cloudflare]' },
          { id: 'kilo-auto/free', name: 'Flint Coding Agent [FREE OpenRouter]' },
          { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra [FREE OpenRouter]' }
        ],
        systemPrompt: `Bạn là Kỹ Sư Lập Trình Chuyên Sâu (Senior Developer & Code Fixer).
[CHẾ ĐỘ LÀM VIỆC THỰC TẾ - TẮT VÍ DỤ MINH HỌA]:
1. Viết code đầy đủ, hoàn chỉnh, sẵn sàng chạy ngay trên dự án thực tế của người dùng.
2. Luôn ghi rõ tên và đường dẫn file ở dòng đầu tiên của khối code: // File: <đường_dẫn> để hệ thống tự động ghi vào thư mục dự án.
3. Giải quyết triệt để logic và sửa lỗi tận gốc, không viết code dở dang.`
      },
      tester: {
        category: 'tester',
        roleTitle: 'Kiểm Thử (Tester / Terminal Debugger)',
        badge: 'TESTER',
        color: '#f59e0b',
        description: 'Chuyên gia rà soát lỗi logic, kiểm tra trường hợp biên, chạy lệnh terminal PowerShell/CMD để test dự án.',
        defaultModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        recommendedModels: [
          { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'DeepSeek R1 Distill 32B [FREE Cloudflare]' },
          { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'NVIDIA Nemotron 30B Reasoning [FREE OpenRouter]' },
          { id: '@cf/meta/llama-3.1-8b-instruct-fp8-fast', name: 'Llama 3.1 8B Fast [FREE Cloudflare]' }
        ],
        systemPrompt: `Bạn là Kỹ Sư Kiểm Thử & Terminal Debugger (QA & DevOps Engineer).
[CHẾ ĐỘ LÀM VIỆC THỰC TẾ - TẮT VÍ DỤ MINH HỌA]:
1. Rà soát trực tiếp mã nguồn của dự án, kiểm tra lỗi runtime và bảo mật.
2. Cung cấp lệnh Terminal (PowerShell/CMD) chuẩn xác để chạy test trong khối \`\`\`powershell để người dùng bấm 1 nút chạy trực tiếp.
3. Phân tích log lỗi và xác nhận dự án đã sẵn sàng hoạt động.`
      },
      architect: {
        category: 'architect',
        roleTitle: 'Kiến Trúc (Architect / Planner)',
        badge: 'ARCHITECT',
        color: '#3b82f6',
        description: 'Chuyên gia phân tích bài toán, thiết kế kiến trúc hệ thống, chia nhỏ các bước thực hiện và điều phối công việc.',
        defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        recommendedModels: [
          { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra 550B [FREE OpenRouter]' },
          { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Xing4.0 Planning [FREE OpenRouter]' },
          { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B [FREE Cloudflare]' }
        ],
        systemPrompt: `Bạn là Kiến Trúc Sư Hệ Thống (Software Architect & Planner).
Điểm mạnh cốt lõi:
1. Phân tích ý tưởng của Người Dùng.
2. Hoạch định cấu trúc module và danh sách file cần tác động.
3. Chia nhỏ các bước công việc rõ ràng theo thế mạnh của các thành viên trong nhóm.`
      },
      reviewer: {
        category: 'reviewer',
        roleTitle: 'Review & Tối Ưu UI/UX (Reviewer & Quality)',
        badge: 'REVIEWER',
        color: '#8b5cf6',
        description: 'Chuyên gia rà soát tiêu chuẩn clean code, tối ưu giao diện UI/UX và tổng hợp báo cáo hoàn thành.',
        defaultModel: 'nvidia/nemotron-3.5-lightning:free',
        recommendedModels: [
          { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning [FREE OpenRouter]' },
          { id: 'kilo-auto/free', name: 'Liquid LFM [FREE OpenRouter]' },
          { id: '@cf/meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision [FREE Cloudflare]' }
        ],
        systemPrompt: `Bạn là Chuyên Gia Review Mã Nguồn & Tối Ưu UI/UX (Senior Code Reviewer & UX Specialist).
Điểm mạnh cốt lõi:
1. Đánh giá tính thẩm mỹ và tiện ích của giao diện người dùng.
2. Rà soát chuẩn clean code, loại bỏ mã dư thừa.
3. Tổng kết báo cáo hoàn thiện gửi cho Người Dùng.`
      },
      devops: {
        category: 'devops',
        roleTitle: 'DevOps & Môi Trường (DevOps / Terminal)',
        badge: 'DEVOPS',
        color: '#06b6d4',
        description: 'Chuyên gia cấu hình môi trường, script build, git status, cài đặt packages (npm, pip) và terminal.',
        defaultModel: 'kilo-auto/free',
        recommendedModels: [
          { id: 'kilo-auto/free', name: 'Llama 3.2 1B Instruct [FREE Cloudflare]' },
          { id: 'kilo-auto/free', name: 'Flint Coding Agent [FREE OpenRouter]' }
        ],
        systemPrompt: `Bạn là Kỹ Sư DevOps & Hệ Thống (DevOps & Terminal Specialist).
Điểm mạnh cốt lõi:
1. Cấu hình môi trường, script package.json, build và deploy.
2. Xử lý các câu lệnh git, terminal và biến môi trường.`
      },
      database: {
        category: 'database',
        roleTitle: 'Cơ Sở Dữ Liệu (Database & SQL Engineer)',
        badge: 'DATABASE',
        color: '#14b8a6',
        description: 'Chuyên gia thiết kế bảng (Schema), quan hệ dữ liệu, tối ưu truy vấn SQL/NoSQL và migrations.',
        defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        recommendedModels: [
          { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra 550B [FREE OpenRouter]' },
          { id: 'cohere/north-mini-code:free', name: 'Cohere North Mini Code [FREE OpenRouter]' },
          { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B [FREE Cloudflare]' }
        ],
        systemPrompt: `Bạn là Kỹ Sư Cơ Sở Dữ Liệu & SQL (Senior Database Architect & Data Engineer).
[CHẾ ĐỘ LÀM VIỆC THỰC TẾ]:
1. Thiết kế bảng dữ liệu, quan hệ khóa ngoại (ERD), script migrations hoàn chỉnh.
2. Viết câu truy vấn SQL/NoSQL tối ưu, đánh index tránh nghẽn hiệu năng.
3. Luôn ghi rõ tên file ở đầu khối code: // File: <đường_dẫn> để lưu thẳng vào dự án.`
      },
      frontend: {
        category: 'frontend',
        roleTitle: 'Giao Diện & Trải Nghiệm (Frontend / UI Engineer)',
        badge: 'FRONTEND',
        color: '#ec4899',
        description: 'Chuyên gia thiết kế UI/UX hiện đại, responsive CSS, animation mượt mà và component hóa.',
        defaultModel: 'cohere/north-mini-code:free',
        recommendedModels: [
          { id: 'cohere/north-mini-code:free', name: 'Cohere North Mini Code [FREE OpenRouter]' },
          { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning [FREE OpenRouter]' }
        ],
        systemPrompt: `Bạn là Kỹ Sư Giao Diện Người Dùng (Senior Frontend & UI/UX Engineer).
[CHẾ ĐỘ LÀM VIỆC THỰC TẾ]:
1. Thiết kế giao diện hiện đại chuẩn SaaS, responsive 100% trên cả Desktop và Mobile.
2. Viết HTML/CSS/JS sạch, tối ưu hiệu ứng chuyển động và trải nghiệm tương tác.
3. Luôn ghi rõ tên file ở đầu khối code: // File: <đường_dẫn> để lưu thẳng vào dự án.`
      },
      security: {
        category: 'security',
        roleTitle: 'An Ninh & Bảo Mật (Security & Auth Auditor)',
        badge: 'SECURITY',
        color: '#e11d48',
        description: 'Chuyên gia rà soát lỗ hổng bảo mật (OWASP, SQLi, XSS, CSRF), phân quyền JWT/OAuth2 và mã hóa.',
        defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        recommendedModels: [
          { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra 550B [FREE OpenRouter]' },
          { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'DeepSeek R1 Distill 32B [FREE Cloudflare]' }
        ],
        systemPrompt: `Bạn là Chuyên Gia An Ninh & Kiểm Toán Bảo Mật (Application Security Specialist & Auth Engineer).
[CHẾ ĐỘ LÀM VIỆC THỰC TẾ]:
1. Rà soát triệt để các lỗ hổng bảo mật (SQL Injection, XSS, CSRF, Token Leak).
2. Thiết lập cơ chế xác thực JWT, mã hóa mật khẩu và phân quyền an toàn.
3. Cung cấp giải pháp vá lỗi cụ thể kèm mã nguồn sẵn sàng chạy.`
      }
    };
  },

  getProjects(userId = null) {
    const data = readDb();
    data.projects = data.projects || [];

    // Đảm bảo cấu trúc teams có mặt ở các dự án hiện có
    let modified = false;
    data.projects.forEach(p => {
      if (!p.teams) {
        const defaultTeamId = 'team_' + crypto.randomBytes(4).toString('hex');
        p.teams = [
          {
            id: defaultTeamId,
            name: 'Nhóm Lập Trình & Kiểm Thử',
            description: 'Nhóm AI chuyên phân tích, viết code và kiểm tra lỗi.',
            members: [
              {
                id: 'mem_1',
                name: 'Kiến Trúc Sư',
                category: 'architect',
                roleTitle: 'Kiến Trúc Hệ Thống',
                badge: 'ARCHITECT',
                color: '#3b82f6',
                model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
                providerId: 'prov_kilo_gateway',
                systemPrompt: this.getSpecializedCatalog().architect.systemPrompt
              },
              {
                id: 'mem_2',
                name: 'Lập Trình Viên',
                category: 'coder',
                roleTitle: 'Lập Trình Fullstack',
                badge: 'CODER',
                color: '#10b981',
                model: 'cohere/north-mini-code:free',
                providerId: 'prov_kilo_gateway',
                systemPrompt: this.getSpecializedCatalog().coder.systemPrompt
              },
              {
                id: 'mem_3',
                name: 'Kỹ Sư Kiểm Thử',
                category: 'tester',
                roleTitle: 'Kiểm Thử & Terminal',
                badge: 'TESTER',
                color: '#f59e0b',
                model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
                providerId: 'prov_kilo_gateway',
                systemPrompt: this.getSpecializedCatalog().tester.systemPrompt
              }
            ]
          }
        ];
        modified = true;
      }
    });

    if (data.projects.length === 0) {
      const defaultWorkspacePath = path.resolve(__dirname, '..');
      const defaultTeamId = 'team_' + crypto.randomBytes(4).toString('hex');
      const defaultProject = {
        id: 'proj_' + crypto.randomBytes(6).toString('hex'),
        userId: userId || null,
        name: 'VinceZone Workspace',
        path: defaultWorkspacePath,
        description: 'Dự án chính đang mở trên máy tính. Hỗ trợ chạy terminal, sửa mã nguồn và điều phối nhóm Agent.',
        teams: [
          {
            id: defaultTeamId,
            name: 'Nhóm Lập Trình & Kiểm Thử',
            description: 'Nhóm AI chuyên phân tích, viết code và kiểm tra lỗi.',
            members: [
              {
                id: 'mem_1',
                name: 'Kiến Trúc Sư',
                category: 'architect',
                roleTitle: 'Kiến Trúc Hệ Thống',
                badge: 'ARCHITECT',
                color: '#3b82f6',
                model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
                providerId: 'prov_kilo_gateway',
                systemPrompt: this.getSpecializedCatalog().architect.systemPrompt
              },
              {
                id: 'mem_2',
                name: 'Lập Trình Viên',
                category: 'coder',
                roleTitle: 'Lập Trình Fullstack',
                badge: 'CODER',
                color: '#10b981',
                model: 'cohere/north-mini-code:free',
                providerId: 'prov_kilo_gateway',
                systemPrompt: this.getSpecializedCatalog().coder.systemPrompt
              },
              {
                id: 'mem_3',
                name: 'Kỹ Sư Kiểm Thử',
                category: 'tester',
                roleTitle: 'Kiểm Thử & Terminal',
                badge: 'TESTER',
                color: '#f59e0b',
                model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
                providerId: 'prov_kilo_gateway',
                systemPrompt: this.getSpecializedCatalog().tester.systemPrompt
              }
            ]
          }
        ],
        chats: [
          {
            id: 'chat_' + crypto.randomBytes(6).toString('hex'),
            title: 'Hội đồng Code & Fix lỗi',
            type: 'team',
            teamId: defaultTeamId,
            model: 'cohere/north-mini-code:free',
            providerId: 'prov_kilo_gateway',
            createdAt: new Date().toISOString(),
            messages: []
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.projects.push(defaultProject);
      modified = true;
    }

    if (modified) writeDb(data);

    if (userId) {
      return data.projects.filter(p => !p.userId || p.userId === userId);
    }
    return data.projects;
  },

  getProjectById(projectId) {
    if (!projectId) return null;
    const projects = this.getProjects();
    return projects.find(p => p.id === projectId) || null;
  },

  createProject({ name, path: projectPath, description, userId = null }) {
    if (!name || !name.trim()) {
      throw new Error('Tên dự án không được để trống.');
    }
    const data = readDb();
    data.projects = data.projects || [];

    const defaultTeamId = 'team_' + crypto.randomBytes(4).toString('hex');
    const newProject = {
      id: 'proj_' + crypto.randomBytes(6).toString('hex'),
      userId: userId || null,
      name: name.trim(),
      path: (projectPath || '').trim() || path.resolve(__dirname, '..'),
      description: (description || '').trim() || 'Dự án lập trình với AI Agent.',
      teams: [
        {
          id: defaultTeamId,
          name: 'Nhóm Lập Trình & Kiểm Thử',
          description: 'Nhóm AI chuyên xử lý code và kiểm thử.',
          members: [
            {
              id: 'mem_1',
              name: 'Lập Trình Viên',
              category: 'coder',
              roleTitle: 'Lập Trình Fullstack',
              badge: 'CODER',
              color: '#10b981',
              model: 'cohere/north-mini-code:free',
              providerId: 'prov_kilo_gateway',
              systemPrompt: this.getSpecializedCatalog().coder.systemPrompt
            },
            {
              id: 'mem_2',
              name: 'Kỹ Sư Kiểm Thử',
              category: 'tester',
              roleTitle: 'Kiểm Thử & Terminal',
              badge: 'TESTER',
              color: '#f59e0b',
              model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
              providerId: 'prov_kilo_gateway',
              systemPrompt: this.getSpecializedCatalog().tester.systemPrompt
            }
          ]
        }
      ],
      chats: [
        {
          id: 'chat_' + crypto.randomBytes(6).toString('hex'),
          title: 'Đoạn chat đầu tiên',
          type: 'team',
          teamId: defaultTeamId,
          model: 'cohere/north-mini-code:free',
          providerId: 'prov_kilo_gateway',
          createdAt: new Date().toISOString(),
          messages: []
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.projects.unshift(newProject);
    writeDb(data);
    return newProject;
  },

  updateProject(projectId, updateData) {
    const data = readDb();
    data.projects = data.projects || [];
    const index = data.projects.findIndex(p => p.id === projectId);
    if (index === -1) throw new Error('Không tìm thấy dự án.');

    const current = data.projects[index];
    data.projects[index] = {
      ...current,
      name: updateData.name !== undefined ? updateData.name.trim() : current.name,
      path: updateData.path !== undefined ? updateData.path.trim() : current.path,
      description: updateData.description !== undefined ? updateData.description.trim() : current.description,
      updatedAt: new Date().toISOString()
    };

    writeDb(data);
    return data.projects[index];
  },

  deleteProject(projectId) {
    const data = readDb();
    data.projects = data.projects || [];
    data.projects = data.projects.filter(p => p.id !== projectId);
    writeDb(data);
    return true;
  },

  // --- QUẢN LÝ NHÓM AGENT (TEAMS) ---

  createProjectTeam(projectId, { name, description }) {
    if (!name || !name.trim()) throw new Error('Tên nhóm không được để trống.');
    const data = readDb();
    data.projects = data.projects || [];
    const p = data.projects.find(x => x.id === projectId);
    if (!p) throw new Error('Không tìm thấy dự án.');

    p.teams = p.teams || [];
    const newTeam = {
      id: 'team_' + crypto.randomBytes(4).toString('hex'),
      name: name.trim(),
      description: (description || '').trim() || 'Nhóm AI Agent làm việc.',
      members: [] // Người dùng tự thêm tối đa 5 thành viên
    };

    p.teams.push(newTeam);
    p.updatedAt = new Date().toISOString();
    writeDb(data);
    return newTeam;
  },

  deleteProjectTeam(projectId, teamId) {
    const data = readDb();
    data.projects = data.projects || [];
    const p = data.projects.find(x => x.id === projectId);
    if (!p) throw new Error('Không tìm thấy dự án.');

    p.teams = (p.teams || []).filter(t => t.id !== teamId);
    p.updatedAt = new Date().toISOString();
    writeDb(data);
    return true;
  },

  addTeamMember(projectId, teamId, { name, category, model }) {
    const data = readDb();
    data.projects = data.projects || [];
    const p = data.projects.find(x => x.id === projectId);
    if (!p) throw new Error('Không tìm thấy dự án.');

    const team = (p.teams || []).find(t => t.id === teamId);
    if (!team) throw new Error('Không tìm thấy nhóm trong dự án.');

    team.members = team.members || [];
    if (team.members.length >= 5) {
      throw new Error('Mỗi nhóm tối đa nhiều nhất 5 agent. Vui lòng xóa bớt thành viên trước khi thêm mới.');
    }

    const catalog = this.getSpecializedCatalog();
    const roleConfig = catalog[category] || catalog.coder;

    const newMember = {
      id: 'mem_' + crypto.randomBytes(4).toString('hex'),
      name: (name || '').trim() || roleConfig.roleTitle.split('(')[0].trim(),
      category: roleConfig.category,
      roleTitle: roleConfig.roleTitle,
      badge: roleConfig.badge,
      color: roleConfig.color,
      model: model || roleConfig.defaultModel,
      systemPrompt: roleConfig.systemPrompt
    };

    team.members.push(newMember);
    p.updatedAt = new Date().toISOString();
    writeDb(data);
    return newMember;
  },

  removeTeamMember(projectId, teamId, memberId) {
    const data = readDb();
    data.projects = data.projects || [];
    const p = data.projects.find(x => x.id === projectId);
    if (!p) throw new Error('Không tìm thấy dự án.');

    const team = (p.teams || []).find(t => t.id === teamId);
    if (!team) throw new Error('Không tìm thấy nhóm.');

    team.members = (team.members || []).filter(m => m.id !== memberId);
    p.updatedAt = new Date().toISOString();
    writeDb(data);
    return true;
  },

  // --- QUẢN LÝ ĐOẠN CHAT TRONG DỰ ÁN ---

  getProjectChats(projectId) {
    const project = this.getProjectById(projectId);
    if (!project) return [];
    return project.chats || [];
  },

  getProjectChat(projectId, chatId) {
    const project = this.getProjectById(projectId);
    if (!project) return null;
    return (project.chats || []).find(c => c.id === chatId) || null;
  },

  createProjectChat(projectId, { title, model = 'kilo-auto/free', agents = [] }) {
    const data = readDb();
    data.projects = data.projects || [];
    const index = data.projects.findIndex(p => p.id === projectId);
    if (index === -1) throw new Error('Không tìm thấy dự án.');

    const newChat = {
      id: 'chat_' + crypto.randomBytes(6).toString('hex'),
      title: (title || '').trim() || 'Đoạn chat mới',
      model: model || 'kilo-auto/free',
      agents: Array.isArray(agents) ? agents : [],
      createdAt: new Date().toISOString(),
      messages: []
    };

    data.projects[index].chats = data.projects[index].chats || [];
    data.projects[index].chats.unshift(newChat);
    data.projects[index].updatedAt = new Date().toISOString();
    writeDb(data);
    return newChat;
  },

  getBestModelForRoleAndProvider(category, providerId) {
    const matrix = {
      coder: {
        prov_openrouter: 'cohere/north-mini-code:free',
        prov_cloudflare_ai: '@cf/meta/llama-3.2-3b-instruct',
        prov_kilo_gateway: 'cohere/north-mini-code:free',
        prov_opencode: 'deepseek-v4.1-flash-free'
      },
      tester: {
        prov_cloudflare_ai: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        prov_openrouter: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        prov_kilo_gateway: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        prov_opencode: 'nemotron-3.5-lightning-free'
      },
      architect: {
        prov_openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        prov_kilo_gateway: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        prov_cloudflare_ai: '@cf/meta/llama-3.2-3b-instruct',
        prov_opencode: 'mimo-v2.6-flash-free'
      },
      database: {
        prov_opencode: 'kilo-auto/free',
        prov_openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        prov_kilo_gateway: 'poolside/laguna-s-2.1:free',
        prov_cloudflare_ai: '@cf/meta/llama-3.2-3b-instruct'
      },
      frontend: {
        prov_opencode: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        prov_cloudflare_ai: '@cf/meta/llama-3.2-11b-vision-instruct',
        prov_openrouter: 'nvidia/nemotron-3.5-lightning:free',
        prov_kilo_gateway: 'kilo-auto/free'
      },
      security: {
        prov_cloudflare_ai: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
        prov_openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        prov_kilo_gateway: 'dots-studio/dots-3-note-preview:free',
        prov_opencode: 'flint-40b-free'
      },
      devops: {
        prov_cloudflare_ai: 'kilo-auto/free',
        prov_openrouter: 'kilo-auto/free',
        prov_kilo_gateway: 'poolside/laguna-s-2.1:free',
        prov_opencode: 'beam-free'
      },
      reviewer: {
        prov_openrouter: 'nvidia/nemotron-3.5-lightning:free',
        prov_cloudflare_ai: '@cf/meta/llama-3.2-11b-vision-instruct',
        prov_kilo_gateway: 'kilo-auto/free',
        prov_opencode: 'big-pickle'
      }
    };
    return matrix[category]?.[providerId] || null;
  },

  addAgentToChat(projectId, chatId, { category, model, name, providerId, providerName }) {
    const data = readDb();
    data.projects = data.projects || [];
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');

    const chat = (proj.chats || []).find(c => c.id === chatId);
    if (!chat) throw new Error('Không tìm thấy đoạn chat trong dự án.');

    chat.agents = chat.agents || [];
    // No limit on agents count

    const catalog = this.getSpecializedCatalog();
    const roleConfig = catalog[category] || catalog.coder;

    // Tự động chọn Model tối ưu theo vai trò và nhà cung cấp nếu chưa chỉ định rõ
    let finalModel = model;
    if (!finalModel) {
      if (providerId) {
        finalModel = this.getBestModelForRoleAndProvider(roleConfig.category, providerId) || roleConfig.defaultModel;
      } else {
        finalModel = roleConfig.defaultModel;
      }
    }

    // Tự động gán Provider tương ứng chuẩn xác theo Model từ 4 Provider
    let finalProvId = providerId;
    let finalProvName = providerName;
    if (!finalProvId) {
      if (finalModel.startsWith('@cf/')) {
        finalProvId = 'prov_cloudflare_ai';
        finalProvName = 'Cloudflare Workers AI';
      } else if (finalModel.includes('-free') || finalModel === 'big-pickle' || finalModel === 'beam-free') {
        finalProvId = 'prov_opencode';
        finalProvName = 'OpenCode';
      } else if (finalModel.includes('kilo') || finalModel.includes('laguna') || finalModel.includes('dots')) {
        finalProvId = 'prov_kilo_gateway';
        finalProvName = 'Kilo Gateway';
      } else {
        finalProvId = 'prov_kilo_gateway';
        finalProvName = 'Kilo Gateway';
      }
    } else if (!finalProvName) {
      const pMap = {
        prov_openrouter: 'OpenRouter',
        prov_cloudflare_ai: 'Cloudflare Workers AI',
        prov_kilo_gateway: 'Kilo Gateway',
        prov_opencode: 'OpenCode'
      };
      finalProvName = pMap[finalProvId] || 'Provider';
    }

    const newAgent = {
      id: 'ag_' + crypto.randomBytes(4).toString('hex'),
      category: roleConfig.category,
      roleTitle: roleConfig.roleTitle,
      name: (name || '').trim() || roleConfig.roleTitle.split('(')[0].trim(),
      badge: roleConfig.badge,
      color: roleConfig.color,
      providerId: finalProvId,
      providerName: finalProvName,
      model: finalModel,
      systemPrompt: roleConfig.systemPrompt
    };

    chat.agents.push(newAgent);
    proj.updatedAt = new Date().toISOString();
    writeDb(data);
    return newAgent;
  },

  // Tự động thêm trọn bộ Agent dựa vào 4 Provider: OpenRouter, Cloudflare, Kilo, OpenCode
  autoSetupAgentsForChat(projectId, chatId) {
    const data = readDb();
    data.projects = data.projects || [];
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');

    const chat = (proj.chats || []).find(c => c.id === chatId);
    if (!chat) throw new Error('Không tìm thấy đoạn chat trong dự án.');

    chat.agents = chat.agents || [];
    const catalog = this.getSpecializedCatalog();

    // Đội ngũ 5 Agent tinh nhuệ từ 4 Provider (OpenRouter, Cloudflare, Kilo, OpenCode)
    const dreamTeam = [
      {
        category: 'architect',
        name: 'Kiến Trúc Sư',
        badge: 'ARCHITECT',
        color: '#3b82f6',
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        category: 'coder',
        name: 'Lập Trình Viên',
        badge: 'CODER',
        color: '#10b981',
        model: 'cohere/north-mini-code:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        category: 'tester',
        name: 'Kỹ Sư Kiểm Thử',
        badge: 'TESTER',
        color: '#f59e0b',
        model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        category: 'database',
        name: 'Kỹ Sư CSDL & SQL',
        badge: 'DATABASE',
        color: '#14b8a6',
        model: 'kilo-auto/free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      },
      {
        category: 'frontend',
        name: 'Kỹ Sư Frontend UI/UX',
        badge: 'FRONTEND',
        color: '#ec4899',
        model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        providerId: 'prov_kilo_gateway',
        providerName: 'Kilo Gateway'
      }
    ];

    dreamTeam.forEach(member => {
      const alreadyHas = chat.agents.some(a => a.category === member.category);
      if (!alreadyHas && true) {
        const roleConfig = catalog[member.category] || catalog.coder;
        chat.agents.push({
          id: 'ag_' + crypto.randomBytes(4).toString('hex'),
          category: member.category,
          roleTitle: roleConfig.roleTitle,
          name: member.name,
          badge: member.badge,
          color: member.color,
          model: member.model,
          providerId: member.providerId,
          providerName: member.providerName,
          systemPrompt: roleConfig.systemPrompt
        });
      }
    });

    proj.updatedAt = new Date().toISOString();
    writeDb(data);
    return chat.agents;
  },

  // Phân tích dự án & ý tưởng để cơ cấu và bổ nhiệm các AI Agent phù hợp
  // Phân tích dự án & ý tưởng để cơ cấu và bổ nhiệm các AI Agent phù hợp theo 20 vị trí
  analyzeAndSetupAgentsForChat(projectId, chatId, userIdea = '') {
    const data = readDb();
    data.projects = data.projects || [];
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');

    const chat = (proj.chats || []).find(c => c.id === chatId);
    if (!chat) throw new Error('Không tìm thấy đoạn chat trong dự án.');

    chat.agents = chat.agents || [];
    const rolesList = this.getTwentyRolesList();
    const roleMap = {};
    rolesList.forEach(r => { roleMap[r.category] = r; });

    // 1. Phân tích ngữ cảnh dự án từ các file thực tế và ý tưởng người dùng
    const filesList = [];
    if (proj.path && fs.existsSync(proj.path)) {
      try {
        const entries = fs.readdirSync(proj.path, { withFileTypes: true });
        entries.forEach(e => {
          if (!e.name.startsWith('.') && e.name !== 'node_modules') {
            filesList.push(e.name);
          }
        });
      } catch (err) {}
    } else if (Array.isArray(proj.files)) {
      proj.files.forEach(f => filesList.push(f.name || f.path || ''));
    }

    const filesStr = filesList.join(' ').toLowerCase();
    const ideaStr = (userIdea || '').toLowerCase();
    const combinedContext = filesStr + ' ' + ideaStr;

    // QUY TẮC NHẬN DIỆN CHẶT CHẼ THEO YÊU CẦU:
    // 1. Mobile: Chỉ thêm khi có từ khóa hoặc file mobile, tuyệt đối không thêm nếu không có!
    const hasMobile = /(?:mobile|android|ios|flutter|react[-\s]?native|di động|app điện thoại|apk|ipa|swift|kotlin|expo)/i.test(combinedContext) ||
      filesStr.includes('android') || filesStr.includes('ios') || filesStr.includes('flutter') || filesStr.includes('pubspec.yaml');

    // 2. AI: Nếu phát hiện có AI thì PHẢI thêm dev AI (ngay từ đầu hoặc bổ sung về sau)
    const hasAI = /(?:ai|llm|machine learning|deep learning|rag|langchain|openai|gemini|claude|agent|trí tuệ nhân tạo|chatbot|embedding|pytorch|tensorflow|nlp|vision|ollama|mô hình ai)/i.test(combinedContext) ||
      filesStr.includes('ai') || filesStr.includes('model') || filesStr.includes('llm') || filesStr.includes('langchain');

    // 3. Desktop / Game:
    const hasDesktopGame = /(?:game|desktop|electron|tauri|unity|unreal|godot|2d|3d|pygame|windows app|game developer)/i.test(combinedContext);

    // 4. Web Frontend & UI:
    const hasFrontend = /(?:frontend|giao diện|ui|ux|web|html|css|react|vue|tailwind|responsive|layout|client)/i.test(combinedContext) ||
      filesStr.includes('index.html') || filesStr.includes('vite.config') || filesStr.includes('public') || filesStr.includes('src/components');

    // 5. Backend & Server & DB:
    const hasBackend = /(?:backend|api|server|database|csdl|sql|sqlite|postgres|mongo|prisma|auth|jwt|express|fastapi|django|nest)/i.test(combinedContext) ||
      filesStr.includes('server.js') || filesStr.includes('package.json') || filesStr.includes('api');

    // Lựa chọn các vai trò phù hợp:
    const selectedRoles = [];

    // Luôn cần Quản lý & Kiến trúc định hướng:
    selectedRoles.push('pm'); // Project Manager
    selectedRoles.push('software_architect'); // Software Architect

    // Frontend:
    if (hasFrontend) {
      selectedRoles.push('frontend_dev');
      selectedRoles.push('senior_frontend_dev');
    }

    // Backend / Fullstack:
    if (hasBackend) {
      selectedRoles.push('backend_dev');
      selectedRoles.push('senior_backend_dev');
    } else {
      selectedRoles.push('fullstack_dev');
    }

    // ĐIỀU KIỆN MOBILE (CHẶT CHẼ):
    if (hasMobile) {
      if (/flutter/i.test(combinedContext)) {
        selectedRoles.push('flutter_dev');
      } else if (/ios|swift/i.test(combinedContext)) {
        selectedRoles.push('ios_dev');
      } else if (/android|kotlin|java/i.test(combinedContext)) {
        selectedRoles.push('android_dev');
      } else {
        selectedRoles.push('flutter_dev'); // Đa nền tảng mặc định
      }
    }

    // ĐIỀU KIỆN AI (PHẢI THÊM NẾU PHÁT HIỆN):
    if (hasAI) {
      selectedRoles.push('applied_ai_engineer'); // Applied AI / LLM Engineer
      if (/machine learning|deep learning|vision|nlp|train/i.test(combinedContext)) {
        selectedRoles.push('ai_ml_engineer');
      }
    }

    // ĐIỀU KIỆN DESKTOP & GAME:
    if (hasDesktopGame) {
      selectedRoles.push('desktop_game_dev');
    }

    // Luôn cần QA và DevOps/Security đảm bảo vận hành:
    selectedRoles.push('qa_engineer');
    selectedRoles.push('devops_security');

    // Thêm các Agent vào danh sách (cho phép trùng vai trò nhưng khác Agent id/tên, không giới hạn 5 người):
    const newlyAdded = [];
    selectedRoles.forEach(roleKey => {
      const blueprint = roleMap[roleKey];
      if (!blueprint) return;

      // Kiểm tra xem vị trí này đã có agent chưa
      const existingSameRoleCount = chat.agents.filter(a => a.category === roleKey).length;
      
      // Nếu vị trí chưa có hoặc cần thêm thành viên hỗ trợ (cho phép trùng vị trí nhưng khác tên agent):
      if (existingSameRoleCount === 0 || (existingSameRoleCount < 2 && (roleKey === 'frontend_dev' || roleKey === 'backend_dev'))) {
        const agentSuffix = existingSameRoleCount > 0 ? ` #${existingSameRoleCount + 1}` : '';
        const newAg = {
          id: 'ag_' + crypto.randomBytes(4).toString('hex'),
          category: blueprint.category,
          roleTitle: blueprint.roleTitle,
          name: blueprint.name + agentSuffix,
          badge: blueprint.badge,
          domain: blueprint.domain,
          color: blueprint.color,
          model: blueprint.defaultModel,
          providerId: blueprint.providerId,
          providerName: blueprint.providerName,
          responsibility: blueprint.desc,
          systemPrompt: `Bạn là ${blueprint.name} (${blueprint.roleTitle}) thuộc nhóm ${blueprint.domain}.
Trách nhiệm chính của bạn: ${blueprint.desc}
[NGUYÊN TẮC LÀM VIỆC]:
1. Thực hiện đúng vai trò chuyên môn của mình trong dự án.
2. Viết mã nguồn hoàn chỉnh, chính xác, sạch đẹp và tương thích.
3. Khi chỉnh sửa hoặc viết file, luôn ghi rõ: // File: <đường_dẫn_tệp> ở đầu code block.`
        };
        chat.agents.push(newAg);
        newlyAdded.push(newAg);
      }
    });

    proj.updatedAt = new Date().toISOString();
    writeDb(data);

    const detectedDomains = [];
    if (hasMobile) detectedDomains.push('Mobile App');
    if (hasAI) detectedDomains.push('AI / LLM Engineering');
    if (hasDesktopGame) detectedDomains.push('Desktop / Game');
    if (hasFrontend) detectedDomains.push('Frontend Web');
    if (hasBackend) detectedDomains.push('Backend & Cloud');

    const analysisReport = {
      projectType: detectedDomains.length > 0 ? detectedDomains.join(' + ') : 'Phần Mềm Đa Năng',
      hasMobile,
      hasAI,
      totalAgents: chat.agents.length,
      allocatedCount: newlyAdded.length,
      agents: chat.agents,
      newlyAdded
    };

    return { success: true, agents: chat.agents, analysisReport };
  },

  removeAgentFromChat(projectId, chatId, agentId) {
    const data = readDb();
    data.projects = data.projects || [];
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');

    const chat = (proj.chats || []).find(c => c.id === chatId);
    if (!chat) throw new Error('Không tìm thấy đoạn chat trong dự án.');

    chat.agents = (chat.agents || []).filter(a => a.id !== agentId);
    proj.updatedAt = new Date().toISOString();
    writeDb(data);
    return true;
  },

  updateProjectChatModel(projectId, chatId, model, providerId) {
    const data = readDb();
    data.projects = data.projects || [];
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');

    const chat = (proj.chats || []).find(c => c.id === chatId);
    if (!chat) throw new Error('Không tìm thấy đoạn chat trong dự án.');

    if (model) chat.model = model;
    if (providerId) chat.providerId = providerId;
    proj.updatedAt = new Date().toISOString();
    writeDb(data);
    return true;
  },

  deleteProjectChat(projectId, chatId) {
    const data = readDb();
    data.projects = data.projects || [];
    const index = data.projects.findIndex(p => p.id === projectId);
    if (index === -1) throw new Error('Không tìm thấy dự án.');

    data.projects[index].chats = (data.projects[index].chats || []).filter(c => c.id !== chatId);
    data.projects[index].updatedAt = new Date().toISOString();
    writeDb(data);
    return true;
  },

  saveProjectChatMessage(projectId, chatId, message) {
    const data = readDb();
    data.projects = data.projects || [];
    const projIdx = data.projects.findIndex(p => p.id === projectId);
    if (projIdx === -1) throw new Error('Không tìm thấy dự án.');

    const chatIdx = (data.projects[projIdx].chats || []).findIndex(c => c.id === chatId);
    if (chatIdx === -1) throw new Error('Không tìm thấy cuộc trò chuyện trong dự án.');

    let cleanContent = message.content || '';
    if (message.role === 'assistant') {
      cleanContent = cleanContent.replace(/^(?:\[[^\]\r\n]+\]:\s*)+/g, '').trim();
    }

    const msgWithMeta = {
      id: 'msg_' + crypto.randomBytes(6).toString('hex'),
      role: message.role || 'assistant',
      author: message.author || (message.role === 'user' ? 'Người Dùng' : 'AI'),
      agentId: message.agentId || null,
      agentBadge: message.agentBadge || null,
      agentColor: message.agentColor || null,
      agentModel: message.agentModel || null,
      agentRole: message.agentRole || null,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      autoSavedFiles: Array.isArray(message.autoSavedFiles) ? message.autoSavedFiles : [],
      content: cleanContent,
      timestamp: new Date().toISOString()
    };

    data.projects[projIdx].chats[chatIdx].messages.push(msgWithMeta);
    data.projects[projIdx].updatedAt = new Date().toISOString();
    writeDb(data);
    return msgWithMeta;
  },

  clearProjectChatMessages(projectId, chatId) {
    const data = readDb();
    data.projects = data.projects || [];
    const projIdx = data.projects.findIndex(p => p.id === projectId);
    if (projIdx === -1) throw new Error('Không tìm thấy dự án.');

    const chatIdx = (data.projects[projIdx].chats || []).findIndex(c => c.id === chatId);
    if (chatIdx === -1) throw new Error('Không tìm thấy cuộc trò chuyện trong dự án.');

    data.projects[projIdx].chats[chatIdx].messages = [];
    data.projects[projIdx].updatedAt = new Date().toISOString();
    writeDb(data);
    return true;
  }
,

  getDepartmentCatalog() {
    return [
      {
        key: 'frontend',
        title: '🏢 Phòng Giao Diện: Frontend & UI',
        domain: 'Software Development',
        primaryRole: 'frontend_dev',
        seniorRole: 'senior_frontend_dev',
        keywords: ['frontend', 'giao diện', 'ui', 'ux', 'html', 'css', 'react', 'vue', 'tailwind', 'style', 'layout', 'responsive', 'màu', 'nút', 'button', 'menu', 'header', 'footer', 'modal', 'trang', 'view', 'dashboard', 'theme', 'client', 'màn hình', 'font', 'icon']
      },
      {
        key: 'backend',
        title: '🏢 Phòng Kỹ Thuật: Backend & Dữ Liệu',
        domain: 'Software Development',
        primaryRole: 'backend_dev',
        seniorRole: 'senior_backend_dev',
        keywords: ['backend', 'api', 'server', 'database', 'csdl', 'sql', 'sqlite', 'postgres', 'mongo', 'prisma', 'auth', 'jwt', 'express', 'endpoint', 'route', 'controller', 'service', 'dữ liệu', 'bảng', 'crud', 'đăng nhập', 'token', 'query', 'migration']
      },
      {
        key: 'mobile',
        title: '🏢 Phòng Ứng Dụng Di Động: Mobile & Cross-Platform',
        domain: 'Mobile & Cross-platform Development',
        primaryRole: 'flutter_dev',
        seniorRole: 'flutter_dev',
        keywords: ['mobile', 'android', 'ios', 'flutter', 'react native', 'di động', 'app điện thoại', 'apk', 'ipa', 'swift', 'kotlin', 'expo']
      },
      {
        key: 'ai',
        title: '🏢 Phòng Trí Tuệ Nhân Tạo: AI & LLM',
        domain: 'AI & Data Engineering',
        primaryRole: 'applied_ai_engineer',
        seniorRole: 'ai_ml_engineer',
        keywords: ['ai', 'llm', 'machine learning', 'deep learning', 'rag', 'langchain', 'openai', 'gemini', 'claude', 'agent', 'trí tuệ nhân tạo', 'chatbot', 'embedding', 'ollama', 'mô hình ai', 'prompt engineering']
      },
      {
        key: 'desktop_game',
        title: '🏢 Phòng Ứng Dụng: Desktop & Game',
        domain: 'Desktop & Game Development',
        primaryRole: 'desktop_game_dev',
        seniorRole: 'desktop_game_dev',
        keywords: ['game', 'desktop', 'electron', 'tauri', 'unity', 'unreal', 'godot', '2d', '3d', 'pygame', 'windows app', 'macos app']
      },
      {
        key: 'qa',
        title: '🏢 Phòng Đảm Bảo Chất Lượng: Kiểm Thử & QA/QC',
        domain: 'Quality Assurance & Infrastructure',
        primaryRole: 'qa_engineer',
        seniorRole: 'qa_engineer',
        keywords: ['test', 'kiểm thử', 'qa', 'qc', 'unit test', 'e2e', 'bug', 'lỗi', 'rà soát lỗi', 'kiểm tra lỗi', 'fix bug']
      },
      {
        key: 'devops',
        title: '🏢 Phòng Hạ Tầng: DevOps & Bảo Mật',
        domain: 'Quality Assurance & Infrastructure',
        primaryRole: 'devops_security',
        seniorRole: 'devops_security',
        keywords: ['devops', 'docker', 'ci/cd', 'deploy', 'triển khai', 'bảo mật', 'security', 'nginx', 'ssl', 'cấu hình server']
      },
      {
        key: 'architecture',
        title: '🏢 Phòng Kiến Trúc Giải Pháp & CTO',
        domain: 'Architecture & Technical Leadership',
        primaryRole: 'software_architect',
        seniorRole: 'solution_architect',
        keywords: ['kiến trúc', 'architect', 'cto', 'solution', 'thiết kế hệ thống', 'design pattern', 'scale', 'mở rộng', 'định hướng công nghệ']
      },
      {
        key: 'fullstack',
        title: '🏢 Phòng Phát Triển Phần Mềm: Fullstack',
        domain: 'Software Development',
        primaryRole: 'fullstack_dev',
        seniorRole: 'senior_backend_dev',
        keywords: ['fullstack', 'toàn diện', 'web app', 'chức năng', 'tính năng', 'sửa code', 'viết code', 'phát triển']
      }
    ];
  },

  matchDepartmentForTask(content = '', projectContext = '') {
    const departments = this.getDepartmentCatalog();
    const contentLower = (content || '').toLowerCase();

    // 1. Mobile check: ONLY if user explicitly mentions mobile in the request
    if (/(?:mobile|android|ios|flutter|react[-\s]?native|di động|app điện thoại|apk|ipa|swift|kotlin|expo)/i.test(contentLower)) {
      const mobDept = departments.find(d => d.key === 'mobile');
      if (mobDept) return mobDept;
    }

    // 2. AI check: If user mentions AI or LLM
    if (/(?:ai|llm|machine learning|deep learning|rag|langchain|openai|gemini|claude|agent|trí tuệ nhân tạo|chatbot|embedding|ollama|mô hình ai|prompt|affiliate|skills)/i.test(contentLower)) {
      const aiDept = departments.find(d => d.key === 'ai');
      if (aiDept) return aiDept;
    }

    // 3. Desktop / Game: ONLY if user explicitly mentions Game or Desktop app
    if (/(?:game|trò chơi|unity|unreal|godot|pygame|game dev|chơi game)/i.test(contentLower)) {
      const gameDept = departments.find(d => d.key === 'desktop_game');
      if (gameDept) return gameDept;
    }

    // 4. DevOps / Security:
    if (/(?:devops|docker|ci\/cd|deploy|triển khai|bảo mật|security|nginx|ssl|dockerfile|server config)/i.test(contentLower)) {
      const devopsDept = departments.find(d => d.key === 'devops');
      if (devopsDept) return devopsDept;
    }

    // 5. QA / Testing:
    if (/(?:kiểm thử|test|qa|qc|unit test|e2e|bug|bắt lỗi|kiểm tra mã|rà soát lỗi)/i.test(contentLower)) {
      const qaDept = departments.find(d => d.key === 'qa');
      if (qaDept) return qaDept;
    }

    // 6. Architecture / CTO:
    if (/(?:kiến trúc|architect|cto|thiết kế hệ thống|scale|giải pháp tổng thể|sơ đồ kiến trúc)/i.test(contentLower)) {
      const archDept = departments.find(d => d.key === 'architecture');
      if (archDept) return archDept;
    }

    // 7. Frontend vs Backend:
    const hasFrontendKeywords = /(?:frontend|giao diện|ui|ux|html|css|style|màu|tông|tông màu|đổi màu|chỉnh màu|màu đen|màu sắc|dark mode|light mode|nền|nút|button|menu|header|footer|modal|trang|theme|client|màn hình|font|icon|tailwind|responsive)/i.test(contentLower);
    const hasBackendKeywords = /(?:backend|api|server|database|csdl|sql|sqlite|postgres|mongo|prisma|auth|jwt|express|router|controller|service|crud|đăng nhập|token|python|fastapi|django|flask|main\.py)/i.test(contentLower);

    if (hasFrontendKeywords && !hasBackendKeywords) {
      return departments.find(d => d.key === 'frontend');
    }
    if (hasBackendKeywords && !hasFrontendKeywords) {
      return departments.find(d => d.key === 'backend');
    }

    // 8. If project has Python/Backend and general code request:
    if (projectContext && /python|main\.py|requirements\.txt|pyproject\.toml/i.test(projectContext)) {
      return departments.find(d => d.key === 'backend') || departments.find(d => d.key === 'fullstack');
    }

    // Default to Fullstack
    return departments.find(d => d.key === 'fullstack') || departments.find(d => d.key === 'backend');
  },

    predictAndCreateProjectDepartments(projectId, userIdea = '') {
    const data = readDb();
    const proj = (data.projects || []).find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');
    proj.chats = proj.chats || [];

    // Ensure main chat is marked isMain
    if (proj.chats.length > 0 && !proj.chats.some(c => c.isMain)) {
      proj.chats[0].isMain = true;
    }

    // 1. Khảo sát ngữ cảnh dự án thực tế
    let filesStr = '';
    if (proj.path && fs.existsSync(proj.path)) {
      try {
        const entries = fs.readdirSync(proj.path);
        filesStr = entries.join(' ').toLowerCase();
      } catch (e) {}
    }

    const combined = (filesStr + ' ' + (userIdea || '')).toLowerCase();
    const hasMobile = /(?:mobile|android|ios|flutter|react[-\s]?native|di động|app điện thoại)/i.test(combined);
    const hasAI = /(?:ai|llm|machine learning|deep learning|rag|langchain|openai|gemini|claude|agent|trí tuệ nhân tạo|chatbot|embedding|skills)/i.test(combined);
    const hasGame = /(?:game|trò chơi|unity|unreal|godot|pygame)/i.test(combined);

    // 2. Dự đoán toàn bộ các phòng ban cốt lõi cần thiết cho vòng đời dự án
    const predictedDepts = [
      { key: 'architecture', title: '🏢 Phòng Kiến Trúc: Cấu Trúc Hệ Thống & Multi-Agent', role: 'software_architect', task: 'Thiết kế kiến trúc hệ thống, luồng dữ liệu và tối ưu hiệu năng' },
      { key: 'backend', title: '🏢 Phòng Kỹ Thuật: Backend & Data Pipeline', role: 'fullstack_dev', task: 'Phát triển mã nguồn Python core, APIs, xử lý cơ sở dữ liệu và dữ liệu affiliate' },
      { key: 'frontend', title: '🏢 Phòng Giao Diện: Frontend & Dashboard', role: 'frontend_dev', task: 'Xây dựng giao diện Web, bảng điều khiển Dashboard và trải nghiệm người dùng' },
      { key: 'qa', title: '🏢 Phòng Kiểm Thử: QA/QC & Test Terminal', role: 'qa_engineer', task: 'Kiểm thử chức năng, tự động hóa test script và rà soát lỗi mã nguồn' },
      { key: 'devops', title: '🏢 Phòng Hạ Tầng: DevOps & Triển Khai', role: 'devops_security', task: 'Thiết lập môi trường (.venv, dependencies), Docker và an toàn bảo mật hệ thống' }
    ];

    // Chỉ thêm Phòng AI nếu dự án/ý tưởng có AI
    if (hasAI) {
      predictedDepts.splice(1, 0, {
        key: 'ai',
        title: '🏢 Phòng Trí Tuệ Nhân Tạo: AI Skills & LLM Engine',
        role: 'applied_ai_engineer',
        task: 'Tích hợp LLM, xây dựng các AI Skills, quản lý Agent Prompts và Workflow tự động hóa'
      });
    }

    // Chỉ thêm Mobile nếu có Mobile (tuyệt đối không thêm bừa)
    if (hasMobile) {
      predictedDepts.push({
        key: 'mobile',
        title: '🏢 Phòng Ứng Dụng Di Động: Mobile & App',
        role: 'flutter_dev',
        task: 'Phát triển ứng dụng di động đa nền tảng Flutter'
      });
    }

    // Chỉ thêm Game nếu có Game
    if (hasGame) {
      predictedDepts.push({
        key: 'desktop_game',
        title: '🏢 Phòng Phát Triển Game & Desktop',
        role: 'desktop_game_dev',
        task: 'Phát triển module Game & ứng dụng Desktop'
      });
    }

    const createdList = [];
    const rolesList = this.getTwentyRolesList();
    const roleMap = {};
    rolesList.forEach(r => { roleMap[r.category] = r; });
    const pmRole = roleMap['pm'];

    predictedDepts.forEach(dept => {
      const already = proj.chats.find(c => c.departmentKey === dept.key || (c.title && c.title.toLowerCase().includes(dept.key)));
      if (!already) {
        const specRole = roleMap[dept.role] || roleMap['fullstack_dev'];
        const pmAgent = {
          id: 'ag_pm_' + crypto.randomBytes(3).toString('hex'),
          category: 'pm',
          name: pmRole.name,
          roleTitle: pmRole.roleTitle,
          badge: 'PM',
          color: pmRole.color || '#3b82f6',
          model: pmRole.defaultModel || 'nvidia/nemotron-3.5-lightning:free',
          providerId: pmRole.providerId || 'prov_kilo_gateway'
        };
        const specAgent = {
          id: 'ag_spec_' + crypto.randomBytes(3).toString('hex'),
          category: specRole.category,
          name: specRole.name,
          roleTitle: specRole.roleTitle,
          badge: specRole.badge,
          color: specRole.color || '#10b981',
          model: specRole.defaultModel || 'cohere/north-mini-code:free',
          providerId: specRole.providerId || 'prov_kilo_gateway',
          responsibility: specRole.desc
        };

        const newDeptChat = {
          id: 'chat_' + crypto.randomBytes(6).toString('hex'),
          title: dept.title,
          model: specAgent.model,
          providerId: specAgent.providerId,
          isDepartment: true,
          departmentKey: dept.key,
          agents: [pmAgent, specAgent],
          createdAt: new Date().toISOString(),
          messages: [
            {
              id: 'msg_' + crypto.randomBytes(6).toString('hex'),
              role: 'assistant',
              author: 'Project Manager (PM) – Quản lý dự án',
              agentBadge: 'PM',
              agentColor: '#3b82f6',
              agentRole: 'Project Manager (PM)',
              content: `Chào đồng chí @${specAgent.name} (${specAgent.roleTitle}),\n\nPhòng ban **${dept.title}** chính thức được thành lập phục vụ dự án **${proj.name}**!\n🎯 **Nhiệm vụ trọng tâm:** ${dept.task}.\n\nĐề nghị đồng chí sẵn sàng túc trực, triển khai mã nguồn và báo cáo tiến độ khi có lệnh từ Sếp!`,
              timestamp: new Date().toISOString()
            },
            {
              id: 'msg_' + crypto.randomBytes(6).toString('hex'),
              role: 'assistant',
              author: specAgent.name,
              agentId: specAgent.id,
              agentBadge: specAgent.badge,
              agentColor: specAgent.color,
              agentRole: specAgent.roleTitle,
              content: `Dạ chào Quản lý dự án (PM)! Tôi đã nắm rõ trách nhiệm chuyên môn của **${dept.title}**.\n\nTôi đã rà soát sẵn sàng và cam kết phối hợp chặt chẽ cùng các phòng ban khác theo chỉ đạo của Sếp và PM.\n\nBáo cáo Quản lý dự án (PM): Phòng ban đã sẵn sàng nhận nhiệm vụ!`,
              timestamp: new Date().toISOString()
            }
          ]
        };

        proj.chats.push(newDeptChat);
        createdList.push(newDeptChat);
      }
    });

    if (createdList.length > 0) {
      proj.updatedAt = new Date().toISOString();
      writeDb(data);
    }

    return { allDepartments: proj.chats.filter(c => c.isDepartment), newlyCreated: createdList };
  },

  getOrCreateDepartmentChat(projectId, deptInfo) {
    const data = readDb();
    const proj = (data.projects || []).find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');
    proj.chats = proj.chats || [];

    // Đánh dấu chat đầu tiên là chat chính nếu chưa có cờ
    if (proj.chats.length > 0 && !proj.chats.some(c => c.isMain)) {
      proj.chats[0].isMain = true;
    }

    // Tìm chat phòng ban tương ứng
    let deptChat = proj.chats.find(c => 
      c.departmentKey === deptInfo.key || 
      (c.title && c.title.toLowerCase().includes(deptInfo.key)) ||
      (c.title && c.title.startsWith('🏢 Phòng') && c.title.toLowerCase().includes(deptInfo.title.toLowerCase()))
    );

    const rolesList = this.getTwentyRolesList();
    const roleMap = {};
    rolesList.forEach(r => { roleMap[r.category] = r; });

    const pmRole = roleMap['pm'];
    const specRole = roleMap[deptInfo.primaryRole] || roleMap['fullstack_dev'];

    const pmAgent = {
      id: 'ag_pm_' + crypto.randomBytes(3).toString('hex'),
      category: 'pm',
      name: pmRole.name,
      roleTitle: pmRole.roleTitle,
      badge: 'PM',
      color: pmRole.color || '#3b82f6',
      model: pmRole.defaultModel || 'nvidia/nemotron-3.5-lightning:free',
      providerId: pmRole.providerId || 'prov_kilo_gateway',
      providerName: pmRole.providerName || 'Kilo Gateway'
    };

    const specAgent = {
      id: 'ag_spec_' + crypto.randomBytes(3).toString('hex'),
      category: specRole.category,
      name: specRole.name,
      roleTitle: specRole.roleTitle,
      badge: specRole.badge,
      color: specRole.color || '#10b981',
      model: specRole.defaultModel || 'cohere/north-mini-code:free',
      providerId: specRole.providerId || 'prov_kilo_gateway',
      providerName: specRole.providerName || 'Kilo Gateway',
      responsibility: specRole.desc
    };

    if (!deptChat) {
      deptChat = {
        id: 'chat_' + crypto.randomBytes(6).toString('hex'),
        title: deptInfo.title,
        model: specAgent.model,
        providerId: specAgent.providerId,
        isDepartment: true,
        departmentKey: deptInfo.key,
        agents: [pmAgent, specAgent],
        createdAt: new Date().toISOString(),
        messages: []
      };
      proj.chats.push(deptChat);
      proj.updatedAt = new Date().toISOString();
      writeDb(data);
    } else {
      deptChat.isDepartment = true;
      deptChat.departmentKey = deptInfo.key;
      deptChat.agents = deptChat.agents || [];
      if (!deptChat.agents.some(a => a.category === 'pm')) {
        deptChat.agents.unshift(pmAgent);
      }
      if (!deptChat.agents.some(a => a.category === specAgent.category)) {
        deptChat.agents.push(specAgent);
      }
      proj.updatedAt = new Date().toISOString();
      writeDb(data);
    }

    return { deptChat, pmAgent, specAgent };
  }
};

module.exports = Store;
