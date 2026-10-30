/**
 * VinceZone AI Workplay & Gateway Frontend Controller
 */

// Application State
let state = {
  currentUser: null,
  authToken: localStorage.getItem('vz_auth_token') || '',
  providers: [],
  keys: [],
  logs: [],
  memories: [],
  memorySettings: { enabled: true, autoLearn: true },
  memCategoryFilter: 'all',
  memSearchTerm: '',
  chats: [],
  currentChatId: null,
  currentChatTitle: 'Đoạn chat mới',
  chatHistory: [],
  pendingAttachments: [],
  currentSnippetLang: 'curl',
  isGenerating: false
};

// Helper for authenticated requests
function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (state.authToken) {
    options.headers['Authorization'] = `Bearer ${state.authToken}`;
  }
  return fetch(url, options);
}

// DOM Elements
const tabButtons = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const activeProvidersCountEl = document.getElementById('active-providers-count');

// Auth Elements
const userLoggedInBox = document.getElementById('user-logged-in');
const userDisplayName = document.getElementById('user-display-name');
const btnLogout = document.getElementById('btn-logout');
const btnOpenAuthModal = document.getElementById('btn-open-auth-modal');
const authModal = document.getElementById('auth-modal');
const btnCloseAuthModal = document.getElementById('btn-close-auth-modal');
const btnCancelAuthModal = document.getElementById('btn-cancel-auth-modal');
const authForm = document.getElementById('auth-form');
const authUsernameInput = document.getElementById('auth-username');
const authEmailGroup = document.getElementById('auth-email-group');
const authEmailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');
const btnAuthSubmit = document.getElementById('btn-auth-submit');
const authTabLogin = document.getElementById('tab-login');
const authTabRegister = document.getElementById('tab-register');
const authHint = document.getElementById('auth-hint');
let authMode = 'login'; // 'login' or 'register'

// Chat History Elements (Bộ nhớ lịch sử chat)
const btnNewChat = document.getElementById('btn-new-chat');
const chatHistoryCount = document.getElementById('chat-history-count');
const chatHistoryList = document.getElementById('chat-history-list');
const btnClearAllHistory = document.getElementById('btn-clear-all-history');
const activeSessionTitle = document.getElementById('active-session-title');
const btnDeleteCurrentChat = document.getElementById('btn-delete-current-chat');

// Playground Elements
const providerSelect = document.getElementById('playground-provider-select');
const modelSelect = document.getElementById('playground-model-select');
const filterFreeOnly = document.getElementById('filter-free-only');
const selectedProviderInfo = document.getElementById('selected-provider-info');
const systemPromptInput = document.getElementById('playground-system-prompt');
const tempInput = document.getElementById('playground-temperature');
const tempVal = document.getElementById('temp-val');
const maxTokensInput = document.getElementById('playground-max-tokens');
const tokensVal = document.getElementById('tokens-val');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const chatStatusIndicator = document.getElementById('chat-status-indicator');
const btnClearChat = document.getElementById('btn-clear-chat');

// Attachment Elements
const chatAttachmentsBar = document.getElementById('chat-attachments-bar');
const btnAttachMenu = document.getElementById('btn-attach-menu');
const attachDropdownMenu = document.getElementById('attach-dropdown-menu');
const menuAttachImage = document.getElementById('menu-attach-image');
const menuAttachFile = document.getElementById('menu-attach-file');
const menuAttachFolder = document.getElementById('menu-attach-folder');
const menuAttachLink = document.getElementById('menu-attach-link');
const menuAttachGdrive = document.getElementById('menu-attach-gdrive');

const inputFileImage = document.getElementById('input-file-image');
const inputFileDocument = document.getElementById('input-file-document');
const inputFileFolder = document.getElementById('input-file-folder');

// Link Modal Elements
const linkModal = document.getElementById('link-modal');
const linkForm = document.getElementById('link-form');
const linkUrlInput = document.getElementById('link-url-input');
const linkTitleInput = document.getElementById('link-title-input');
const btnCloseLinkModal = document.getElementById('btn-close-link-modal');
const btnCancelLinkModal = document.getElementById('btn-cancel-link-modal');

// Google Drive Modal Elements
const gdriveModal = document.getElementById('gdrive-modal');
const gdriveForm = document.getElementById('gdrive-form');
const gdriveUrlInput = document.getElementById('gdrive-url-input');
const gdriveTitleInput = document.getElementById('gdrive-title-input');
const btnCloseGdriveModal = document.getElementById('btn-close-gdrive-modal');
const btnCancelGdriveModal = document.getElementById('btn-cancel-gdrive-modal');

// Providers Elements
const providersGrid = document.getElementById('providers-grid');
const btnOpenAddProvider = document.getElementById('btn-open-add-provider');
const providerModal = document.getElementById('provider-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const providerForm = document.getElementById('provider-form');
const pIdInput = document.getElementById('p-id');
const pNameInput = document.getElementById('p-name');
const pTypeInput = document.getElementById('p-type');
const pApiKeyInput = document.getElementById('p-apikey');
const pBaseUrlInput = document.getElementById('p-baseurl');
const pModelsInput = document.getElementById('p-models');
const pEnabledInput = document.getElementById('p-enabled');
const modalProviderTitle = document.getElementById('modal-provider-title');

// Gateway Elements
const keysList = document.getElementById('keys-list');
const btnNewKey = document.getElementById('btn-new-key');
const keyModal = document.getElementById('key-modal');
const btnCloseKeyModal = document.getElementById('btn-close-key-modal');
const btnCancelKeyModal = document.getElementById('btn-cancel-key-modal');
const keyForm = document.getElementById('key-form');
const keyNameInput = document.getElementById('key-name-input');
const codeSnippetPre = document.getElementById('code-snippet-pre');
const btnCopySnippet = document.getElementById('btn-copy-snippet');
const snippetTabs = document.querySelectorAll('.snippet-tab');

// Logs Elements
const logsTbody = document.getElementById('logs-tbody');
const btnRefreshLogs = document.getElementById('btn-refresh-logs');

// Memory Elements (VinceZone Cognitive Memory)
const activeMemoriesCountEl = document.getElementById('active-memories-count');
const memoriesGrid = document.getElementById('memories-grid');
const memoryGlobalToggle = document.getElementById('memory-global-toggle');
const memoryAutoLearnToggle = document.getElementById('memory-autolearn-toggle');
const memorySearchInput = document.getElementById('memory-search-input');
const memFilterBtns = document.querySelectorAll('.mem-filter-btn');
const btnOpenAddMemory = document.getElementById('btn-open-add-memory');
const memoryModal = document.getElementById('memory-modal');
const btnCloseMemoryModal = document.getElementById('btn-close-memory-modal');
const btnCancelMemoryModal = document.getElementById('btn-cancel-memory-modal');
const memoryForm = document.getElementById('memory-form');
const memIdInput = document.getElementById('mem-id');
const memCategorySelect = document.getElementById('mem-category');
const memContentInput = document.getElementById('mem-content');
const modalMemoryTitle = document.getElementById('modal-memory-title');

// Preset URLs and models for provider types
const TYPE_PRESETS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: 'gpt-4o, gpt-4o-mini, o1, o3-mini',
    type: 'openai'
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: 'gemini-2.5-flash, gemini-2.5-pro, gemini-1.5-flash',
    type: 'gemini'
  },
  anthropic: {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: 'claude-3-7-sonnet-20250219, claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022',
    type: 'anthropic'
  },
  opencode: {
    name: 'OpenCode (v2 Zen)',
    baseUrl: 'https://opencode.ai/zen/v1',
    models: 'beam-free, big-pickle, deepseek-v4.1-flash-free, flint-40b-free, glm-5.3-flash-free, mimo-v2.6-flash-free, nemotron-3.5-lightning-free, nemotron-3.5-super-vl-free',
    type: 'openai-compatible'
  },
  kilo: {
    name: 'Kilo Gateway',
    baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
    models: 'kilo-auto/free, cohere/north-mini-code:free, dots-studio/dots-3-note-preview:free, liquid/lfm-2.5-2.6b:free, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, nvidia/nemotron-3-ultra-550b-a55b:free, nvidia/nemotron-3.5-lightning:free, poolside/laguna-s-2.1:free, poolside/laguna-xs-2.1:free, recursive/flint-v1.0:free, xingchen-agi/xing4.0-29b-a4b:free',
    type: 'openai-compatible'
  },
  zenmux: {
    name: 'ZenMux',
    baseUrl: 'https://zenmux.ai/api/v1',
    models: 'zenmux/auto-free, deepseek-v4-flash, glm-4-flash, gemini-1.5-flash-free, qwen-2.5-72b-instruct',
    type: 'openai-compatible'
  },
  'openai-compatible': {
    name: 'OpenAI-Compatible Custom',
    baseUrl: 'https://api.deepseek.com/v1',
    models: 'deepseek-chat, deepseek-reasoner',
    type: 'openai-compatible'
  }
};

