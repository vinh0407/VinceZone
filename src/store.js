const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Default initial state
const defaultData = {
  providers: [
    {
      id: 'prov_openai_default',
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
      enabled: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_gemini_default',
      name: 'Google Gemini',
      type: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: '',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
      enabled: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_anthropic_default',
      name: 'Anthropic Claude',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: '',
      models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
      enabled: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_deepseek_default',
      name: 'DeepSeek',
      type: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      enabled: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_groq_default',
      name: 'Groq',
      type: 'openai-compatible',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: '',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
      enabled: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_ollama_default',
      name: 'Ollama (Local)',
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      models: ['qwen2.5:7b', 'llama3.2:latest', 'deepseek-r1:latest'],
      enabled: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_opencode',
      name: 'OpenCode',
      type: 'openai-compatible',
      baseUrl: 'https://api.opencode.ai/v1',
      apiKey: '',
      models: [
        'beam-free',
        'big-pickle',
        'deepseek-v4.1-flash-free',
        'flint-40b-free',
        'mimo-v2.6-flash-free',
        'nemotron-3.5-lightning-free',
        'nemotron-3.5-super-vl-free'
      ],
      enabled: false,
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
        'liquid/lfm-2.5-2.6b:free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'nvidia/nemotron-3.5-lightning:free',
        'poolside/laguna-s-2.1:free',
        'poolside/laguna-xs-2.1:free',
        'recursive/flint-v1.0:free',
        'xingchen-agi/xing4.0-29b-a4b:free'
      ],
      enabled: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_zenmux',
      name: 'ZenMux',
      type: 'openai-compatible',
      baseUrl: 'https://zenmux.ai/api/v1',
      apiKey: '',
      models: [
        'zenmux/auto-free',
        'deepseek-v4-flash',
        'glm-4-flash',
        'gemini-1.5-flash-free',
        'qwen-2.5-72b-instruct'
      ],
      enabled: false,
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
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return defaultData;
  }
}

function writeDb(data) {
  ensureDb();
  const tmpFile = DB_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

// Helper methods
const Store = {
  readDb,
  writeDb,

  getProviders() {
    return readDb().providers || [];
  },

  getProviderById(id) {
    const providers = this.getProviders();
    return providers.find(p => p.id === id);
  },

  findProviderForModel(modelName) {
    const providers = this.getProviders().filter(p => p.enabled && p.apiKey);
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

    const lines = activeMemories.map(m => {
      let tag = '[Ghi nhớ]';
      if (m.category === 'preference') tag = '[Sở thích]';
      if (m.category === 'project') tag = '[Dự án]';
      if (m.category === 'rule') tag = '[Quy tắc]';
      return `- ${tag}: ${m.content}`;
    });

    return `\n\n### [BỘ NHỚ VINCEZONE - KIẾN THỨC DÙNG CHUNG QUA CÁC AI]:\n` +
           `Hệ thống VinceZone đã lưu trữ các thông tin và sở thích sau đây của người dùng. Dù bạn là AI nào, hãy luôn áp dụng các ghi nhớ này khi phản hồi:\n` +
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

    // Tự động kích hoạt bộ nhớ nhận thức học hỏi từ đoạn chat vừa lưu
    if (target.messages && target.messages.length > 0) {
      const lastUserMsg = [...target.messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg && lastUserMsg.content) {
        const text = typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content
          : (Array.isArray(lastUserMsg.content) ? lastUserMsg.content.filter(p => p.type === 'text').map(p => p.text).join(' ') : '');
        if (text) {
          this.autoExtractMemory(text, target.model || 'Chat Memory');
        }
      }
    }

    if (data.chatSessions.length > 250) {
      data.chatSessions = data.chatSessions.slice(0, 250);
    }

    writeDb(data);
    return target;
  },

  deleteChat(id) {
    const data = readDb();
    data.chatSessions = (data.chatSessions || []).filter(c => c.id !== id);
    writeDb(data);
  },

  clearAllChats(userId = null) {
    const data = readDb();
    if (userId) {
      data.chatSessions = (data.chatSessions || []).filter(c => c.userId && c.userId !== userId);
    } else {
      data.chatSessions = [];
    }
    writeDb(data);
  }
};

module.exports = Store;
