require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
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
        'xingchen-agi/xing4.0-29b-a4b:free',
        'liquid/lfm-2.5-2.6b:free',
        'google/gemma-4-26b-a4b-it:free',
        'cohere/north-mini-code:free',
        'recursive/flint-v1.0:free',
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
        '@cf/meta/llama-3.2-1b-instruct',
        '@cf/meta/llama-3.2-3b-instruct',
        '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
        '@cf/meta/llama-3.2-11b-vision-instruct',
        '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
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
        'liquid/lfm-2.5-2.6b:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'nvidia/nemotron-3.5-lightning:free',
        'recursive/flint-v1.0:free'
      ],
      enabled: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prov_opencode',
      name: 'OpenCode',
      type: 'openai-compatible',
      baseUrl: 'https://opencode.ai/zen/v1',
      apiKey: process.env.OPENCODE_API_KEY || 'oc_sk_7d0be3f1bfef_hwzhwSkqayOPMZu44wIEhg4SNY5vXaeq',
      models: [
        'deepseek-v4.1-flash-free',
        'glm-5.3-flash-free',
        'nemotron-3.5-lightning-free',
        'nemotron-3.5-super-vl-free',
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
    const list = readDb().providers || [];
    list.forEach(p => {
      if (p.id === 'prov_openrouter' && (!p.apiKey || p.apiKey === '')) {
        p.apiKey = process.env.OPENROUTER_API_KEY || '';
      }
      if (p.id === 'prov_cloudflare_ai' && (!p.apiKey || p.apiKey === '')) {
        p.apiKey = process.env.CLOUDFLARE_API_TOKEN || '';
      }
      if (p.id === 'prov_opencode' && (!p.apiKey || p.apiKey === '')) {
        p.apiKey = process.env.OPENCODE_API_KEY || 'oc_sk_7d0be3f1bfef_hwzhwSkqayOPMZu44wIEhg4SNY5vXaeq';
      }
    });
    return list;
  },

  getProviderById(id) {
    const providers = this.getProviders();
    return providers.find(p => p.id === id);
  },

  findProviderForModel(modelName) {
    const providers = this.getProviders().filter(p => p.enabled && (p.apiKey || p.id === 'prov_kilo_gateway' || p.id === 'prov_opencode'));
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
          { id: 'recursive/flint-v1.0:free', name: 'Flint Coding Agent [FREE OpenRouter]' },
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
        defaultModel: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
        recommendedModels: [
          { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill 32B [FREE Cloudflare]' },
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
          { id: 'xingchen-agi/xing4.0-29b-a4b:free', name: 'Xing4.0 Planning [FREE OpenRouter]' },
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
          { id: 'liquid/lfm-2.5-2.6b:free', name: 'Liquid LFM [FREE OpenRouter]' },
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
        defaultModel: '@cf/meta/llama-3.2-1b-instruct',
        recommendedModels: [
          { id: '@cf/meta/llama-3.2-1b-instruct', name: 'Llama 3.2 1B Instruct [FREE Cloudflare]' },
          { id: 'recursive/flint-v1.0:free', name: 'Flint Coding Agent [FREE OpenRouter]' }
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
          { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill 32B [FREE Cloudflare]' }
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
                providerId: 'prov_openrouter',
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
                providerId: 'prov_openrouter',
                systemPrompt: this.getSpecializedCatalog().coder.systemPrompt
              },
              {
                id: 'mem_3',
                name: 'Kỹ Sư Kiểm Thử',
                category: 'tester',
                roleTitle: 'Kiểm Thử & Terminal',
                badge: 'TESTER',
                color: '#f59e0b',
                model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
                providerId: 'prov_cloudflare_ai',
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
                providerId: 'prov_openrouter',
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
                providerId: 'prov_openrouter',
                systemPrompt: this.getSpecializedCatalog().coder.systemPrompt
              },
              {
                id: 'mem_3',
                name: 'Kỹ Sư Kiểm Thử',
                category: 'tester',
                roleTitle: 'Kiểm Thử & Terminal',
                badge: 'TESTER',
                color: '#f59e0b',
                model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
                providerId: 'prov_cloudflare_ai',
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
            providerId: 'prov_openrouter',
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
              providerId: 'prov_openrouter',
              systemPrompt: this.getSpecializedCatalog().coder.systemPrompt
            },
            {
              id: 'mem_2',
              name: 'Kỹ Sư Kiểm Thử',
              category: 'tester',
              roleTitle: 'Kiểm Thử & Terminal',
              badge: 'TESTER',
              color: '#f59e0b',
              model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
              providerId: 'prov_cloudflare_ai',
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
          providerId: 'prov_openrouter',
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
      agents: Array.isArray(agents) ? agents.slice(0, 5) : [],
      createdAt: new Date().toISOString(),
      messages: []
    };

    data.projects[index].chats = data.projects[index].chats || [];
    data.projects[index].chats.unshift(newChat);
    data.projects[index].updatedAt = new Date().toISOString();
    writeDb(data);
    return newChat;
  },

  addAgentToChat(projectId, chatId, { category, model, name, providerId, providerName }) {
    const data = readDb();
    data.projects = data.projects || [];
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj) throw new Error('Không tìm thấy dự án.');

    const chat = (proj.chats || []).find(c => c.id === chatId);
    if (!chat) throw new Error('Không tìm thấy đoạn chat trong dự án.');

    chat.agents = chat.agents || [];
    if (chat.agents.length >= 5) {
      throw new Error('Mỗi đoạn chat chỉ có thể thêm tối đa 5 Agent.');
    }

    const catalog = this.getSpecializedCatalog();
    const roleConfig = catalog[category] || catalog.coder;

    const newAgent = {
      id: 'ag_' + crypto.randomBytes(4).toString('hex'),
      category: roleConfig.category,
      roleTitle: roleConfig.roleTitle,
      name: (name || '').trim() || roleConfig.roleTitle.split('(')[0].trim(),
      badge: roleConfig.badge,
      color: roleConfig.color,
      providerId: providerId || null,
      providerName: providerName || null,
      model: model || roleConfig.defaultModel,
      systemPrompt: roleConfig.systemPrompt
    };

    chat.agents.push(newAgent);
    proj.updatedAt = new Date().toISOString();
    writeDb(data);
    return newAgent;
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
      content: message.content || '',
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
};

module.exports = Store;