// Danh sách các mô hình Free (listfree)
const LIST_FREE_MODELS = [
  // OpenCode Free Models (Theo danh sách chính xác của OpenCode Zen)
  'beam-free',
  'beam free',
  'big-pickle',
  'big pickle',
  'deepseek-v4.1-flash-free',
  'deepseek v4.1 flash free',
  'flint-40b-free',
  'flint 40b free',
  'glm-5.3-flash-free',
  'glm 5.3 flash free',
  'mimo-v2.6-flash-free',
  'mimo v2.6 flash free',
  'nemotron-3.5-lightning-free',
  'nemotron 3.5 lightning free',
  'nemotron 3.5 lighning free',
  'nemotron-3.5-super-vl-free',
  'nemotron 3.5 super vl free',

  // Kilo Gateway Free Models (Chuẩn xác theo Kilo Gateway)
  'kilo-auto/free',
  'kilo auto free',
  'auto free',
  'cohere/north-mini-code:free',
  'cohere north mini code',
  'dots-studio/dots-3-note-preview:free',
  'dots studio dots3-note preview',
  'liquid/lfm-2.5-2.6b:free',
  'liquid ai lfm2.5-2.6b',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia nemotron 3 nano omni',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia nemotron 3 ultra',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia nemotron 3.5 lightning',
  'poolside/laguna-s-2.1:free',
  'poolside laguna s 2.1',
  'poolside/laguna-xs-2.1:free',
  'poolside laguna xs 2.1',
  'recursive/flint-v1.0:free',
  'recursive flint',
  'xingchen-agi/xing4.0-29b-a4b:free',
  'xingchen agi xing4.0 29b a4b',

  // ZenMux Free Models
  'zenmux/auto-free',
  'deepseek-v4-flash',
  'glm-4-flash',
  'gemini-1.5-flash-free'
];

function isFreeModel(m) {
  if (!m) return false;
  const lower = m.toLowerCase().trim();
  const normalized = lower.replace(/[^a-z0-9]/g, '');

  // 1. Kiểm tra chính xác trong listfree
  const inList = LIST_FREE_MODELS.some(f => {
    const fNorm = f.toLowerCase().replace(/[^a-z0-9]/g, '');
    return fNorm === normalized || lower === f.toLowerCase();
  });
  if (inList) return true;

  // 2. Kiểm tra theo tiền tố/hậu tố mẫu
  return lower.includes(':free') || lower.includes('-free') || lower.includes('/free') || 
         lower.includes('flash') || lower.includes('free') || lower.includes('llama-3.1-8b') || 
         lower.includes('qwen2.5:7b') || lower.includes('big-pickle') || lower.includes('beam');
}

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupPlaygroundEvents();
  setupAttachmentEvents();
  setupProviderEvents();
  setupGatewayEvents();
  setupMemoryEvents();
  setupAuthEvents();
  setupChatHistoryEvents();

  // Load initial data
  await Promise.all([
    fetchCurrentUser(),
    fetchProviders(),
    fetchKeys(),
    fetchLogs(),
    fetchMemories(),
    fetchChatHistory()
  ]);

  renderSnippets();
});

// -------------------------------------------------------------
// 1. NAVIGATION
// -------------------------------------------------------------

function setupNavigation() {
  // Top nav (Playground vs Cài Đặt)
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(`tab-${targetTab}`);
      if (pane) pane.classList.add('active');

      if (targetTab === 'settings') {
        const activeSubtabBtn = document.querySelector('.settings-nav-item.active');
        const activeSubtab = activeSubtabBtn ? activeSubtabBtn.getAttribute('data-subtab') : 'providers';
        if (activeSubtab === 'providers') fetchProviders();
        if (activeSubtab === 'gateway') fetchKeys();
        if (activeSubtab === 'memory') fetchMemories();
        if (activeSubtab === 'logs') fetchLogs();
      }
    });
  });

  // Settings Sub-Navigation (Providers Hub, Gateway API, Bộ Nhớ, Logs)
  const settingsNavItems = document.querySelectorAll('.settings-nav-item');
  const settingsSubpanes = document.querySelectorAll('.settings-subpane');

  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const subtab = item.getAttribute('data-subtab');

      settingsNavItems.forEach(i => i.classList.remove('active'));
      settingsSubpanes.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetPane = document.getElementById(`subtab-${subtab}`);
      if (targetPane) targetPane.classList.add('active');

      if (subtab === 'providers') fetchProviders();
      if (subtab === 'gateway') fetchKeys();
      if (subtab === 'memory') fetchMemories();
      if (subtab === 'logs') fetchLogs();
    });
  });
}

window.switchSettingsSubtab = function(subtab) {
  const settingsBtn = document.querySelector('.nav-btn[data-tab="settings"]');
  if (settingsBtn) settingsBtn.click();
  const subBtn = document.querySelector(`.settings-nav-item[data-subtab="${subtab}"]`);
  if (subBtn) subBtn.click();
};

// -------------------------------------------------------------
// 2. PLAYGROUND LOGIC
// -------------------------------------------------------------

function setupPlaygroundEvents() {
  tempInput.addEventListener('input', (e) => {
    tempVal.textContent = e.target.value;
  });

  maxTokensInput.addEventListener('input', (e) => {
    tokensVal.textContent = e.target.value;
  });

  providerSelect.addEventListener('change', () => {
    updateModelDropdownForSelectedProvider();
  });

  modelSelect.addEventListener('change', () => {
    renderSnippets();
  });

  if (filterFreeOnly) {
    filterFreeOnly.addEventListener('change', () => {
      updateModelDropdownForSelectedProvider();
    });
  }

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    const attachmentsToSend = [...state.pendingAttachments];
    const hasAttachments = attachmentsToSend.length > 0;

    if ((!message && !hasAttachments) || state.isGenerating) return;

    const selectedModel = modelSelect.value;
    if (!selectedModel) {
      alert('Vui lòng chọn hoặc cấu hình một AI Model trước.');
      return;
    }

    const currentProv = state.providers.find(p => p.id === providerSelect.value);
    if (currentProv && !currentProv.hasKey) {
      alert(`Nhà cung cấp "${currentProv.name}" chưa được cấu hình API Key.\n\nVui lòng chuyển sang tab "Cài Đặt" -> "Providers Hub", bấm nút "Sửa" tại thẻ "${currentProv.name}" để dán API Key của bạn.`);
      return;
    }

    // Build context string from text files, folders, links, and Google Drive
    let enrichedPrompt = message;
    const contextBlocks = [];

    attachmentsToSend.filter(a => a.type === 'file').forEach(f => {
      contextBlocks.push(`[Tệp đính kèm: ${f.name} (${formatBytes(f.size)})]\n\`\`\`\n${f.text}\n\`\`\``);
    });

    attachmentsToSend.filter(a => a.type === 'folder').forEach(f => {
      contextBlocks.push(`[Thư mục dự án: ${f.name} (${f.fileCount} tệp)]\n${f.summary}`);
    });

    attachmentsToSend.filter(a => a.type === 'link').forEach(l => {
      contextBlocks.push(`[Nội dung từ Liên kết Web: ${l.title || ''} (${l.url})]\n${l.snippet || ''}`);
    });

    attachmentsToSend.filter(a => a.type === 'gdrive').forEach(g => {
      contextBlocks.push(`[Tài liệu Google Drive: ${g.title || ''} (${g.url})]\n${g.snippet || ''}`);
    });

    if (contextBlocks.length > 0) {
      enrichedPrompt = `--- TÀI LIỆU VÀ TỆP ĐÍNH KÈM TỪ NGƯỜI DÙNG ---\n${contextBlocks.join('\n\n')}\n--- HẾT PHẦN ĐÍNH KÈM ---\n\n${message || 'Hãy phân tích và hỗ trợ tôi dựa trên các tệp và tài liệu đã đính kèm ở trên.'}`;
    }

    const images = attachmentsToSend.filter(a => a.type === 'image');
    let messageContentForPayload;
    if (images.length > 0) {
      messageContentForPayload = [
        { type: 'text', text: enrichedPrompt || 'Hãy phân tích hình ảnh này.' },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: img.dataUrl }
        }))
      ];
    } else {
      messageContentForPayload = enrichedPrompt;
    }

    // Append user message to UI
    appendMessage('user', message, attachmentsToSend);
    state.chatHistory.push({ role: 'user', content: messageContentForPayload });

    // Clear staging attachments & input
    state.pendingAttachments = [];
    renderAttachmentsBar();
    chatInput.value = '';
    state.isGenerating = true;
    btnSend.disabled = true;
    chatStatusIndicator.textContent = 'Đang suy luận...';

    // Prepare assistant message placeholder
    const assistantBubble = appendMessage('assistant', '');

    try {
      const messagesPayload = [];
      const sysPrompt = systemPromptInput.value.trim();
      if (sysPrompt) {
        messagesPayload.push({ role: 'system', content: sysPrompt });
      }

      // Add conversation turns
      for (const msg of state.chatHistory) {
        messagesPayload.push({ role: msg.role, content: msg.content });
      }

      const response = await fetch('/api/playground/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: messagesPayload,
          temperature: parseFloat(tempInput.value),
          max_tokens: parseInt(maxTokensInput.value, 10),
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullAssistantText = '';
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
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') break;
            try {
              const chunk = JSON.parse(jsonStr);
              const delta = chunk.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullAssistantText += delta;
                renderMarkdown(assistantBubble, fullAssistantText);
                chatMessages.scrollTop = chatMessages.scrollHeight;
              }
            } catch {
              // ignore json parse chunk
            }
          }
        }
      }

      // Record assistant turn in state
      state.chatHistory.push({ role: 'assistant', content: fullAssistantText });
      chatStatusIndicator.textContent = 'Hoàn tất';

      // Auto save or update chat session!
      if (!state.currentChatId) {
        const titleSource = message || (attachmentsToSend[0] ? attachmentsToSend[0].name : 'Hội thoại');
        state.currentChatTitle = titleSource.length > 30 ? titleSource.slice(0, 30) + '...' : titleSource;
      }
      await autoSaveCurrentChat();
    } catch (err) {
      renderMarkdown(assistantBubble, `❌ **Lỗi:** ${err.message}`);
      chatStatusIndicator.textContent = 'Lỗi';
    } finally {
      state.isGenerating = false;
      btnSend.disabled = false;
      setTimeout(() => { chatStatusIndicator.textContent = ''; }, 3000);
    }
  });
}

