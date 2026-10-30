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
  promptsCategoryFilter: 'all',
  promptsSearchTerm: '',
  customPrompts: JSON.parse(localStorage.getItem('vz_custom_prompts') || '[]'),
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
const purposeSelect = document.getElementById('playground-purpose-select');
const purposeBadge = document.getElementById('purpose-badge');
const purposeHint = document.getElementById('purpose-hint');
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

// User Profile Elements (Hồ sơ người dùng & Chỉ thị AI)
const profileLockedBox = document.getElementById('profile-locked-box');
const profileFormBox = document.getElementById('profile-form-box');
const profileActiveUsername = document.getElementById('profile-active-username');
const profileSubtabBadge = document.getElementById('profile-subtab-badge');
const btnProfileLogin = document.getElementById('btn-profile-login');
const formUserProfile = document.getElementById('form-user-profile');
const profDisplayName = document.getElementById('prof-display-name');
const profRole = document.getElementById('prof-role');
const profProjects = document.getElementById('prof-projects');
const profTechstack = document.getElementById('prof-techstack');
const profStyle = document.getElementById('prof-style');
const profRules = document.getElementById('prof-rules');
const profNotes = document.getElementById('prof-notes');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnReloadProfile = document.getElementById('btn-reload-profile');
const profileSaveStatus = document.getElementById('profile-save-status');

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
  setupPromptEvents();
  setupAuthEvents();
  setupUserProfileEvents();
  setupChatHistoryEvents();

  // Load initial data
  await Promise.all([
    fetchCurrentUser(),
    fetchUserProfile(),
    fetchProviders(),
    fetchKeys(),
    fetchLogs(),
    fetchMemories(),
    fetchChatHistory()
  ]);

  renderSnippets();
  renderPrompts();
});

// -------------------------------------------------------------
// 1. NAVIGATION
// -------------------------------------------------------------

function setupNavigation() {
  // Top nav (Playground vs Prompt Hub vs Cài Đặt)
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(`tab-${targetTab}`);
      if (pane) pane.classList.add('active');

      if (targetTab === 'prompts') {
        renderPrompts();
      }

      if (targetTab === 'settings') {
        const activeSubtabBtn = document.querySelector('.settings-nav-item.active');
        const activeSubtab = activeSubtabBtn ? activeSubtabBtn.getAttribute('data-subtab') : 'profile';
        if (activeSubtab === 'profile') fetchUserProfile();
        if (activeSubtab === 'providers') fetchProviders();
        if (activeSubtab === 'gateway') fetchKeys();
        if (activeSubtab === 'memory') fetchMemories();
        if (activeSubtab === 'logs') fetchLogs();
      }
    });
  });

  // Settings Sub-Navigation (Thông Tin Người Dùng, Providers Hub, Gateway API, Bộ Nhớ, Logs)
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

      if (subtab === 'profile') fetchUserProfile();
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

  if (purposeSelect) {
    purposeSelect.addEventListener('change', () => {
      updateModelDropdownForSelectedProvider();
    });
  }

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

      const response = await authFetch('/api/playground/chat', {
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

  checkAndAutoSwitchToVisionModel();

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
    // Prefer Kilo Gateway (which is 100% active, reliable, and completely free)
    const kiloProv = enabledProviders.find(p => p.id === 'prov_kilo_gateway');
    const firstWithKey = kiloProv || enabledProviders.find(p => p.hasKey);
    providerSelect.value = firstWithKey ? firstWithKey.id : enabledProviders[0].id;
  }

  updateModelDropdownForSelectedProvider();
}

function getModelCapabilities(model) {
  const m = (model || '').toLowerCase();
  
  // Vision / Multimodal detection (ảnh, video, sơ đồ)
  const isVision = m.includes('omni') || 
                   m.includes('vl') || 
                   m.includes('vision') || 
                   m.includes('dots-3-note') || 
                   m.includes('dots3') ||
                   m.includes('gpt-4o') || 
                   m.includes('gemini') || 
                   m.includes('claude-3') || 
                   m.includes('claude-3.5') || 
                   m.includes('claude-3-7') || 
                   m.includes('super-vl');

  // Coding detection (lập trình, refactor, debug)
  const isCode = m.includes('code') || 
                 m.includes('coder') || 
                 m.includes('laguna') || 
                 m.includes('flint') || 
                 m.includes('deepseek') || 
                 m.includes('qwen') || 
                 m.includes('claude') || 
                 m.includes('gpt-4o') || 
                 m.includes('gemini');

  // Reasoning detection (suy luận logic sâu, toán, r1, o1, o3)
  const isReasoning = m.includes('reason') || 
                      m.includes('r1') || 
                      m.includes('o1') || 
                      m.includes('o3') || 
                      m.includes('ultra') || 
                      m.includes('deepseek-reasoner') || 
                      m.includes('xing');

  // General / Fast Chat (hội thoại nhanh, tổng quát)
  const isGeneral = m.includes('auto') || 
                    m.includes('flash') || 
                    m.includes('mini') || 
                    m.includes('lightning') || 
                    m.includes('lfm') || 
                    m.includes('chat') || 
                    m.includes('mimo') || 
                    m.includes('beam') || 
                    m.includes('pickle');

  return { isVision, isCode, isReasoning, isGeneral };
}