function appendMessage(role, text, attachments = []) {
  // Hide welcome banner if exists
  const banner = chatMessages.querySelector('.welcome-banner');
  if (banner) banner.remove();

  const row = document.createElement('div');
  row.className = `chat-row ${role}`;

  const author = document.createElement('div');
  author.className = 'chat-author';
  const authorTitle = role === 'user' ? '👤 BẠN' : `⚡ ${modelSelect.value || 'AI'}`;
  author.innerHTML = `<span>${authorTitle}</span>`;

  if (role === 'user' && text) {
    const btnRem = document.createElement('button');
    btnRem.type = 'button';
    btnRem.className = 'btn-remember-chat';
    btnRem.textContent = '🧠 Ghi nhớ';
    btnRem.title = 'Lưu ý này vào Bộ nhớ dùng chung của VinceZone';
    btnRem.onclick = () => quickRememberText(text, modelSelect.value);
    author.appendChild(btnRem);
  }

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  // Render attachment chips or thumbnails
  if (attachments && attachments.length > 0) {
    const attContainer = document.createElement('div');
    attContainer.className = 'message-attachments-container';

    attachments.forEach(att => {
      if (att.type === 'image') {
        const img = document.createElement('img');
        img.src = att.dataUrl;
        img.className = 'msg-attachment-img';
        img.title = `${att.name} (${formatBytes(att.size)}) - Nhấn để xem toàn màn hình`;
        img.onclick = () => {
          const w = window.open('');
          w.document.write(`<body style="background:#000;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${att.dataUrl}" style="max-width:95vw;max-height:95vh;object-fit:contain;"></body>`);
        };
        attContainer.appendChild(img);
      } else if (att.type === 'file') {
        const badge = document.createElement('span');
        badge.className = 'msg-attachment-badge';
        badge.innerHTML = `📄 <strong>${escapeHtml(att.name)}</strong> <small>(${formatBytes(att.size)})</small>`;
        attContainer.appendChild(badge);
      } else if (att.type === 'folder') {
        const badge = document.createElement('span');
        badge.className = 'msg-attachment-badge';
        badge.innerHTML = `📁 <strong>${escapeHtml(att.name)}</strong> <small>(${att.fileCount} tệp)</small>`;
        attContainer.appendChild(badge);
      } else if (att.type === 'link') {
        const link = document.createElement('a');
        link.className = 'msg-attachment-badge';
        link.href = att.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerHTML = `🌐 <strong>${escapeHtml(att.title || att.url)}</strong>`;
        attContainer.appendChild(link);
      } else if (att.type === 'gdrive') {
        const link = document.createElement('a');
        link.className = 'msg-attachment-badge';
        link.href = att.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerHTML = `📁 <strong>GG Drive: ${escapeHtml(att.title || 'Tài liệu')}</strong>`;
        attContainer.appendChild(link);
      }
    });

    bubble.appendChild(attContainer);
  }

  const textNode = document.createElement('div');
  textNode.className = 'chat-bubble-text';

  if (role === 'user') {
    textNode.textContent = text || '';
    bubble.appendChild(textNode);
  } else {
    textNode.innerHTML = text ? marked.parse(text) : '<span class="loading-dots">...</span>';
    bubble.appendChild(textNode);
  }

  row.appendChild(author);
  row.appendChild(bubble);
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return textNode;
}

// -------------------------------------------------------------
// ATTACHMENTS CONTROLLER (ẢNH, TỆP, THƯ MỤC, LINK, GG DRIVE)
// -------------------------------------------------------------

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readDocumentAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function renderAttachmentsBar() {
  if (!chatAttachmentsBar) return;
  chatAttachmentsBar.innerHTML = '';

  if (state.pendingAttachments.length === 0) {
    chatAttachmentsBar.style.display = 'none';
    return;
  }

  chatAttachmentsBar.style.display = 'flex';

  state.pendingAttachments.forEach((att, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';

    if (att.type === 'image') {
      chip.innerHTML = `
        <img src="${att.dataUrl}" class="chip-thumb" alt="${escapeHtml(att.name)}">
        <span class="chip-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="chip-meta">${formatBytes(att.size)}</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    } else if (att.type === 'file') {
      chip.innerHTML = `
        <span>📄</span>
        <span class="chip-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="chip-meta">${formatBytes(att.size)}</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    } else if (att.type === 'folder') {
      chip.innerHTML = `
        <span>📁</span>
        <span class="chip-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="chip-meta">${att.fileCount} tệp</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    } else if (att.type === 'link') {
      chip.innerHTML = `
        <span>🌐</span>
        <span class="chip-name" title="${escapeHtml(att.title || att.url)}">${escapeHtml(att.title || att.url)}</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    } else if (att.type === 'gdrive') {
      chip.innerHTML = `
        <span>📁</span>
        <span class="chip-name" title="${escapeHtml(att.title || 'Google Drive')}">GG Drive: ${escapeHtml(att.title || 'Tài liệu')}</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    }

    chatAttachmentsBar.appendChild(chip);
  });
}

window.removePendingAttachment = function(idx) {
  state.pendingAttachments.splice(idx, 1);
  renderAttachmentsBar();
};

async function processUploadedFiles(files) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const dataUrl = await readImageAsDataUrl(file);
      state.pendingAttachments.push({
        id: 'att_' + Date.now() + Math.random().toString(36).slice(2, 6),
        type: 'image',
        name: file.name,
        size: file.size,
        dataUrl,
        mimeType: file.type
      });
    } else {
      try {
        const text = await readDocumentAsText(file);
        state.pendingAttachments.push({
          id: 'att_' + Date.now() + Math.random().toString(36).slice(2, 6),
          type: 'file',
          name: file.name,
          size: file.size,
          text
        });
      } catch (err) {
        console.error('Không thể đọc file:', file.name, err);
      }
    }
  }
  renderAttachmentsBar();
}

async function handleFolderSelection(files) {
  if (!files || files.length === 0) return;

  const validFiles = [];
  const MAX_FOLDER_FILES = 60;
  const MAX_FILE_SIZE = 150 * 1024; // 150KB

  const ignoredExts = ['.png', '.jpg', '.jpeg', '.gif', '.zip', '.tar', '.gz', '.exe', '.dll', '.bin', '.iso', '.pdf', '.docx', '.xlsx', '.mp4', '.mp3', '.lock', '.woff', '.woff2', '.ttf'];
  const ignoredPaths = ['node_modules/', '.git/', '.next/', 'dist/', 'build/', '.vscode/', '__pycache__/'];

  for (const f of files) {
    const relPath = f.webkitRelativePath || f.name;
    if (ignoredPaths.some(p => relPath.includes(p))) continue;
    const lower = f.name.toLowerCase();
    if (ignoredExts.some(ext => lower.endsWith(ext))) continue;
    if (f.size > MAX_FILE_SIZE) continue;

    validFiles.push(f);
    if (validFiles.length >= MAX_FOLDER_FILES) break;
  }

  if (validFiles.length === 0) {
    alert('Không tìm thấy tệp mã nguồn hoặc tệp văn bản hợp lệ trong thư mục này.');
    return;
  }

  const rootFolderName = (files[0].webkitRelativePath || '').split('/')[0] || 'Dự án';
  
  let treeSummary = `--- CẤU TRÚC THƯ MỤC: ${rootFolderName} (${validFiles.length} tệp) ---\n`;
  validFiles.forEach(f => {
    treeSummary += `• ${f.webkitRelativePath || f.name} (${formatBytes(f.size)})\n`;
  });
  treeSummary += '\n--- NỘI DUNG CÁC TỆP CHI TIẾT ---\n';

  let totalChars = 0;
  const MAX_TOTAL_CHARS = 100000;

  for (const file of validFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      treeSummary += `\n[...Đã đạt giới hạn dung lượng văn bản dự án...]`;
      break;
    }
    try {
      const content = await readDocumentAsText(file);
      const relPath = file.webkitRelativePath || file.name;
      treeSummary += `\n[Tệp: ${relPath}]\n\`\`\`\n${content.slice(0, 15000)}\n\`\`\`\n`;
      totalChars += content.length;
    } catch {
      // ignore
    }
  }

  state.pendingAttachments.push({
    id: 'att_' + Date.now() + Math.random().toString(36).slice(2, 6),
    type: 'folder',
    name: rootFolderName,
    fileCount: validFiles.length,
    summary: treeSummary
  });

  renderAttachmentsBar();
}

async function handleWebLink(url, customTitle) {
  chatStatusIndicator.textContent = 'Đang quét link...';
  try {
    const res = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi khi tải URL');

    state.pendingAttachments.push({
      id: 'att_' + Date.now() + Math.random().toString(36).slice(2, 6),
      type: 'link',
      url: data.url,
      title: customTitle || data.title,
      snippet: data.snippet
    });
    renderAttachmentsBar();
    chatStatusIndicator.textContent = 'Đã chèn liên kết';
    setTimeout(() => { chatStatusIndicator.textContent = ''; }, 2000);
  } catch (err) {
    alert(`Không thể quét liên kết: ${err.message}`);
    chatStatusIndicator.textContent = '';
  }
}

async function handleGoogleDriveLink(url, customTitle) {
  chatStatusIndicator.textContent = 'Đang nhận diện Google Drive...';
  try {
    const res = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    
    state.pendingAttachments.push({
      id: 'att_' + Date.now() + Math.random().toString(36).slice(2, 6),
      type: 'gdrive',
      url: data.url || url,
      title: customTitle || data.title || 'Tài liệu Google Drive',
      snippet: data.snippet || `Liên kết tài liệu Google Drive: ${url}`
    });
    renderAttachmentsBar();
    chatStatusIndicator.textContent = 'Đã chèn Google Drive';
    setTimeout(() => { chatStatusIndicator.textContent = ''; }, 2000);
  } catch (err) {
    state.pendingAttachments.push({
      id: 'att_' + Date.now() + Math.random().toString(36).slice(2, 6),
      type: 'gdrive',
      url: url,
      title: customTitle || 'Tài liệu Google Drive',
      snippet: `Liên kết tài liệu Google Drive: ${url}`
    });
    renderAttachmentsBar();
    chatStatusIndicator.textContent = 'Đã đính kèm GG Drive';
    setTimeout(() => { chatStatusIndicator.textContent = ''; }, 2000);
  }
}

function setupAttachmentEvents() {
  if (btnAttachMenu) {
    btnAttachMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      attachDropdownMenu.classList.toggle('show');
    });
  }

  document.addEventListener('click', (e) => {
    if (attachDropdownMenu && !attachDropdownMenu.contains(e.target) && e.target !== btnAttachMenu) {
      attachDropdownMenu.classList.remove('show');
    }
  });

  // Attach Menu items
  if (menuAttachImage) {
    menuAttachImage.addEventListener('click', () => {
      attachDropdownMenu.classList.remove('show');
      inputFileImage.click();
    });
  }

  if (menuAttachFile) {
    menuAttachFile.addEventListener('click', () => {
      attachDropdownMenu.classList.remove('show');
      inputFileDocument.click();
    });
  }

  if (menuAttachFolder) {
    menuAttachFolder.addEventListener('click', () => {
      attachDropdownMenu.classList.remove('show');
      inputFileFolder.click();
    });
  }

  if (menuAttachLink) {
    menuAttachLink.addEventListener('click', () => {
      attachDropdownMenu.classList.remove('show');
      openLinkModal();
    });
  }

  if (menuAttachGdrive) {
    menuAttachGdrive.addEventListener('click', () => {
      attachDropdownMenu.classList.remove('show');
      openGdriveModal();
    });
  }

  // File Inputs change handlers
  if (inputFileImage) {
    inputFileImage.addEventListener('change', async (e) => {
      if (e.target.files) {
        await processUploadedFiles(e.target.files);
        inputFileImage.value = '';
      }
    });
  }

  if (inputFileDocument) {
    inputFileDocument.addEventListener('change', async (e) => {
      if (e.target.files) {
        await processUploadedFiles(e.target.files);
        inputFileDocument.value = '';
      }
    });
  }

  if (inputFileFolder) {
    inputFileFolder.addEventListener('change', async (e) => {
      if (e.target.files) {
        await handleFolderSelection(e.target.files);
        inputFileFolder.value = '';
      }
    });
  }

  // Link Modal
  if (btnCloseLinkModal) btnCloseLinkModal.onclick = closeLinkModal;
  if (btnCancelLinkModal) btnCancelLinkModal.onclick = closeLinkModal;
  if (linkForm) {
    linkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = linkUrlInput.value.trim();
      const title = linkTitleInput.value.trim();
      if (!url) return;
      closeLinkModal();
      await handleWebLink(url, title);
    });
  }

  // Google Drive Modal
  if (btnCloseGdriveModal) btnCloseGdriveModal.onclick = closeGdriveModal;
  if (btnCancelGdriveModal) btnCancelGdriveModal.onclick = closeGdriveModal;
  if (gdriveForm) {
    gdriveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = gdriveUrlInput.value.trim();
      const title = gdriveTitleInput.value.trim();
      if (!url) return;
      closeGdriveModal();
      await handleGoogleDriveLink(url, title);
    });
  }

  setupDragAndDropAndPaste();
}

function openLinkModal() {
  linkUrlInput.value = '';
  linkTitleInput.value = '';
  linkModal.classList.add('active');
  setTimeout(() => linkUrlInput.focus(), 50);
}
function closeLinkModal() {
  linkModal.classList.remove('active');
}

function openGdriveModal() {
  gdriveUrlInput.value = '';
  gdriveTitleInput.value = '';
  gdriveModal.classList.add('active');
  setTimeout(() => gdriveUrlInput.focus(), 50);
}
function closeGdriveModal() {
  gdriveModal.classList.remove('active');
}

function setupDragAndDropAndPaste() {
  const dropZone = document.querySelector('.playground-chat-panel');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      });
    });

    dropZone.addEventListener('drop', async (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        await processUploadedFiles(files);
      }
    });
  }

  if (chatInput) {
    chatInput.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            const dataUrl = await readImageAsDataUrl(file);
            state.pendingAttachments.push({
              id: 'att_' + Date.now(),
              type: 'image',
              name: `Pasted-Image-${Date.now().toString().slice(-4)}.png`,
              size: file.size,
              dataUrl,
              mimeType: file.type
            });
            renderAttachmentsBar();
          }
        }
      }
    });
  }
}

function renderMarkdown(el, markdownText) {
  if (window.marked) {
    el.innerHTML = marked.parse(markdownText);
  } else {
    el.textContent = markdownText;
  }
}

function updateProviderAndModelDropdowns() {
  const currentSelectedProvider = providerSelect.value;
  providerSelect.innerHTML = '';

  const enabledProviders = state.providers.filter(p => p.enabled);

  if (enabledProviders.length === 0) {
    providerSelect.innerHTML = '<option value="" disabled selected>Chưa có Provider nào được bật</option>';
    modelSelect.innerHTML = '<option value="" disabled selected>Chưa có Model khả dụng</option>';
    if (selectedProviderInfo) selectedProviderInfo.textContent = 'Vui lòng bật ít nhất 1 Provider trong tab Providers Hub';
    return;
  }

  enabledProviders.forEach(prov => {
    const opt = document.createElement('option');
    opt.value = prov.id;
    const modelCount = prov.models ? prov.models.length : 0;
    const keyTag = prov.hasKey ? '✓' : '⚠️ Chưa key';
    opt.textContent = `${prov.name} (${modelCount} models • ${keyTag})`;
    providerSelect.appendChild(opt);
  });

  // Keep existing selection if still valid
  if (currentSelectedProvider && enabledProviders.some(p => p.id === currentSelectedProvider)) {
    providerSelect.value = currentSelectedProvider;
  } else {
    // Prefer the first provider that has an API key configured, otherwise first
    const firstWithKey = enabledProviders.find(p => p.hasKey);
    providerSelect.value = firstWithKey ? firstWithKey.id : enabledProviders[0].id;
  }

  updateModelDropdownForSelectedProvider();
}