function checkAndAutoSwitchToVisionModel() {
  const hasImage = state.pendingAttachments.some(a => a.type === 'image');
  if (!hasImage) return;

  const curProv = state.providers.find(p => p.id === providerSelect.value);
  const curModel = modelSelect.value;
  const isCurModelVision = curModel && getModelCapabilities(curModel).isVision;

  if (!isCurModelVision) {
    if (purposeSelect) purposeSelect.value = 'vision';

    const hasVisionModel = curProv && curProv.models.some(m => getModelCapabilities(m).isVision);
    if (!hasVisionModel) {
      // Switch provider to Kilo Gateway which has working free vision models
      const kiloProv = state.providers.find(p => p.id === 'prov_kilo_gateway' && p.enabled);
      if (kiloProv) {
        providerSelect.value = kiloProv.id;
      }
    }

    updateModelDropdownForSelectedProvider();

    // Select the best vision model in dropdown
    const visionOpt = Array.from(modelSelect.options).find(o => 
      o.value.includes('omni') || o.value.includes('dots-3-note') || o.value.includes('vision') || o.value.includes('vl')
    );
    if (visionOpt) {
      modelSelect.value = visionOpt.value;
    }

    showToast('📸 Đã phát hiện ảnh đính kèm: Hệ thống tự động chuyển sang Tác vụ Vision và chọn mô hình hỗ trợ đọc ảnh!');
  }
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

  const selectedPurpose = purposeSelect ? purposeSelect.value : 'all';
  const isFilterFree = filterFreeOnly && filterFreeOnly.checked;

  // 1. Lọc danh sách theo Tác vụ / Dùng để làm gì
  let modelsByPurpose = prov.models;
  if (selectedPurpose === 'vision') {
    modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isVision);
  } else if (selectedPurpose === 'code') {
    modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isCode);
  } else if (selectedPurpose === 'reasoning') {
    modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isReasoning);
  } else if (selectedPurpose === 'general') {
    modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isGeneral);
  }

  // 2. Lọc theo Free-only nếu được bật
  const modelsToRender = isFilterFree 
    ? modelsByPurpose.filter(m => isFreeModel(m)) 
    : modelsByPurpose;

  // Cập nhật Purpose Hint & Trạng thái hướng dẫn
  if (purposeHint) {
    if (selectedPurpose === 'vision') {
      if (modelsByPurpose.length > 0) {
        purposeHint.textContent = `✓ Đã lọc ${modelsByPurpose.length} model có khả năng nhìn & phân tích ảnh (Multimodal Vision)`;
        purposeHint.style.color = 'var(--status-green)';
      } else {
        purposeHint.textContent = `⚠️ Provider "${prov.name}" không có model đọc ảnh. Hãy chuyển Provider sang Kilo Gateway (Omni) hoặc Gemini / GPT-4o`;
        purposeHint.style.color = '#f87171';
      }
    } else if (selectedPurpose === 'code') {
      purposeHint.textContent = `✓ Đã lọc ${modelsByPurpose.length} model tối ưu cho lập trình, debug & refactor code`;
      purposeHint.style.color = '#60a5fa';
    } else if (selectedPurpose === 'reasoning') {
      purposeHint.textContent = `✓ Đã lọc ${modelsByPurpose.length} model có chuỗi tư duy suy luận logic sâu (Reasoning)`;
      purposeHint.style.color = '#c084fc';
    } else if (selectedPurpose === 'general') {
      purposeHint.textContent = `✓ Đã lọc ${modelsByPurpose.length} model phản hồi nhanh & tiết kiệm tài nguyên`;
      purposeHint.style.color = '#fbbf24';
    } else {
      purposeHint.textContent = `Hiển thị toàn bộ ${prov.models.length} model của ${prov.name}`;
      purposeHint.style.color = 'var(--text-secondary)';
    }
  }

  if (modelsToRender.length === 0) {
    const reasonText = selectedPurpose !== 'all' 
      ? `Không có model nào cho tác vụ này trong ${prov.name}` 
      : 'Không có Model Free nào';
    modelSelect.innerHTML = `<option value="" disabled selected>${reasonText}</option>`;
    if (selectedProviderInfo) selectedProviderInfo.textContent = `Vui lòng chọn tác vụ khác hoặc đổi Provider`;
    return;
  }

  modelsToRender.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model;
    const isFree = isFreeModel(model);
    const caps = getModelCapabilities(model);

    let tagStr = '';
    if (caps.isVision) tagStr += ' 👁️ Vision';
    if (caps.isCode) tagStr += ' 💻 Code';
    if (caps.isReasoning) tagStr += ' 🧠 Logic';

    opt.textContent = `${isFree ? '✨ [FREE] ' : ''}${model}${tagStr}`;
    modelSelect.appendChild(opt);
  });

  if (modelSelect.options.length > 0) {
    modelSelect.selectedIndex = 0;
  }

  if (selectedProviderInfo) {
    const keyNotice = prov.hasKey ? '✓ Sẵn sàng' : '⚠️ Cần nhập API Key trong Hub';
    const filterNotice = isFilterFree ? `(Đang lọc: ${modelsToRender.length} Free)` : `${modelsToRender.length} models phù hợp`;
    selectedProviderInfo.textContent = `${prov.name} • ${filterNotice} • ${keyNotice}`;
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
  fetchUserProfile();
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
// 7.1 USER PROFILE & PERMANENT AI DIRECTIVES CONTROLLER
// -------------------------------------------------------------

async function fetchUserProfile() {
  if (!profileLockedBox || !profileFormBox) return;

  if (!state.authToken || !state.currentUser) {
    profileLockedBox.style.display = 'flex';
    profileFormBox.style.display = 'none';
    if (profileSubtabBadge) {
      profileSubtabBadge.textContent = 'Khách';
      profileSubtabBadge.style.background = '#27272a';
      profileSubtabBadge.style.color = '#a1a1aa';
    }
    return;
  }

  profileLockedBox.style.display = 'none';
  profileFormBox.style.display = 'flex';
  if (profileActiveUsername) {
    profileActiveUsername.textContent = state.currentUser.displayName || state.currentUser.username;
  }

  try {
    const res = await authFetch('/api/user/profile');
    if (res.ok) {
      const data = await res.json();
      const prof = data.profile || {};
      state.userProfile = prof;

      if (profDisplayName) profDisplayName.value = prof.displayName || state.currentUser.displayName || state.currentUser.username || '';
      if (profRole) profRole.value = prof.role || '';
      if (profProjects) profProjects.value = prof.activeProjects || '';
      if (profTechstack) profTechstack.value = prof.techStack || '';
      if (profStyle) profStyle.value = prof.preferredStyle || '';
      if (profRules) profRules.value = prof.criticalRules || '';
      if (profNotes) profNotes.value = prof.customNotes || '';

      const hasContent = Boolean(prof.displayName || prof.role || prof.criticalRules || prof.techStack);
      if (profileSubtabBadge) {
        profileSubtabBadge.textContent = hasContent ? 'Đã kích hoạt' : 'Đã đăng nhập';
        profileSubtabBadge.style.background = hasContent ? 'rgba(34, 197, 94, 0.15)' : '#27272a';
        profileSubtabBadge.style.color = hasContent ? 'var(--status-green)' : '#a1a1aa';
      }
    }
  } catch (err) {
    console.error('Lỗi khi tải thông tin hồ sơ người dùng:', err);
  }
}

async function saveUserProfile(e) {
  if (e) e.preventDefault();
  if (!state.authToken || !state.currentUser) {
    alert('Vui lòng đăng nhập để lưu thông tin và hồ sơ AI.');
    return;
  }

  const payload = {
    displayName: profDisplayName ? profDisplayName.value.trim() : '',
    role: profRole ? profRole.value.trim() : '',
    activeProjects: profProjects ? profProjects.value.trim() : '',
    techStack: profTechstack ? profTechstack.value.trim() : '',
    preferredStyle: profStyle ? profStyle.value.trim() : '',
    criticalRules: profRules ? profRules.value.trim() : '',
    customNotes: profNotes ? profNotes.value.trim() : ''
  };

  if (btnSaveProfile) {
    btnSaveProfile.disabled = true;
    btnSaveProfile.innerHTML = '⏳ Đang lưu dữ liệu...';
  }

  try {
    const res = await authFetch('/api/user/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      state.userProfile = data.profile;
      if (data.profile.displayName && state.currentUser) {
        state.currentUser.displayName = data.profile.displayName;
        if (userDisplayName) userDisplayName.textContent = data.profile.displayName;
        if (profileActiveUsername) profileActiveUsername.textContent = data.profile.displayName;
      }
      if (profileSaveStatus) {
        profileSaveStatus.textContent = '✓ Đã lưu thành công! Toàn bộ AI sẽ ghi nhớ dữ liệu này.';
        profileSaveStatus.style.display = 'inline';
        setTimeout(() => {
          if (profileSaveStatus) profileSaveStatus.style.display = 'none';
        }, 4000);
      }
      if (profileSubtabBadge) {
        profileSubtabBadge.textContent = 'Đã kích hoạt';
        profileSubtabBadge.style.background = 'rgba(34, 197, 94, 0.15)';
        profileSubtabBadge.style.color = 'var(--status-green)';
      }
    } else {
      alert('Không thể lưu hồ sơ: ' + (data.error || 'Lỗi không xác định'));
    }
  } catch (err) {
    alert('Lỗi kết nối lưu hồ sơ: ' + err.message);
  } finally {
    if (btnSaveProfile) {
      btnSaveProfile.disabled = false;
      btnSaveProfile.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Lưu Thông Tin & Hồ Sơ AI
      `;
    }
  }
}

function setupUserProfileEvents() {
  if (btnProfileLogin) {
    btnProfileLogin.addEventListener('click', () => {
      setAuthMode('login');
      if (authModal) authModal.classList.add('active');
    });
  }

  if (formUserProfile) {
    formUserProfile.addEventListener('submit', saveUserProfile);
  }

  if (btnReloadProfile) {
    btnReloadProfile.addEventListener('click', () => {
      fetchUserProfile();
    });
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

// -------------------------------------------------------------
// TOAST NOTIFICATION SYSTEM
// -------------------------------------------------------------

function showToast(msg, duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.innerHTML = `
    <span style="font-size: 1.15rem; color: var(--status-green);">✓</span>
    <span style="flex: 1;">${escapeHtml(msg)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// -------------------------------------------------------------
// KHO THƯ VIỆN PROMPT (PROMPT HUB)
// -------------------------------------------------------------

const BUILTIN_PROMPTS = [
  // 1. Chỉnh ảnh & Vision AI
  {
    id: 'p_img_1',
    category: 'image',
    catLabel: '🖼️ Chỉnh ảnh & Vision',
    icon: '📸',
    title: 'Tạo Ảnh Chân Dung Điện Ảnh 8K (Cinematic Portrait)',
    desc: 'Tạo câu lệnh mô tả chi tiết bằng tiếng Anh theo phong cách nhiếp ảnh điện ảnh 8K, ánh sáng hoàng hôn, độ sâu trường ảnh mờ ảo.',
    tags: ['Midjourney', 'Photorealism', 'Cinematic', '8K Bokeh'],
    level: 'Chuyên sâu',
    prompt: `Một bức ảnh chân dung phong cách điện ảnh (Cinematic photography), chụp bằng ống kính 85mm f/1.4, ánh sáng vàng lúc hoàng hôn (golden hour lighting), chi tiết khuôn mặt sắc nét 8K, độ sâu trường ảnh nông (bokeh mềm mịn), tông màu moody ấm áp, tương phản cao, phong cách nghệ thuật nhiếp ảnh đoạt giải National Geographic, chân thực không tì vết.`
  },
  {
    id: 'p_img_2',
    category: 'image',
    catLabel: '🖼️ Chỉnh ảnh & Vision',
    icon: '🎨',
    title: 'Phân Tích Thị Giác & Tinh Chỉnh Lightroom/Photoshop',
    desc: 'Quan sát ảnh đính kèm, phân tích bố cục, màu sắc và gợi ý bảng thông số tinh chỉnh cụ thể kèm prompt tái tạo ảnh.',
    tags: ['Vision AI', 'Lightroom Presets', 'Photoshop', 'Color Grading'],
    level: 'Chuyên sâu',
    prompt: `Bạn là chuyên gia phân tích thị giác và chỉnh sửa ảnh nghệ thuật chuyên nghiệp. Hãy quan sát bức ảnh tôi đính kèm và thực hiện các yêu cầu:
1. Đánh giá bố cục, ánh sáng, độ cân bằng trắng và độ tương phản hiện tại.
2. Chỉ ra các khuyết điểm cần tối ưu (vùng cháy sáng, tối mất chi tiết, nhiễu hạt, góc nghiêng).
3. Gợi ý bảng thông số tinh chỉnh cụ thể (Exposure, Contrast, Highlights, Shadows, Temp, Tint, Clarity, Dehaze).
4. Viết 1 câu Prompt tiếng Anh hoàn chỉnh (kèm các từ khóa negative prompt) để tôi có thể tạo lại hoặc nâng cấp bức ảnh này trên các AI vẽ ảnh (Midjourney, Stable Diffusion, DALL-E).`
  },
  {
    id: 'p_img_3',
    category: 'image',
    catLabel: '🖼️ Chỉnh ảnh & Vision',
    icon: '✨',
    title: 'Phục Chế & Nâng Cấp Chi Tiết Ảnh Cũ / Mờ (Restoration)',
    desc: 'Tái tạo và khử nhiễu ảnh cũ, phục hồi đường nét khuôn mặt, tăng độ phân giải siêu nét và tô màu tự nhiên.',
    tags: ['Restoration', 'Upscale', 'Face Enhance', 'Colorize'],
    level: 'Nâng cao',
    prompt: `Đóng vai trò chuyên gia phục chế hình ảnh kỹ thuật số (Digital Photo Restoration Expert). Phân tích bức ảnh cũ/mờ đính kèm:
1. Xác định niên đại, phong cách và các hư tổn chính (trầy xước, ố vàng, mất nét, vỡ hạt pixel).
2. Đề xuất quy trình phục dựng: Khử nhiễu, tái tạo đường nét mắt mũi miệng, và phương án lên màu (colorization) tự nhiên.
3. Tạo câu prompt tiếng Anh chi tiết để đưa vào các công cụ AI Upscale & Inpainting phục hồi bức ảnh về độ phân giải siêu nét.`
  },
  {
    id: 'p_img_4',
    category: 'image',
    catLabel: '🖼️ Chỉnh ảnh & Vision',
    icon: '🎭',
    title: 'Chuyển Đổi Phong Cách Ảnh Thật Sang Anime / 3D Pixar / Cyberpunk',
    desc: 'Tạo prompt biến đổi ảnh chân dung người thật sang các phong cách hoạt hình 3D Pixar hoặc Anime Nhật Bản cao cấp.',
    tags: ['Style Transfer', '3D Pixar', 'Anime Makoto Shinkai', 'Cyberpunk'],
    level: 'Sáng tạo',
    prompt: `Hãy chuyển đổi bức ảnh chân dung/khung cảnh tôi đính kèm sang phong cách nghệ thuật [Chọn: 3D Pixar Animation / Anime phong cách Makoto Shinkai / Cyberpunk Neon]:
- Giữ nguyên các đặc điểm nhận dạng khuôn mặt, thần thái và trang phục gốc.
- Tái tạo với ánh sáng nghệ thuật đặc trưng, bảng màu rực rỡ, đường nét cách điệu mượt mà.
- Cung cấp prompt tiếng Anh hoàn chỉnh có đầy đủ các thông số stylize, quality và aspect ratio để tôi dán vào Midjourney v6.`
  },
  {
    id: 'p_img_5',
    category: 'image',
    catLabel: '🖼️ Chỉnh ảnh & Vision',
    icon: '🖼️',
    title: 'Thiết Kế Poster Quảng Cáo & Typography Thương Mại',
    desc: 'Thiết lập bố cục hình ảnh thương mại cao cấp với không gian chừa sẵn cho logo và tiêu đề sản phẩm (Negative Space).',
    tags: ['Commercial', 'Poster Design', 'Negative Space', 'Product Ads'],
    level: 'Thương mại',
    prompt: `Tạo câu lệnh hình ảnh quảng cáo sản phẩm thương mại cao cấp (Commercial Product Ad) cho sản phẩm [Tên sản phẩm]:
- Phong cách: Studio tối giản, phông nền đơn sắc sang trọng, đổ bóng mềm mại, ánh sáng viền (rim light) làm nổi bật chất liệu sản phẩm.
- Bố cục: Chừa khoảng không gian trống phía trên hoặc một bên (Copy space / Negative space) để thiết kế thêm chữ và logo thương hiệu.
- Độ phân giải: Siêu chi tiết 8K, thể hiện rõ texture bề mặt vật liệu (kim loại bóng, thủy tinh trong suốt hoặc mờ sang trọng).`
  },

  // 2. Giáo dục & Tạo đề thi
  {
    id: 'p_exam_1',
    category: 'exam',
    catLabel: '📚 Tạo đề thi & Giáo dục',
    icon: '📝',
    title: 'Biên Soạn Đề Thi Trắc Nghiệm Chuẩn Ma Trận Bloom',
    desc: 'Tạo bộ 10 câu trắc nghiệm 4 đáp án theo đúng 4 mức độ nhận thức (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao) kèm lời giải.',
    tags: ['Ma trận Bloom', 'Khảo thí', 'Đáp án & Lời giải', '4 Cấp độ'],
    level: 'Sư phạm',
    prompt: `Bạn là chuyên gia khảo thí và sư phạm giàu kinh nghiệm. Dựa vào nội dung kiến thức được cung cấp (hoặc tài liệu đính kèm), hãy biên soạn đề kiểm tra trắc nghiệm gồm 10 câu hỏi theo đúng ma trận phân hóa chuẩn:
- 3 câu Nhận biết (30%)
- 3 câu Thông hiểu (30%)
- 2 câu Vận dụng (20%)
- 2 câu Vận dụng cao (20%)

Yêu cầu định dạng:
Mỗi câu có 4 phương án A, B, C, D rõ ràng. Các phương án nhiễu phải hợp lý, mang tính phân loại học sinh tốt.
Phần cuối đề: Trình bày bảng đáp án chuẩn kèm lời giải thích chi tiết, logic vì sao chọn đáp án đó.`
  },
  {
    id: 'p_exam_2',
    category: 'exam',
    catLabel: '📚 Tạo đề thi & Giáo dục',
    icon: '📊',
    title: 'Đề Thi Tự Luận & Bảng Tiêu Chí Chấm Điểm (Rubric)',
    desc: 'Thiết kế 3 câu hỏi tự luận đào sâu tư duy phản biện và giải quyết tình huống kèm biểu điểm chi tiết thang điểm 10.',
    tags: ['Tự luận', 'Rubric Thang 10', 'Tư duy phản biện', 'Tình huống'],
    level: 'Chuyên sâu',
    prompt: `Dựa vào tài liệu hoặc chủ đề bài học tôi cung cấp, hãy biên soạn 3 câu hỏi tự luận đánh giá năng lực tư duy phản biện và vận dụng thực tiễn của người học:
- Câu 1: Câu hỏi lý thuyết chuyên sâu kết hợp so sánh / phân tích (3 điểm)
- Câu 2: Câu hỏi giải quyết tình huống thực tế (4 điểm)
- Câu 3: Câu hỏi mở đề xuất giải pháp sáng tạo (3 điểm)

Kèm theo: Bảng tiêu chí chấm điểm (Rubric) chi tiết đến từng 0.5 điểm, nêu rõ các ý bắt buộc phải có để học viên đạt điểm tối đa.`
  },
  {
    id: 'p_exam_3',
    category: 'exam',
    catLabel: '📚 Tạo đề thi & Giáo dục',
    icon: '💡',
    title: 'Gia Sư Phương Pháp Vấn Đáp Socrates (Socratic Tutor)',
    desc: 'Đóng vai gia sư thông thái hỏi đáp từng câu một để kích thích người học tự tư duy tìm ra câu trả lời thay vì cho đáp án ngay.',
    tags: ['Socrates', 'Vấn đáp gợi mở', 'Gia sư AI', 'Tư duy sâu'],
    level: 'Tương tác',
    prompt: `Hãy đóng vai trò một gia sư thông thái áp dụng phương pháp vấn đáp Socrates. Chủ đề hôm nay là: [Tên bài học hoặc tài liệu đính kèm].
Quy tắc:
1. Không đưa ra ngay bài giảng dài hay đáp án trực tiếp.
2. Hãy đặt cho tôi từng câu hỏi một (từ dễ đến khó) để gợi mở và kiểm tra hiểu biết của tôi.
3. Sau mỗi lần tôi trả lời, hãy nhận xét ngắn gọn và đặt câu hỏi tiếp theo để dẫn dắt tôi tự khám phá ra bản chất vấn đề.`
  },
  {
    id: 'p_exam_4',
    category: 'exam',
    catLabel: '📚 Tạo đề thi & Giáo dục',
    icon: '📇',
    title: 'Tạo Bộ Flashcards Ghi Nhớ Nhanh & Thuật Ngữ Cốt Lõi',
    desc: 'Chắt lọc tài liệu thành các cặp thẻ Mặt trước (Khái niệm/Câu hỏi) và Mặt sau (Giải nghĩa ngắn gọn/Ví dụ) tương thích Anki.',
    tags: ['Flashcard', 'Anki CSV', 'Ghi nhớ Spaced Repetition', 'Từ vựng'],
    level: 'Thực dụng',
    prompt: `Từ nội dung tài liệu đính kèm, hãy trích xuất thành một bộ gồm 15 Flashcards tối ưu cho phương pháp lặp lại ngắt quãng (Spaced Repetition):
- Cấu trúc từng thẻ gồm 2 mặt:
  + Mặt trước (Front): Câu hỏi trọng tâm, khái niệm hoặc tình huống ngắn gọn.
  + Mặt sau (Back): Định nghĩa cô đọng dưới 35 từ kèm ví dụ minh họa trực quan.
- Cuối cùng, xuất ra định dạng bảng 2 cột phân cách bằng dấu tab (TSV) để tôi nhập thẳng vào ứng dụng Anki / Quizlet.`
  },
  {
    id: 'p_exam_5',
    category: 'exam',
    catLabel: '📚 Tạo đề thi & Giáo dục',
    icon: '📑',
    title: 'Tóm Tắt Tài Liệu & Sách Học Thuật Chuẩn Cornell Notes',
    desc: 'Ghi chép và tóm lược sách vở theo hệ thống Cornell gồm Cột ghi chú, Cột từ khóa câu hỏi gợi nhớ và Khối đúc kết cuối trang.',
    tags: ['Cornell Notes', 'Tóm tắt sách', 'Học tập thông minh', 'Tư duy hệ thống'],
    level: 'Học thuật',
    prompt: `Hãy đọc kỹ tài liệu đính kèm và trình bày lại theo phương pháp ghi chú Cornell Notes chuẩn học thuật:
1. Cột Cue (Câu hỏi cốt lõi & Từ khóa then chốt): Liệt kê các câu hỏi lớn và thuật ngữ định nghĩa.
2. Cột Notes (Nội dung ghi chép chi tiết): Tóm tắt các luận điểm, dữ kiện, công thức và ví dụ tương ứng.
3. Phần Summary (Đúc kết cốt lõi cuối bài): Viết một đoạn tóm tắt từ 3-5 câu cô đọng toàn bộ tinh thần và bài học ứng dụng thực tiễn của tài liệu.`
  },

  // 3. Xử lý tài liệu & Chuyển PDF sang Word
  {
    id: 'p_doc_1',
    category: 'document',
    catLabel: '📄 Chuyển PDF sang Word',
    icon: '📑',
    title: 'Chuyển Đổi PDF / Scan Sang Word Giữ Nguyên Bảng Biểu',
    desc: 'Trích xuất toàn bộ văn bản từ file PDF hoặc ảnh chụp, tái tạo bảng Markdown chuẩn và sửa lỗi xuống dòng ngắt quãng.',
    tags: ['PDF to Word', 'OCR Clean', 'Bảng biểu Markdown', 'Chữa lỗi ngắt dòng'],
    level: 'Chuyên sâu',
    prompt: `Bạn là trợ lý xử lý tài liệu và OCR cấp cao. Từ nội dung hoặc hình ảnh tệp PDF được đính kèm, hãy chuyển đổi sang văn bản hoàn chỉnh để tôi dán trực tiếp vào Microsoft Word với các yêu cầu:
1. Giữ nguyên 100% cấu trúc phân cấp (Tiêu đề lớn, Tiêu đề phụ, Danh sách gạch đầu dòng 1, 2, 3).
2. Tái tạo các bảng biểu thành dạng Bảng Markdown chuẩn (đầy đủ các cột, dòng và số liệu chính xác).
3. Tự động khắc phục lỗi xuống dòng ngắt quãng (line-break thừa giữa các câu do PDF chia cột).
4. Giữ nguyên toàn bộ số liệu, đơn vị tính, ngày tháng và thuật ngữ chuyên môn không được tự ý sửa đổi.`
  },
  {
    id: 'p_doc_2',
    category: 'document',
    catLabel: '📄 Chuyển PDF sang Word',
    icon: '⚖️',
    title: 'Trích Xuất Hợp Đồng & Văn Bản Pháp Lý Chuẩn Thể Thức',
    desc: 'Đọc tệp hợp đồng/văn bản PDF, trích xuất điều khoản, quyền & nghĩa vụ, số tiền và chuẩn hóa thể thức hành chính.',
    tags: ['Hợp đồng', 'Pháp lý', 'Điều khoản', 'Thể thức hành chính'],
    level: 'Chuyên gia',
    prompt: `Hãy đóng vai trò chuyên viên pháp chế và tài liệu doanh nghiệp. Đọc kỹ tệp hợp đồng/báo cáo PDF được đính kèm và trích xuất:
1. Thông tin định danh: Các bên tham gia, đại diện pháp luật, số hợp đồng, ngày hiệu lực.
2. Bảng tóm tắt các mốc tài chính: Giá trị hợp đồng, các đợt thanh toán, thời hạn và số tài khoản.
3. Toàn bộ nội dung điều khoản đã được định dạng lại chuẩn thể thức văn bản hành chính Việt Nam (có căn lề, mục rõ ràng) sẵn sàng sao chép vào Word.`
  },
  {
    id: 'p_doc_3',
    category: 'document',
    catLabel: '📄 Chuyển PDF sang Word',
    icon: '🧾',
    title: 'Trích Xuất Hóa Đơn / Sao Kê Ngân Hàng Thành Bảng Excel / CSV',
    desc: 'Bóc tách dữ liệu từ ảnh chụp hóa đơn GTGT hoặc sao kê PDF thành bảng dữ liệu có cấu trúc chuẩn cột Excel.',
    tags: ['Invoice OCR', 'Sao kê ngân hàng', 'Bóc tách hóa đơn', 'Excel CSV'],
    level: 'Kế toán',
    prompt: `Hãy phân tích hình ảnh hóa đơn / bảng sao kê PDF đính kèm và trích xuất dữ liệu thành một Bảng Markdown sạch chuẩn Excel gồm các cột:
- [Ngày giao dịch]
- [Mã hóa đơn / Mã tham chiếu]
- [Tên hàng hóa / Dịch vụ / Nội dung giao dịch]
- [Số lượng]
- [Đơn giá]
- [Thuế VAT (%)]
- [Thành tiền (VND)]
Cuối bảng có dòng Tổng cộng tiền hàng, Tiền thuế và Tổng thanh toán. Không bỏ sót bất kỳ dòng dữ liệu nào.`
  },
  {
    id: 'p_doc_4',
    category: 'document',
    catLabel: '📄 Chuyển PDF sang Word',
    icon: '🔍',
    title: 'So Sánh & Đối Chiếu Khác Biệt Giữa 2 Phiên Bản Văn Bản (Diff)',
    desc: 'Chỉ ra tất cả các điểm thay đổi, thêm vào, bớt đi hoặc sửa đổi giữa 2 tài liệu / hợp đồng được cung cấp.',
    tags: ['Document Diff', 'So sánh hợp đồng', 'Kiểm tra phiên bản', 'Bảo đảm an toàn'],
    level: 'Kiểm soát',
    prompt: `Hãy so sánh hai đoạn văn bản / hai tài liệu PDF tôi đính kèm (Phiên bản A và Phiên bản B):
1. Liệt kê toàn bộ các điểm khác biệt chi tiết theo từng điều khoản/đoạn văn (Nội dung nào bị xóa, nội dung nào được thêm mới, câu từ nào bị sửa đổi).
2. Đánh giá mức độ rủi ro hoặc tác động pháp lý/nghĩa vụ của những thay đổi này.
3. Xuất ra bảng đối chiếu 3 cột: [Khoản mục] | [Phiên bản cũ] | [Phiên bản mới] để dễ dàng theo dõi.`
  },

  // 4. Lập trình & Kỹ thuật
  {
    id: 'p_code_1',
    category: 'code',
    catLabel: '💻 Lập trình & Debug',
    icon: '🐛',
    title: 'Senior Code Review & Tối Ưu Hóa Clean Code',
    desc: 'Phân tích lỗi tiềm ẩn, tìm Memory Leak/Race Condition, refactor code sạch và đánh giá độ phức tạp Big-O.',
    tags: ['Code Review', 'Clean Code', 'Performance', 'Big-O', 'Refactor'],
    level: 'Senior Staff',
    prompt: `Bạn là Kỹ sư phần mềm cao cấp (Senior Staff Engineer). Hãy phân tích đoạn mã nguồn sau đây:
1. Phát hiện và chỉ ra tất cả các lỗi tiềm ẩn (Logic bugs, Memory leaks, Race conditions, Security vulnerabilities, Edge cases).
2. Giải thích cặn kẽ nguyên nhân gốc rễ (Root Cause) vì sao lỗi xảy ra.
3. Cung cấp đoạn mã đã được Refactor hoàn chỉnh: Chuẩn Clean Code, xử lý try/catch an toàn, chú thích rõ ràng.
4. Đánh giá độ phức tạp thời gian & không gian (Big-O notation) trước và sau khi tối ưu.`
  },
  {
    id: 'p_code_2',
    category: 'code',
    catLabel: '💻 Lập trình & Debug',
    icon: '🧪',
    title: 'Viết Bộ Unit Test Toàn Diện (Full Coverage Unit Testing)',
    desc: 'Tự động tạo bộ test cases bao gồm Happy Path, Edge Cases, Mocking và Error Handling bằng Jest/PyTest.',
    tags: ['Unit Test', 'Jest', 'PyTest', 'Mocking', 'Edge Cases'],
    level: 'QA & Dev',
    prompt: `Đóng vai trò QA Lead & Senior Developer. Hãy viết bộ Unit Test toàn diện cho hàm/mô-đun code được cung cấp:
- Bao gồm đầy đủ: Happy path (trường hợp chuẩn), Edge cases (giá trị biên, rỗng, null/undefined, số âm, mảng rỗng), và Error Handling (ném lỗi đúng loại).
- Tạo dữ liệu giả lập (Mock data) thực tế.
- Viết code test sạch, dễ bảo trì theo chuẩn AAA (Arrange - Act - Assert).`
  },
  {
    id: 'p_code_3',
    category: 'code',
    catLabel: '💻 Lập trình & Debug',
    icon: '🏛️',
    title: 'Thiết Kế Kiến Trúc Hệ Thống & Lược Đồ Database (Schema Designer)',
    desc: 'Thiết kế kiến trúc ứng dụng (Microservices / Modular Monolith) kèm lược đồ SQL / NoSQL và chỉ mục Indexing tối ưu.',
    tags: ['System Architecture', 'Database Schema', 'PostgreSQL', 'Indexing', 'Scalability'],
    level: 'Architect',
    prompt: `Đóng vai trò Solution Architect. Với bài toán hệ thống: [Mô tả yêu cầu ứng dụng và quy mô người dùng].
Hãy thiết kế:
1. Kiến trúc hệ thống tổng quan (Tech stack đề xuất, giao tiếp giữa các service, cơ chế Cache, Message Queue).
2. Lược đồ cơ sở dữ liệu chi tiết (Bảng, trường, kiểu dữ liệu, khóa chính, khóa ngoại, chỉ số Index để truy vấn nhanh).
3. Đề xuất các giải pháp bảo đảm mở rộng (Scalability) và tính sẵn sàng cao (High Availability).`
  },
  {
    id: 'p_code_4',
    category: 'code',
    catLabel: '💻 Lập trình & Debug',
    icon: '📖',
    title: 'Soạn Tài Liệu API Chuẩn OpenAPI / Swagger Kèm Ví Dụ Curl',
    desc: 'Biến các đoạn code backend controller thành tài liệu API chi tiết chuẩn RESTful, có schema request/response và mã lỗi HTTP.',
    tags: ['API Docs', 'Swagger', 'OpenAPI 3.0', 'cURL examples'],
    level: 'Chuyên nghiệp',
    prompt: `Dựa vào đoạn code backend hoặc mô tả endpoint sau, hãy biên soạn tài liệu API chuẩn kỹ thuật:
- Phương thức HTTP & Đường dẫn Endpoint.
- Header yêu cầu (Authorization, Content-Type).
- Request Payload (Body / Query params) kèm định dạng kiểu dữ liệu và trường bắt buộc.
- Bảng mã phản hồi HTTP (200, 201, 400, 401, 404, 500) kèm JSON Response mẫu thực tế.
- Câu lệnh kiểm thử cURL mẫu hoàn chỉnh có thể copy chạy ngay trong Terminal.`
  },
  {
    id: 'p_code_5',
    category: 'code',
    catLabel: '💻 Lập trình & Debug',
    icon: '⚡',
    title: 'Chuyên Gia Tối Ưu Truy Vấn SQL & Database Bottleneck',
    desc: 'Phân tích câu lệnh SQL bị chậm, giải thích EXPLAIN ANALYZE, đề xuất Index tối ưu và cấu trúc lại câu lệnh.',
    tags: ['SQL Optimization', 'EXPLAIN ANALYZE', 'Indexing', 'Performance Tuning'],
    level: 'DBA',
    prompt: `Tôi có câu truy vấn SQL sau đang chạy rất chậm trên cơ sở dữ liệu:
[Dán câu lệnh SQL và lược đồ bảng].
Hãy giúp tôi:
1. Phân tích nguyên nhân gây nghẽn (Table scan, nested loop không hiệu quả, thiếu index, hàm trong mệnh đề WHERE).
2. Viết lại câu lệnh SQL tối ưu nhất.
3. Đề xuất câu lệnh tạo Index chính xác (Composite index nếu cần) để tăng tốc độ truy vấn gấp nhiều lần.`
  },

  // 5. Marketing & Sáng tạo nội dung
  {
    id: 'p_mkt_1',
    category: 'marketing',
    catLabel: '✍️ Marketing & Content',
    icon: '🚀',
    title: 'Bài Viết Chuẩn SEO Chuyên Sâu Tối Ưu E-E-A-T',
    desc: 'Xây dựng bài viết chuẩn SEO đầy đủ tiêu đề giật tít, mở bài lôi cuốn, thẻ H2/H3 giá trị và kêu gọi hành động CTA.',
    tags: ['Google SEO', 'E-E-A-T', 'Content Pillar', 'High CTR'],
    level: 'Chuyên sâu',
    prompt: `Bạn là chuyên gia SEO & Content Marketing hàng đầu. Hãy viết bài viết toàn diện, chuyên sâu về chủ đề [Chủ đề] với từ khóa chính: [Từ khóa]:
- Tiêu đề: Cuốn hút, chứa từ khóa chính, độ dài dưới 60 ký tự.
- Meta Description: Tóm lược 150 ký tự kích thích tỷ lệ nhấp (CTR).
- Mở bài: Dùng kỹ thuật Hook mạnh mẽ giữ chân người đọc ngay 3 giây đầu.
- Thân bài: Chia thành các thẻ H2, H3 mạch lạc, cung cấp số liệu thực tế, ví dụ trực quan, giải quyết triệt để thắc mắc người đọc.
- Kết bài & CTA: Đúc kết giá trị và kêu gọi hành động tự nhiên, không gượng ép.`
  },
  {
    id: 'p_mkt_2',
    category: 'marketing',
    catLabel: '✍️ Marketing & Content',
    icon: '🎬',
    title: 'Kịch Bản Video Ngắn 60 Giây Triệu View (TikTok / Reels / Shorts)',
    desc: 'Kịch bản video ngắn phân chia rõ khung hình thị giác (Visual) và lời thoại (Voiceover) với Hook cực mạnh.',
    tags: ['TikTok Script', 'Reels', 'Shorts', '3s Hook', 'Viral'],
    level: 'Sáng tạo',
    prompt: `Hãy viết kịch bản video ngắn 60 giây về chủ đề [Chủ đề] theo chuẩn công thức viral:
- [0 - 3s] Hook cực gắt: Câu nói hoặc hình ảnh gây sốc/bất ngờ khiến người xem không thể lướt qua.
- [3 - 45s] Thân bài: Chia sẻ 3 bí kíp/sự thật đắt giá được cô đọng, dứt khoát, nhịp điệu nhanh.
- [45 - 60s] Kêu gọi hành động & Gợi mở tranh luận: Kích thích thả tim, lưu video và để lại bình luận tranh luận.
Trình bày rõ theo 2 cột: [Hình ảnh/Hành động diễn xuất] và [Lời thoại/Âm thanh].`
  },
  {
    id: 'p_mkt_3',
    category: 'marketing',
    catLabel: '✍️ Marketing & Content',
    icon: '🎯',
    title: 'Copywriting Bán Hàng Thuyết Phục Theo Công Thức PAS',
    desc: 'Viết bài bán hàng đánh trúng nỗi đau khách hàng theo mô hình PAS (Problem - Agitate - Solve) kích thích chốt đơn.',
    tags: ['Copywriting', 'Công thức PAS', 'Tâm lý khách hàng', 'Chuyển đổi'],
    level: 'Thuyết phục',
    prompt: `Hãy viết bài viết bán hàng cho sản phẩm/dịch vụ [Tên sản phẩm] nhắm tới đối tượng [Khách hàng mục tiêu] theo công thức PAS:
1. Problem (Nêu bật nỗi đau): Nêu chính xác rắc rối phiền toái mà khách hàng đang chịu đựng mỗi ngày.
2. Agitate (Xoáy sâu nỗi đau): Mô tả hậu quả nghiêm trọng và chi phí nếu tiếp tục trì hoãn không giải quyết.
3. Solve (Giải pháp hoàn hảo): Giới thiệu sản phẩm như một cứu cánh tự nhiên, minh chứng bằng kết quả thực tế và bảo đảm rủi ro (Risk-free Guarantee).`
  },
  {
    id: 'p_mkt_4',
    category: 'marketing',
    catLabel: '✍️ Marketing & Content',
    icon: '📧',
    title: 'Chuỗi Email Nuôi Dưỡng & Chăm Sóc Khách Hàng (Email Sequence)',
    desc: 'Thiết kế chuỗi 3 email chào mừng và chuyển đổi khách hàng tiềm năng với tiêu đề mở mail trên 45%.',
    tags: ['Email Marketing', 'Cold Outreach', 'Nurture Sequence', 'Conversion'],
    level: 'B2B & B2C',
    prompt: `Hãy thiết kế chuỗi 3 email nuôi dưỡng khách hàng mới đăng ký trải nghiệm [Tên dịch vụ/sản phẩm]:
- Email 1 (Ngay lập tức): Lời chào nồng nhiệt, tặng kèm quà tặng/tài liệu giá trị, hướng dẫn bước đầu tiên đơn giản nhất.
- Email 2 (Ngày thứ 2): Câu chuyện thành công thực tế (Case study) của một khách hàng đã giải quyết vấn đề tương tự.
- Email 3 (Ngày thứ 4): Ưu đãi đặc quyền có giới hạn thời gian (Scarcity) kèm lời kêu gọi nâng cấp tài khoản rõ ràng.`
  },

  // 6. Phân tích dữ liệu & Excel
  {
    id: 'p_data_1',
    category: 'data',
    catLabel: '📊 Phân tích dữ liệu & Excel',
    icon: '📈',
    title: 'Phù Thủy Công Thức Excel & Google Sheets Nâng Cao',
    desc: 'Giải quyết bài toán dò tìm phức tạp, mảng động (XLOOKUP, FILTER, INDEX-MATCH) kèm script tự động hóa.',
    tags: ['Excel Formulas', 'XLOOKUP', 'FILTER', 'Mảng động', 'Google Sheets'],
    level: 'Nâng cao',
    prompt: `Bạn là chuyên gia phân tích dữ liệu và tự động hóa bảng tính Excel/Google Sheets. Tôi đang gặp bài toán dữ liệu sau: [Mô tả chi tiết cấu trúc cột và mục tiêu cần tính toán].
Hãy cung cấp:
1. Công thức tối ưu nhất (sử dụng các hàm hiện đại như XLOOKUP, FILTER, UNIQUE, ARRAYFORMULA).
2. Hướng dẫn từng bước cách công thức xử lý dữ liệu để tôi hiểu bản chất.
3. Đoạn mã Python (dùng thư viện Pandas) hoặc Google Apps Script nếu bảng tính quá nhiều dòng cần tự động hóa hàng loạt.`
  },
  {
    id: 'p_data_2',
    category: 'data',
    catLabel: '📊 Phân tích dữ liệu & Excel',
    icon: '🤖',
    title: 'Viết Macro VBA & Google Apps Script Tự Động Hóa Báo Cáo',
    desc: 'Tự động tổng hợp dữ liệu từ nhiều sheet, định dạng bảng biểu, gửi email báo cáo hàng ngày chỉ với 1 click.',
    tags: ['VBA Macro', 'Google Apps Script', 'Tự động hóa', 'Auto Reporting'],
    level: 'Tự động hóa',
    prompt: `Hãy viết mã nguồn [VBA Macro cho Excel / Google Apps Script cho Google Sheets] để tự động hóa công việc sau:
[Mô tả quy trình: Ví dụ gom các sheet chi nhánh vào sheet tổng hợp, xóa dòng trống, định dạng cột tiền tệ và tô màu cảnh báo nếu quá hạn].
- Mã nguồn phải có chú thích bằng tiếng Việt chi tiết từng dòng.
- Xử lý lỗi an toàn (Error Handling) để không bị crash khi dữ liệu có ô rỗng hoặc lỗi cú pháp.`
  },
  {
    id: 'p_data_3',
    category: 'data',
    catLabel: '📊 Phân tích dữ liệu & Excel',
    icon: '📊',
    title: 'Phân Tích Chỉ Số Tài Chính & Tăng Trưởng Kinh Doanh (Financial Modeling)',
    desc: 'Tính toán các chỉ số kinh doanh quan trọng (CAC, LTV, Churn rate, Runway, ROI) và đề xuất phương án cải thiện.',
    tags: ['Financial Analysis', 'SaaS Metrics', 'LTV & CAC', 'ROI Optimization'],
    level: 'Chiến lược',
    prompt: `Đóng vai trò Giám đốc Tài chính (CFO) kiêm Chuyên gia Phân tích Dữ liệu Kinh doanh. Dựa trên số liệu sau: [Cung cấp số liệu doanh thu, chi phí marketing, số lượng khách hàng...].
Hãy tính toán và phân tích:
1. Các chỉ số cốt lõi: Chi phí thu hút khách hàng (CAC), Giá trị vòng đời (LTV), Tỷ lệ LTV/CAC, Tỷ lệ rời bỏ (Churn Rate).
2. Nhận định sức khỏe tài chính và điểm nghẽn lớn nhất trong mô hình kinh doanh hiện tại.
3. Đề xuất 3 hành động cụ thể để cải thiện biên lợi nhuận trong quý tới.`
  },

  // 7. Dịch thuật & Học thuật
  {
    id: 'p_trans_1',
    category: 'translation',
    catLabel: '💼 Dịch thuật chuyên sâu',
    icon: '🌐',
    title: 'Dịch Thuật Bản Địa Hóa Song Ngữ Anh - Việt Chuyên Ngành',
    desc: 'Dịch thuật thoát ý, đúng ngữ cảnh chuyên ngành, văn phong tự nhiên như người bản xứ thay vì dịch máy thô cứng.',
    tags: ['Bản địa hóa', 'Anh - Việt', 'Thoát ý tự nhiên', 'Chuẩn thuật ngữ'],
    level: 'Chuyên gia',
    prompt: `Bạn là dịch giả song ngữ cao cấp chuyên ngành Công nghệ và Kinh doanh. Hãy dịch đoạn văn bản sau đây sang tiếng Việt:
Yêu cầu bắt buộc:
1. Tuyệt đối không dịch thô word-by-word. Dịch thoát ý, tự nhiên, nhuần nhuyễn theo phong cách của chuyên gia bản địa.
2. Giữ nguyên và dùng chuẩn các thuật ngữ chuyên ngành đã được thị trường công nhận.
3. Chú thích ngắn gọn trong ngoặc đơn các từ viết tắt hoặc thuật ngữ mới lần đầu xuất hiện.`
  },
  {
    id: 'p_trans_2',
    category: 'translation',
    catLabel: '💼 Dịch thuật chuyên sâu',
    icon: '🎓',
    title: 'Hiệu Đính & Nâng Cấp Luận Văn Học Thuật Chuẩn Quốc Tế',
    desc: 'Sửa lỗi ngữ pháp, cải thiện vốn từ vựng học thuật cao cấp (C1/C2), trau chuốt cấu trúc câu cho bài báo khoa học.',
    tags: ['Academic Proofreading', 'IELTS / TOEFL', 'Bài báo khoa học', 'C1/C2 Vocab'],
    level: 'Học thuật',
    prompt: `Hãy đóng vai trò một Giáo sư biên tập bài báo học thuật chuẩn quốc tế (Academic Editor). Đọc đoạn văn bản học thuật tiếng Anh sau:
1. Sửa toàn bộ lỗi ngữ pháp, dùng từ và cách diễn đạt gượng gạo.
2. Nâng cấp các từ vựng thông thường thành từ vựng học thuật trang trọng (C1/C2 Academic vocabulary).
3. Đảm bảo tính mạch lạc, liên kết giữa các câu bằng các từ nối học thuật tinh tế.
4. Xuất ra bảng so sánh [Câu gốc] vs [Câu đã trau chuốt] kèm lời giải thích ngắn gọn vì sao sửa như vậy.`
  },
  {
    id: 'p_trans_3',
    category: 'translation',
    catLabel: '💼 Dịch thuật chuyên sâu',
    icon: '✉️',
    title: 'Viết Email Giao Tiếp Thương Mại Quốc Tế Trang Trọng',
    desc: 'Soạn thảo email tiếng Anh ngoại giao, đàm phán hợp đồng hoặc khiếu nại đối tác một cách khéo léo, dứt khoát.',
    tags: ['Business English', 'Đàm phán thương mại', 'Email ngoại giao', 'Chuyên nghiệp'],
    level: 'Thương mại',
    prompt: `Hãy viết một email bằng tiếng Anh thương mại chuyên nghiệp gửi tới [Đối tác / Khách hàng quốc tế] về vấn đề: [Mục đích email: Đàm phán giá / Thông báo chậm tiến độ / Đề xuất hợp tác].
- Giọng văn: Lịch thiệp, trang trọng, thể hiện sự tôn trọng nhưng dứt khoát và rõ ràng về quyền lợi.
- Bố cục: Tiêu đề súc tích, mở đầu chuyên nghiệp, thân bài đi thẳng vào nội dung cốt lõi kèm giải pháp, kết thúc bằng lời kêu gọi hành động (Call to action) cụ thể.`
  }
];

function getAllPrompts() {
  return [...BUILTIN_PROMPTS, ...state.customPrompts];
}

function renderPrompts() {
  const grid = document.getElementById('prompts-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const all = getAllPrompts();
  const cat = state.promptsCategoryFilter || 'all';
  const search = (state.promptsSearchTerm || '').toLowerCase();

  // Update category counts on filter buttons
  const catCounts = { all: all.length };
  all.forEach(p => {
    catCounts[p.category] = (catCounts[p.category] || 0) + 1;
  });

  const filterBtns = document.querySelectorAll('.prompt-filter-btn');
  filterBtns.forEach(btn => {
    const c = btn.getAttribute('data-cat');
    const count = catCounts[c] || 0;
    // Extract base text
    let baseText = btn.getAttribute('data-base-label');
    if (!baseText) {
      baseText = btn.textContent.replace(/\s*\(\d+\)$/, '').trim();
      btn.setAttribute('data-base-label', baseText);
    }
    btn.innerHTML = `${baseText} <span class="prompt-filter-count">${count}</span>`;
  });

  // Update stat total count
  const statTotalEl = document.getElementById('stat-total-prompts');
  if (statTotalEl) statTotalEl.textContent = `${all.length}+`;

  const filtered = all.filter(p => {
    const matchCat = cat === 'all' || p.category === cat;
    const matchSearch = !search || 
      p.title.toLowerCase().includes(search) || 
      p.desc.toLowerCase().includes(search) || 
      p.prompt.toLowerCase().includes(search) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(search)));
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3.5rem 1rem; color: var(--text-muted); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: 12px;">
        <div style="font-size: 2.2rem; margin-bottom: 0.65rem;">🔍</div>
        <h4 style="color: var(--text-white); margin-bottom: 0.35rem;">Không tìm thấy Prompt phù hợp</h4>
        <p style="font-size: 0.85rem;">Hãy thử tìm từ khóa khác hoặc bấm "+ Tạo Prompt Mới" để lưu công thức của riêng bạn.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'prompt-card';

    const catBadgeClass = `cat-${item.category}`;
    const wordCount = item.prompt.trim().split(/\s+/).length;
    const tagsHtml = (item.tags || []).map(t => `<span class="prompt-tag">${escapeHtml(t)}</span>`).join('');

    card.innerHTML = `
      <div class="prompt-card-header">
        <div class="prompt-title-group">
          <span class="prompt-icon">${item.icon || '💡'}</span>
          <div>
            <h4 class="prompt-card-title">${escapeHtml(item.title)}</h4>
          </div>
        </div>
        <span class="prompt-badge ${catBadgeClass}">${escapeHtml(item.catLabel || item.category)}</span>
      </div>

      <p class="prompt-card-desc">${escapeHtml(item.desc || '')}</p>

      ${tagsHtml ? `<div class="prompt-tags-list">${tagsHtml}</div>` : ''}

      <div class="prompt-meta-row">
        <span>Độ dài: <strong>~${wordCount} từ</strong></span>
        <span>Cấp độ: <strong>${escapeHtml(item.level || 'Chuẩn hóa')}</strong></span>
      </div>

      <div class="prompt-box">${escapeHtml(item.prompt)}</div>

      <div class="prompt-card-footer">
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <button class="btn-copy-prompt" title="Sao chép prompt này" onclick="window.copyPromptById(this, '${item.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Sao chép</span>
          </button>
          <button class="btn-sys-prompt" title="Nạp vào System Prompt của Playground" onclick="window.applyAsSystemPromptById('${item.id}')">
            <span>⚙️ System</span>
          </button>
        </div>

        <button class="btn-use-prompt" title="Sao chép & chuyển thẳng sang Playground để điền sẵn" onclick="window.applyPromptById('${item.id}')">
          <span>Áp dụng vào Playground</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `;

    grid.appendChild(card);
  });
}

function setupPromptEvents() {
  const searchInput = document.getElementById('prompt-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.promptsSearchTerm = e.target.value.trim();
      renderPrompts();
    });
  }

  const filterBtns = document.querySelectorAll('.prompt-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.promptsCategoryFilter = btn.getAttribute('data-cat');
      renderPrompts();
    });
  });

  // Modal events
  const btnOpenAddPrompt = document.getElementById('btn-open-add-prompt');
  const promptModal = document.getElementById('prompt-modal');
  const btnClosePromptModal = document.getElementById('btn-close-prompt-modal');
  const btnCancelPromptModal = document.getElementById('btn-cancel-prompt-modal');
  const promptForm = document.getElementById('prompt-form');

  if (btnOpenAddPrompt) {
    btnOpenAddPrompt.addEventListener('click', () => {
      promptForm.reset();
      promptModal.classList.add('active');
    });
  }

  if (btnClosePromptModal) btnClosePromptModal.onclick = () => promptModal.classList.remove('active');
  if (btnCancelPromptModal) btnCancelPromptModal.onclick = () => promptModal.classList.remove('active');

  if (promptForm) {
    promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('custom-prompt-title').value.trim();
      const cat = document.getElementById('custom-prompt-cat').value;
      const desc = document.getElementById('custom-prompt-desc').value.trim();
      const content = document.getElementById('custom-prompt-content').value.trim();

      if (!title || !content) return;

      const newPrompt = {
        id: 'cp_' + Date.now(),
        category: cat,
        catLabel: getCatLabel(cat),
        icon: getCatIcon(cat),
        title,
        desc,
        prompt: content,
        tags: ['Tùy chỉnh', getCatLabel(cat).split(' ')[1] || 'Prompt'],
        level: 'Cá nhân',
        isCustom: true
      };

      state.customPrompts.unshift(newPrompt);
      localStorage.setItem('vz_custom_prompts', JSON.stringify(state.customPrompts));

      promptModal.classList.remove('active');
      showToast(`⭐ Đã lưu Prompt cá nhân: "${title}"!`);
      renderPrompts();
    });
  }
}