function updateModelDropdownForSelectedProvider() {
  const selectedProvId = providerSelect.value;
  const prov = state.providers.find(p => p.id === selectedProvId);

  modelSelect.innerHTML = '';

  if (!prov || !prov.models || prov.models.length === 0) {
    modelSelect.innerHTML = '<option value="" disabled selected>Provider này chưa có Model</option>';
    if (selectedProviderInfo) selectedProviderInfo.textContent = 'Chưa có model nào cho Provider đã chọn';
    return;
  }

  const isFilterFree = filterFreeOnly && filterFreeOnly.checked;
  const modelsToRender = isFilterFree 
    ? prov.models.filter(m => isFreeModel(m)) 
    : prov.models;

  if (modelsToRender.length === 0) {
    modelSelect.innerHTML = '<option value="" disabled selected>Không có Model Free nào</option>';
    if (selectedProviderInfo) selectedProviderInfo.textContent = `Provider "${prov.name}" không có Model Free nào`;
    return;
  }

  modelsToRender.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model;
    const isFree = isFreeModel(model);
    opt.textContent = isFree ? `✨ [FREE] ${model}` : model;
    modelSelect.appendChild(opt);
  });

  if (modelSelect.options.length > 0) {
    modelSelect.selectedIndex = 0;
  }

  if (selectedProviderInfo) {
    const keyNotice = prov.hasKey ? '✓ Sẵn sàng' : '⚠️ Cần nhập API Key trong Hub';
    const filterNotice = isFilterFree ? `(Đang lọc: ${modelsToRender.length} Free)` : `${prov.models.length} models`;
    selectedProviderInfo.textContent = `${prov.name} (${prov.type}) • ${filterNotice} • ${keyNotice}`;
  }

  renderSnippets();
}

// -------------------------------------------------------------
// 3. PROVIDERS HUB
// -------------------------------------------------------------

async function fetchProviders() {
  try {
    const res = await fetch('/api/providers');
    state.providers = await res.json();
    renderProviders();
    updateProviderAndModelDropdowns();
    renderSnippets();
  } catch (err) {
    console.error('Failed to fetch providers:', err);
  }
}

function renderProviders() {
  providersGrid.innerHTML = '';
  const activeCount = state.providers.filter(p => p.enabled && p.hasKey).length;
  activeProvidersCountEl.textContent = activeCount;

  state.providers.forEach(p => {
    const card = document.createElement('div');
    card.className = 'provider-card';

    const isReady = p.enabled && p.hasKey;

    card.innerHTML = `
      <div class="provider-card-header">
        <div class="provider-title-group">
          <span class="status-dot ${isReady ? 'active' : 'inactive'}"></span>
          <h3>${escapeHtml(p.name)}</h3>
        </div>
        <span class="provider-badge">${p.type}</span>
      </div>

      <div class="provider-info-row">
        <span class="info-label">Base URL</span>
        <span class="info-value">${escapeHtml(p.baseUrl)}</span>
      </div>

      <div class="provider-info-row">
        <span class="info-label">API Key</span>
        <span class="info-value">${p.hasKey ? p.apiKeyMasked : '<span style="color:#ef4444">Chưa cấu hình key</span>'}</span>
      </div>

      <div class="provider-info-row">
        <span class="info-label">Models (${p.models ? p.models.length : 0})</span>
        <div class="model-tags">
          ${(p.models || []).map(m => `
            <span class="model-tag">
              ${escapeHtml(m)}
              ${isFreeModel(m) ? '<span class="badge-free">FREE</span>' : ''}
            </span>
          `).join('')}
        </div>
      </div>

      <div class="provider-actions">
        <button class="btn-ghost" onclick="testProvider('${p.id}')">
          ⚡ Ping Test
        </button>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn-small" onclick="openEditProvider('${p.id}')">Sửa</button>
          <button class="btn-small" style="color:#ef4444;" onclick="deleteProvider('${p.id}')">Xóa</button>
        </div>
      </div>
    `;

    providersGrid.appendChild(card);
  });
}

function setupProviderEvents() {
  btnOpenAddProvider.addEventListener('click', () => {
    modalProviderTitle.textContent = 'Thêm AI Provider Mới';
    pIdInput.value = '';
    providerForm.reset();
    pTypeInput.dispatchEvent(new Event('change'));
    providerModal.classList.add('active');
  });

  btnCloseModal.addEventListener('click', () => providerModal.classList.remove('active'));
  btnCancelModal.addEventListener('click', () => providerModal.classList.remove('active'));

  pTypeInput.addEventListener('change', (e) => {
    const preset = TYPE_PRESETS[e.target.value];
    if (preset && !pIdInput.value) {
      if (preset.name && (!pNameInput.value || Object.values(TYPE_PRESETS).some(x => x.name === pNameInput.value))) {
        pNameInput.value = preset.name;
      }
      pBaseUrlInput.value = preset.baseUrl;
      pModelsInput.value = preset.models;
    }
  });

  providerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedPreset = TYPE_PRESETS[pTypeInput.value];
    const resolvedType = selectedPreset?.type || pTypeInput.value;

    const providerData = {
      id: pIdInput.value || undefined,
      name: pNameInput.value.trim(),
      type: resolvedType,
      baseUrl: pBaseUrlInput.value.trim(),
      apiKey: pApiKeyInput.value.trim(),
      models: pModelsInput.value,
      enabled: pEnabledInput.checked
    };

    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerData)
      });
      if (res.ok) {
        providerModal.classList.remove('active');
        await fetchProviders();
      } else {
        const err = await res.json();
        alert('Lỗi: ' + (err.error || 'Không thể lưu provider'));
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + err.message);
    }
  });
}

window.openEditProvider = (id) => {
  const p = state.providers.find(item => item.id === id);
  if (!p) return;

  modalProviderTitle.textContent = `Chỉnh sửa: ${p.name}`;
  pIdInput.value = p.id;
  pNameInput.value = p.name;
  pTypeInput.value = p.type;
  pBaseUrlInput.value = p.baseUrl;
  pApiKeyInput.value = '';
  pApiKeyInput.placeholder = p.hasKey ? '(Đang lưu trữ key an toàn. Để trống nếu giữ nguyên)' : 'Nhập API Key mới';
  pModelsInput.value = (p.models || []).join(', ');
  pEnabledInput.checked = p.enabled;

  providerModal.classList.add('active');
};

window.deleteProvider = async (id) => {
  if (!confirm('Bạn có chắc muốn xóa Provider này khỏi Gateway?')) return;
  try {
    await fetch(`/api/providers/${id}`, { method: 'DELETE' });
    await fetchProviders();
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
};

window.testProvider = async (id) => {
  const p = state.providers.find(item => item.id === id);
  if (!p) return;

  const originalStatus = p.name;
  alert(`Đang gửi test ping tới ${p.name}... Vui lòng đợi trong giây lát.`);

  try {
    const res = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
    const result = await res.json();
    if (result.ok) {
      alert(`✅ KẾT NỐI THÀNH CÔNG!\n${result.message}`);
    } else {
      alert(`❌ THẤT BẠI:\n${result.message}`);
    }
  } catch (err) {
    alert(`❌ Lỗi: ${err.message}`);
  }
};

// -------------------------------------------------------------
// 4. GATEWAY KEYS & QUICK CODE SNIPPETS
// -------------------------------------------------------------

async function fetchKeys() {
  try {
    const res = await fetch('/api/keys');
    state.keys = await res.json();
    renderKeys();
    renderSnippets();
  } catch (err) {
    console.error('Failed to fetch keys:', err);
  }
}

function renderKeys() {
  keysList.innerHTML = '';
  if (state.keys.length === 0) {
    keysList.innerHTML = '<p class="card-desc" style="color:#ef4444">Chưa có API Key nào được tạo. Nhấp "Tạo Key Mới" để ứng dụng bên ngoài có thể gọi API.</p>';
    return;
  }

  state.keys.forEach(k => {
    const item = document.createElement('div');
    item.className = 'key-item';
    item.innerHTML = `
      <div class="key-meta">
        <span class="key-name">${escapeHtml(k.name)}</span>
        <span class="key-string">${k.key}</span>
      </div>
      <div class="key-actions">
        <button class="btn-small" onclick="copyValue('${k.key}')">Copy</button>
        <button class="btn-small" style="color:#ef4444;" onclick="deleteKey('${k.id}')">Xóa</button>
      </div>
    `;
    keysList.appendChild(item);
  });
}

function setupGatewayEvents() {
  btnNewKey.addEventListener('click', () => {
    keyNameInput.value = '';
    keyModal.classList.add('active');
  });

  btnCloseKeyModal.addEventListener('click', () => keyModal.classList.remove('active'));
  btnCancelKeyModal.addEventListener('click', () => keyModal.classList.remove('active'));

  keyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = keyNameInput.value.trim();
    if (!name) return;

    try {
      await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      keyModal.classList.remove('active');
      await fetchKeys();
    } catch (err) {
      alert('Lỗi tạo khóa: ' + err.message);
    }
  });

  snippetTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      snippetTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentSnippetLang = tab.getAttribute('data-lang');
      renderSnippets();
    });
  });

  btnCopySnippet.addEventListener('click', () => {
    const code = codeSnippetPre.textContent;
    navigator.clipboard.writeText(code);
    btnCopySnippet.textContent = 'Đã Copy!';
    setTimeout(() => { btnCopySnippet.textContent = 'Copy Code'; }, 2000);
  });
}

window.deleteKey = async (id) => {
  if (!confirm('Thu hồi API Key này? Các ứng dụng đang dùng key này sẽ bị từ chối truy cập.')) return;
  try {
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    await fetchKeys();
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
};

function renderSnippets() {
  const activeKey = state.keys.length > 0 ? state.keys[0].key : 'vz_live_your_key_here';
  const targetModel = modelSelect.value || 'gpt-4o';
  const origin = window.location.origin;

  let snippet = '';

  if (state.currentSnippetLang === 'curl') {
    snippet = `curl -X POST "${origin}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${activeKey}" \\
  -d '{
    "model": "${targetModel}",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello via VinceZone Gateway!" }
    ],
    "temperature": 0.7
  }'`;
  } else if (state.currentSnippetLang === 'python') {
    snippet = `from openai import OpenAI

# Sử dụng chính thư viện chính thức của OpenAI nhưng trỏ về VinceZone Gateway!
client = OpenAI(
    base_url="${origin}/v1",
    api_key="${activeKey}"
)

response = client.chat.completions.create(
    model="${targetModel}",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello from Python!"}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`;
  } else if (state.currentSnippetLang === 'js') {
    snippet = `import OpenAI from "openai";

// Gọi bất kỳ AI nào (Claude, Gemini, DeepSeek, OpenAI) qua 1 chuẩn duy nhất!
const openai = new OpenAI({
  baseURL: "${origin}/v1",
  apiKey: "${activeKey}"
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "${targetModel}",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello from Node.js!" }
    ]
  });

  console.log(completion.choices[0].message.content);
}

main();`;
  }

  codeSnippetPre.textContent = snippet;
}

// -------------------------------------------------------------
// 5. AUDIT LOGS
// -------------------------------------------------------------

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    state.logs = await res.json();
    renderLogs();
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  }
}

function renderLogs() {
  logsTbody.innerHTML = '';
  if (state.logs.length === 0) {
    logsTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: #71717a;">Chưa có lượt gọi API nào được ghi nhận.</td></tr>`;
    return;
  }

  state.logs.forEach(log => {
    const tr = document.createElement('tr');
    const timeStr = new Date(log.timestamp).toLocaleTimeString();
    const statusClass = log.status === 200 ? 's-200' : 's-500';

    tr.innerHTML = `
      <td>${timeStr}</td>
      <td><code>${log.endpoint}</code></td>
      <td><strong>${escapeHtml(log.model || 'N/A')}</strong></td>
      <td>${escapeHtml(log.provider || 'N/A')}</td>
      <td>${escapeHtml(log.clientIp || '127.0.0.1')}</td>
      <td><span class="badge-status ${statusClass}">${log.status}</span></td>
      <td>${log.latency ? log.latency + 'ms' : '-'}</td>
      <td>${log.tokens ? log.tokens : '-'}</td>
    `;
    logsTbody.appendChild(tr);
  });
}

btnRefreshLogs.addEventListener('click', fetchLogs);

// -------------------------------------------------------------
// 6. VINCEZONE COGNITIVE MEMORY CONTROLLER (BỘ NHỚ DÙNG CHUNG)
// -------------------------------------------------------------

async function fetchMemories() {
  try {
    const res = await fetch('/api/memories');
    const data = await res.json();
    state.memories = data.memories || [];
    state.memorySettings = data.settings || { enabled: true, autoLearn: true };
    
    if (memoryGlobalToggle) {
      memoryGlobalToggle.checked = state.memorySettings.enabled;
      const label = state.memorySettings.enabled ? 'BẬT' : 'TẮT';
      memoryGlobalToggle.nextElementSibling.innerHTML = `Bộ Nhớ: <strong>${label}</strong>`;
    }
    if (memoryAutoLearnToggle) {
      memoryAutoLearnToggle.checked = state.memorySettings.autoLearn;
      const label = state.memorySettings.autoLearn ? 'BẬT' : 'TẮT';
      memoryAutoLearnToggle.nextElementSibling.innerHTML = `Tự Học: <strong>${label}</strong>`;
    }
    
    renderMemories();
  } catch (err) {
    console.error('Failed to fetch memories:', err);
  }
}