function getCatLabel(cat) {
  const map = {
    image: '🖼️ Chỉnh ảnh & Vision',
    exam: '📚 Tạo đề thi & Giáo dục',
    document: '📄 Chuyển PDF sang Word',
    code: '💻 Lập trình & Debug',
    marketing: '✍️ Marketing & Content',
    data: '📊 Phân tích dữ liệu & Excel',
    translation: '💼 Dịch thuật chuyên sâu',
    custom: '⭐ Tùy chỉnh của tôi'
  };
  return map[cat] || '⭐ Tùy chỉnh';
}

function getCatIcon(cat) {
  const map = {
    image: '🎨',
    exam: '📝',
    document: '📑',
    code: '💻',
    marketing: '🚀',
    data: '📈',
    translation: '🌐',
    custom: '⭐'
  };
  return map[cat] || '💡';
}

window.applyPromptById = function(promptId) {
  const all = getAllPrompts();
  const item = all.find(p => p.id === promptId);
  if (!item) return;
  window.applyPromptToPlayground(item.prompt, item.title);
};

window.copyPromptById = function(btnEl, promptId) {
  const all = getAllPrompts();
  const item = all.find(p => p.id === promptId);
  if (!item) return;
  window.copyPromptCardText(btnEl, item.prompt);
};