function renderMemories() {
  if (!memoriesGrid) return;
  memoriesGrid.innerHTML = '';

  const activeCount = state.memories.filter(m => m.enabled).length;
  if (activeMemoriesCountEl) activeMemoriesCountEl.textContent = activeCount;

  // Filter memories
  let list = state.memories;
  if (state.memCategoryFilter !== 'all') {
    list = list.filter(m => m.category === state.memCategoryFilter);
  }
  if (state.memSearchTerm) {
    const q = state.memSearchTerm.toLowerCase();
    list = list.filter(m => m.content.toLowerCase().includes(q));
  }

  if (list.length === 0) {
    memoriesGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: 10px;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🧠</div>
        <h4 style="color: var(--text-white); margin-bottom: 0.35rem;">Chưa có mục ghi nhớ nào phù hợp</h4>
        <p style="font-size: 0.8rem;">Bấm "+ Thêm Ghi Nhớ" hoặc gửi tin nhắn có câu "hãy nhớ là...", "dự án của tôi..." để VinceZone tự động học hỏi.</p>
      </div>
    `;
    return;
  }

  const categoryLabels = {
    preference: 'Sở thích & Phong cách',
    project: 'Dự án',
    rule: 'Quy tắc',
    learned: 'Đã học hỏi'
  };

  list.forEach(mem => {
    const card = document.createElement('div');
    card.className = `memory-card ${mem.enabled ? '' : 'disabled'}`;

    const catLabel = categoryLabels[mem.category] || 'Ghi nhớ';
    const catClass = `mem-cat-${mem.category || 'learned'}`;
    const timeStr = new Date(mem.createdAt).toLocaleDateString('vi-VN');

    card.innerHTML = `
      <div class="memory-card-header">
        <span class="mem-cat-badge ${catClass}">${catLabel}</span>
        <label class="filter-free-wrapper" title="Bật/Tắt áp dụng ghi nhớ này">
          <input type="checkbox" ${mem.enabled ? 'checked' : ''} onchange="toggleMemory('${mem.id}')">
          <span style="font-size: 0.7rem; color: ${mem.enabled ? 'var(--status-green)' : 'var(--text-muted)'}; font-weight: 600;">
            ${mem.enabled ? 'Đang dùng' : 'Tạm tắt'}
          </span>
        </label>
      </div>

      <div class="memory-content">${escapeHtml(mem.content)}</div>

      <div class="memory-meta">
        <span>Nguồn: <strong>${escapeHtml(mem.sourceModel || 'VinceZone')}</strong> • ${timeStr}</span>
        <div class="memory-actions">
          <button class="btn-small" onclick="openEditMemory('${mem.id}')">Sửa</button>
          <button class="btn-small" style="color:#ef4444;" onclick="deleteMemory('${mem.id}')">Xóa</button>
        </div>
      </div>
    `;

    memoriesGrid.appendChild(card);
  });
}

function setupMemoryEvents() {
  const btnSyncChatMemory = document.getElementById('btn-sync-chat-memory');
  if (btnSyncChatMemory) {
    btnSyncChatMemory.addEventListener('click', async () => {
      btnSyncChatMemory.disabled = true;
      const originalText = btnSyncChatMemory.innerHTML;
      btnSyncChatMemory.innerHTML = '⏳ Đang quét lịch sử chat...';

      try {
        const res = await authFetch('/api/memories/sync-from-chats', { method: 'POST' });
        const result = await res.json();
        await fetchMemories();
        if (result.count > 0) {
          alert(`Đã trích xuất và học được ${result.count} kiến thức mới từ các cuộc hội thoại của bạn!`);
        } else {
          alert('Bộ nhớ nhận thức đã cập nhật đầy đủ toàn bộ thông tin từ lịch sử chat.');
        }
      } catch (err) {
        alert('Lỗi đồng bộ bộ nhớ: ' + err.message);
      } finally {
        btnSyncChatMemory.disabled = false;
        btnSyncChatMemory.innerHTML = originalText;
      }
    });
  }

  if (btnOpenAddMemory) {
    btnOpenAddMemory.addEventListener('click', () => {
      modalMemoryTitle.textContent = 'Thêm Ghi Nhớ Vào VinceZone';
      memIdInput.value = '';
      memoryForm.reset();
      memoryModal.classList.add('active');
    });
  }

  if (btnCloseMemoryModal) btnCloseMemoryModal.addEventListener('click', () => memoryModal.classList.remove('active'));
  if (btnCancelMemoryModal) btnCancelMemoryModal.addEventListener('click', () => memoryModal.classList.remove('active'));

  if (memorySearchInput) {
    memorySearchInput.addEventListener('input', (e) => {
      state.memSearchTerm = e.target.value.trim();
      renderMemories();
    });
  }

  memFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      memFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.memCategoryFilter = btn.getAttribute('data-cat');
      renderMemories();
    });
  });

  if (memoryGlobalToggle) {
    memoryGlobalToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await fetch('/api/memories/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      state.memorySettings.enabled = enabled;
      const label = enabled ? 'BẬT' : 'TẮT';
      memoryGlobalToggle.nextElementSibling.innerHTML = `Bộ Nhớ: <strong>${label}</strong>`;
      renderMemories();
    });
  }

  if (memoryAutoLearnToggle) {
    memoryAutoLearnToggle.addEventListener('change', async (e) => {
      const autoLearn = e.target.checked;
      await fetch('/api/memories/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoLearn })
      });
      state.memorySettings.autoLearn = autoLearn;
      const label = autoLearn ? 'BẬT' : 'TẮT';
      memoryAutoLearnToggle.nextElementSibling.innerHTML = `Tự Học: <strong>${label}</strong>`;
    });
  }

  if (memoryForm) {
    memoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = memContentInput.value.trim();
      const category = memCategorySelect.value;
      if (!content) return;

      try {
        await fetch('/api/memories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: memIdInput.value || undefined,
            content,
            category
          })
        });
        memoryModal.classList.remove('active');
        await fetchMemories();
      } catch (err) {
        alert('Lỗi lưu ghi nhớ: ' + err.message);
      }
    });
  }
}

window.toggleMemory = async (id) => {
  try {
    await fetch(`/api/memories/${id}/toggle`, { method: 'POST' });
    await fetchMemories();
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
};

window.openEditMemory = (id) => {
  const m = state.memories.find(item => item.id === id);
  if (!m) return;
  modalMemoryTitle.textContent = 'Chỉnh sửa Ghi Nhớ';
  memIdInput.value = m.id;
  memContentInput.value = m.content;
  memCategorySelect.value = m.category || 'learned';
  memoryModal.classList.add('active');
};

window.deleteMemory = async (id) => {
  if (!confirm('Xóa mục ghi nhớ này khỏi Bộ nhớ VinceZone?')) return;
  try {
    await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    await fetchMemories();
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
};

window.quickRememberText = async (text, currentModel) => {
  if (!text) return;
  try {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text,
        category: 'learned',
        sourceModel: currentModel || 'Playground'
      })
    });
    if (res.ok) {
      alert(`🧠 Đã lưu vào Bộ nhớ VinceZone!\n\n"${text}"\n\nTất cả các AI khác (OpenCode, Kilo, ZenMux, Gemini...) khi bạn trò chuyện sẽ tự động áp dụng ghi nhớ này.`);
      await fetchMemories();
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
};

// -------------------------------------------------------------
// 7. AUTHENTICATION CONTROLLER (ĐĂNG NHẬP / ĐĂNG KÝ)
// -------------------------------------------------------------

async function fetchCurrentUser() {
  if (!state.authToken) {
    renderAuthUI(null);
    return;
  }
  try {
    const res = await authFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      state.currentUser = data.user;
      renderAuthUI(state.currentUser);
    } else {
      state.authToken = '';
      localStorage.removeItem('vz_auth_token');
      renderAuthUI(null);
    }
  } catch {
    renderAuthUI(null);
  }
}

function renderAuthUI(user) {
  if (user) {
    if (userLoggedInBox) userLoggedInBox.style.display = 'flex';
    if (userDisplayName) userDisplayName.textContent = user.displayName || user.username;
    if (btnOpenAuthModal) btnOpenAuthModal.style.display = 'none';
  } else {
    if (userLoggedInBox) userLoggedInBox.style.display = 'none';
    if (btnOpenAuthModal) btnOpenAuthModal.style.display = 'block';
  }
}

function setupAuthEvents() {
  if (btnOpenAuthModal) {
    btnOpenAuthModal.addEventListener('click', () => {
      setAuthMode('login');
      authModal.classList.add('active');
    });
  }

  if (btnCloseAuthModal) btnCloseAuthModal.addEventListener('click', () => authModal.classList.remove('active'));
  if (btnCancelAuthModal) btnCancelAuthModal.addEventListener('click', () => authModal.classList.remove('active'));

  if (authTabLogin) authTabLogin.addEventListener('click', () => setAuthMode('login'));
  if (authTabRegister) authTabRegister.addEventListener('click', () => setAuthMode('register'));

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await authFetch('/api/auth/logout', { method: 'POST' });
      state.authToken = '';
      state.currentUser = null;
      localStorage.removeItem('vz_auth_token');
      renderAuthUI(null);
      await fetchChatHistory();
      startNewChat();
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = authUsernameInput.value.trim();
      const password = authPasswordInput.value;
      const email = authEmailInput.value.trim();

      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = { username, password };
      if (authMode === 'register' && email) payload.email = email;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          state.authToken = data.token;
          state.currentUser = data.user;
          localStorage.setItem('vz_auth_token', data.token);
          renderAuthUI(data.user);
          authModal.classList.remove('active');
          authForm.reset();
          await fetchChatHistory();
        } else {
          alert('Lỗi: ' + (data.error || 'Xác thực thất bại'));
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
      }
    });
  }
}

function setAuthMode(mode) {
  authMode = mode;
  if (mode === 'login') {
    authTabLogin.classList.add('active');
    authTabRegister.classList.remove('active');
    btnAuthSubmit.textContent = 'Đăng Nhập';
    authEmailGroup.style.display = 'none';
    authHint.style.display = 'block';
  } else {
    authTabRegister.classList.add('active');
    authTabLogin.classList.remove('active');
    btnAuthSubmit.textContent = 'Đăng Ký Tài Khoản';
    authEmailGroup.style.display = 'flex';
    authHint.style.display = 'none';
  }
}

// -------------------------------------------------------------
// 8. CHAT HISTORY CONTROLLER (BỘ NHỚ LỊCH SỬ CHAT)
// -------------------------------------------------------------

async function fetchChatHistory() {
  try {
    const res = await authFetch('/api/chats');
    const data = await res.json();
    if (Array.isArray(data)) {
      state.chats = data;
      state.isGuest = !state.currentUser;
    } else if (data && data.chats) {
      state.chats = data.chats;
      state.isGuest = data.isGuest;
      state.retentionInfo = data.retentionInfo;
    }
    renderChatHistoryList();
  } catch (err) {
    console.error('Failed to fetch chat history:', err);
  }
}

function renderChatHistoryList() {
  if (!chatHistoryList) return;
  chatHistoryList.innerHTML = '';

  if (chatHistoryCount) chatHistoryCount.textContent = state.chats.length;

  // Retention Pill Status
  const retentionPill = document.getElementById('history-retention-pill');
  const retentionText = document.getElementById('retention-text');
  if (retentionPill && retentionText) {
    if (state.currentUser && !state.isGuest) {
      retentionPill.className = 'history-retention-pill permanent';
      retentionText.textContent = '🔒 Lưu vĩnh viễn (Đã đăng nhập)';
      retentionPill.title = 'Tài khoản đã đăng nhập, lịch sử trò chuyện được lưu trữ an toàn lâu dài.';
    } else {
      retentionPill.className = 'history-retention-pill';
      retentionText.textContent = '⏳ Khách: Lưu 3 ngày (Đăng nhập để lưu lâu dài)';
      retentionPill.title = 'Tài khoản khách chỉ lưu tạm trong 3 ngày. Hãy đăng nhập để lưu trữ vĩnh viễn.';
    }
  }

  if (state.chats.length === 0) {
    chatHistoryList.innerHTML = `
      <div style="text-align: center; padding: 2rem 0.5rem; color: var(--text-muted); font-size: 0.75rem;">
        Chưa có lịch sử chat nào.<br>Hãy bắt đầu cuộc trò chuyện mới!
      </div>
    `;
    return;
  }

  state.chats.forEach(chat => {
    const item = document.createElement('div');
    const isActive = chat.id === state.currentChatId;
    item.className = `history-item ${isActive ? 'active' : ''}`;
    
    const timeStr = formatRelativeTime(chat.updatedAt || chat.createdAt);
    const retentionBadge = chat.isGuest 
      ? `<span style="color:#eab308;font-size:0.65rem;" title="${chat.retention || 'Tạm lưu 3 ngày'}">• 3 ngày</span>`
      : `<span style="color:#22c55e;font-size:0.65rem;" title="Lưu vĩnh viễn">• Vĩnh viễn</span>`;

    item.innerHTML = `
      <div class="history-item-body">
        <span class="history-item-title" title="${escapeHtml(chat.title)}">${escapeHtml(chat.title)}</span>
        <div class="history-item-meta">
          <code>${escapeHtml(chat.model || 'AI')}</code>
          <span>• ${timeStr}</span>
          ${retentionBadge}
        </div>
      </div>
      <button class="history-item-del" title="Xóa đoạn chat này" onclick="deleteChatSession(event, '${chat.id}')">&times;</button>
    `;

    item.onclick = (e) => {
      if (e.target.classList.contains('history-item-del')) return;
      loadChatSession(chat.id);
    };

    chatHistoryList.appendChild(item);
  });
}

function setupChatHistoryEvents() {
  if (btnNewChat) {
    btnNewChat.addEventListener('click', () => {
      startNewChat();
    });
  }

  if (btnClearAllHistory) {
    btnClearAllHistory.addEventListener('click', () => {
      clearAllChatHistory();
    });
  }

  if (btnDeleteCurrentChat) {
    btnDeleteCurrentChat.addEventListener('click', () => {
      if (state.currentChatId) {
        deleteChatSession(null, state.currentChatId);
      } else {
        startNewChat();
      }
    });
  }
}

async function autoSaveCurrentChat() {
  try {
    const payload = {
      id: state.currentChatId || undefined,
      title: state.currentChatTitle || 'Cuộc trò chuyện mới',
      model: modelSelect.value,
      provider: providerSelect.options[providerSelect.selectedIndex]?.text || 'Provider',
      messages: state.chatHistory
    };

    const res = await authFetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const saved = await res.json();
    if (saved && saved.id) {
      state.currentChatId = saved.id;
      state.currentChatTitle = saved.title;
      if (activeSessionTitle) activeSessionTitle.textContent = saved.title;
      await fetchChatHistory();
    }
  } catch (err) {
    console.error('Failed to auto-save chat session:', err);
  }
}

async function loadChatSession(id) {
  try {
    const res = await authFetch(`/api/chats/${id}`);
    if (!res.ok) throw new Error('Không thể tải đoạn chat');
    const chat = await res.json();

    state.currentChatId = chat.id;
    state.currentChatTitle = chat.title;
    state.chatHistory = chat.messages || [];

    if (activeSessionTitle) activeSessionTitle.textContent = chat.title;

    chatMessages.innerHTML = '';
    const banner = chatMessages.querySelector('.welcome-banner');
    if (banner) banner.remove();

    if (state.chatHistory.length === 0) {
      chatMessages.innerHTML = `
        <div class="welcome-banner">
          <div class="welcome-icon">💬</div>
          <h3>${escapeHtml(chat.title)}</h3>
          <p>Chưa có tin nhắn trong phiên này. Nhập câu hỏi bên dưới để chat tiếp!</p>
        </div>
      `;
    } else {
      for (const msg of state.chatHistory) {
        renderCanvasMessageBubble(msg.role, msg.content, msg.model || chat.model);
      }
    }

    renderChatHistoryList();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (err) {
    alert('Lỗi tải cuộc trò chuyện: ' + err.message);
  }
}

function renderCanvasMessageBubble(role, content, modelName) {
  const row = document.createElement('div');
  row.className = `chat-row ${role}`;

  const author = document.createElement('div');
  author.className = 'chat-author';
  const authorTitle = role === 'user' ? '👤 BẠN' : `⚡ ${modelName || modelSelect.value || 'AI'}`;
  author.innerHTML = `<span>${authorTitle}</span>`;

  let textToDisplay = '';
  const imageParts = [];

  if (typeof content === 'string') {
    textToDisplay = content;
  } else if (Array.isArray(content)) {
    content.forEach(p => {
      if (p.type === 'text') textToDisplay += (textToDisplay ? '\n' : '') + p.text;
      if (p.type === 'image_url' && p.image_url?.url) imageParts.push(p.image_url.url);
    });
  }

  if (role === 'user' && textToDisplay) {
    const btnRem = document.createElement('button');
    btnRem.type = 'button';
    btnRem.className = 'btn-remember-chat';
    btnRem.textContent = '🧠 Ghi nhớ';
    btnRem.title = 'Lưu ý này vào Bộ nhớ dùng chung của VinceZone';
    btnRem.onclick = () => quickRememberText(textToDisplay, modelSelect.value);
    author.appendChild(btnRem);
  }

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if (imageParts.length > 0) {
    const attContainer = document.createElement('div');
    attContainer.className = 'message-attachments-container';
    imageParts.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'msg-attachment-img';
      img.title = 'Xem ảnh phóng to';
      img.onclick = () => {
        const w = window.open('');
        w.document.write(`<body style="background:#000;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:95vw;max-height:95vh;object-fit:contain;"></body>`);
      };
      attContainer.appendChild(img);
    });
    bubble.appendChild(attContainer);
  }

  const textNode = document.createElement('div');
  textNode.className = 'chat-bubble-text';

  if (role === 'user') {
    textNode.textContent = textToDisplay;
    bubble.appendChild(textNode);
  } else {
    textNode.innerHTML = textToDisplay ? marked.parse(textToDisplay) : '';
    bubble.appendChild(textNode);
  }

  row.appendChild(author);
  row.appendChild(bubble);
  chatMessages.appendChild(row);
}

function startNewChat() {
  state.currentChatId = null;
  state.currentChatTitle = 'Đoạn hội thoại mới';
  state.chatHistory = [];
  if (activeSessionTitle) activeSessionTitle.textContent = 'Đoạn hội thoại mới';

  chatMessages.innerHTML = `
    <div class="welcome-banner">
      <div class="welcome-icon">⚡</div>
      <h3>VinceZone Workplay Canvas</h3>
      <p>Nơi thử nghiệm trực tiếp các AI Model đã gom từ các Provider (OpenCode, Kilo Gateway, ZenMux, OpenAI, Gemini...).</p>
      <p class="sub-hint">Mẹo: Bạn có thể chọn Model bất kỳ từ thanh bên phải và bắt đầu trò chuyện ngay lập tức. Toàn bộ lịch sử sẽ tự động lưu lại ở thanh bên trái để chat tiếp bất kỳ lúc nào.</p>
    </div>
  `;
  renderChatHistoryList();
}

window.deleteChatSession = async (e, id) => {
  if (e) e.stopPropagation();
  if (!confirm('Bạn có chắc muốn xóa cuộc trò chuyện này khỏi lịch sử?')) return;
  try {
    await authFetch(`/api/chats/${id}`, { method: 'DELETE' });
    if (state.currentChatId === id) {
      startNewChat();
    }
    await fetchChatHistory();
  } catch (err) {
    alert('Lỗi xóa đoạn chat: ' + err.message);
  }
};

async function clearAllChatHistory() {
  if (!confirm('Xóa toàn bộ tất cả các cuộc hội thoại trong lịch sử? Hành động này không thể hoàn tác.')) return;
  try {
    await authFetch('/api/chats', { method: 'DELETE' });
    startNewChat();
    await fetchChatHistory();
  } catch (err) {
    alert('Lỗi xóa lịch sử: ' + err.message);
  }
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return date.toLocaleDateString('vi-VN');
}

// -------------------------------------------------------------
// UTILITIES
// -------------------------------------------------------------

window.copyValue = (val) => {
  navigator.clipboard.writeText(val);
  alert('Đã sao chép vào bộ nhớ tạm: ' + val);
};

window.copyText = (elId) => {
  const text = document.getElementById(elId).textContent;
  navigator.clipboard.writeText(text);
  alert('Đã sao chép: ' + text);
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