window.applyAsSystemPromptById = function(promptId) {
  const all = getAllPrompts();
  const item = all.find(p => p.id === promptId);
  if (!item) return;
  window.applyAsSystemPrompt(item.prompt, item.title);
};

window.copyPromptCardText = async function(btnEl, text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    }
    const original = btnEl.innerHTML;
    btnEl.innerHTML = `<span style="color:#22c55e;">✓ Đã chép!</span>`;
    showToast('📋 Đã sao chép nội dung Prompt vào bộ nhớ tạm!');
    setTimeout(() => {
      btnEl.innerHTML = original;
    }, 1800);
  } catch {
    showToast('⚠️ Đã sao chép prompt!');
  }
};

/**
 * Áp dụng Prompt vào Playground:
 * 1. Tự động copy nội dung prompt vào clipboard
 * 2. Chuyển thẳng tới tab Playground
 * 3. Ghi sẵn nội dung vào ô chat, tự động điều chỉnh độ cao và focus
 * 4. TUYỆT ĐỐI CHƯA GỬI để người dùng có thể chỉnh sửa/thêm tài liệu trước
 */
window.applyPromptToPlayground = async function(promptText, title) {
  // 1. Tự động sao chép vào clipboard
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(promptText);
    }
  } catch (err) {
    console.warn('Clipboard write error:', err);
  }

  // 2. Chuyển thẳng tới tab Playground
  const tabBtns = document.querySelectorAll('.nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  tabBtns.forEach(b => b.classList.remove('active'));
  panes.forEach(p => p.classList.remove('active'));

  const playgroundBtn = document.querySelector('.nav-btn[data-tab="playground"]');
  const playgroundPane = document.getElementById('tab-playground');
  if (playgroundBtn) playgroundBtn.classList.add('active');
  if (playgroundPane) playgroundPane.classList.add('active');

  // 3. Ghi sẵn prompt vào ô chat input nhưng CHƯA nhấn gửi
  const chatInputEl = document.getElementById('chat-input');
  if (chatInputEl) {
    chatInputEl.value = promptText;
    chatInputEl.style.height = 'auto';
    chatInputEl.style.height = Math.min(220, Math.max(56, chatInputEl.scrollHeight)) + 'px';
    chatInputEl.focus();
    chatInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    chatInputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // 4. Hiển thị thông báo Toast xác nhận
  showToast(`🚀 Đã sao chép & điền sẵn Prompt: "${title || 'Mẫu'}" vào ô chat. Hãy chỉnh sửa nếu cần và bấm Gửi!`);
};

/**
 * Nạp trực tiếp làm System Prompt của Playground
 */
window.applyAsSystemPrompt = async function(promptText, title) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(promptText);
    }
  } catch (err) {
    console.warn('Clipboard error:', err);
  }

  const tabBtns = document.querySelectorAll('.nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  tabBtns.forEach(b => b.classList.remove('active'));
  panes.forEach(p => p.classList.remove('active'));

  const playgroundBtn = document.querySelector('.nav-btn[data-tab="playground"]');
  const playgroundPane = document.getElementById('tab-playground');
  if (playgroundBtn) playgroundBtn.classList.add('active');
  if (playgroundPane) playgroundPane.classList.add('active');

  const sysPromptEl = document.getElementById('playground-system-prompt');
  if (sysPromptEl) {
    sysPromptEl.value = promptText;
    sysPromptEl.focus();
    sysPromptEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showToast(`⚙️ Đã thiết lập Prompt làm System Prompt cho Playground!`);
};
