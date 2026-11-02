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
  setupMobileModelSheetEvents();

  // Desktop Edition Integration
  if (window.vzDesktop) {
    const desktopBadge = document.getElementById('desktop-app-badge');
    if (desktopBadge) desktopBadge.style.display = 'inline-flex';
    document.title = 'VinceZone Studio [Desktop Edition]';
  }

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
// 1. NAVIGATION & URL ROUTING
const tabRoutes = {
  'playground': '/Playground',
  'projects': '/Dự Án',
  'prompts': '/Kho Prompt & Skills',
  'settings': '/Cài Đặt (Settings)'
};

function parseCurrentUrlRoute() {
  const rawPath = decodeURIComponent(window.location.pathname || '').trim().toLowerCase();
  
  if (rawPath.includes('dự án') || rawPath.includes('project') || rawPath.includes('du-an')) {
    return 'projects';
  }
  if (rawPath.includes('kho prompt') || rawPath.includes('prompt') || rawPath.includes('skill')) {
    return 'prompts';
  }
  if (rawPath.includes('cài đặt') || rawPath.includes('setting') || rawPath.includes('cai-dat')) {
    return 'settings';
  }
  if (rawPath.includes('playground')) {
    return 'playground';
  }

  return 'projects';
}

window.switchTabByRoute = function(targetTab, updateHistory = true) {
  if (!targetTab) return;

  const allNavButtons = document.querySelectorAll('.nav-btn, .mobile-nav-btn');
  allNavButtons.forEach(b => {
    if (b.getAttribute('data-tab') === targetTab) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  const tabPanes = document.querySelectorAll('.tab-pane');
  tabPanes.forEach(p => p.classList.remove('active'));

  const pane = document.getElementById(`tab-${targetTab}`);
  if (pane) pane.classList.add('active');
  document.body.setAttribute('data-active-tab', targetTab);

  closeMobileDrawers();

  if (targetTab === 'projects') {
    loadProjects();
  }
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

  if (updateHistory && tabRoutes[targetTab]) {
    const newPath = tabRoutes[targetTab];
    if (decodeURIComponent(window.location.pathname) !== newPath) {
      window.history.pushState({ tab: targetTab }, '', newPath);
    }
  }
};

function setupNavigation() {
  // Top nav & Mobile bottom nav sync
  const allNavButtons = document.querySelectorAll('.nav-btn, .mobile-nav-btn');
  allNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTabByRoute(targetTab, true);
    });
  });

  // Handle browser back / forward navigation
  window.addEventListener('popstate', () => {
    const currentTab = parseCurrentUrlRoute();
    switchTabByRoute(currentTab, false);
  });

  // Mobile Drawers Toggle Handlers
  const btnOpenHistory = document.getElementById('btn-open-history-drawer');
  const btnCloseHistory = document.getElementById('btn-close-history-drawer');
  const btnOpenModel = document.getElementById('btn-open-model-drawer');
  const mobileModelPill = document.getElementById('mobile-model-pill');
  const btnCloseModel = document.getElementById('btn-close-model-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');

  if (btnOpenHistory) btnOpenHistory.addEventListener('click', openHistoryDrawer);
  if (btnCloseHistory) btnCloseHistory.addEventListener('click', closeMobileDrawers);
  if (btnOpenModel) btnOpenModel.addEventListener('click', openModelDrawer);
  if (mobileModelPill) mobileModelPill.addEventListener('click', openModelDrawer);
  if (btnCloseModel) btnCloseModel.addEventListener('click', closeMobileDrawers);
  if (backdrop) backdrop.addEventListener('click', closeMobileDrawers);

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
// MOBILE DRAWER & BOTTOM SHEET CONTROLS (GIAO DIỆN DI ĐỘNG CHATGPT/GEMINI)
// -------------------------------------------------------------

window.setStarterPrompt = function(text) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text;
    input.focus();
  }
};

function closeMobileDrawers() {
  const historySidebar = document.getElementById('chat-history-sidebar');
  const modelSidebar = document.getElementById('playground-sidebar');
  const modelSheet = document.getElementById('mobile-model-sheet');
  const backdrop = document.getElementById('mobile-drawer-backdrop');

  if (historySidebar) historySidebar.classList.remove('mobile-drawer-open');
  if (modelSidebar) modelSidebar.classList.remove('mobile-drawer-open');
  if (modelSheet) modelSheet.classList.remove('active');
  if (backdrop) backdrop.classList.remove('active');
  document.body.classList.remove('mobile-drawer-active');
}

function openHistoryDrawer() {
  closeMobileDrawers();
  const historySidebar = document.getElementById('chat-history-sidebar');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  if (historySidebar) historySidebar.classList.add('mobile-drawer-open');
  if (backdrop) backdrop.classList.add('active');
  document.body.classList.add('mobile-drawer-active');
}

function openModelDrawer() {
  openMobileModelSheet();
}

function openMobileModelSheet() {
  closeMobileDrawers();
  const modelSheet = document.getElementById('mobile-model-sheet');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  
  // Sync parameters from main controls to sheet
  const sheetSysPrompt = document.getElementById('sheet-system-prompt');
  const sheetTemp = document.getElementById('sheet-temperature');
  const sheetTempVal = document.getElementById('sheet-temp-val');
  const sheetTokens = document.getElementById('sheet-max-tokens');
  const sheetTokensVal = document.getElementById('sheet-tokens-val');

  if (sheetSysPrompt && systemPromptInput) sheetSysPrompt.value = systemPromptInput.value;
  if (sheetTemp && tempInput) {
    sheetTemp.value = tempInput.value;
    if (sheetTempVal) sheetTempVal.textContent = tempInput.value;
  }
  if (sheetTokens && maxTokensInput) {
    sheetTokens.value = maxTokensInput.value;
    if (sheetTokensVal) sheetTokensVal.textContent = maxTokensInput.value;
  }

  renderMobileModelSheet();

  if (modelSheet) modelSheet.classList.add('active');
  if (backdrop) backdrop.classList.add('active');
  document.body.classList.add('mobile-drawer-active');
}

function renderMobileModelSheet() {
  const listEl = document.getElementById('model-sheet-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const activePurpose = state.sheetPurposeFilter || 'all';
  const filterFree = state.sheetFreeOnly || false;
  const searchTerm = (state.sheetSearchTerm || '').toLowerCase().trim();
  const currentModel = modelSelect ? modelSelect.value : '';

  // Collect all available models across providers
  const enabledProviders = (state.providers || []).filter(p => p.enabled);
  let allModels = [];

  enabledProviders.forEach(p => {
    (p.models || []).forEach(m => {
      if (!allModels.some(item => item.model === m && item.providerId === p.id)) {
        allModels.push({
          model: m,
          providerId: p.id,
          providerName: p.name,
          isFree: isFreeModel(m),
          caps: getModelCapabilities(m)
        });
      }
    });
  });

  // Filter by purpose
  if (activePurpose === 'vision') allModels = allModels.filter(x => x.caps.isVision);
  else if (activePurpose === 'code') allModels = allModels.filter(x => x.caps.isCode);
  else if (activePurpose === 'reasoning') allModels = allModels.filter(x => x.caps.isReasoning);
  else if (activePurpose === 'general') allModels = allModels.filter(x => x.caps.isGeneral);

  // Filter by Free
  if (filterFree) allModels = allModels.filter(x => x.isFree);

  // Filter by Search
  if (searchTerm) {
    allModels = allModels.filter(x => 
      x.model.toLowerCase().includes(searchTerm) || 
      x.providerName.toLowerCase().includes(searchTerm)
    );
  }

  if (allModels.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.82rem;">
        Không tìm thấy mô hình nào phù hợp với bộ lọc hiện tại.
      </div>
    `;
    return;
  }

  allModels.forEach(item => {
    const isSelected = item.model === currentModel;
    const div = document.createElement('div');
    div.className = `sheet-model-item ${isSelected ? 'selected' : ''}`;

    let tags = [];
    if (item.isFree) tags.push('<span class="sheet-tag tag-free">[FREE]</span>');
    if (item.caps.isVision) tags.push('<span class="sheet-tag tag-vision">Vision</span>');
    if (item.caps.isCode) tags.push('<span class="sheet-tag tag-code">Code</span>');
    if (item.caps.isReasoning) tags.push('<span class="sheet-tag tag-logic">Logic</span>');

    div.innerHTML = `
      <div class="sheet-model-info">
        <div class="sheet-model-name">${escapeHtml(item.model)}</div>
        <div class="sheet-model-meta">
          <span class="sheet-provider-name">${escapeHtml(item.providerName)}</span>
          <div class="sheet-tags">${tags.join('')}</div>
        </div>
      </div>
      <div class="sheet-model-radio">${isSelected ? '✓' : ''}</div>
    `;

    div.addEventListener('click', () => {
      selectModelFromSheet(item.providerId, item.model);
      closeMobileDrawers();
    });

    listEl.appendChild(div);
  });
}

function selectModelFromSheet(providerId, modelName) {
  if (providerSelect) {
    if (providerSelect.value !== 'all' && providerSelect.value !== providerId) {
      providerSelect.value = providerId;
      updateModelDropdownForSelectedProvider();
    }
  }
  if (modelSelect) {
    // Find option in select or create
    let optFound = Array.from(modelSelect.options).find(o => o.value === modelName);
    if (!optFound) {
      // Switch to 'all' provider so all models are present
      if (providerSelect && providerSelect.value !== 'all') {
        providerSelect.value = 'all';
        updateModelDropdownForSelectedProvider();
      }
    }
    modelSelect.value = modelName;
    modelSelect.dispatchEvent(new Event('change'));
  }
  updateMobileModelLabel();
}

function setupMobileModelSheetEvents() {
  const btnCloseSheet = document.getElementById('btn-close-model-sheet');
  if (btnCloseSheet) btnCloseSheet.addEventListener('click', closeMobileDrawers);

  // Tabs: Models vs Params
  const tabModels = document.getElementById('sheet-tab-models');
  const tabParams = document.getElementById('sheet-tab-params');
  const viewModels = document.getElementById('sheet-view-models');
  const viewParams = document.getElementById('sheet-view-params');

  if (tabModels && tabParams && viewModels && viewParams) {
    tabModels.addEventListener('click', () => {
      tabModels.classList.add('active');
      tabParams.classList.remove('active');
      viewModels.style.display = 'block';
      viewParams.style.display = 'none';
    });

    tabParams.addEventListener('click', () => {
      tabParams.classList.add('active');
      tabModels.classList.remove('active');
      viewParams.style.display = 'block';
      viewModels.style.display = 'none';
    });
  }

  // Purpose Chips
  const purposeChips = document.querySelectorAll('#sheet-purpose-chips .sheet-chip');
  purposeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      purposeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.sheetPurposeFilter = chip.getAttribute('data-purpose');
      renderMobileModelSheet();
    });
  });

  // Search input
  const sheetSearch = document.getElementById('sheet-model-search');
  if (sheetSearch) {
    sheetSearch.addEventListener('input', (e) => {
      state.sheetSearchTerm = e.target.value;
      renderMobileModelSheet();
    });
  }

  // Free filter
  const sheetFree = document.getElementById('sheet-filter-free');
  if (sheetFree) {
    sheetFree.addEventListener('change', (e) => {
      state.sheetFreeOnly = e.target.checked;
      renderMobileModelSheet();
    });
  }

  // Param sliders in sheet
  const sheetTemp = document.getElementById('sheet-temperature');
  const sheetTempVal = document.getElementById('sheet-temp-val');
  if (sheetTemp && sheetTempVal) {
    sheetTemp.addEventListener('input', (e) => {
      sheetTempVal.textContent = e.target.value;
    });
  }

  const sheetTokens = document.getElementById('sheet-max-tokens');
  const sheetTokensVal = document.getElementById('sheet-tokens-val');
  if (sheetTokens && sheetTokensVal) {
    sheetTokens.addEventListener('input', (e) => {
      sheetTokensVal.textContent = e.target.value;
    });
  }

  // Save params button
  const btnSaveParams = document.getElementById('btn-save-sheet-params');
  if (btnSaveParams) {
    btnSaveParams.addEventListener('click', () => {
      const sheetSysPrompt = document.getElementById('sheet-system-prompt');
      if (sheetSysPrompt && systemPromptInput) {
        systemPromptInput.value = sheetSysPrompt.value;
      }
      if (sheetTemp && tempInput) {
        tempInput.value = sheetTemp.value;
        if (tempVal) tempVal.textContent = sheetTemp.value;
      }
      if (sheetTokens && maxTokensInput) {
        maxTokensInput.value = sheetTokens.value;
        if (tokensVal) tokensVal.textContent = sheetTokens.value;
      }
      closeMobileDrawers();
    });
  }
}

function updateMobileModelLabel() {
  const modelSelectEl = document.getElementById('playground-model-select');
  const labelEl = document.getElementById('mobile-model-name-label');
  if (!labelEl || !modelSelectEl) return;
  const selOption = modelSelectEl.options[modelSelectEl.selectedIndex];
  if (selOption && selOption.text) {
    let cleanName = selOption.text.replace(/\[FREE\]\s*/i, '').replace(/\[Vision\]|\[Code\]|\[Logic\]/gi, '').trim();
    if (cleanName.includes('/')) {
      const parts = cleanName.split('/');
      cleanName = parts[parts.length - 1];
    }
    labelEl.textContent = cleanName || 'Chọn Model AI';
  } else {
    labelEl.textContent = 'Chọn Model AI';
  }
}

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
    updateMobileModelLabel();
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

    let currentProv = state.providers.find(p => p.id === providerSelect.value);
    if (!currentProv || providerSelect.value === 'all') {
      const selectedOpt = modelSelect.options[modelSelect.selectedIndex];
      const provId = selectedOpt?.dataset?.providerId;
      if (provId) {
        currentProv = state.providers.find(p => p.id === provId);
      } else {
        currentProv = state.providers.find(p => p.enabled && p.models && p.models.includes(selectedModel));
      }
    }

    if (currentProv && !currentProv.hasKey) {
      alert(`Nhà cung cấp "${currentProv.name}" chứa model "${selectedModel}" chưa được cấu hình API Key.\n\nVui lòng chuyển sang tab "Cài Đặt" -> "Providers Hub", bấm nút "Sửa" tại thẻ "${currentProv.name}" để dán API Key của bạn.`);
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

    // Tích hợp tùy chọn từ AI Image Studio (Tạo ảnh & Sửa ảnh)
    const curPurpose = purposeSelect ? purposeSelect.value : 'all';
    const isImageTask = curPurpose === 'image_gen' || curPurpose === 'image_edit';
    if (isImageTask) {
      const artStyleEl = document.getElementById('studio-art-style');
      if (artStyleEl && artStyleEl.value !== 'natural') {
        enrichedPrompt += ` [Style: ${artStyleEl.value}]`;
      }
      if (window.studioState) {
        enrichedPrompt += ` [Aspect: ${window.studioState.aspectRatio} (${window.studioState.width}x${window.studioState.height})]`;
      }
    }

    const images = attachmentsToSend.filter(a => a.type === 'image');
    if (isImageTask && window.studioState && window.studioState.sourceImage) {
      if (!images.some(img => img.dataUrl === window.studioState.sourceImage)) {
        images.push({
          type: 'image',
          name: 'Ảnh nguồn cần sửa',
          dataUrl: window.studioState.sourceImage,
          size: 0
        });
        attachmentsToSend.push({
          type: 'image',
          name: 'Ảnh nguồn cần sửa',
          dataUrl: window.studioState.sourceImage,
          size: 0
        });
      }
    }

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
    chatStatusIndicator.textContent = curPurpose === 'image_gen' ? 'Đang vẽ và tạo ảnh AI...' : (curPurpose === 'image_edit' ? 'Đang chỉnh sửa ảnh bằng AI...' : 'Đang suy luận...');

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
      renderMarkdown(assistantBubble, `**Lỗi:** ${err.message}`);
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
  const authorTitle = role === 'user' ? 'BẠN' : (modelSelect.value || 'AI');
  author.innerHTML = `<span>${authorTitle}</span>`;

  if (role === 'user' && text) {
    const btnRem = document.createElement('button');
    btnRem.type = 'button';
    btnRem.className = 'btn-remember-chat';
    btnRem.textContent = 'Ghi nhớ';
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
        badge.innerHTML = `<strong>${escapeHtml(att.name)}</strong> <small>(${formatBytes(att.size)})</small>`;
        attContainer.appendChild(badge);
      } else if (att.type === 'folder') {
        const badge = document.createElement('span');
        badge.className = 'msg-attachment-badge';
        badge.innerHTML = `<strong>${escapeHtml(att.name)}</strong> <small>(${att.fileCount} tệp)</small>`;
        attContainer.appendChild(badge);
      } else if (att.type === 'link') {
        const link = document.createElement('a');
        link.className = 'msg-attachment-badge';
        link.href = att.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerHTML = `<strong>${escapeHtml(att.title || att.url)}</strong>`;
        attContainer.appendChild(link);
      } else if (att.type === 'gdrive') {
        const link = document.createElement('a');
        link.className = 'msg-attachment-badge';
        link.href = att.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerHTML = `<strong>GG Drive: ${escapeHtml(att.title || 'Tài liệu')}</strong>`;
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
        
        <span class="chip-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="chip-meta">${formatBytes(att.size)}</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    } else if (att.type === 'folder') {
      chip.innerHTML = `
        
        <span class="chip-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="chip-meta">${att.fileCount} tệp</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    } else if (att.type === 'link') {
      chip.innerHTML = `
        <span></span>
        <span class="chip-name" title="${escapeHtml(att.title || att.url)}">${escapeHtml(att.title || att.url)}</span>
        <button type="button" class="chip-remove" onclick="removePendingAttachment(${idx})" title="Xóa">&times;</button>
      `;
    } else if (att.type === 'gdrive') {
      chip.innerHTML = `
        
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

  // 1. Thêm tùy chọn "Tất cả nhà cung cấp có sẵn" lên đầu tiên
  const totalModelsCount = enabledProviders.reduce((acc, p) => acc + (p.models ? p.models.length : 0), 0);
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = ` Tất cả nhà cung cấp có sẵn (Gom ${enabledProviders.length} Providers • ${totalModelsCount} Models)`;
  providerSelect.appendChild(allOpt);

  // 2. Thêm từng Provider riêng lẻ
  enabledProviders.forEach(prov => {
    const opt = document.createElement('option');
    opt.value = prov.id;
    const modelCount = prov.models ? prov.models.length : 0;
    const keyTag = prov.hasKey ? '' : ' Chưa key';
    opt.textContent = `${prov.name} (${modelCount} models • ${keyTag})`;
    providerSelect.appendChild(opt);
  });

  // Keep existing selection if still valid, or default to 'all'
  if (currentSelectedProvider && (currentSelectedProvider === 'all' || enabledProviders.some(p => p.id === currentSelectedProvider))) {
    providerSelect.value = currentSelectedProvider;
  } else {
    // Mặc định chọn gom tất cả nhà cung cấp có sẵn
    providerSelect.value = 'all';
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

  // Image Generation detection (Flux, SDXL, Turbo, Midjourney, DALL-E)
  const isImageGen = m.includes('flux') || 
                     m.includes('diffusion') || 
                     m.includes('turbo') || 
                     m.includes('midjourney') || 
                     m.includes('sdxl') || 
                     m.includes('dall-e') || 
                     m.includes('imagen');

  // Image Editing / Img2Img detection
  const isImageEdit = m.includes('flux') || 
                      m.includes('diffusion') || 
                      m.includes('turbo') || 
                      m.includes('edit') || 
                      m.includes('inpaint');

  return { isVision, isCode, isReasoning, isGeneral, isImageGen, isImageEdit };
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

    showToast(' Đã phát hiện ảnh đính kèm: Hệ thống tự động chuyển sang Tác vụ Vision và chọn mô hình hỗ trợ đọc ảnh!');
  }
}

function updateModelDropdownForSelectedProvider() {
  const selectedProvId = providerSelect.value;
  modelSelect.innerHTML = '';

  const selectedPurpose = purposeSelect ? purposeSelect.value : 'all';
  const isFilterFree = filterFreeOnly && filterFreeOnly.checked;

  // TRƯỜNG HỢP 1: TẤT CẢ NHÀ CUNG CẤP CÓ SẴN (GOM TOÀN BỘ)
  if (selectedProvId === 'all') {
    const enabledProviders = state.providers.filter(p => p.enabled);
    let totalMatchingModels = 0;

    enabledProviders.forEach(prov => {
      if (!prov.models || prov.models.length === 0) return;

      // 1. Lọc theo Tác vụ
      let modelsByPurpose = prov.models;
      if (selectedPurpose === 'image_gen') {
        modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isImageGen);
      } else if (selectedPurpose === 'image_edit') {
        modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isImageEdit);
      } else if (selectedPurpose === 'vision') {
        modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isVision);
      } else if (selectedPurpose === 'code') {
        modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isCode);
      } else if (selectedPurpose === 'reasoning') {
        modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isReasoning);
      } else if (selectedPurpose === 'general') {
        modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isGeneral);
      }

      // 2. Lọc theo Free
      const modelsToRender = isFilterFree 
        ? modelsByPurpose.filter(m => isFreeModel(m)) 
        : modelsByPurpose;

      if (modelsToRender.length > 0) {
        totalMatchingModels += modelsToRender.length;
        const group = document.createElement('optgroup');
        const keyTag = prov.hasKey ? 'Sẵn sàng' : 'Cần Key';
        group.label = `${prov.name} (${modelsToRender.length} models • ${keyTag})`;

        modelsToRender.forEach(model => {
          const opt = document.createElement('option');
          opt.value = model;
          opt.dataset.providerId = prov.id;
          opt.dataset.providerName = prov.name;

          const isFree = isFreeModel(model);
          const caps = getModelCapabilities(model);

          let tagStr = '';
          if (caps.isImageGen) tagStr += ' [Vẽ ảnh]';
          if (caps.isImageEdit) tagStr += ' [Sửa ảnh]';
          if (caps.isVision) tagStr += ' [Vision]';
          if (caps.isCode) tagStr += ' [Code]';
          if (caps.isReasoning) tagStr += ' [Logic]';

          opt.textContent = `${isFree ? '[FREE] ' : ''}${model}${tagStr}`;
          group.appendChild(opt);
        });

        modelSelect.appendChild(group);
      }
    });

    if (purposeHint) {
      if (selectedPurpose === 'image_gen') {
        purposeHint.textContent = `Đã gom ${totalMatchingModels} model chuyên tạo & vẽ ảnh nghệ thuật (Flux, SDXL, Turbo) từ tất cả Provider`;
        purposeHint.style.color = '#ec4899';
      } else if (selectedPurpose === 'image_edit') {
        purposeHint.textContent = `Đã gom ${totalMatchingModels} model chuyên chỉnh sửa, biến đổi phong cách và inpainting ảnh từ tất cả Provider`;
        purposeHint.style.color = '#a855f7';
      } else if (selectedPurpose === 'vision') {
        purposeHint.textContent = `Đã gom ${totalMatchingModels} model có khả năng đọc & phân tích ảnh (Vision) từ tất cả Provider`;
        purposeHint.style.color = 'var(--status-green)';
      } else if (selectedPurpose === 'code') {
        purposeHint.textContent = `Đã gom ${totalMatchingModels} model chuyên sâu về viết code, refactor & debug từ tất cả Provider`;
        purposeHint.style.color = '#60a5fa';
      } else if (selectedPurpose === 'reasoning') {
        purposeHint.textContent = `Đã gom ${totalMatchingModels} model suy luận logic sâu (Reasoning) từ tất cả Provider`;
        purposeHint.style.color = '#c084fc';
      } else if (selectedPurpose === 'general') {
        purposeHint.textContent = `Đã gom ${totalMatchingModels} model phản hồi nhanh & tổng quát từ tất cả Provider`;
        purposeHint.style.color = '#fbbf24';
      } else {
        purposeHint.textContent = `Gom toàn bộ ${totalMatchingModels} model từ ${enabledProviders.length} Nhà cung cấp có sẵn`;
        purposeHint.style.color = 'var(--text-secondary)';
      }
    }

    if (totalMatchingModels === 0) {
      const reasonText = selectedPurpose !== 'all' 
        ? `Không tìm thấy model nào cho tác vụ này trên toàn bộ Provider` 
        : 'Không có Model Free nào trên toàn bộ Provider';
      modelSelect.innerHTML = `<option value="" disabled selected>${reasonText}</option>`;
      if (selectedProviderInfo) selectedProviderInfo.textContent = `Vui lòng bỏ chọn "Chỉ hiện FREE" hoặc chọn tác vụ khác`;
      return;
    }

    if (modelSelect.options.length > 0) {
      modelSelect.selectedIndex = 0;
    }

    if (selectedProviderInfo) {
      const filterNotice = isFilterFree ? `(Đang lọc: ${totalMatchingModels} Free)` : `${totalMatchingModels} models sẵn sàng`;
      selectedProviderInfo.textContent = `Tất cả Nhà cung cấp • ${filterNotice} • Gateway tự động điều hướng`;
    }

    renderSnippets();
    updateMobileModelLabel();
    return;
  }

  // TRƯỜNG HỢP 2: CHỌN MỘT NHÀ CUNG CẤP CỤ THỂ
  const prov = state.providers.find(p => p.id === selectedProvId);

  if (!prov || !prov.models || prov.models.length === 0) {
    modelSelect.innerHTML = '<option value="" disabled selected>Provider này chưa có Model</option>';
    if (selectedProviderInfo) selectedProviderInfo.textContent = 'Chưa có model nào cho Provider đã chọn';
    return;
  }

  // 1. Lọc danh sách theo Tác vụ / Dùng để làm gì
  let modelsByPurpose = prov.models;
  if (selectedPurpose === 'image_gen') {
    modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isImageGen);
  } else if (selectedPurpose === 'image_edit') {
    modelsByPurpose = prov.models.filter(m => getModelCapabilities(m).isImageEdit);
  } else if (selectedPurpose === 'vision') {
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
    if (selectedPurpose === 'image_gen') {
      if (modelsByPurpose.length > 0) {
        purposeHint.textContent = `Đã lọc ${modelsByPurpose.length} model vẽ & tạo ảnh nghệ thuật của ${prov.name}`;
        purposeHint.style.color = '#ec4899';
      } else {
        purposeHint.textContent = `Provider "${prov.name}" không hỗ trợ tạo ảnh. Hãy chọn Pollinations AI hoặc "Tất cả nhà cung cấp"`;
        purposeHint.style.color = '#f87171';
      }
    } else if (selectedPurpose === 'image_edit') {
      if (modelsByPurpose.length > 0) {
        purposeHint.textContent = `Đã lọc ${modelsByPurpose.length} model chỉnh sửa ảnh của ${prov.name}`;
        purposeHint.style.color = '#a855f7';
      } else {
        purposeHint.textContent = `Provider "${prov.name}" không hỗ trợ sửa ảnh. Hãy chọn Pollinations AI hoặc "Tất cả nhà cung cấp"`;
        purposeHint.style.color = '#f87171';
      }
    } else if (selectedPurpose === 'vision') {
      if (modelsByPurpose.length > 0) {
        purposeHint.textContent = `Đã lọc ${modelsByPurpose.length} model có khả năng nhìn & phân tích ảnh (Multimodal Vision)`;
        purposeHint.style.color = 'var(--status-green)';
      } else {
        purposeHint.textContent = `Provider "${prov.name}" không có model đọc ảnh. Hãy chuyển sang "Tất cả nhà cung cấp" hoặc Kilo Gateway`;
        purposeHint.style.color = '#f87171';
      }
    } else if (selectedPurpose === 'code') {
      purposeHint.textContent = `Đã lọc ${modelsByPurpose.length} model tối ưu cho lập trình, debug & refactor code`;
      purposeHint.style.color = '#60a5fa';
    } else if (selectedPurpose === 'reasoning') {
      purposeHint.textContent = `Đã lọc ${modelsByPurpose.length} model có chuỗi tư duy suy luận logic sâu (Reasoning)`;
      purposeHint.style.color = '#c084fc';
    } else if (selectedPurpose === 'general') {
      purposeHint.textContent = `Đã lọc ${modelsByPurpose.length} model phản hồi nhanh & tiết kiệm tài nguyên`;
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
    if (selectedProviderInfo) selectedProviderInfo.textContent = `Vui lòng chọn tác vụ khác hoặc chọn "Tất cả nhà cung cấp"`;
    return;
  }

  modelsToRender.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model;
    opt.dataset.providerId = prov.id;
    opt.dataset.providerName = prov.name;

    const isFree = isFreeModel(model);
    const caps = getModelCapabilities(model);

    let tagStr = '';
    if (caps.isImageGen) tagStr += ' [Vẽ ảnh]';
    if (caps.isImageEdit) tagStr += ' [Sửa ảnh]';
    if (caps.isVision) tagStr += ' [Vision]';
    if (caps.isCode) tagStr += ' [Code]';
    if (caps.isReasoning) tagStr += ' [Logic]';

    opt.textContent = `${isFree ? '[FREE] ' : ''}${model}${tagStr}`;
    modelSelect.appendChild(opt);
  });

  if (modelSelect.options.length > 0) {
    modelSelect.selectedIndex = 0;
  }

  if (selectedProviderInfo) {
    const keyNotice = prov.hasKey ? 'Sẵn sàng' : 'Cần nhập API Key trong Hub';
    const filterNotice = isFilterFree ? `(Đang lọc: ${modelsToRender.length} Free)` : `${modelsToRender.length} models phù hợp`;
    selectedProviderInfo.textContent = `${prov.name} • ${filterNotice} • ${keyNotice}`;
  }

  renderSnippets();
  updateMobileModelLabel();

  // Bật/tắt thanh tùy chọn Image Studio nếu chọn tác vụ Tạo ảnh hoặc Sửa ảnh
  const studioBar = document.getElementById('image-studio-bar');
  if (studioBar) {
    if (selectedPurpose === 'image_gen') {
      studioBar.style.display = 'block';
      if (typeof window.switchStudioMode === 'function') window.switchStudioMode('gen');
    } else if (selectedPurpose === 'image_edit') {
      studioBar.style.display = 'block';
      if (typeof window.switchStudioMode === 'function') window.switchStudioMode('edit');
    } else {
      studioBar.style.display = 'none';
    }
  }
}

// Global Image Studio State & Controls
window.studioState = {
  mode: 'gen',
  aspectRatio: '1:1',
  width: 1024,
  height: 1024,
  style: 'natural',
  sourceImage: null,
  strength: 0.6
};

window.switchStudioMode = function(mode) {
  window.studioState.mode = mode;
  const btnGen = document.getElementById('btn-mode-text2img');
  const btnEdit = document.getElementById('btn-mode-img2img');
  const badge = document.getElementById('studio-mode-badge');
  const editZone = document.getElementById('studio-edit-source-zone');
  const strengthWrap = document.getElementById('studio-strength-wrap');
  const chatInput = document.getElementById('chat-input');

  if (mode === 'edit') {
    if (btnGen) btnGen.classList.remove('active');
    if (btnEdit) btnEdit.classList.add('active');
    if (badge) {
      badge.textContent = 'Chỉnh sửa ảnh';
      badge.style.color = '#a855f7';
      badge.style.borderColor = 'rgba(168, 85, 247, 0.4)';
    }
    if (editZone) editZone.style.display = 'block';
    if (strengthWrap) strengthWrap.style.display = 'flex';
    if (chatInput) chatInput.placeholder = 'Nhập mô tả yêu cầu sửa ảnh (Ví dụ: "Đổi màu tóc thành vàng kim, thay nền bằng bãi biển hoàng hôn")...';
  } else {
    if (btnGen) btnGen.classList.add('active');
    if (btnEdit) btnEdit.classList.remove('active');
    if (badge) {
      badge.textContent = 'Tạo ảnh';
      badge.style.color = '#ec4899';
      badge.style.borderColor = 'rgba(236, 72, 153, 0.4)';
    }
    if (editZone) editZone.style.display = 'none';
    if (strengthWrap) strengthWrap.style.display = 'none';
    if (chatInput) chatInput.placeholder = 'Mô tả hình ảnh bạn muốn tạo bằng AI (Ví dụ: "Một chú rồng pha lê bay qua thành phố tương lai")...';
  }
};

window.updateStudioAspect = function() {
  const sel = document.getElementById('studio-aspect-ratio');
  if (!sel) return;
  const val = sel.value;
  window.studioState.aspectRatio = val;
  if (val === '1:1') {
    window.studioState.width = 1024;
    window.studioState.height = 1024;
  } else if (val === '16:9') {
    window.studioState.width = 1280;
    window.studioState.height = 720;
  } else if (val === '9:16') {
    window.studioState.width = 720;
    window.studioState.height = 1280;
  } else if (val === '4:3') {
    window.studioState.width = 1024;
    window.studioState.height = 768;
  } else if (val === '3:4') {
    window.studioState.width = 768;
    window.studioState.height = 1024;
  }
};

window.handleStudioSourceUpload = function(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Vui lòng chọn một tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
    return;
  }
  const reader = new FileReader();
  reader.onload = (evt) => {
    window.studioState.sourceImage = evt.target.result;
    const placeholder = document.getElementById('studio-source-placeholder');
    const previewWrap = document.getElementById('studio-source-preview-wrap');
    const previewImg = document.getElementById('studio-source-preview-img');
    if (placeholder) placeholder.style.display = 'none';
    if (previewWrap) previewWrap.style.display = 'inline-flex';
    if (previewImg) previewImg.src = evt.target.result;
  };
  reader.readAsDataURL(file);
};

window.removeStudioSourceImg = function() {
  window.studioState.sourceImage = null;
  const fileInput = document.getElementById('input-studio-source-file');
  if (fileInput) fileInput.value = '';
  const placeholder = document.getElementById('studio-source-placeholder');
  const previewWrap = document.getElementById('studio-source-preview-wrap');
  if (placeholder) placeholder.style.display = 'block';
  if (previewWrap) previewWrap.style.display = 'none';
};

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
          Ping Test
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
      alert(` KẾT NỐI THÀNH CÔNG!\n${result.message}`);
    } else {
      alert(` THẤT BẠI:\n${result.message}`);
    }
  } catch (err) {
    alert(` Lỗi: ${err.message}`);
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
        
        <h4 style="color: var(--text-white); margin-bottom: 0.35rem;">Chưa có mục ghi nhớ nào phù hợp</h4>
        <p style="font-size: 0.8rem;">Bấm "+ Thêm Ghi Nhớ" hoặc gửi tin nhắn có câu "hãy nhớ là...", "dự án của tôi..." để VinceZone tự động học hỏi.</p>
      </div>
    `;
    return;
  }

  const categoryLabels = {
    conversation: 'Đoạn chat & Hội thoại',
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
      btnSyncChatMemory.innerHTML = 'Đang quét lịch sử chat...';

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

  const btnClearAllMemories = document.getElementById('btn-clear-all-memories');
  if (btnClearAllMemories) {
    btnClearAllMemories.addEventListener('click', async () => {
      if (!confirm('CẢNH BÁO NGUY HIỂM: Hành động này sẽ XÓA VĨNH VIỄN toàn bộ bộ nhớ nhận thức của VinceZone!\n\nLưu ý: Ngay cả khi bạn đã xóa lịch sử chat, các ghi nhớ hội thoại cũng sẽ bị xóa sạch hoàn toàn nếu bạn tiếp tục.\n\nBạn có chắc chắn muốn xóa vĩnh viễn?')) return;
      try {
        await authFetch('/api/memories', { method: 'DELETE' });
        alert('Toàn bộ bộ nhớ nhận thức đã bị xóa vĩnh viễn!');
        await fetchMemories();
      } catch (err) {
        alert('Lỗi xóa bộ nhớ: ' + err.message);
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
      alert(` Đã lưu vào Bộ nhớ VinceZone!\n\n"${text}"\n\nTất cả các AI khác (OpenCode, Kilo, ZenMux, Gemini...) khi bạn trò chuyện sẽ tự động áp dụng ghi nhớ này.`);
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
    btnSaveProfile.innerHTML = ' Đang lưu dữ liệu...';
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
        profileSaveStatus.textContent = ' Đã lưu thành công! Toàn bộ AI sẽ ghi nhớ dữ liệu này.';
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
      retentionText.textContent = 'Lưu vĩnh viễn (Đã đăng nhập)';
      retentionPill.title = 'Tài khoản đã đăng nhập, lịch sử trò chuyện được lưu trữ an toàn lâu dài.';
    } else {
      retentionPill.className = 'history-retention-pill';
      retentionText.textContent = ' Khách: Lưu 3 ngày (Đăng nhập để lưu lâu dài)';
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
      ? `<span style="color:#eab308;font-size:0.65rem;" title="${chat.retention || 'Tạm lưu 3 ngày'}">3 ngày</span>`
      : `<span style="color:#22c55e;font-size:0.65rem;" title="Lưu vĩnh viễn">Vĩnh viễn</span>`;

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
      closeMobileDrawers();
    };

    chatHistoryList.appendChild(item);
  });
}

function setupChatHistoryEvents() {
  if (btnNewChat) {
    btnNewChat.addEventListener('click', () => {
      startNewChat();
      closeMobileDrawers();
    });
  }

  const btnMobileNewChat = document.getElementById('btn-mobile-new-chat');
  if (btnMobileNewChat) {
    btnMobileNewChat.addEventListener('click', () => {
      startNewChat();
      closeMobileDrawers();
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
      provider: modelSelect.options[modelSelect.selectedIndex]?.dataset?.providerName || (providerSelect.value === 'all' ? 'Tất cả Provider' : providerSelect.options[providerSelect.selectedIndex]?.text || 'Provider'),
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

    if (state.chatHistory.length > 0) {
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
  const authorTitle = role === 'user' ? ' BẠN' : ` ${modelName || modelSelect.value || 'AI'}`;
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
    btnRem.textContent = ' Ghi nhớ';
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

  chatMessages.innerHTML = '';
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
    <span style="font-size: 1.15rem; color: var(--status-green);"></span>
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
    catLabel: 'Chỉnh ảnh & Vision',
    icon: '',
    title: 'Tạo Ảnh Chân Dung Điện Ảnh 8K (Cinematic Portrait)',
    desc: 'Tạo câu lệnh mô tả chi tiết bằng tiếng Anh theo phong cách nhiếp ảnh điện ảnh 8K, ánh sáng hoàng hôn, độ sâu trường ảnh mờ ảo.',
    tags: ['Midjourney', 'Photorealism', 'Cinematic', '8K Bokeh'],
    level: 'Chuyên sâu',
    prompt: `Một bức ảnh chân dung phong cách điện ảnh (Cinematic photography), chụp bằng ống kính 85mm f/1.4, ánh sáng vàng lúc hoàng hôn (golden hour lighting), chi tiết khuôn mặt sắc nét 8K, độ sâu trường ảnh nông (bokeh mềm mịn), tông màu moody ấm áp, tương phản cao, phong cách nghệ thuật nhiếp ảnh đoạt giải National Geographic, chân thực không tì vết.`
  },
  {
    id: 'p_img_2',
    category: 'image',
    catLabel: 'Chỉnh ảnh & Vision',
    icon: '',
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
    catLabel: 'Chỉnh ảnh & Vision',
    icon: '',
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
    catLabel: 'Chỉnh ảnh & Vision',
    icon: '',
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
    catLabel: 'Chỉnh ảnh & Vision',
    icon: '',
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
    catLabel: 'Tạo đề thi & Giáo dục',
    icon: '',
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
    catLabel: 'Tạo đề thi & Giáo dục',
    icon: '',
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
    catLabel: 'Tạo đề thi & Giáo dục',
    icon: '',
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
    catLabel: 'Tạo đề thi & Giáo dục',
    icon: '',
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
    catLabel: 'Tạo đề thi & Giáo dục',
    icon: '',
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
    catLabel: 'Chuyển PDF sang Word',
    icon: '',
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
    catLabel: 'Chuyển PDF sang Word',
    icon: '',
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
    catLabel: 'Chuyển PDF sang Word',
    icon: '',
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
    catLabel: 'Chuyển PDF sang Word',
    icon: '',
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
    catLabel: 'Lập trình & Debug',
    icon: '',
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
    catLabel: 'Lập trình & Debug',
    icon: '',
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
    catLabel: 'Lập trình & Debug',
    icon: '',
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
    catLabel: 'Lập trình & Debug',
    icon: '',
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
    catLabel: 'Lập trình & Debug',
    icon: '',
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
    catLabel: 'Marketing & Content',
    icon: '',
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
    catLabel: 'Marketing & Content',
    icon: '',
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
    catLabel: 'Marketing & Content',
    icon: '',
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
    catLabel: 'Marketing & Content',
    icon: '',
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
    catLabel: 'Phân tích dữ liệu & Excel',
    icon: '',
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
    catLabel: 'Phân tích dữ liệu & Excel',
    icon: '',
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
    catLabel: 'Phân tích dữ liệu & Excel',
    icon: '',
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
    catLabel: 'Dịch thuật chuyên sâu',
    icon: '',
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
    catLabel: 'Dịch thuật chuyên sâu',
    icon: '',
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
    catLabel: 'Dịch thuật chuyên sâu',
    icon: '',
    title: 'Viết Email Giao Tiếp Thương Mại Quốc Tế Trang Trọng',
    desc: 'Soạn thảo email tiếng Anh ngoại giao, đàm phán hợp đồng hoặc khiếu nại đối tác một cách khéo léo, dứt khoát.',
    tags: ['Business English', 'Đàm phán thương mại', 'Email ngoại giao', 'Chuyên nghiệp'],
    level: 'Thương mại',
    prompt: `Hãy viết một email bằng tiếng Anh thương mại chuyên nghiệp gửi tới [Đối tác / Khách hàng quốc tế] về vấn đề: [Mục đích email: Đàm phán giá / Thông báo chậm tiến độ / Đề xuất hợp tác].
- Giọng văn: Lịch thiệp, trang trọng, thể hiện sự tôn trọng nhưng dứt khoát và rõ ràng về quyền lợi.
- Bố cục: Tiêu đề súc tích, mở đầu chuyên nghiệp, thân bài đi thẳng vào nội dung cốt lõi kèm giải pháp, kết thúc bằng lời kêu gọi hành động (Call to action) cụ thể.`
  },

  // -------------------------------------------------------------
  // SKILL GIAO DIỆN (IMPECCABLE & TASTE)
  // -------------------------------------------------------------
  {
    id: 'skill_ui_craft',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable craft - Xây dựng trọn gói giao diện & Dashboard',
    desc: 'AI tự làm từ đầu đến cuối: phân tích dự án hiện tại, thiết kế UX/UI, triển khai trực tiếp vào code, kiểm tra responsive PC/tablet/mobile và tự sửa lỗi.',
    tags: ['Impeccable', 'Craft', 'Full Dashboard', 'UX/UI', 'Responsive'],
    level: 'Chuyên gia UI/UX',
    prompt: `/impeccable craft
Xây dựng hoàn chỉnh giao diện dashboard quản lý. Hãy phân tích project hiện tại, thiết kế UX/UI, triển khai trực tiếp vào code, kiểm tra responsive PC/tablet/mobile và tự sửa các vấn đề phát hiện được. Không phá vỡ chức năng backend hiện tại.`
  },
  {
    id: 'skill_ui_polish',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable polish - Đánh bóng UI & Tinh chỉnh chi tiết vi mô',
    desc: 'Làm sạch CSS, chuẩn hóa spacing 4px/8px, viền mờ tinh tế, border-radius, shadows và visual hierarchy đạt độ thẩm mỹ cao nhất.',
    tags: ['Impeccable', 'Polish', 'Micro-interactions', 'Spacing', 'Shadows'],
    level: 'Pixel Perfect',
    prompt: `/impeccable polish
Hãy rà soát toàn bộ giao diện hiện tại: chuẩn hóa spacing theo thang 4px/8px, kiểm tra độ tương phản màu sắc (WCAG AAA), làm mềm mại border-radius, tinh chỉnh lại padding/margins và tối ưu các hiệu ứng hover/focus để đạt độ tinh tế vượt trội.`
  },
  {
    id: 'skill_ui_layout',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable layout - Tái cấu trúc Layout & Grid Responsive',
    desc: 'Chuẩn hóa cấu trúc Flexbox / CSS Grid, Bento-grid hiện đại, chống vỡ khung và chống tràn văn bản trên mọi thiết bị.',
    tags: ['Impeccable', 'Layout', 'CSS Grid', 'Flexbox', 'Responsive'],
    level: 'Frontend Architect',
    prompt: `/impeccable layout
Hãy tối ưu lại toàn bộ hệ thống layout: sử dụng Flexbox/CSS Grid hiện đại, xử lý triệt để overflow và text truncation, canh lề đối xứng, đảm bảo hiển thị hoàn hảo từ màn hình mobile nhỏ (360px) đến Ultra-wide 4K.`
  },
  {
    id: 'skill_ui_typeset',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable typeset - Hệ thống Typography & Phân cấp thị giác',
    desc: 'Thiết lập font chữ cao cấp (Inter, Geist, SF Pro), tỷ lệ font-size, line-height và letter-spacing chuyên nghiệp.',
    tags: ['Impeccable', 'Typography', 'Hierarchy', 'Font Pairing'],
    level: 'Chuyên nghiệp',
    prompt: `/impeccable typeset
Hãy nâng cấp hệ thống Typography: chọn font chữ phù hợp (Inter, Geist, Plus Jakarta Sans, SF Pro), chuẩn hóa tỷ lệ phân cấp h1 -> h6, cân đối line-height (1.4 - 1.6), tinh chỉnh letter-spacing cho headings và text body để tạo trải nghiệm đọc tốt nhất.`
  },
  {
    id: 'skill_ui_colorize',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable colorize - Bảng màu Dark/Light Theme & Contrast',
    desc: 'Xây dựng hệ màu hiện đại, Dark Theme sâu sang trọng (#09090b), viền mờ tinh tế và điểm nhấn tương phản cao.',
    tags: ['Impeccable', 'Colorize', 'Dark Mode', 'Contrast', 'Theme'],
    level: 'Cao cấp',
    prompt: `/impeccable colorize
Hãy tối ưu hóa bảng màu giao diện: thiết lập Dark Theme cao cấp với nền đen sâu (#09090b), các lớp thẻ (#121215, #18181b), viền mờ tinh tế (#27272a) và accent color hài hòa, đảm bảo độ tương phản hoàn hảo và bảo vệ mắt.`
  },
  {
    id: 'skill_ui_animate',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable animate - Chuyển động vi mô mượt mà & Skeletons',
    desc: 'Bổ sung các chuyển động tinh tế, hover state, loading skeletons, modal enter/leave transitions 150-250ms.',
    tags: ['Impeccable', 'Animate', 'Transitions', 'Skeleton', 'Micro-interactions'],
    level: 'Chuyên sâu',
    prompt: `/impeccable animate
Bổ sung hiệu ứng chuyển động vi mô (Micro-interactions): hover lift, smooth fade-in/out, transitions mượt mà (cubic-bezier(0.16, 1, 0.3, 1)), skeleton loading khi nạp dữ liệu và cảm giác tương tác phản hồi tức thì.`
  },
  {
    id: 'skill_ui_distill',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable distill - Tinh giản tối đa & Loại bỏ chi tiết thừa',
    desc: 'Lược bớt các thành phần gây rối mắt, giảm tải nhận thức (Cognitive Load), giữ lại những gì giá trị nhất.',
    tags: ['Impeccable', 'Distill', 'Minimalism', 'Cognitive Load'],
    level: 'Tối giản',
    prompt: `/impeccable distill
Hãy lược bỏ toàn bộ các chi tiết thừa thãi, viền phân cách không cần thiết, giảm thiểu số lượng màu sắc và icon thừa, giữ cho giao diện sạch sẽ, thoáng đãng và tập trung 100% vào nội dung cốt lõi của người dùng.`
  },
  {
    id: 'skill_ui_harden',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable harden - Tăng độ vững chắc UX & Xử lý mọi Edge Cases',
    desc: 'Bổ sung trạng thái rỗng (Empty States), Error States, Loading spinners, phòng tránh crash và lỗi mất mạng.',
    tags: ['Impeccable', 'Harden', 'Empty States', 'Error Handling', 'Edge Cases'],
    level: 'Production Ready',
    prompt: `/impeccable harden
Hãy củng cố độ tin cậy của giao diện: bổ sung empty state đẹp mắt khi chưa có dữ liệu, thông báo lỗi thân thiện, disable button khi đang xử lý để chống double-click, và bảo vệ form khỏi dữ liệu rỗng hoặc sai định dạng.`
  },
  {
    id: 'skill_ui_audit',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: '/impeccable audit & critique - Đánh giá toàn diện UI/UX',
    desc: 'Báo cáo phân tích chuyên sâu về thẩm mỹ, tính khả dụng, độ trễ và khả năng tiếp cận (Accessibility).',
    tags: ['Impeccable', 'Audit', 'Critique', 'UX Review', 'Accessibility'],
    level: 'Kiểm toán UI',
    prompt: `/impeccable audit
Hãy phân tích và đánh giá chi tiết UI/UX hiện tại: chỉ ra 5 điểm yếu lớn nhất về thẩm mỹ, bố cục, trải nghiệm người dùng, độ tương phản và đưa ra kế hoạch khắc phục từng bước kèm mã nguồn cụ thể.`
  },
  {
    id: 'skill_ui_taste_frontend',
    category: 'ui-taste',
    catLabel: 'Skill Giao Diện',
    icon: '',
    title: 'design-taste-frontend & high-end-visual-design',
    desc: 'Bộ quy chuẩn thẩm mỹ hàng đầu: loại bỏ giao diện generic, áp dụng ngôn ngữ thiết kế Stripe, Linear, Vercel, Apple.',
    tags: ['Taste Skill', 'Visual Frontend', 'High-End Design', 'Modern Web'],
    level: 'Thẩm mỹ cao cấp',
    prompt: `Áp dụng Taste Skill & Visual Frontend Standards:
1. Tuyệt đối không tạo giao diện generic (Bootstrap thô sơ, màu sắc lòe loẹt, viền đậm lỗi thời).
2. Phong cách tối giản cao cấp: Dark mode sâu (#09090b), viền siêu mờ (border: 1px solid rgba(255,255,255,0.08)), bóng mềm tự nhiên.
3. Typography hiện đại, phân cấp rõ ràng bằng font-weight và kích thước.
4. Trải nghiệm xúc giác số: nút bấm có phản hồi rõ ràng, bo góc hài hòa (border-radius: 8px-12px), spacing thoáng đãng.`
  },

  // -------------------------------------------------------------
  // 10 SIÊU SKILLS (SUPER SKILLS)
  // -------------------------------------------------------------
  {
    id: 'skill_sp_anthropic',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '1. Anthropic Skills - Xử lý tài liệu, PDF, Excel & Thiết kế',
    desc: 'Làm việc với tài liệu phức tạp, trích xuất cấu trúc văn bản dài, chuẩn hóa dữ liệu bảng tính và phân tích báo cáo.',
    tags: ['Anthropic', 'PDF', 'Spreadsheet', 'Báo cáo', 'Phân tích'],
    level: 'Siêu Skill #1',
    prompt: `Áp dụng Anthropic Skills:
Nhiệm vụ: Phân tích, xử lý và chuẩn hóa tài liệu chuyên nghiệp.
- Đọc hiểu sâu tài liệu dài, trích xuất cấu trúc rõ ràng.
- Tổ chức dữ liệu dưới dạng bảng Markdown / Spreadsheet chuẩn hóa.
- Tránh bỏ sót các chi tiết pháp lý, số liệu tài chính hoặc điều khoản kỹ thuật.`
  },
  {
    id: 'skill_sp_superpowers',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '2. Superpowers - Quy trình Spec  Plan  TDD  Review',
    desc: 'Quy trình kỹ thuật phần mềm chuẩn mực để xây dựng các feature lớn từ con số 0 mà không phát sinh lỗi tiềm ẩn.',
    tags: ['Superpowers', 'Spec', 'Plan', 'TDD', 'Code Review'],
    level: 'Siêu Skill #2',
    prompt: `Áp dụng Superpowers Workflow:
1. Spec: Phân tích yêu cầu và viết bản đặc tả tính năng đầy đủ (Input, Output, Edge Cases).
2. Plan: Chia nhỏ thành các bước triển khai cụ thể, có thể kiểm chứng độc lập.
3. TDD: Viết test case trước, sau đó viết code để pass toàn bộ test.
4. Review: Tự kiểm tra lại chất lượng mã nguồn, hiệu năng và tính bảo mật trước khi bàn giao.`
  },
  {
    id: 'skill_sp_karpathy',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '3. Karpathy Skills - Code đơn giản, ít abstraction, nghĩ sâu trước khi viết',
    desc: 'Tránh AI viết code rườm rà, hạn chế over-engineering, ưu tiên giải pháp trực tiếp, dễ đọc và dễ debug nhất.',
    tags: ['Karpathy', 'KISS', 'Minimalist', 'No Overengineering'],
    level: 'Siêu Skill #3',
    prompt: `Áp dụng Karpathy Skills (Minimalist & First-Principles Engineering):
- Suy nghĩ thấu đáo về bản chất vấn đề trước khi gõ dòng code đầu tiên.
- Viết code đơn giản nhất có thể hoạt động (Simple is better than complex).
- Tránh abstraction không cần thiết, không tạo lớp bọc (wrapper/class) thừa thãi.
- Tối ưu hóa tính dễ đọc và khả năng gỡ lỗi trực tiếp.`
  },
  {
    id: 'skill_sp_real_engineers',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '4. Real Engineers - Debugging thực chiến, testing & Production ready',
    desc: 'Tư duy kỹ sư công nghệ thực chiến: truy tìm nguyên nhân gốc rễ (Root Cause), kiểm tra chịu tải và bảo mật.',
    tags: ['Real Engineers', 'Debugging', 'Root Cause', 'Production'],
    level: 'Siêu Skill #4',
    prompt: `Áp dụng Real Engineers Skill:
- Tìm và sửa lỗi từ tận gốc (Root Cause Analysis), tuyệt đối không dùng mẹo vá tạm bợ (hack/workaround).
- Xử lý triệt để Memory Leak, Race Condition, Unhandled Exceptions và Timeout.
- Đảm bảo code đạt tiêu chuẩn Production: có logging, error handling và zero downtime.`
  },
  {
    id: 'skill_sp_uiux_promax',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '5. UI/UX Pro Max - Responsive đa nền tảng & Design System',
    desc: 'Xây dựng frontend và mobile app với trải nghiệm mượt mà, tối ưu khả năng tiếp cận và hệ thống tokens bài bản.',
    tags: ['UI/UX Pro Max', 'Design System', 'Accessibility', 'Mobile First'],
    level: 'Siêu Skill #5',
    prompt: `Áp dụng UI/UX Pro Max:
- Xây dựng Design System nhất quán: Tokens (màu sắc, khoảng cách, font, shadow).
- Responsive 100% chuẩn Touch trên mobile, bàn phím và chuột trên desktop.
- Đảm bảo khả năng tiếp cận WCAG (màu tương phản, aria-label, focus indicator).`
  },
  {
    id: 'skill_sp_caveman',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '6. Caveman - Output cực ngắn, giảm token & đi thẳng vào đáp án',
    desc: 'Loại bỏ hoàn toàn lời chào hỏi xã giao, giải thích dài dòng. Chỉ đưa ra câu trả lời trực tiếp và code chạy được.',
    tags: ['Caveman', 'Súc tích', 'Tiết kiệm Token', 'Tập trung'],
    level: 'Siêu Skill #6',
    prompt: `[Caveman Mode Active]
- Zero fluff. No greeting. No recap. No conversational filler.
- Output direct code and minimal bullet points only.
- Maximize information density per token.`
  },
  {
    id: 'skill_sp_addy_osmani',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '7. Addy Osmani Skills - Tối ưu hiệu năng Web & Core Web Vitals',
    desc: 'Tối ưu LCP, FID, CLS, lazy loading, code-splitting, tree-shaking và giảm bundle size tối đa.',
    tags: ['Addy Osmani', 'Performance', 'Core Web Vitals', 'Tối ưu web'],
    level: 'Siêu Skill #7',
    prompt: `Áp dụng Addy Osmani Performance Skills:
- Tối ưu Core Web Vitals: LCP (Largest Contentful Paint) < 2.5s, CLS < 0.1, INP < 200ms.
- Giảm thiểu JavaScript blocking, lazy-load tài nguyên nặng.
- Tận dụng HTTP caching, nén hình ảnh WebP/AVIF và tối ưu critical rendering path.`
  },
  {
    id: 'skill_sp_taste_skill',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '8. Taste Skill - Thẩm mỹ cao cấp, typography & tránh UI generic',
    desc: 'Biến sản phẩm số thành tác phẩm có cá tính thị giác riêng biệt, giàu cảm xúc và thẩm mỹ hiện đại.',
    tags: ['Taste Skill', 'Typography', 'Visual Hierarchy', 'High Quality'],
    level: 'Siêu Skill #8',
    prompt: `Áp dụng Taste Skill:
- Tránh các giao diện đại trà, vô hồn.
- Kết hợp màu sắc tinh tế, phân lớp độ sâu bằng shadow mềm và viền mờ.
- Tối ưu từng micro-interaction để người dùng cảm nhận được độ mượt và sự trau chuốt.`
  },
  {
    id: 'skill_sp_awesome_claude',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '9. Awesome Claude Skills - Kho mở rộng công cụ & tự động hóa',
    desc: 'Khai thác tối đa các công cụ tích hợp, MCP server, web search và script tự động hóa chuyên biệt.',
    tags: ['Awesome Skills', 'MCP', 'Tool Calling', 'Automation'],
    level: 'Siêu Skill #9',
    prompt: `Kích hoạt Awesome Skills Workflow:
- Phân tích bài toán và lựa chọn công cụ tối ưu nhất (Tool calling, script automation, API Gateway).
- Tự động hóa các tác vụ lặp đi lặp lại bằng code script độc lập.
- Tối ưu hóa chuỗi thực thi để đạt kết quả chính xác nhất.`
  },
  {
    id: 'skill_sp_adhd',
    category: 'super-skills',
    catLabel: '10 Siêu Skills',
    icon: '',
    title: '10. I Have ADHD - Trình bày ngắn gọn, chia nhỏ task, 100% Actionable',
    desc: 'Cách truyền đạt tối ưu cho người bận rộn: checklist cụ thể, không khối văn bản dài, làm bước nào xong bước đó.',
    tags: ['ADHD', 'Actionable', 'Checklist', 'Rõ ràng'],
    level: 'Siêu Skill #10',
    prompt: `[I Have ADHD Mode]
- Trình bày thông tin dưới dạng checklist [ ] ngắn gọn, rõ ràng.
- Không viết các đoạn văn dài quá 3 dòng.
- Chia nhỏ dự án thành các bước vi mô (Micro-steps) có thể hoàn thành trong 5-10 phút.
- Nêu bật rõ: Việc cần làm ngay bây giờ là gì?`
  },

  // -------------------------------------------------------------
  // AFFILIATE & MARKETING SKILLS
  // -------------------------------------------------------------
  {
    id: 'skill_aff_grand_slam',
    category: 'affiliate',
    catLabel: 'Affiliate Skills',
    icon: '',
    title: 'Grand Slam Offer Generator - Lời đề nghị không thể từ chối',
    desc: 'Áp dụng công thức Hormozi $100M Offers: Dream Outcome, Perceived Likelihood, Time Delay và Effort & Sacrifice.',
    tags: ['Affiliate', 'Grand Slam Offer', 'Conversion', 'Hormozi'],
    level: 'Marketing Đỉnh Cao',
    prompt: `Bạn là chuyên gia thiết kế ưu đãi chuyển đổi cao (Grand Slam Offer Generator theo phương pháp $100M Offers):
Hãy giúp tôi xây dựng một Lời đề nghị không thể chối từ cho sản phẩm/dịch vụ: [Điền sản phẩm/dịch vụ của bạn].
1. Phân tích 4 biến số cốt lõi:
   - Dream Outcome: Kết quả trong mơ của khách hàng là gì?
   - Perceived Likelihood: Khách hàng tin tưởng bao nhiêu % sẽ đạt được kết quả?
   - Time Delay: Giảm thiểu thời gian từ lúc mua đến khi thấy kết quả.
   - Effort & Sacrifice: Giảm thiểu công sức và sự hy sinh của khách hàng.
2. Tạo Gói Giá Trị (Value Stack):
   - Sản phẩm chính + 3-5 phần thưởng (Bonuses) giá trị cao giải quyết nỗi lo tiếp theo.
   - Cam kết bảo hành đảo ngược rủi ro (Risk-Reversal Guarantee).
   - Lý do tạo sự khan hiếm và cấp bách chân thật (Scarcity & Urgency).`
  },
  {
    id: 'skill_aff_viral_post',
    category: 'affiliate',
    catLabel: 'Affiliate Skills',
    icon: '',
    title: 'Viral Post & Hook Writer - Viết bài mạng xã hội triệu view',
    desc: 'Tạo hook mở đầu gây tò mò cực mạnh, giữ chân người đọc với nhịp điệu lôi cuốn và call-to-action chuyển đổi cao.',
    tags: ['Viral Hook', 'Social Media', 'Facebook', 'LinkedIn', 'X'],
    level: 'Lan tỏa cao',
    prompt: `Bạn là Viral Copywriter hàng đầu. Hãy viết 3 bài post mạng xã hội (Facebook / Threads / LinkedIn) về chủ đề: [Điền chủ đề/sản phẩm].
Yêu cầu:
- Dòng Hook mở đầu: Gây tò mò, đảo ngược niềm tin thông thường hoặc chỉ ra một sai lầm phổ biến.
- Nhịp văn: Câu ngắn, dễ đọc trên di động, ngắt dòng nhịp nhàng, có tính kể chuyện (Storytelling).
- Giá trị cốt lõi: Chia sẻ 3-5 bài học thực tế, có thể áp dụng được ngay.
- Kêu gọi hành động (CTA): Khéo léo điều hướng tương tác (Comment nhận tài liệu / Click link bio).`
  },
  {
    id: 'skill_aff_tiktok_script',
    category: 'affiliate',
    catLabel: 'Affiliate Skills',
    icon: '',
    title: 'TikTok & Short-Form Video Script Writer',
    desc: 'Kịch bản video ngắn 30-60 giây: Hook 3 giây đầu, Body giữ nhịp cao, và CTA tự nhiên không gượng ép.',
    tags: ['TikTok', 'Reels', 'Shorts', 'Video Script', 'Kịch bản'],
    level: 'Video Marketing',
    prompt: `Hãy viết kịch bản video ngắn (TikTok / Facebook Reels / YouTube Shorts) thời lượng 45 giây về: [Sản phẩm / Chủ đề].
Cấu trúc kịch bản 3 cột: [Thời gian | Hình ảnh/Hành động | Lời thoại/Voiceover]:
- 00:00 - 00:03: HOOK giữ chân người xem (Câu nói gây sốc hoặc hành động bất ngờ).
- 00:03 - 00:30: VẤN ĐỀ & GIẢI PHÁP (Nhịp độ nhanh, trực quan, giải thích rõ lợi ích).
- 00:30 - 00:45: CALL TO ACTION (Kêu gọi follow / xem link trong bio một cách tự nhiên).`
  },
  {
    id: 'skill_aff_seo_audit',
    category: 'affiliate',
    catLabel: 'Affiliate Skills',
    icon: '',
    title: 'SEO Audit & Keyword Optimization cho bài viết Affiliate',
    desc: 'Kiểm toán SEO toàn diện: Search Intent, On-Page SEO, thẻ H1/H2/H3, FAQ schema và tối ưu tỷ lệ Click (CTR).',
    tags: ['SEO', 'Keyword Research', 'Affiliate Blog', 'On-page'],
    level: 'Chuyên sâu SEO',
    prompt: `Hãy đóng vai trò chuyên gia SEO Technical & Affiliate Marketing:
Phân tích và tối ưu hóa bài viết blog cho từ khóa: [Điền từ khóa mục tiêu]:
1. Xác định Search Intent chính xác (Commercial / Transactional / Informational).
2. Đề xuất cấu trúc dàn ý chuẩn SEO (H1, H2, H3) bao phủ toàn bộ Entity liên quan.
3. Viết 3 tiêu đề Title Tag và Meta Description có CTR cao nhất.
4. Đề xuất vị trí đặt CTA và bảng so sánh (Comparison Table) để tối ưu tỷ lệ chuyển đổi affiliate link.`
  },
  {
    id: 'skill_aff_email_drip',
    category: 'affiliate',
    catLabel: 'Affiliate Skills',
    icon: '',
    title: 'Email Drip Sequence - Chuỗi 5 email nuôi dưỡng & bán hàng',
    desc: 'Chuỗi email tự động: Chào mừng  Câu chuyện cá nhân  Giá trị chuyên sâu  Case Study  Chốt ưu đãi.',
    tags: ['Email Automation', 'Drip Sequence', 'Nurturing', 'Sales Funnel'],
    level: 'Tự động hóa',
    prompt: `Hãy thiết kế chuỗi 5 Email Drip Sequence tự động nuôi dưỡng và chuyển đổi khách hàng tiềm năng cho: [Sản phẩm/Khóa học/Phần mềm]:
- Email 1: Welcome & Giao quà Lead Magnet (Tạo ấn tượng ban đầu mạnh mẽ).
- Email 2: Câu chuyện cá nhân (Thất bại trước đây và bài học bước ngoặt).
- Email 3: Giá trị cốt lõi (Vạch trần sai lầm phổ biến nhất của thị trường).
- Email 4: Case Study / Bằng chứng xã hội (Khách hàng đã thay đổi như thế nào).
- Email 5: Lời chào hàng có hạn (Ưu đãi đặc biệt, giải tỏa thắc mắc cuối cùng).`
  }
];

function getAllPrompts() {
  return [...BUILTIN_PROMPTS, ...state.customPrompts];
}

function renderPrompts() {
  const listEl = document.getElementById('prompts-list');
  const gridEl = document.getElementById('prompts-grid');
  if (!listEl && !gridEl) return;

  const mode = state.promptViewMode || 'list';
  if (listEl) listEl.innerHTML = '';
  if (gridEl) gridEl.innerHTML = '';

  if (mode === 'list') {
    if (listEl) listEl.style.display = 'flex';
    if (gridEl) gridEl.style.display = 'none';
  } else {
    if (listEl) listEl.style.display = 'none';
    if (gridEl) gridEl.style.display = 'grid';
  }

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

  const emptyHtml = `
    <div style="grid-column: 1/-1; text-align: center; padding: 3.5rem 1rem; color: var(--text-muted); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: 12px; width: 100%;">
      
      <h4 style="color: var(--text-white); margin-bottom: 0.35rem;">Không tìm thấy Prompt phù hợp</h4>
      <p style="font-size: 0.85rem;">Hãy thử tìm từ khóa khác hoặc bấm "+ Tạo Prompt Mới" để lưu công thức của riêng bạn.</p>
    </div>
  `;

  if (filtered.length === 0) {
    if (mode === 'list' && listEl) listEl.innerHTML = emptyHtml;
    if (mode === 'grid' && gridEl) gridEl.innerHTML = emptyHtml;
    return;
  }

  filtered.forEach(item => {
    const catBadgeClass = `cat-${item.category}`;
    const wordCount = item.prompt.trim().split(/\s+/).length;
    const tagsHtml = (item.tags || []).map(t => `<span class="prompt-tag">${escapeHtml(t)}</span>`).join('');

    if (mode === 'list' && listEl) {
      // List Row Render (Gọn gàng theo yêu cầu)
      const row = document.createElement('div');
      row.className = 'prompt-list-row';
      row.id = `row-${item.id}`;

      row.innerHTML = `
        <div class="prompt-list-main">
          <div class="prompt-list-left">
            
            <div class="prompt-list-info">
              <div class="prompt-list-title-line">
                <span class="prompt-list-title" onclick="window.togglePromptDetail('${item.id}')">${escapeHtml(item.title)}</span>
                <span class="prompt-badge ${catBadgeClass}">${escapeHtml(item.catLabel || item.category)}</span>
                ${item.level ? `<span class="prompt-tag" style="color: #a1a1aa; border-color: rgba(255,255,255,0.06);">${escapeHtml(item.level)}</span>` : ''}
              </div>
              <p class="prompt-list-desc" title="${escapeHtml(item.desc || '')}">${escapeHtml(item.desc || '')}</p>
            </div>
          </div>

          <div class="prompt-list-actions">
            <button class="btn-copy-prompt" title="Sao chép prompt này" onclick="window.copyPromptById(this, '${item.id}')">
              
              <span>Sao chép</span>
            </button>
            <button class="btn-sys-prompt" title="Nạp vào System Prompt của Playground" onclick="window.applyAsSystemPromptById('${item.id}')">
              <span>System</span>
            </button>
            <button class="btn-use-prompt" title="Sao chép & chuyển thẳng sang Playground để điền sẵn" onclick="window.applyPromptById('${item.id}')">
              <span>Áp dụng vào Playground</span>
              
            </button>
            <button class="prompt-list-expand-btn" id="btn-exp-${item.id}" title="Xem trước nội dung chi tiết" onclick="window.togglePromptDetail('${item.id}')">
              <span>Chi tiết</span>
              
            </button>
          </div>
        </div>

        <div class="prompt-list-detail" id="detail-${item.id}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; font-size: 0.75rem; color: var(--text-muted);">
            <div>${tagsHtml}</div>
            <div>Độ dài: <strong style="color: var(--text-white);">~${wordCount} từ</strong></div>
          </div>
          <div class="prompt-box">${escapeHtml(item.prompt)}</div>
        </div>
      `;

      listEl.appendChild(row);
    } else if (mode === 'grid' && gridEl) {
      // Grid Card Render
      const card = document.createElement('div');
      card.className = 'prompt-card';
      card.innerHTML = `
        <div class="prompt-card-header">
          <div class="prompt-title-group">
            
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
              
              <span>Sao chép</span>
            </button>
            <button class="btn-sys-prompt" title="Nạp vào System Prompt của Playground" onclick="window.applyAsSystemPromptById('${item.id}')">
              <span>System</span>
            </button>
          </div>

          <button class="btn-use-prompt" title="Sao chép & chuyển thẳng sang Playground để điền sẵn" onclick="window.applyPromptById('${item.id}')">
            <span>Áp dụng vào Playground</span>
            
          </button>
        </div>
      `;

      gridEl.appendChild(card);
    }
  });
}

function setupPromptEvents() {
  // View mode switcher (List / Grid)
  const btnViewList = document.getElementById('view-mode-list');
  const btnViewGrid = document.getElementById('view-mode-grid');
  if (btnViewList && btnViewGrid) {
    btnViewList.addEventListener('click', () => {
      state.promptViewMode = 'list';
      btnViewList.classList.add('active');
      btnViewGrid.classList.remove('active');
      renderPrompts();
    });
    btnViewGrid.addEventListener('click', () => {
      state.promptViewMode = 'grid';
      btnViewGrid.classList.add('active');
      btnViewList.classList.remove('active');
      renderPrompts();
    });
  }

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
      showToast(` Đã lưu Prompt cá nhân: "${title}"!`);
      renderPrompts();
    });
  }
}

function getCatLabel(cat) {
  const map = {
    'ui-taste': 'Skill Giao Diện',
    'super-skills': '10 Siêu Skills',
    'affiliate': 'Affiliate Skills',
    'image': 'Chỉnh ảnh & Vision',
    'exam': 'Tạo đề thi & Giáo dục',
    'document': 'Chuyển PDF sang Word',
    'code': 'Lập trình & Debug',
    'marketing': 'Marketing & Content',
    'data': 'Phân tích dữ liệu & Excel',
    'translation': 'Dịch thuật & Ngoại ngữ',
    'custom': ' Tùy chỉnh của tôi'
  };
  return map[cat] || ' Tùy chỉnh';
}

function getCatIcon(cat) { return ''; }

window.togglePromptDetail = function(rowId) {
  const detailEl = document.getElementById('detail-' + rowId);
  const btnEl = document.getElementById('btn-exp-' + rowId);
  if (!detailEl) return;
  const isOpen = detailEl.classList.toggle('open');
  if (btnEl) {
    btnEl.classList.toggle('expanded', isOpen);
    btnEl.innerHTML = isOpen ? 
      `<span>Thu gọn</span> ` : 
      `<span>Chi tiết</span> `;
  }
};

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
    btnEl.innerHTML = `<span style="color:#22c55e;"> Đã chép!</span>`;
    showToast(' Đã sao chép nội dung Prompt vào bộ nhớ tạm!');
    setTimeout(() => {
      btnEl.innerHTML = original;
    }, 1800);
  } catch {
    showToast(' Đã sao chép prompt!');
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

  // 2. Chuyển thẳng tới tab Playground (Đồng bộ cả Mobile Bottom Nav)
  const allNavs = document.querySelectorAll('.nav-btn, .mobile-nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  allNavs.forEach(b => {
    if (b.getAttribute('data-tab') === 'playground') {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
  panes.forEach(p => p.classList.remove('active'));

  const playgroundPane = document.getElementById('tab-playground');
  if (playgroundPane) playgroundPane.classList.add('active');

  // Đóng các drawer trên mobile
  closeMobileDrawers();

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
  showToast(` Đã sao chép & điền sẵn Prompt: "${title || 'Mẫu'}" vào ô chat. Hãy chỉnh sửa nếu cần và bấm Gửi!`);
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

  showToast(` Đã thiết lập Prompt làm System Prompt cho Playground!`);
};

// =========================================================================
// DỰ ÁN & MULTI-AGENT TEAMWORK CLIENT IMPLEMENTATION
// =========================================================================

const projectsState = {
  projects: [],
  activeProjectId: null,
  activeChatId: null,
  activeProject: null,
  activeChat: null,
  attachments: [],
  isRunning: false
};

// 1. Tải danh sách dự án
async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    projectsState.projects = data.projects || [];

    // Tự động chọn dự án đầu tiên nếu chưa chọn hoặc ID không còn tồn tại
    if (projectsState.projects.length > 0) {
      if (!projectsState.activeProjectId || !projectsState.projects.some(p => p.id === projectsState.activeProjectId)) {
        projectsState.activeProjectId = projectsState.projects[0].id;
      }
    } else {
      projectsState.activeProjectId = null;
      projectsState.activeChatId = null;
    }

    renderProjectsList();
    renderActiveProject();
  } catch (err) {
    console.error('Lỗi khi tải danh sách dự án:', err);
    showToast('Lỗi khi tải danh sách dự án: ' + err.message);
  }
}

// 2. Render Danh Sách Các Dự Án Trong Sidebar
function renderProjectsList() {
  const container = document.getElementById('projects-list-items');
  if (!container) return;
  container.innerHTML = '';

  if (projectsState.projects.length === 0) {
    container.innerHTML = `
      <div style="background: rgba(255,255,255,0.02); border: 1px dashed #27272a; border-radius: 8px; padding: 0.85rem; text-align: center;">
        <p style="color:#71717a; font-size:0.8rem; margin:0;">Chưa có dự án nào. Bấm "+ Thêm Dự Án" ở trên để bắt đầu.</p>
      </div>
    `;
    const activeWs = document.getElementById('active-project-workspace');
    if (activeWs) activeWs.style.display = 'none';
    return;
  }

  projectsState.projects.forEach(p => {
    const isSelected = p.id === projectsState.activeProjectId;
    const card = document.createElement('div');
    card.className = `project-list-card ${isSelected ? 'active' : ''}`;
    card.onclick = () => selectProject(p.id);

    if (isSelected) {
      card.innerHTML = `
        <div class="project-list-card-main">
          <strong class="project-list-name">${escapeHtml(p.name)}</strong>
          <span class="project-list-path" title="${escapeHtml(p.path || '')}">${escapeHtml(p.path || 'Local')}</span>
        </div>
        <div class="active-proj-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn-micro btn-structure-accent" onclick="window.openProjectStructureModal('${p.id}')" title="Xem sơ đồ công việc & file đã chỉnh của các AI Agent">Cấu Trúc</button>
          <button type="button" class="btn-micro" onclick="window.toggleProjectTerminal()" title="Mở Terminal trong thư mục dự án">Terminal</button>
          <button type="button" class="btn-micro action-danger" onclick="deleteProjectItem(event, '${p.id}', '${escapeHtml(p.name)}')" title="Xóa dự án khỏi danh sách">Xóa</button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="project-list-card-main">
          <strong class="project-list-name">${escapeHtml(p.name)}</strong>
          <span class="project-list-path" title="${escapeHtml(p.path || '')}">${escapeHtml(p.path || 'Local')}</span>
        </div>
        <button type="button" class="project-list-delete-btn" onclick="deleteProjectItem(event, '${p.id}', '${escapeHtml(p.name)}')" title="Xóa dự án">&times;</button>
      `;
    }
    container.appendChild(card);
  });

  const activeWs = document.getElementById('active-project-workspace');
  if (activeWs) {
    activeWs.style.display = projectsState.activeProjectId ? 'block' : 'none';
  }
}

window.toggleProjectTerminal = function() {
  const termDrawer = document.getElementById('project-terminal-drawer');
  if (termDrawer) {
    const isHidden = termDrawer.style.display === 'none' || !termDrawer.style.display;
    termDrawer.style.display = isHidden ? 'block' : 'none';
  }
};

window.selectProject = function(id) {
  projectsState.activeProjectId = id;
  renderProjectsList();
  renderActiveProject();
};

window.deleteProjectItem = async function(event, id, name) {
  if (event) event.stopPropagation();
  if (!confirm(`Bạn có chắc chắn muốn xóa dự án "${name}" không?`)) return;
  try {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      projectsState.projects = projectsState.projects.filter(p => p.id !== id);
      if (projectsState.activeProjectId === id) {
        projectsState.activeProjectId = projectsState.projects.length > 0 ? projectsState.projects[0].id : null;
      }
      renderProjectsList();
      renderActiveProject();
      showToast(`Đã xóa dự án "${name}"!`);
    } else {
      showToast('Lỗi khi xóa dự án: ' + (data.error || 'Thao tác thất bại'));
    }
  } catch (err) {
    showToast('Lỗi khi xóa dự án: ' + err.message);
  }
};

// 3. Render Dự Án Đang Mở (Tập Tin, Các Đoạn Chat)
function renderActiveProject() {
  let p = projectsState.projects.find(x => x.id === projectsState.activeProjectId);
  if (!p && projectsState.projects.length > 0) {
    p = projectsState.projects[0];
    projectsState.activeProjectId = p.id;
  }
  projectsState.activeProject = p || null;

  const activeWs = document.getElementById('active-project-workspace');
  const nameEl = document.getElementById('active-project-name');
  const pathEl = document.getElementById('active-project-path');
  const chatsListEl = document.getElementById('project-chats-list');

  if (!p) {
    if (activeWs) activeWs.style.display = 'none';
    renderProjectChat(null);
    return;
  }

  if (activeWs) activeWs.style.display = 'block';
  if (nameEl) nameEl.textContent = p.name;
  if (pathEl) {
    pathEl.textContent = p.path;
    pathEl.title = p.path;
  }

  // Tải danh sách tập tin của dự án
  loadProjectFiles(p.id);

  // Render Danh Sách Các Đoạn Chat Của Dự Án
  if (chatsListEl) {
    chatsListEl.innerHTML = '';
    const chats = p.chats || [];

    if (chats.length === 0) {
      chatsListEl.innerHTML = `
        <div style="background: rgba(255,255,255,0.02); border: 1px dashed #27272a; border-radius: 8px; padding: 0.75rem; text-align: center;">
          <p style="color:#71717a;font-size:0.75rem;margin-bottom:0.4rem;">Chưa có đoạn chat nào.</p>
          <button type="button" class="btn-micro-action" onclick="document.getElementById('btn-open-new-chat-modal').click()">+ Tạo Đoạn Chat Đầu Tiên</button>
        </div>
      `;
    } else {
      // Pick first chat if none active
      if (!projectsState.activeChatId || !chats.some(c => c.id === projectsState.activeChatId)) {
        projectsState.activeChatId = chats[0].id;
      }

      chats.forEach(c => {
        const item = document.createElement('div');
        item.className = `project-chat-item ${c.id === projectsState.activeChatId ? 'active' : ''}`;
        
        const agentCount = (c.agents || []).length;
        const tagLabel = agentCount > 0 
          ? `${agentCount} Agent (${c.agents.map(a => a.badge || 'AI').join(', ')})`
          : `AI: ${c.model || 'kilo-auto/free'}`;

        item.innerHTML = `
          <div class="chat-item-main" onclick="selectProjectChat('${c.id}')">
            <span class="chat-item-title">${escapeHtml(c.title)}</span>
            <span class="chat-item-badge">${escapeHtml(tagLabel)} • ${(c.messages || []).length} tin nhắn</span>
          </div>
          <button type="button" class="btn-delete-chat" onclick="deleteProjectChat(event, '${c.id}')" title="Xóa đoạn chat này">&times;</button>
        `;
        chatsListEl.appendChild(item);
      });
    }
  }

  // Render chat hiện tại
  let currentChat = (p.chats || []).find(c => c.id === projectsState.activeChatId);
  if (!currentChat && (p.chats || []).length > 0) {
    currentChat = p.chats[0];
    projectsState.activeChatId = currentChat.id;
  }
  renderProjectChat(currentChat || null);
}

// 4. Tải và hiển thị cây thư mục / tập tin dự án
async function loadProjectFiles(projectId) {
  const container = document.getElementById('project-files-list');
  if (!container) return;

  try {
    const res = await fetch(`/api/projects/${projectId}/files`);
    const data = await res.json();
    const files = data.files || [];

    if (files.length === 0) {
      container.innerHTML = '<span class="tree-empty-text">Thư mục trống hoặc chưa có tập tin.</span>';
      return;
    }

    container.innerHTML = '';
    files.forEach(f => {
      const row = document.createElement('div');
      row.className = `tree-item ${f.isDirectory ? 'is-dir' : 'is-file'}`;
      const icon = f.isDirectory ? '📁' : '📄';
      row.innerHTML = `
        <span class="tree-icon">${icon}</span>
        <span class="tree-name" title="${escapeHtml(f.path)}">${escapeHtml(f.name)}</span>
      `;
      container.appendChild(row);
    });
  } catch (err) {
    container.innerHTML = `<span class="tree-error-text">Không thể đọc tập tin: ${err.message}</span>`;
  }
}

// 5. Chọn luồng chat trong dự án
window.selectProjectChat = function(chatId) {
  projectsState.activeChatId = chatId;
  const chatsListEl = document.getElementById('project-chats-list');
  if (chatsListEl) {
    const items = chatsListEl.querySelectorAll('.project-chat-item');
    items.forEach(el => el.classList.remove('active'));
  }
  renderActiveProject();
};

// 6. Xóa đoạn chat trong dự án
window.deleteProjectChat = async function(event, chatId) {
  if (event) event.stopPropagation();
  if (!confirm('Bạn có chắc chắn muốn xóa đoạn chat này không?')) return;
  try {
    const res = await fetch(`/api/projects/${projectsState.activeProjectId}/chats/${chatId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      if (projectsState.activeProject) {
        projectsState.activeProject.chats = (projectsState.activeProject.chats || []).filter(c => c.id !== chatId);
        if (projectsState.activeChatId === chatId) {
          projectsState.activeChatId = projectsState.activeProject.chats.length > 0 ? projectsState.activeProject.chats[0].id : null;
        }
      }
      renderActiveProject();
      showToast('Đã xóa đoạn chat.');
    } else {
      showToast('Lỗi khi xóa chat: ' + (data.error || 'Thất bại'));
    }
  } catch (err) {
    showToast('Lỗi khi xóa chat: ' + err.message);
  }
};

function updateTopbarModelSummary() {
  const modelSelectEl = document.getElementById('chat-active-model-select');
  const summaryEl = document.getElementById('topbar-model-summary-name');
  if (summaryEl) {
    const text = (modelSelectEl && modelSelectEl.value) || (projectsState.activeChat ? projectsState.activeChat.model : 'Model AI');
    summaryEl.textContent = text;
    summaryEl.title = text;
  }
}

// Thiết lập dropdown Nhà cung cấp & Model tương ứng trên Top Bar của đoạn chat
async function setupChatTopBarProviderAndModel(chat) {
  const provSelectEl = document.getElementById('chat-active-provider-select');
  const modelSelectEl = document.getElementById('chat-active-model-select');
  if (!provSelectEl || !modelSelectEl || !chat) return;

  if (!councilProvidersCache || councilProvidersCache.length === 0) {
    try {
      const res = await fetch('/api/providers');
      councilProvidersCache = await res.json();
    } catch (e) {
      councilProvidersCache = [];
    }
  }

  // Lọc các nhà cung cấp ĐANG HOẠT ĐỘNG (có API Key hoặc Gateway mặc định hoạt động)
  const activeProvs = (councilProvidersCache || []).filter(p => {
    return p.enabled !== false && (
      p.apiKey ||
      p.id === 'prov_openrouter' ||
      p.id === 'prov_cloudflare_ai' ||
      p.id === 'prov_kilo_gateway' ||
      p.id === 'prov_opencode'
    );
  });

  // Điền danh sách Provider
  provSelectEl.innerHTML = '';
  activeProvs.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const modelCount = (p.models || []).length;
    opt.textContent = `⚡ ${p.name} (${modelCount} Models)`;
    provSelectEl.appendChild(opt);
  });

  // Xác định provider hiện tại của chat
  let currentProvId = chat.providerId;
  if (!currentProvId || !activeProvs.some(p => p.id === currentProvId)) {
    const matched = activeProvs.find(p => (p.models || []).includes(chat.model));
    currentProvId = matched ? matched.id : (activeProvs[0] ? activeProvs[0].id : null);
  }

  if (currentProvId) {
    provSelectEl.value = currentProvId;
  }

  const updateModelsDropdown = async (isUserTriggered = false) => {
    const selectedProvId = provSelectEl.value;
    const prov = activeProvs.find(p => p.id === selectedProvId) || activeProvs[0];
    modelSelectEl.innerHTML = '';
    if (!prov) return;

    const MODEL_PURPOSES = {
      'nvidia/nemotron-3-ultra-550b-a55b:free': 'Reasoning, AI Agent',
      'nvidia/nemotron-3.5-super-vl:free': 'Phân tích hình ảnh (Vision)',
      'nvidia/nemotron-3.5-lightning:free': 'Chat, Automation',
      'xingchen-agi/xing4.0-29b-a4b:free': 'Planning, Tool Calling',
      'liquid/lfm-2.5-2.6b:free': 'Trích xuất dữ liệu',
      'google/gemma-4-26b-a4b-it:free': 'Chat, Hình ảnh & Video',
      'cohere/north-mini-code:free': 'Lập trình chuyên sâu',
      'recursive/flint-v1.0:free': 'Coding Agent',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'Lập luận Logic',
      'openrouter/free': 'Auto Router Free',
      '@cf/meta/llama-3.2-1b-instruct': 'Chat nhẹ siêu nhanh',
      '@cf/meta/llama-3.2-3b-instruct': 'Viết nội dung',
      '@cf/meta/llama-3.1-8b-instruct-fp8-fast': 'Chat, xử lý văn bản',
      '@cf/meta/llama-3.2-11b-vision-instruct': 'Phân tích ảnh (Vision)',
      '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': 'Reasoning suy luận sâu',
      '@cf/baai/bge-m3': 'Embedding tìm kiếm',
      '@cf/baai/bge-reranker-base': 'Xếp hạng tìm kiếm',
      '@cf/black-forest-labs/flux-1-schnell': 'Tạo ảnh',
      'deepseek-v4.1-flash-free': 'DeepSeek V4.1 Siêu Nhanh',
      'glm-5.3-flash-free': 'GLM 5.3 Flash Thông Minh',
      'nemotron-3.5-lightning-free': 'Nemotron 3.5 Lightning',
      'nemotron-3.5-super-vl-free': 'Nemotron Vision Đa Phương Tiện',
      'mimo-v2.6-flash-free': 'Mimo V2.6 Xử Lý Nhanh',
      'flint-40b-free': 'Flint 40B Coding Agent',
      'beam-free': 'Beam AI Đa Năng',
      'big-pickle': 'Big Pickle Thử Nghiệm'
    };

    (prov.models || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      const purpose = MODEL_PURPOSES[m] ? ` [${MODEL_PURPOSES[m]}]` : '';
      opt.textContent = `${m}${purpose} [FREE 100%]`;
      modelSelectEl.appendChild(opt);
    });

    if ((prov.models || []).includes(chat.model)) {
      modelSelectEl.value = chat.model;
    } else if (prov.models && prov.models.length > 0) {
      modelSelectEl.value = prov.models[0];
    }

    if (isUserTriggered) {
      const newModel = modelSelectEl.value;
      try {
        await fetch(`/api/projects/${projectsState.activeProjectId}/chats/${chat.id}/model`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: newModel, providerId: selectedProvId })
        });
        chat.model = newModel;
        chat.providerId = selectedProvId;
        updateTopbarModelSummary();
        showToast(`⚡ Đã chuyển sang ${prov.name} - Model: ${newModel}`);
      } catch (e) {
        showToast('Lỗi đổi model: ' + e.message);
      }
    }
  };

  provSelectEl.onchange = () => updateModelsDropdown(true);

  modelSelectEl.onchange = async () => {
    const newModel = modelSelectEl.value;
    const selectedProvId = provSelectEl.value;
    const prov = activeProvs.find(p => p.id === selectedProvId);
    try {
      await fetch(`/api/projects/${projectsState.activeProjectId}/chats/${chat.id}/model`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel, providerId: selectedProvId })
      });
      chat.model = newModel;
      chat.providerId = selectedProvId;
      updateTopbarModelSummary();
      showToast(`✔ Đã chọn Model: ${newModel}`);
    } catch (e) {
      showToast('Lỗi đổi model: ' + e.message);
    }
  };

  await updateModelsDropdown(false);
  updateTopbarModelSummary();
}

// 7. Render Nội Dung Cuộc Trò Chuyện & Top Bar
function renderActiveChatAgents(chat) {
  const agentsRowEl = document.getElementById('chat-agents-pills-row');
  const addAgentBtn = document.getElementById('btn-add-agent-plus');
  const agents = (chat && chat.agents) ? chat.agents : [];
  if (agentsRowEl) {
    agentsRowEl.innerHTML = '';
    agents.forEach(ag => {
      let badgeClass = 'badge-coder';
      const b = (ag.badge || '').toUpperCase();
      const cat = (ag.category || '').toLowerCase();
      if (b.includes('ARCH') || cat === 'architect') badgeClass = 'badge-arch';
      else if (b.includes('TEST') || cat === 'tester') badgeClass = 'badge-tester';
      else if (b.includes('REVIEW') || cat === 'reviewer') badgeClass = 'badge-reviewer';
      else if (b.includes('DEVOPS') || cat === 'devops') badgeClass = 'badge-devops';
      else if (b.includes('DATA') || cat === 'database') badgeClass = 'badge-database';
      else if (b.includes('FRONT') || cat === 'frontend') badgeClass = 'badge-frontend';
      else if (b.includes('SEC') || cat === 'security') badgeClass = 'badge-security';

      const chip = document.createElement('div');
      chip.className = 'chat-agent-pill';
      const provText = ag.providerName ? ` [${ag.providerName}]` : '';
      chip.title = `Model: ${ag.model || 'Auto'}${provText} - Vai trò: ${ag.roleTitle || ag.name}`;
      chip.innerHTML = `
        <span class="agent-badge ${badgeClass}">${escapeHtml(ag.badge || 'AI')}</span>
        <span class="agent-name-text">${escapeHtml(ag.name)}</span>
        <span class="agent-model-pill-tag" style="font-size:0.65rem; color:#71717a; font-family:monospace;">(${escapeHtml(ag.model || 'Auto')})</span>
        <button type="button" class="chip-remove-btn" onclick="removeAgentFromActiveChat('${ag.id}')" title="Xóa Agent khỏi Hội Đồng">&times;</button>
      `;
      agentsRowEl.appendChild(chip);
    });
  }
  if (addAgentBtn) {
    if (agents.length >= 5) {
      addAgentBtn.disabled = true;
      addAgentBtn.title = 'Đoạn chat này đã có tối đa 5 Agent';
      addAgentBtn.classList.add('disabled');
    } else {
      addAgentBtn.disabled = false;
      addAgentBtn.title = `Thêm Agent vào đoạn chat này (${agents.length}/5 Agent)`;
      addAgentBtn.classList.remove('disabled');
    }
  }
}
window.renderActiveChatAgents = renderActiveChatAgents;

function renderProjectChat(chat) {
  projectsState.activeChat = chat;
  const topBarEl = document.getElementById('project-chat-topbar');
  const titleEl = document.getElementById('project-chat-title');
  const modelSelectEl = document.getElementById('chat-active-model-select');
  const feedEl = document.getElementById('projects-chat-feed');

  if (!feedEl) return;
  feedEl.innerHTML = '';

  if (!chat || !projectsState.activeProject) {
    if (topBarEl) topBarEl.style.display = 'none';
    feedEl.innerHTML = '<div class="chat-empty-clean">Vui lòng chọn hoặc thêm một dự án để bắt đầu.</div>';
    return;
  }

  // Hiển thị top bar của đoạn chat (nếu không bị người dùng ẩn)
  if (topBarEl) {
    if (!topBarEl.classList.contains('topbar-hidden')) {
      topBarEl.style.display = 'flex';
    }
  }
  if (typeof window.updateFloatingViewControls === 'function') {
    window.updateFloatingViewControls();
  }
  if (titleEl) titleEl.textContent = chat.title;

  // Đồng bộ Nhà cung cấp (Provider) & Model tương ứng trên Top Bar
  setupChatTopBarProviderAndModel(chat);

  // Render các Agent trong đoạn chat (Tối đa 5 Agent)
  renderActiveChatAgents(chat);

  const messages = chat.messages || [];

  if (messages.length === 0) {
    feedEl.innerHTML = '<div class="chat-empty-clean">Nhập câu hỏi, ý tưởng hoặc đính kèm ảnh/file để bắt đầu...</div>';
    return;
  }

  // Render messages
  messages.forEach(msg => {
    appendProjectMessageToFeed(msg, feedEl);
  });

  feedEl.scrollTop = feedEl.scrollHeight;
}

// 8. Quản Lý Thêm Agent Vào Hội Đồng (Chia Provider -> Model, Tối đa 5 Agent)
let councilProvidersCache = null;

window.openAddAgentCouncilModal = async function() {
  if (!projectsState.activeProjectId || !projectsState.activeChatId) {
    showToast('Vui lòng chọn hoặc tạo một đoạn chat trước.');
    return;
  }

  const agents = projectsState.activeChat?.agents || [];
  if (agents.length >= 5) {
    showToast('Đoạn chat này đã có tối đa 5 Agent trong Hội Đồng.');
    return;
  }

  const modal = document.getElementById('modal-add-agent-council');
  const roleSelect = document.getElementById('council-role-category');
  const nameInput = document.getElementById('council-agent-name-input');
  const provSelect = document.getElementById('council-provider-select');
  const modelSelect = document.getElementById('council-model-select');

  if (!modal || !provSelect || !modelSelect) return;

  // Tải danh sách provider nếu chưa có
  if (!councilProvidersCache || councilProvidersCache.length === 0) {
    try {
      const res = await fetch('/api/providers');
      councilProvidersCache = await res.json();
    } catch (e) {
      console.error('Lỗi tải providers:', e);
      councilProvidersCache = [];
    }
  }

  // Điền danh sách Provider vào Dropdown
  provSelect.innerHTML = '';
  if (councilProvidersCache.length === 0) {
    provSelect.innerHTML = '<option value="prov_openrouter">OpenRouter [FREE]</option>';
  } else {
    const sorted = [...councilProvidersCache].sort((a, b) => {
      const aReady = Boolean(a.apiKey || a.hasKey || a.id === 'prov_openrouter' || a.id === 'prov_cloudflare_ai' || a.id === 'prov_kilo_gateway' || a.id === 'prov_opencode');
      const bReady = Boolean(b.apiKey || b.hasKey || b.id === 'prov_openrouter' || b.id === 'prov_cloudflare_ai' || b.id === 'prov_kilo_gateway' || b.id === 'prov_opencode');
      if (aReady && !bReady) return -1;
      if (!aReady && bReady) return 1;
      return 0;
    });

    sorted.forEach(p => {
      const isReady = Boolean(p.apiKey || p.hasKey || p.id === 'prov_openrouter' || p.id === 'prov_cloudflare_ai' || p.id === 'prov_kilo_gateway' || p.id === 'prov_opencode');
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = isReady
        ? `✔ ${p.name} [Sẵn Sàng - ${(p.models || []).length} Models]`
        : `⚠️ ${p.name} (Chưa kích hoạt)`;
      provSelect.appendChild(opt);
    });

    const defaultReady = sorted.find(p => p.id === 'prov_openrouter') || sorted.find(p => p.id === 'prov_cloudflare_ai') || sorted[0];
    if (defaultReady) provSelect.value = defaultReady.id;
  }

  // Hàm cập nhật danh sách Model tương ứng khi đổi Provider
  const updateCouncilModels = () => {
    const selectedProvId = provSelect.value;
    const prov = councilProvidersCache.find(p => p.id === selectedProvId) || councilProvidersCache[0];
    modelSelect.innerHTML = '';

    if (!prov || !prov.models || prov.models.length === 0) {
      modelSelect.innerHTML = '<option value="kilo-auto/free">kilo-auto/free [FREE]</option>';
      return;
    }

    const MODEL_PURPOSES = {
      'nvidia/nemotron-3-ultra-550b-a55b:free': 'Reasoning, AI Agent',
      'nvidia/nemotron-3.5-super-vl:free': 'Phân tích hình ảnh (Vision)',
      'nvidia/nemotron-3.5-lightning:free': 'Chat, Automation',
      'xingchen-agi/xing4.0-29b-a4b:free': 'Planning, Tool Calling',
      'liquid/lfm-2.5-2.6b:free': 'Trích xuất dữ liệu',
      'google/gemma-4-26b-a4b-it:free': 'Chat, Hình ảnh & Video',
      'cohere/north-mini-code:free': 'Lập trình chuyên sâu',
      'recursive/flint-v1.0:free': 'Coding Agent',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'Lập luận Logic',
      'openrouter/free': 'Auto Router Free',
      '@cf/meta/llama-3.2-1b-instruct': 'Chat nhẹ siêu nhanh',
      '@cf/meta/llama-3.2-3b-instruct': 'Viết nội dung',
      '@cf/meta/llama-3.1-8b-instruct-fp8-fast': 'Chat, xử lý văn bản',
      '@cf/meta/llama-3.2-11b-vision-instruct': 'Phân tích ảnh (Vision)',
      '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': 'Reasoning suy luận sâu',
      '@cf/baai/bge-m3': 'Embedding tìm kiếm',
      '@cf/baai/bge-reranker-base': 'Xếp hạng tìm kiếm',
      '@cf/black-forest-labs/flux-1-schnell': 'Tạo ảnh',
      'deepseek-v4.1-flash-free': 'DeepSeek V4.1 Siêu Nhanh',
      'glm-5.3-flash-free': 'GLM 5.3 Flash Thông Minh',
      'nemotron-3.5-lightning-free': 'Nemotron 3.5 Lightning',
      'nemotron-3.5-super-vl-free': 'Nemotron Vision Đa Phương Tiện',
      'mimo-v2.6-flash-free': 'Mimo V2.6 Xử Lý Nhanh',
      'flint-40b-free': 'Flint 40B Coding Agent',
      'beam-free': 'Beam AI Đa Năng',
      'big-pickle': 'Big Pickle Thử Nghiệm'
    };

    prov.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      const purpose = MODEL_PURPOSES[m] ? ` [${MODEL_PURPOSES[m]}]` : '';
      opt.textContent = `${m}${purpose} [FREE 100%]`;
      modelSelect.appendChild(opt);
    });

    // Tự động gợi ý model phù hợp với vai trò
    const currentRole = roleSelect ? roleSelect.value : 'coder';
    if (currentRole === 'coder') {
      const codeModel = prov.models.find(m => m.toLowerCase().includes('code') || m.toLowerCase().includes('coder') || m.toLowerCase().includes('deepseek'));
      if (codeModel) modelSelect.value = codeModel;
    } else if (currentRole === 'tester') {
      const logicModel = prov.models.find(m => m.toLowerCase().includes('reasoning') || m.toLowerCase().includes('r1') || m.toLowerCase().includes('nano'));
      if (logicModel) modelSelect.value = logicModel;
    } else if (currentRole === 'architect') {
      const archModel = prov.models.find(m => m.toLowerCase().includes('ultra') || m.toLowerCase().includes('550b') || m.toLowerCase().includes('xing') || m.toLowerCase().includes('auto'));
      if (archModel) modelSelect.value = archModel;
    } else if (currentRole === 'database') {
      const dbModel = prov.models.find(m => m.toLowerCase().includes('glm') || m.toLowerCase().includes('llama-3.1-8b') || m.toLowerCase().includes('sql') || m.toLowerCase().includes('code'));
      if (dbModel) modelSelect.value = dbModel;
    } else if (currentRole === 'frontend') {
      const feModel = prov.models.find(m => m.toLowerCase().includes('vl') || m.toLowerCase().includes('vision') || m.toLowerCase().includes('laguna') || m.toLowerCase().includes('lightning'));
      if (feModel) modelSelect.value = feModel;
    } else if (currentRole === 'security') {
      const secModel = prov.models.find(m => m.toLowerCase().includes('lightning') || m.toLowerCase().includes('ultra') || m.toLowerCase().includes('r1'));
      if (secModel) modelSelect.value = secModel;
    }
  };

  provSelect.onchange = updateCouncilModels;

  // Cập nhật tên hiển thị mặc định khi đổi vai trò
  if (roleSelect) {
    roleSelect.onchange = () => {
      const roleTitles = {
        architect: 'Kiến Trúc Sư',
        coder: 'Lập Trình Viên',
        tester: 'Kỹ Sư Kiểm Thử',
        database: 'Kỹ Sư CSDL & SQL',
        frontend: 'Kỹ Sư Frontend UI/UX',
        security: 'Chuyên Gia Bảo Mật',
        reviewer: 'Chuyên Gia Review',
        devops: 'Kỹ Sư DevOps'
      };
      if (nameInput) nameInput.value = roleTitles[roleSelect.value] || 'AI Agent';
      updateCouncilModels();
    };
  }

  if (nameInput && !nameInput.value) nameInput.value = 'Kiến Trúc Sư';
  updateCouncilModels();

  modal.classList.add('active'); modal.classList.add('open');
};

// Tự động thêm trọn bộ 5 Agent chuyên sâu từ 4 Provider: OpenRouter, Cloudflare, Kilo, OpenCode
window.autoSetupCouncilAgents = async function() {
  if (!projectsState.activeProjectId || !projectsState.activeChatId) {
    showToast('Vui lòng chọn hoặc mở một đoạn chat trước.');
    return;
  }

  try {
    showToast('Đang tự động tuyển chọn 5 Agent từ 4 Provider...');
    const res = await fetch(`/api/projects/${projectsState.activeProjectId}/chats/${projectsState.activeChatId}/auto-add-agents`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success && data.agents) {
      if (projectsState.activeChat) {
        projectsState.activeChat.agents = data.agents;
      }
      renderActiveChatAgents(projectsState.activeChat);
      renderActiveProject();
      showToast('Đã tự động thêm đủ 5 Agent từ 4 Provider: OpenRouter, Cloudflare, Kilo, OpenCode!');
    } else {
      showToast('Lỗi: ' + (data.error || 'Không thể tự động thêm agent.'));
    }
  } catch (err) {
    showToast('Lỗi tự động thêm agent: ' + err.message);
  }
};

// 9. Xóa Agent khỏi đoạn chat
window.removeAgentFromActiveChat = async function(agentId) {
  if (!projectsState.activeProjectId || !projectsState.activeChatId) return;
  try {
    const res = await fetch(`/api/projects/${projectsState.activeProjectId}/chats/${projectsState.activeChatId}/agents/${agentId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      if (projectsState.activeChat) {
        projectsState.activeChat.agents = (projectsState.activeChat.agents || []).filter(a => a.id !== agentId);
      }
      renderProjectChat(projectsState.activeChat);
      renderActiveProject();
      showToast('Đã gỡ Agent khỏi Hội Đồng.');
    } else {
      showToast('Lỗi: ' + (data.error || 'Thao tác thất bại'));
    }
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  }
};

// 10. Gắn 1 tin nhắn vào Feed

// Hàm trang trí các khối Code để LÀM VIỆC THỰC TẾ (Lưu File vào Dự Án & Chạy Terminal)
function decorateProjectCodeBlocks(containerEl) {
  if (!containerEl) return;
  const preElements = containerEl.querySelectorAll('pre');
  preElements.forEach(pre => {
    if (pre.dataset.decorated) return;
    pre.dataset.decorated = 'true';

    const codeEl = pre.querySelector('code');
    const rawText = codeEl ? codeEl.innerText : pre.innerText;

    // Phát hiện chú thích file: // File: src/main.js hoặc # File: app.py
    const fileMatch = rawText.match(/^(?:\/\/|#|\/\*|--)\s*(?:File|Tệp|Đường dẫn):\s*([^\r\n]+)/im);
    let suggestedFile = fileMatch ? fileMatch[1].replace(/\*\/$/, '').trim() : '';

    // Chuẩn hóa tên file: loại bỏ đường dẫn tuyệt đối của dự án nếu có
    if (suggestedFile) {
      suggestedFile = suggestedFile.replace(/\\/g, '/');
      const activeProjPath = (projectsState.activeProject?.path || '').replace(/\\/g, '/');
      if (activeProjPath && suggestedFile.toLowerCase().startsWith(activeProjPath.toLowerCase())) {
        suggestedFile = suggestedFile.slice(activeProjPath.length).replace(/^\/+/, '');
      } else {
        const projBaseName = activeProjPath.split('/').pop().toLowerCase();
        if (projBaseName && suggestedFile.toLowerCase().startsWith(projBaseName + '/')) {
          suggestedFile = suggestedFile.slice(projBaseName.length + 1);
        }
      }
      suggestedFile = suggestedFile.replace(/^[a-zA-Z]:\/+/, '').replace(/^\/+/, '');
      if (suggestedFile === '.' || suggestedFile === '/') {
        suggestedFile = '';
      }
    }

    const isTerminal = /powershell|cmd|bash|sh|terminal/.test(codeEl?.className || '') ||
                       /^(npm|git|node|pip|yarn|pnpm|python|dir|ls|cd|mkdir|cat|curl|powershell)\s+/im.test(rawText.trim());

    const toolbar = document.createElement('div');
    toolbar.className = 'code-block-action-bar';

    let buttonsHtml = '';
    // Nút Lưu File gọn gàng
    if (suggestedFile) {
      buttonsHtml += `<button type="button" class="btn-code-action btn-apply-file" data-file="${escapeHtml(suggestedFile)}" title="Ghi trực tiếp vào file ${escapeHtml(suggestedFile)} trên máy">💾 Lưu File</button>`;
    } else {
      buttonsHtml += `<button type="button" class="btn-code-action btn-apply-custom-file" title="Ghi code này vào một file trong dự án">💾 Lưu File...</button>`;
    }

    // Nút Chạy Terminal
    if (isTerminal) {
      buttonsHtml += `<button type="button" class="btn-code-action btn-run-terminal" title="Chạy lệnh này trực tiếp trong Terminal của dự án">▶ Chạy Terminal</button>`;
    }

    // Nút Copy code
    buttonsHtml += `<button type="button" class="btn-code-action btn-copy-code" title="Sao chép mã nguồn">📋 Copy</button>`;

    toolbar.innerHTML = `
      <div class="code-bar-left">
        <span class="code-bar-title">${suggestedFile ? `📁 ${escapeHtml(suggestedFile)}` : (codeEl?.className?.replace('language-', '') || 'code')}</span>
        ${suggestedFile ? `<span class="badge-auto-saved" title="Agent đã có toàn quyền và tự động ghi vào máy">⚡ Đã tự động lưu</span>` : ''}
      </div>
      <div class="code-bar-actions">${buttonsHtml}</div>
    `;

    pre.parentNode.insertBefore(toolbar, pre);

    // Xử lý copy code
    const copyBtn = toolbar.querySelector('.btn-copy-code');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(rawText);
          const origText = copyBtn.textContent;
          copyBtn.textContent = '✔ Đã Copy';
          setTimeout(() => { copyBtn.textContent = origText; }, 1600);
        } catch (e) {
          showToast('Không thể sao chép');
        }
      });
    }

    // Xử lý sự kiện Lưu File
    const applyFileBtn = toolbar.querySelector('.btn-apply-file, .btn-apply-custom-file');
    if (applyFileBtn) {
      applyFileBtn.addEventListener('click', async () => {
        let targetFile = applyFileBtn.dataset.file;
        if (!targetFile || targetFile === '.' || targetFile === '/' || targetFile.trim() === '') {
          targetFile = prompt('Nhập tên/đường dẫn file cần lưu trong dự án (ví dụ: src/app.js):');
        }
        if (!targetFile || !targetFile.trim()) return;
        targetFile = targetFile.trim();

        if (!projectsState.activeProjectId) {
          showToast('Vui lòng chọn hoặc thêm dự án trước.');
          return;
        }

        try {
          applyFileBtn.disabled = true;
          applyFileBtn.textContent = 'Đang lưu file...';
          const res = await fetch(`/api/projects/${projectsState.activeProjectId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: targetFile, content: rawText, type: 'file' })
          });
          const data = await res.json();
          if (data.success) {
            showToast(`Đã áp dụng & ghi thành công vào file "${targetFile}"!`);
            applyFileBtn.textContent = '✔ Đã Lưu Xong';
            loadProjectFiles(projectsState.activeProjectId);
          } else {
            showToast('Lỗi lưu file: ' + (data.error || 'Thất bại'));
            applyFileBtn.textContent = '💾 Thử Lại';
          }
        } catch (err) {
          showToast('Lỗi: ' + err.message);
          applyFileBtn.textContent = '💾 Thử Lại';
        } finally {
          applyFileBtn.disabled = false;
        }
      });
    }

    // Xử lý sự kiện Chạy Terminal
    const runTerminalBtn = toolbar.querySelector('.btn-run-terminal');
    if (runTerminalBtn) {
      runTerminalBtn.addEventListener('click', async () => {
        if (!projectsState.activeProjectId) {
          showToast('Vui lòng chọn hoặc thêm dự án trước.');
          return;
        }

        const terminalDrawer = document.getElementById('project-terminal-drawer');
        const outputPre = document.getElementById('terminal-output-pre');
        const cmdInput = document.getElementById('terminal-cmd-input');
        if (terminalDrawer) terminalDrawer.style.display = 'block';

        const cmdToRun = rawText.trim();
        if (cmdInput) cmdInput.value = cmdToRun;
        if (outputPre) outputPre.textContent = `> ${cmdToRun}\n[Đang chạy lệnh trong thư mục dự án...]`;

        try {
          runTerminalBtn.disabled = true;
          runTerminalBtn.textContent = 'Đang chạy...';
          const res = await fetch(`/api/projects/${projectsState.activeProjectId}/terminal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmdToRun, shell: 'powershell' })
          });
          const data = await res.json();
          if (outputPre) {
            outputPre.textContent = `> ${cmdToRun}\n\n${data.stdout || ''}${data.stderr ? `\n[Lỗi]: ${data.stderr}` : ''}\n\n[Mã thoát]: ${data.exitCode} (${data.duration}ms)`;
          }
          showToast(data.exitCode === 0 ? 'Chạy lệnh hoàn tất thành công!' : 'Lệnh chạy xong với cảnh báo/lỗi.');
        } catch (err) {
          if (outputPre) outputPre.textContent = `Lỗi thực thi terminal: ${err.message}`;
          showToast('Lỗi chạy terminal: ' + err.message);
        } finally {
          runTerminalBtn.disabled = false;
          runTerminalBtn.textContent = '▶ Chạy Lại';
        }
      });
    }
  });
}

function showAgentTypingIndicator(authorName, badge, text) {
  const feedEl = document.getElementById('projects-chat-feed');
  if (!feedEl) return;
  hideAgentTypingIndicator();

  // Highlight agent đang phát biểu trên thanh topbar
  document.querySelectorAll('.agent-badge-chip').forEach(chip => {
    chip.classList.remove('is-speaking');
    if (authorName && chip.textContent.toLowerCase().includes(authorName.toLowerCase())) {
      chip.classList.add('is-speaking');
    }
  });

  let avatarIcon = '💻';
  let badgeClass = 'badge-coder';
  if ((badge || '').includes('ARCH')) { avatarIcon = '🏛️'; badgeClass = 'badge-arch'; }
  else if ((badge || '').includes('TEST')) { avatarIcon = '🧪'; badgeClass = 'badge-tester'; }
  else if ((badge || '').includes('REVIEW')) { avatarIcon = '🧐'; badgeClass = 'badge-reviewer'; }
  else if ((badge || '').includes('DEVOPS')) { avatarIcon = '🚀'; badgeClass = 'badge-devops'; }
  else if ((badge || '').includes('DATA') || (badge || '').includes('SQL')) { avatarIcon = '🗄️'; badgeClass = 'badge-database'; }
  else if ((badge || '').includes('FRONT') || (badge || '').includes('UI')) { avatarIcon = '🎨'; badgeClass = 'badge-frontend'; }
  else if ((badge || '').includes('SEC')) { avatarIcon = '🛡️'; badgeClass = 'badge-security'; }

  const typingEl = document.createElement('div');
  typingEl.id = 'agent-live-typing-indicator';
  typingEl.className = 'proj-msg msg-agent msg-typing-card';
  typingEl.innerHTML = `
    <div class="proj-msg-header" style="margin-bottom: 0.35rem; padding-bottom: 0.25rem;">
      <div class="proj-msg-author-wrap">
        <span class="agent-avatar-icon">${avatarIcon}</span>
        <span class="agent-badge ${badgeClass}">${escapeHtml(badge || 'AI')}</span>
        <span class="proj-msg-author" style="font-size: 0.84rem;">${escapeHtml(authorName || 'Agent')} đang trao đổi...</span>
      </div>
    </div>
    <div class="typing-indicator-wave">
      <span class="typing-dot dot-1"></span>
      <span class="typing-dot dot-2"></span>
      <span class="typing-dot dot-3"></span>
      <span class="typing-status-text">${escapeHtml(text || 'Đang phối hợp cùng hội đồng...')}</span>
    </div>
  `;
  feedEl.appendChild(typingEl);
  feedEl.scrollTop = feedEl.scrollHeight;
}

function hideAgentTypingIndicator() {
  const el = document.getElementById('agent-live-typing-indicator');
  if (el) el.remove();
  document.querySelectorAll('.agent-badge-chip.is-speaking').forEach(chip => {
    chip.classList.remove('is-speaking');
  });
}

function appendProjectMessageToFeed(msg, feedEl) {
  if (!feedEl) feedEl = document.getElementById('projects-chat-feed');
  if (!feedEl) return;

  // Xóa bỏ màn hình rỗng ngay khi có tin nhắn
  const emptyPlaceholder = feedEl.querySelector('.chat-empty-clean');
  if (emptyPlaceholder) {
    emptyPlaceholder.remove();
  }

  const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const isUser = msg.role === 'user';
  
  const msgEl = document.createElement('div');
  msgEl.className = `proj-msg ${isUser ? 'msg-user' : 'msg-agent'}`;

  // Loại bỏ triệt để tiền tố tên trùng lặp (ví dụ [Kiến Trúc Sư]: ...)
  const rawCleanText = (msg.content || '').replace(/^(?:\[[^\]\r\n]+\]:\s*)+/g, '').trim();

  // Parse markdown
  let parsedContent = '';
  try {
    parsedContent = marked.parse(rawCleanText);
  } catch (e) {
    parsedContent = escapeHtml(rawCleanText);
  }

  // Tự động highlight chính xác các tag Mention @Tên (tránh khớp tham lam các từ phía sau)
  const knownRoleNames = [
    'Kỹ Sư Frontend UI/UX', 'Kỹ Sư Frontend', 'Kỹ Sư CSDL & SQL', 'Kỹ Sư CSDL',
    'Chuyên Gia Bảo Mật', 'Chuyên Gia Review', 'Kỹ Sư Kiểm Thử', 'Kỹ Sư DevOps',
    'Kiến Trúc Sư', 'Lập Trình Viên', 'Reviewer', 'Coder', 'Tester', 'Architect',
    'Database', 'Frontend', 'Security', 'DevOps', 'Người Dùng', 'Cả Nhóm', 'Hội Đồng', 'All'
  ];
  if (projectsState.activeChatId && projectsState.activeProjectId) {
    const curChat = (projectsState.chats || []).find(c => c.id === projectsState.activeChatId);
    if (curChat && Array.isArray(curChat.agents)) {
      curChat.agents.forEach(a => {
        if (a.name && !knownRoleNames.includes(a.name)) knownRoleNames.push(a.name);
      });
    }
  }
  knownRoleNames.sort((a, b) => b.length - a.length);
  const escapedNames = knownRoleNames.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const mentionPattern = new RegExp("@(" + escapedNames + ")(?=[^a-zA-Z0-9_À-Ỹà-ỹ]|$)", "gi");
  parsedContent = parsedContent.replace(mentionPattern, (m, name) => `<span class="mention-pill">@${escapeHtml(name)}</span>`);

  // Render attachments if attached to message
  let attachHtml = '';
  if (msg.attachments && msg.attachments.length > 0) {
    attachHtml = `
      <div class="msg-attachments-gallery">
        ${msg.attachments.map(att => {
          if (att.type && att.type.startsWith('image/')) {
            return `<img src="${att.data}" class="msg-attach-img" alt="Attached Image">`;
          }
          return `<div class="msg-attach-file">📄 ${escapeHtml(att.name || 'Tệp')}</div>`;
        }).join('')}
      </div>
    `;
  }

  if (isUser) {
    msgEl.innerHTML = `
      <div class="proj-msg-header">
        <span class="proj-msg-author">👤 ${escapeHtml(msg.author || 'Bạn')}</span>
        <span class="proj-msg-time">${timeStr}</span>
      </div>
      <div class="proj-msg-body markdown-content">
        ${parsedContent}
        ${attachHtml}
      </div>
    `;
  } else {
    let avatarIcon = '💻';
    let badgeClass = 'badge-coder';
    const badgeText = msg.agentBadge || 'AI';
    if (badgeText.includes('ARCH')) { avatarIcon = '🏛️'; badgeClass = 'badge-arch'; }
    else if (badgeText.includes('TEST')) { avatarIcon = '🧪'; badgeClass = 'badge-tester'; }
    else if (badgeText.includes('REVIEW')) { avatarIcon = '🧐'; badgeClass = 'badge-reviewer'; }
    else if (badgeText.includes('DEVOPS')) { avatarIcon = '🚀'; badgeClass = 'badge-devops'; }

    const modelTagHtml = msg.agentModel ? `<span class="agent-model-tag">${escapeHtml(msg.agentModel)}</span>` : '';

    msgEl.innerHTML = `
      <div class="proj-msg-header">
        <div class="proj-msg-author-wrap">
          <span class="agent-avatar-icon">${avatarIcon}</span>
          <span class="agent-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
          <span class="proj-msg-author">${escapeHtml(msg.author || 'AI')}</span>
        </div>
        <div class="proj-msg-meta-right">
          ${modelTagHtml}
          <span class="proj-msg-time">${timeStr}</span>
        </div>
      </div>
      <div class="proj-msg-body markdown-content">
        ${parsedContent}
        ${attachHtml}
      </div>
    `;
  }

  feedEl.appendChild(msgEl);
  decorateProjectCodeBlocks(msgEl);
}

// 11. Gửi tin nhắn / ý tưởng vào đoạn chat
async function sendProjectIdea() {
  try {
    const inputEl = document.getElementById('project-chat-input');
    const feedEl = document.getElementById('projects-chat-feed');
    const progressEl = document.getElementById('project-team-progress');
    const progressTitleEl = document.getElementById('team-progress-title');
    const chatModelSelect = document.getElementById('chat-active-model-select');

    if (!inputEl) return;

    // Đảm bảo mảng attachments luôn hợp lệ
    if (!Array.isArray(projectsState.attachments)) {
      projectsState.attachments = [];
    }

    // Tự động tải lại danh sách dự án nếu đang rỗng
    if (!projectsState.projects || projectsState.projects.length === 0) {
      try {
        const pRes = await fetch('/api/projects');
        const pData = await pRes.json();
        projectsState.projects = pData.projects || [];
      } catch (e) {
        console.warn('Auto fetch projects notice:', e);
      }
    }

    // Tự động khôi phục dự án nếu chưa có trong state
    if (!projectsState.activeProjectId && projectsState.projects.length > 0) {
      projectsState.activeProjectId = projectsState.projects[0].id;
    }
    let curProj = projectsState.projects.find(p => p.id === projectsState.activeProjectId) || projectsState.projects[0];
    if (!curProj) {
      showToast('Vui lòng tạo hoặc mở một dự án trước khi gửi tin nhắn.');
      return;
    }
    projectsState.activeProjectId = curProj.id;
    projectsState.activeProject = curProj;

    // Tự động khôi phục hoặc tạo đoạn chat mới nếu chưa có
    if (!projectsState.activeChatId || !(curProj.chats || []).some(c => c.id === projectsState.activeChatId)) {
      if (curProj.chats && curProj.chats.length > 0) {
        projectsState.activeChatId = curProj.chats[0].id;
        projectsState.activeChat = curProj.chats[0];
      } else {
        try {
          const createRes = await fetch(`/api/projects/${curProj.id}/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Đoạn chat mới', model: 'cohere/north-mini-code:free', providerId: 'prov_openrouter' })
          });
          const createData = await createRes.json();
          const newChat = createData.chat || createData;
          curProj.chats = curProj.chats || [];
          curProj.chats.push(newChat);
          projectsState.activeChatId = newChat.id;
          projectsState.activeChat = newChat;
        } catch (e) {
          showToast('Không thể tạo đoạn chat: ' + e.message);
          return;
        }
      }
    }

    const content = inputEl.value.trim();
    const attachments = Array.isArray(projectsState.attachments) ? [...projectsState.attachments] : [];

    if (!content && attachments.length === 0) return;

    if (projectsState.isRunning) {
      showToast('Agent đang xử lý yêu cầu trước đó. Đang gửi tiếp...');
    }

    // Clear input & attachments ngay lập tức trên UI
    inputEl.value = '';
    inputEl.style.height = 'auto';
    projectsState.attachments = [];
    renderProjectAttachments();
    projectsState.isRunning = true;

    // Render tin nhắn của user ngay lập tức lên feed
    const tempUserMsg = {
      role: 'user',
      author: 'Bạn',
      content,
      attachments,
      timestamp: new Date().toISOString()
    };
    appendProjectMessageToFeed(tempUserMsg, feedEl);
    if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;

    // Hiển thị animation typing indicator cho Agent đầu tiên trong hội đồng
    const firstAgent = projectsState.activeChat?.agents?.[0];
    if (firstAgent) {
      showAgentTypingIndicator(firstAgent.name, firstAgent.badge, 'Đang phân tích yêu cầu và mở đầu cuộc họp hội đồng...');
    } else {
      showAgentTypingIndicator('AI Trợ Lý', 'AI', 'Đang phân tích và xử lý yêu cầu...');
    }

    // Hiển thị thanh tiến trình
    if (progressEl) {
      progressEl.style.display = 'flex';
      if (progressTitleEl) {
        progressTitleEl.textContent = 'Hội đồng Agent đang làm việc và phối hợp...';
      }
    }

    const selectedModel = chatModelSelect ? chatModelSelect.value : (projectsState.activeChat?.model || 'cohere/north-mini-code:free');
    const chatProvSelect = document.getElementById('chat-active-provider-select');
    const selectedProviderId = chatProvSelect ? chatProvSelect.value : (projectsState.activeChat?.providerId || 'prov_openrouter');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const res = await fetch(`/api/projects/${projectsState.activeProjectId}/chats/${projectsState.activeChatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          content,
          attachments,
          model: selectedModel,
          providerId: selectedProviderId,
          isStream: false
        })
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Lỗi khi gửi yêu cầu tới Agent.');
      }

      // Đưa câu trả lời của các Agent lên màn hình chat với animation tuần tự mượt mà
      const messages = data.messages || [];
      hideAgentTypingIndicator();

      if (messages.length <= 1) {
        messages.forEach(msg => {
          appendProjectMessageToFeed(msg, feedEl);
        });
      } else {
        // Nhiều Agent trong hội đồng: hiển thị tuần tự với hiệu ứng đang gõ giữa các lượt trao đổi
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          if (i > 0) {
            showAgentTypingIndicator(msg.author, msg.agentBadge, `${msg.author} đang tiếp nhận ý kiến và phản hồi...`);
            await new Promise(r => setTimeout(r, 700));
            hideAgentTypingIndicator();
          }
          appendProjectMessageToFeed(msg, feedEl);
          if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
        }
      }

      // Thông báo và tự động làm mới cây thư mục nếu Agent đã tự động ghi file vào máy
      const allAutoSaved = messages.flatMap(m => m.autoSavedFiles || []);
      if (allAutoSaved.length > 0) {
        showToast(`⚡ Agent đã tự động ghi ${allAutoSaved.length} file vào máy (${allAutoSaved.join(', ')})!`);
        if (typeof loadProjectFiles === 'function' && projectsState.activeProjectId) {
          loadProjectFiles(projectsState.activeProjectId);
        }
      }

      // Tự động cập nhật danh sách chat nếu có chat công việc mới được tạo bởi AI
      if (data.createdChats && data.createdChats.length > 0) {
        if (typeof loadProjectChats === 'function' && projectsState.activeProjectId) {
          loadProjectChats(projectsState.activeProjectId);
        }
        showToast(`🎉 AI đã tự động tạo ${data.createdChats.length} nhóm chat công việc mới cho dự án!`);
      }

      // Quét và hiển thị thông báo nếu AI tự động tuyển dụng thêm Agent
      messages.forEach(msg => {
        const recruitRegex = /\[(?:RECRUIT_AGENT|AUTO_ADD_AGENT):\s*role="([^"]+)",\s*name="([^"]+)"(?:,\s*model="([^"]+)")?\]/gi;
        let rMatch;
        while ((rMatch = recruitRegex.exec(msg.content)) !== null) {
          const rRole = rMatch[1];
          const rName = rMatch[2];
          const rModel = rMatch[3] || 'Auto';
          renderRecruitmentNotice(rName, rRole, rModel);
        }
      });

      // Tự động đồng bộ và nạp lại danh sách Agent nếu vừa có thành viên mới được tuyển dụng
      if (projectsState.activeProjectId && projectsState.activeChatId) {
        try {
          const refChatRes = await fetch(`/api/projects/${projectsState.activeProjectId}/chats`);
          const refChatData = await refChatRes.json();
          const updatedChat = (refChatData.chats || []).find(c => c.id === projectsState.activeChatId);
          if (updatedChat && projectsState.activeChat) {
            projectsState.activeChat.agents = updatedChat.agents || [];
            renderActiveChatAgents(projectsState.activeChat);
          }
        } catch (e) {}
      }

      // Lưu vào state chat hiện tại
      if (projectsState.activeChat) {
        projectsState.activeChat.messages = projectsState.activeChat.messages || [];
        projectsState.activeChat.messages.push(tempUserMsg, ...messages);
      }

      if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
    } catch (err) {
      console.error('Lỗi API gửi tin:', err);
      showToast('Lỗi: ' + err.message);
    } finally {
      hideAgentTypingIndicator();
      projectsState.isRunning = false;
      if (progressEl) progressEl.style.display = 'none';
    }
  } catch (outerErr) {
    console.error('Lỗi ngoại lệ trong sendProjectIdea:', outerErr);
    showToast('Lỗi xử lý gửi: ' + outerErr.message);
  }
}
window.sendProjectIdea = sendProjectIdea;

// Hàm hiển thị thông báo AI tự động tuyển dụng thêm thành viên
function renderRecruitmentNotice(recruitedName, role, model) {
  const feedEl = document.getElementById('projects-chat-feed');
  if (!feedEl) return;
  const notice = document.createElement('div');
  notice.className = 'agent-recruit-announcement';
  notice.innerHTML = `
    <span class="recruit-icon">⚡</span>
    <span class="recruit-text">Hội đồng AI vừa <strong>tự động tuyển dụng</strong>: <span class="recruit-highlight">${escapeHtml(recruitedName)}</span> (${escapeHtml(model || 'Auto')}) vào dự án!</span>
  `;
  feedEl.appendChild(notice);
}
window.renderRecruitmentNotice = renderRecruitmentNotice;

// =========================================================================
// 11b. SƠ ĐỒ & CẤU TRÚC DỰ ÁN KÈM GIẢI THÍCH CHI TIẾT (ARCHITECTURE CANVAS)
// =========================================================================

window.openProjectStructureView = function() {
  const structureView = document.getElementById('project-structure-view');
  const chatFeed = document.getElementById('projects-chat-feed');
  const composer = document.querySelector('.projects-chat-composer');
  const topbar = document.getElementById('project-chat-topbar');

  if (!structureView) return;

  if (chatFeed) chatFeed.style.display = 'none';
  if (composer) composer.style.display = 'none';
  structureView.style.display = 'flex';

  window.loadProjectStructure();
};

window.closeProjectStructureView = function() {
  const structureView = document.getElementById('project-structure-view');
  const chatFeed = document.getElementById('projects-chat-feed');
  const composer = document.querySelector('.projects-chat-composer');

  if (structureView) structureView.style.display = 'none';
  if (chatFeed) {
    chatFeed.style.display = 'flex';
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }
  if (composer) composer.style.display = 'flex';
};

window.loadProjectStructure = async function() {
  const container = document.getElementById('structure-content-area');
  const nameEl = document.getElementById('structure-project-name');
  const pathEl = document.getElementById('structure-project-path');

  if (!projectsState.activeProjectId) {
    if (container) {
      container.innerHTML = '<div class="chat-empty-clean">Vui lòng chọn hoặc thêm một dự án trước để xem sơ đồ kiến trúc.</div>';
    }
    return;
  }

  if (container) {
    container.innerHTML = `
      <div class="structure-loading" style="display: flex; align-items: center; justify-content: center; padding: 3rem; gap: 0.75rem; color: #a1a1aa;">
        <div class="team-progress-spinner"></div>
        <span>Đang phân tích sơ đồ kiến trúc & bóc tách cấu trúc dự án...</span>
      </div>
    `;
  }

  try {
    const res = await fetch(`/api/projects/${projectsState.activeProjectId}/structure`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Không thể tải cấu trúc dự án.');
    }

    if (nameEl) nameEl.textContent = `Sơ Đồ Kiến Trúc: ${data.project.name}`;
    if (pathEl) pathEl.textContent = data.project.path;

    const techBadges = (data.techStack || []).map(t => `<span class="tech-badge-pill">${escapeHtml(t)}</span>`).join('');

    // Sơ đồ các Cột Kiến Trúc (Column Architecture Diagram)
    const columnsHtml = (data.layers || []).map((layer, idx) => `
      <div class="arch-column" style="--col-accent: ${layer.color || '#3b82f6'};">
        <div class="arch-column-header">
          <div class="arch-column-top">
            <span class="arch-column-badge" style="background: ${layer.color}22; color: ${layer.color}; border: 1px solid ${layer.color}44;">
              CỘT ${idx + 1}: ${escapeHtml(layer.badge)}
            </span>
          </div>
          <div class="arch-column-title">
            <span>${layer.icon}</span>
            <span>${escapeHtml(layer.title.split('(')[0].trim())}</span>
          </div>
          <span class="arch-column-tech">${escapeHtml(layer.roleDescription)}</span>
        </div>
        <div class="arch-column-body">
          ${(layer.keyModules || []).map(mod => `
            <div class="arch-module-card" onclick="this.querySelector('.arch-module-extra')?.classList.toggle('open')" title="Nhấn để xem / thu gọn giải thích chi tiết">
              <div class="arch-module-name">
                <span>${escapeHtml(mod.name)}</span>
                <span style="font-size: 0.65rem; color: #71717a;">▾</span>
              </div>
              <div class="arch-module-desc">${escapeHtml(mod.desc)}</div>
              <div class="arch-module-extra" style="display: block;">
                <span style="color: #60a5fa; font-weight: 600;">Chức năng:</span> Xử lý trực tiếp các tác vụ liên quan đến ${escapeHtml(layer.badge.toLowerCase())}.
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const lifecycleHtml = (data.lifecycle || []).map(st => `
      <div class="lifecycle-step-card">
        <div class="step-num-pill">${st.step}</div>
        <strong class="step-card-title">${escapeHtml(st.title)}</strong>
        <p class="step-card-desc">${escapeHtml(st.desc)}</p>
      </div>
    `).join('');

    container.innerHTML = `
      <!-- Thẻ thông tin tổng quan -->
      <div class="structure-hero-card">
        <div class="structure-hero-top">
          <div class="structure-hero-title">
            <span>🏛️</span>
            <span>Tổng Quan Dự Án: <strong>${escapeHtml(data.project.name)}</strong></span>
          </div>
          <div class="tech-badges-row">
            ${techBadges}
          </div>
        </div>
        <p style="font-size: 0.85rem; color: #a1a1aa; line-height: 1.5; margin: 0;">
          ${escapeHtml(data.project.description || 'Dự án thực tế đang mở trên máy tính. Hệ thống phân tích đa tầng kiến trúc và quản lý luồng thực thi.')}
        </p>
      </div>

      <!-- Đường ống luồng dữ liệu giữa các cột (Pipeline Flow) -->
      <div class="structure-column-pipeline">
        <div class="pipeline-node" style="color: #3b82f6;"><span>🌐</span> 1. Frontend UI</div>
        <span class="pipeline-arrow">➔</span>
        <div class="pipeline-node" style="color: #10b981;"><span>⚙️</span> 2. Backend Gateway</div>
        <span class="pipeline-arrow">➔</span>
        <div class="pipeline-node" style="color: #8b5cf6;"><span>🤖</span> 3. Hội Đồng AI</div>
        <span class="pipeline-arrow">➔</span>
        <div class="pipeline-node" style="color: #f59e0b;"><span>💾</span> 4. Lưu Trữ Dữ Liệu</div>
        <span class="pipeline-arrow">➔</span>
        <div class="pipeline-node" style="color: #06b6d4;"><span>🚀</span> 5. Môi Trường Thực Thi</div>
      </div>

      <!-- Sơ đồ cột kiến trúc trực quan (Column Architecture Diagram) -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <span>📊</span>
            <span>Sơ Đồ Cột Cấu Trúc Dự Án (Bấm vào hộp để xem giải thích chi tiết)</span>
          </h4>
          <span style="font-size: 0.75rem; color: #71717a;">5 Cột Kiến Trúc Hoàn Chỉnh</span>
        </div>

        <div class="structure-columns-grid">
          ${columnsHtml}
        </div>
      </div>

      <!-- Luồng vận hành & vòng đời xử lý -->
      <div class="structure-lifecycle-box" style="margin-top: 1rem;">
        <div class="lifecycle-title">
          <span>🔄</span>
          <span>Quy Trình Phối Hợp &amp; Vòng Đời Thực Thi Dự Án (Execution Lifecycle)</span>
        </div>
        <div class="lifecycle-steps-grid">
          ${lifecycleHtml}
        </div>
      </div>

      <!-- Nút Quay Lại Đoạn Chat Nổi Bật Ở Cuối Trang -->
      <div class="structure-bottom-bar">
        <button type="button" class="btn-back-to-chat-lg" onclick="window.closeProjectStructureView()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>Quay Lại Đoạn Chat Ban Đầu (Esc)</span>
        </button>
      </div>
    `;

  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: #ef4444;">
          <p>Lỗi tải cấu trúc dự án: ${escapeHtml(err.message)}</p>
          <button type="button" class="btn-primary btn-small" onclick="window.loadProjectStructure()">Thử lại</button>
        </div>
      `;
    }
  }
};

// 12. Render Staged Attachments
function renderProjectAttachments() {
  const bar = document.getElementById('project-attachments-bar');
  if (!bar) return;

  if (projectsState.attachments.length === 0) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  bar.style.display = 'flex';
  bar.innerHTML = projectsState.attachments.map((att, idx) => {
    const isImg = att.type && att.type.startsWith('image/');
    return `
      <div class="attachment-preview-pill">
        ${isImg ? `<img src="${att.data}" class="attach-thumb" alt="thumb">` : '📄'}
        <span class="attach-pill-name">${escapeHtml(att.name || 'Tệp')}</span>
        <button type="button" class="btn-remove-attach" onclick="removeProjectAttachment(${idx})" title="Bỏ đính kèm">&times;</button>
      </div>
    `;
  }).join('');
}

window.removeProjectAttachment = function(idx) {
  projectsState.attachments.splice(idx, 1);
  renderProjectAttachments();
};

// 13. Khởi tạo tất cả Event Listeners cho Projects System

// Hàm nạp danh sách Provider & Model vào Modal tạo chat mới (giống Playground)
async function populateNewChatModelSelectors() {
  const provSelect = document.getElementById('new-chat-provider-select');
  const modelSelect = document.getElementById('new-chat-model-select');
  if (!provSelect || !modelSelect) return;

  if (!councilProvidersCache || councilProvidersCache.length === 0) {
    try {
      const res = await fetch('/api/providers');
      councilProvidersCache = await res.json();
    } catch (e) {
      councilProvidersCache = [];
    }
  }

  provSelect.innerHTML = '<option value="all" selected>Tất cả nhà cung cấp có sẵn</option>';
  if (councilProvidersCache && councilProvidersCache.length > 0) {
    const sorted = [...councilProvidersCache].sort((a, b) => {
      const aReady = a.apiKey || a.id === 'prov_kilo_gateway' || a.id === 'prov_opencode';
      const bReady = b.apiKey || b.id === 'prov_kilo_gateway' || b.id === 'prov_opencode';
      if (aReady && !bReady) return -1;
      if (!aReady && bReady) return 1;
      return 0;
    });

    sorted.forEach(p => {
      const isReady = Boolean(p.apiKey || p.hasKey || p.id === 'prov_openrouter' || p.id === 'prov_cloudflare_ai' || p.id === 'prov_kilo_gateway' || p.id === 'prov_opencode');
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = isReady
        ? `✔ ${p.name} [Sẵn Sàng - ${(p.models || []).length} Models]`
        : `⚠️ ${p.name} (Chưa kích hoạt)`;
      provSelect.appendChild(opt);
    });
  }

  const updateNewChatModels = () => {
    const selProvId = provSelect.value;
    modelSelect.innerHTML = '';

    let modelsToDisplay = [];
    if (selProvId === 'all') {
      councilProvidersCache.forEach(p => {
        (p.models || []).forEach(m => {
          if (!modelsToDisplay.some(x => x.model === m)) {
            modelsToDisplay.push({ model: m, providerName: p.name });
          }
        });
      });
    } else {
      const prov = councilProvidersCache.find(p => p.id === selProvId);
      if (prov) {
        (prov.models || []).forEach(m => {
          modelsToDisplay.push({ model: m, providerName: prov.name });
        });
      }
    }

    if (modelsToDisplay.length === 0) {
      modelSelect.innerHTML = '<option value="kilo-auto/free">kilo-auto/free [FREE]</option>';
      return;
    }

    modelsToDisplay.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.model;
      const isFree = item.model.includes(':free') || item.model.includes('-free') || item.model.includes('free');
      opt.textContent = `${item.model} [${item.providerName}]${isFree ? ' [FREE]' : ''}`;
      modelSelect.appendChild(opt);
    });
  };

  provSelect.onchange = updateNewChatModels;
  updateNewChatModels();
}

let projectsListenersInitialized = false;

function initProjectsEventListeners() {
  if (projectsListenersInitialized) return;
  projectsListenersInitialized = true;

  // Gửi ý tưởng / tin nhắn
  const btnSend = document.getElementById('btn-send-project-idea');
  const chatInput = document.getElementById('project-chat-input');
  if (btnSend) {
    btnSend.onclick = (e) => {
      e.preventDefault();
      sendProjectIdea();
    };
  }
  if (chatInput) {
    chatInput.oninput = () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 220) + 'px';
    };
    chatInput.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendProjectIdea();
      }
    };

    // Paste screenshot from clipboard
    chatInput.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            projectsState.attachments.push({
              name: 'screenshot_' + Date.now() + '.png',
              type: blob.type,
              data: event.target.result
            });
            renderProjectAttachments();
            showToast('Đã dán ảnh chụp màn hình vào ô đính kèm!');
          };
          reader.readAsDataURL(blob);
        }
      }
    });
  }

  // Đính kèm File
  const btnAttachFile = document.getElementById('btn-project-attach-file');
  const fileInput = document.getElementById('project-file-input');
  if (btnAttachFile && fileInput) {
    btnAttachFile.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      files.forEach(f => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          projectsState.attachments.push({
            name: f.name,
            type: f.type,
            data: evt.target.result
          });
          renderProjectAttachments();
        };
        reader.readAsDataURL(f);
      });
      fileInput.value = '';
    };
  }

  // Đính kèm Thư mục
  const btnAttachFolder = document.getElementById('btn-project-attach-folder');
  const folderInput = document.getElementById('project-folder-input');
  if (btnAttachFolder && folderInput) {
    btnAttachFolder.onclick = () => folderInput.click();
    folderInput.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      const folderName = files[0]?.webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'Folder';
      projectsState.attachments.push({
        name: `📁 ${folderName} (${files.length} tệp)`,
        type: 'folder',
        data: 'folder:' + folderName,
        fileCount: files.length
      });
      renderProjectAttachments();
      folderInput.value = '';
    };
  }

  // Đính kèm Ảnh
  const btnAttachImage = document.getElementById('btn-project-attach-image');
  const imageInput = document.getElementById('project-image-input');
  if (btnAttachImage && imageInput) {
    btnAttachImage.onclick = () => imageInput.click();
    imageInput.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      files.forEach(f => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          projectsState.attachments.push({
            name: f.name,
            type: f.type,
            data: evt.target.result
          });
          renderProjectAttachments();
        };
        reader.readAsDataURL(f);
      });
      imageInput.value = '';
    };
  }

  // Hỗ trợ kéo ngang chuột và cuộn con lăn chuột ngang trên thanh Agent
  const agentsRowEl = document.getElementById('chat-agents-pills-row');
  if (agentsRowEl) {
    agentsRowEl.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        agentsRowEl.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    agentsRowEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.chip-remove-btn')) return;
      isDown = true;
      startX = e.pageX - agentsRowEl.offsetLeft;
      scrollLeft = agentsRowEl.scrollLeft;
    });
    agentsRowEl.addEventListener('mouseleave', () => { isDown = false; });
    agentsRowEl.addEventListener('mouseup', () => { isDown = false; });
    agentsRowEl.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - agentsRowEl.offsetLeft;
      const walk = (x - startX) * 1.5;
      agentsRowEl.scrollLeft = scrollLeft - walk;
    });
  }

  // Dấu cộng nhỏ (+) mở Modal chọn Provider & Model thêm Agent vào Hội đồng
  const btnAddAgent = document.getElementById('btn-add-agent-plus');
  if (btnAddAgent) {
    btnAddAgent.onclick = (e) => {
      e.preventDefault();
      openAddAgentCouncilModal();
    };
  }

  // Modal: Thêm Agent vào Hội đồng (Form Submit - Đảm bảo chỉ thêm đúng 1 Agent duy nhất mỗi lần)
  const modalCouncil = document.getElementById('modal-add-agent-council');
  const formCouncil = document.getElementById('add-agent-council-form');
  const btnCloseCouncil = document.getElementById('btn-close-council-modal');
  const btnCancelCouncil = document.getElementById('btn-cancel-council-modal');
  const btnSubmitCouncil = document.getElementById('btn-submit-council-agent');

  let isAddingAgent = false;
  const closeCouncilModal = () => { modalCouncil?.classList.remove('active'); modalCouncil?.classList.remove('open'); };
  if (btnCloseCouncil) btnCloseCouncil.onclick = closeCouncilModal;
  if (btnCancelCouncil) btnCancelCouncil.onclick = closeCouncilModal;

  if (formCouncil) {
    formCouncil.onsubmit = async (e) => {
      e.preventDefault();
      if (isAddingAgent) return;

      const category = document.getElementById('council-role-category')?.value;
      const name = document.getElementById('council-agent-name-input')?.value.trim();
      const provSelect = document.getElementById('council-provider-select');
      const modelSelect = document.getElementById('council-model-select');

      const providerId = provSelect?.value;
      const providerName = provSelect?.options[provSelect.selectedIndex]?.text.split('(')[0].trim();
      const model = modelSelect?.value;

      if (!projectsState.activeProjectId || !projectsState.activeChatId) {
        showToast('Vui lòng chọn hoặc tạo đoạn chat trước.');
        return;
      }

      const currentAgents = projectsState.activeChat?.agents || [];
      if (currentAgents.length >= 5) {
        showToast('Đoạn chat này đã có tối đa 5 Agent trong Hội Đồng.');
        closeCouncilModal();
        return;
      }

      try {
        isAddingAgent = true;
        if (btnSubmitCouncil) {
          btnSubmitCouncil.disabled = true;
          btnSubmitCouncil.textContent = 'Đang thêm...';
        }

        const res = await fetch(`/api/projects/${projectsState.activeProjectId}/chats/${projectsState.activeChatId}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            name,
            providerId,
            providerName,
            model
          })
        });
        const data = await res.json();
        if (data.success && data.agent) {
          showToast(`Đã thêm ${data.agent.name} (${model}) từ ${providerName} vào Hội Đồng!`);
          closeCouncilModal();
          formCouncil.reset();

          if (projectsState.activeChat) {
            projectsState.activeChat.agents = projectsState.activeChat.agents || [];
            if (!projectsState.activeChat.agents.some(a => a.id === data.agent.id)) {
              projectsState.activeChat.agents.push(data.agent);
            }
          }
          renderProjectChat(projectsState.activeChat);
          renderActiveProject();

          // Tự động cuộn sang phải để hiển thị ngay Agent mới thêm
          if (agentsRowEl) {
            setTimeout(() => {
              agentsRowEl.scrollTo({ left: agentsRowEl.scrollWidth, behavior: 'smooth' });
            }, 100);
          }
        } else {
          showToast('Lỗi: ' + (data.error || 'Không thể thêm Agent'));
        }
      } catch (err) {
        showToast('Lỗi: ' + err.message);
      } finally {
        isAddingAgent = false;
        if (btnSubmitCouncil) {
          btnSubmitCouncil.disabled = false;
          btnSubmitCouncil.textContent = 'Thêm Vào Hội Đồng';
        }
      }
    };
  }

  // Terminal Toggle
  const btnToggleTerm = document.getElementById('btn-toggle-terminal');
  const termDrawer = document.getElementById('project-terminal-drawer');
  const btnCloseTerm = document.getElementById('btn-close-terminal-drawer');
  if (btnToggleTerm && termDrawer) {
    btnToggleTerm.addEventListener('click', () => {
      const isHidden = termDrawer.style.display === 'none';
      termDrawer.style.display = isHidden ? 'block' : 'none';
    });
  }
  if (btnCloseTerm && termDrawer) {
    btnCloseTerm.addEventListener('click', () => { termDrawer.style.display = 'none'; });
  }

  // Terminal Execute
  const btnExecTerm = document.getElementById('btn-execute-terminal');
  const inputCmd = document.getElementById('terminal-cmd-input');
  const selectShell = document.getElementById('terminal-shell-select');
  const preOut = document.getElementById('terminal-output-pre');

  const runTerminalCmd = async () => {
    const cmd = inputCmd?.value.trim();
    if (!cmd || !projectsState.activeProjectId) return;
    if (preOut) preOut.textContent = `Đang chạy lệnh "${cmd}"...`;
    try {
      const res = await fetch(`/api/projects/${projectsState.activeProjectId}/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          shell: selectShell?.value || 'powershell'
        })
      });
      const data = await res.json();
      if (preOut) preOut.textContent = data.output || data.error || '(Không có kết quả)';
    } catch (err) {
      if (preOut) preOut.textContent = 'Lỗi thực thi: ' + err.message;
    }
  };
  if (btnExecTerm) btnExecTerm.addEventListener('click', runTerminalCmd);
  if (inputCmd) {
    inputCmd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runTerminalCmd();
      }
    });
  }

  // Cây tập tin: Tạo file / folder / refresh
  const btnNewFile = document.getElementById('btn-tree-new-file');
  const btnNewFolder = document.getElementById('btn-tree-new-folder');
  const btnRefreshFiles = document.getElementById('btn-refresh-files');

  if (btnNewFile) {
    btnNewFile.addEventListener('click', async () => {
      if (!projectsState.activeProjectId) return;
      const fileName = prompt('Nhập tên tập tin mới (ví dụ: index.js, utils.py):');
      if (!fileName || !fileName.trim()) return;
      try {
        const res = await fetch(`/api/projects/${projectsState.activeProjectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fileName.trim(), type: 'file', content: '' })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Đã tạo tệp "${fileName}"!`);
          loadProjectFiles(projectsState.activeProjectId);
        } else {
          showToast('Lỗi: ' + (data.error || 'Thất bại'));
        }
      } catch (err) {
        showToast('Lỗi: ' + err.message);
      }
    });
  }

  if (btnNewFolder) {
    btnNewFolder.addEventListener('click', async () => {
      if (!projectsState.activeProjectId) return;
      const folderName = prompt('Nhập tên thư mục mới (ví dụ: src, assets, components):');
      if (!folderName || !folderName.trim()) return;
      try {
        const res = await fetch(`/api/projects/${projectsState.activeProjectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderName.trim(), type: 'folder' })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Đã tạo thư mục "${folderName}"!`);
          loadProjectFiles(projectsState.activeProjectId);
        } else {
          showToast('Lỗi: ' + (data.error || 'Thất bại'));
        }
      } catch (err) {
        showToast('Lỗi: ' + err.message);
      }
    });
  }

  if (btnRefreshFiles) {
    btnRefreshFiles.addEventListener('click', () => {
      if (projectsState.activeProjectId) {
        loadProjectFiles(projectsState.activeProjectId);
        showToast('Đã làm mới danh sách tập tin.');
      }
    });
  }

  // Modal: Thêm Dự Án Mới
  const modalCreateProject = document.getElementById('modal-create-project');
  const btnOpenCreateProject = document.getElementById('btn-open-create-project');
  const btnCloseCreateProject = document.getElementById('btn-close-create-project-modal');
  const btnCancelCreateProject = document.getElementById('btn-cancel-create-project');
  const formCreateProject = document.getElementById('create-project-form');
  const btnBrowseFolder = document.getElementById('btn-browse-folder');
  const folderPickerHidden = document.getElementById('folder-picker-hidden');
  const inputProjectPath = document.getElementById('new-project-path-input');
  const inputProjectName = document.getElementById('new-project-name-input');

  if (btnBrowseFolder) {
    btnBrowseFolder.addEventListener('click', async () => {
      // 1. Uu tien dung Native Windows Folder Dialog neu dang chay tren Desktop Electron
      if (window.vzDesktop && typeof window.vzDesktop.openFolderDialog === 'function') {
        try {
          const res = await window.vzDesktop.openFolderDialog();
          if (res && res.rootPath) {
            if (inputProjectPath) inputProjectPath.value = res.rootPath;
            if (inputProjectName && (!inputProjectName.value || inputProjectName.value.trim() === '')) {
              inputProjectName.value = res.name;
            }
          }
          return;
        } catch (err) {
          console.warn('Native folder dialog error:', err);
        }
      }
      // 2. Fallback cho trinh duyet Web
      if (folderPickerHidden) folderPickerHidden.click();
    });

    if (folderPickerHidden) {
      folderPickerHidden.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          const firstFile = files[0];
          // In electron / desktop, path is available on File object
          const fullPath = firstFile.path ? firstFile.path.substring(0, firstFile.path.lastIndexOf('\\') || firstFile.path.lastIndexOf('/')) : '';
          const folderName = firstFile.webkitRelativePath ? firstFile.webkitRelativePath.split('/')[0] : 'MyProject';
          
          if (inputProjectPath) inputProjectPath.value = fullPath || folderName;
          if (inputProjectName) inputProjectName.value = folderName;
        }
      });
    }
  }

  if (btnOpenCreateProject && modalCreateProject) {
    btnOpenCreateProject.onclick = () => {
      modalCreateProject.classList.add('active'); modalCreateProject.classList.add('open');
      inputProjectPath?.focus();
    };
  }
  const closeCreateProjectModal = () => { modalCreateProject?.classList.remove('active'); modalCreateProject?.classList.remove('open'); };
  if (btnCloseCreateProject) btnCloseCreateProject.onclick = closeCreateProjectModal;
  if (btnCancelCreateProject) btnCancelCreateProject.onclick = closeCreateProjectModal;

  const btnSubmitCreateProject = document.getElementById('btn-submit-create-project');
  let isCreatingProject = false;
  if (formCreateProject) {
    formCreateProject.onsubmit = async (e) => {
      e.preventDefault();
      if (isCreatingProject) return;

      const name = inputProjectName?.value.trim();
      const pathVal = inputProjectPath?.value.trim();
      const desc = document.getElementById('new-project-desc-input')?.value.trim();

      if (!name || !pathVal) {
        showToast('Vui lòng nhập tên và đường dẫn thư mục dự án.');
        return;
      }

      try {
        isCreatingProject = true;
        if (btnSubmitCreateProject) {
          btnSubmitCreateProject.disabled = true;
          btnSubmitCreateProject.textContent = 'Đang thêm...';
        }

        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, path: pathVal, description: desc })
        });
        const data = await res.json();
        if (data.success && data.project) {
          showToast(`Đã thêm dự án "${name}" thành công!`);
          closeCreateProjectModal();
          formCreateProject.reset();

          projectsState.activeProjectId = data.project.id;
          await loadProjects();
        } else {
          showToast('Lỗi: ' + (data.error || 'Không thể tạo dự án'));
        }
      } catch (err) {
        showToast('Lỗi tạo dự án: ' + err.message);
      } finally {
        isCreatingProject = false;
        if (btnSubmitCreateProject) {
          btnSubmitCreateProject.disabled = false;
          btnSubmitCreateProject.textContent = 'Xác Nhận & Thêm Dự Án';
        }
      }
    };
  }

  // Modal: Thêm Đoạn Chat Mới Trong Dự Án (Chỉ tạo đúng 1 đoạn chat duy nhất mỗi lần bấm)
  const modalNewChat = document.getElementById('modal-new-project-chat');
  const btnOpenNewChat = document.getElementById('btn-open-new-chat-modal');
  const btnCloseNewChat = document.getElementById('btn-close-new-project-chat-modal');
  const btnCancelNewChat = document.getElementById('btn-cancel-new-project-chat');
  const btnSubmitNewChat = document.getElementById('btn-submit-new-chat');
  const formNewChat = document.getElementById('new-project-chat-form');
  const newChatTitleInput = document.getElementById('new-chat-title-input');
  const newChatModelSelect = document.getElementById('new-chat-model-select');

  let isCreatingChat = false;
  if (btnOpenNewChat && modalNewChat) {
    btnOpenNewChat.onclick = () => {
      if (!projectsState.activeProjectId) {
        showToast('Vui lòng chọn hoặc thêm một dự án trước.');
        return;
      }
      modalNewChat.classList.add('active'); modalNewChat.classList.add('open'); populateNewChatModelSelectors();
      if (newChatTitleInput) {
        newChatTitleInput.value = `Đoạn chat ${(projectsState.activeProject?.chats || []).length + 1}`;
        newChatTitleInput.focus();
        newChatTitleInput.select();
      }
    };
  }
  const closeNewChatModal = () => { modalNewChat?.classList.remove('active'); modalNewChat?.classList.remove('open'); };
  if (btnCloseNewChat) btnCloseNewChat.onclick = closeNewChatModal;
  if (btnCancelNewChat) btnCancelNewChat.onclick = closeNewChatModal;

  if (formNewChat) {
    formNewChat.onsubmit = async (e) => {
      e.preventDefault();
      if (isCreatingChat) return;

      const title = newChatTitleInput?.value.trim();
      const model = newChatModelSelect?.value || 'kilo-auto/free';

      if (!title || !projectsState.activeProjectId) return;

      try {
        isCreatingChat = true;
        if (btnSubmitNewChat) {
          btnSubmitNewChat.disabled = true;
          btnSubmitNewChat.textContent = 'Đang tạo...';
        }

        const res = await fetch(`/api/projects/${projectsState.activeProjectId}/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, model })
        });
        const data = await res.json();
        const createdChat = data.chat || (data.success ? data : null);
        if (createdChat && createdChat.id) {
          showToast(`Đã tạo đoạn chat "${title}" với AI ${model}!`);
          closeNewChatModal();
          formNewChat.reset();

          if (projectsState.activeProject) {
            projectsState.activeProject.chats = projectsState.activeProject.chats || [];
            if (!projectsState.activeProject.chats.some(c => c.id === createdChat.id)) {
              projectsState.activeProject.chats.unshift(createdChat);
            }
          }
          projectsState.activeChatId = createdChat.id;
          renderActiveProject();
        } else {
          showToast('Lỗi: ' + (data.error || 'Không thể tạo đoạn chat'));
        }
      } catch (err) {
        showToast('Lỗi tạo chat: ' + err.message);
      } finally {
        isCreatingChat = false;
        if (btnSubmitNewChat) {
          btnSubmitNewChat.disabled = false;
          btnSubmitNewChat.textContent = 'Tạo Đoạn Chat';
        }
      }
    };
  }

  // Xóa dự án đang mở
  const btnDeleteActiveProj = document.getElementById('btn-delete-active-project');
  if (btnDeleteActiveProj) {
    btnDeleteActiveProj.addEventListener('click', () => {
      if (projectsState.activeProject) {
        deleteProjectItem(null, projectsState.activeProject.id, projectsState.activeProject.name);
      }
    });
  }

  // Quản lý hiển thị nút nổi khôi phục (Floating View Controls)
  const btnFloatingShowSidebar = document.getElementById('btn-floating-show-sidebar');
  const btnFloatingShowTopbar = document.getElementById('btn-floating-show-topbar');
  const btnHideTopbar = document.getElementById('btn-hide-chat-topbar');
  const chatTopbar = document.getElementById('project-chat-topbar');
  const projectsLayout = document.querySelector('.projects-layout');

  window.updateFloatingViewControls = function() {
    const isSidebarCollapsed = projectsLayout?.classList.contains('sidebar-collapsed');
    const isTopbarHidden = chatTopbar?.classList.contains('topbar-hidden');

    if (btnFloatingShowSidebar) {
      btnFloatingShowSidebar.style.display = isSidebarCollapsed ? 'inline-flex' : 'none';
    }
    if (btnFloatingShowTopbar) {
      btnFloatingShowTopbar.style.display = isTopbarHidden ? 'inline-flex' : 'none';
    }
  };

  // 1. Ẩn / Hiện Bảng Bên Dự Án (Sidebar Toggle & Hotkey Ctrl+B)
  const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-projects-sidebar');

  const toggleProjectsSidebar = () => {
    if (!projectsLayout) return;
    const isCollapsed = projectsLayout.classList.toggle('sidebar-collapsed');
    localStorage.setItem('vincezone_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    window.updateFloatingViewControls();
    showToast(isCollapsed ? 'Đã ẩn bảng bên (Mở rộng chat)' : 'Đã hiện bảng bên');
  };

  if (btnCollapseSidebar) btnCollapseSidebar.onclick = toggleProjectsSidebar;
  if (btnToggleSidebar) btnToggleSidebar.onclick = toggleProjectsSidebar;
  if (btnFloatingShowSidebar) btnFloatingShowSidebar.onclick = toggleProjectsSidebar;

  // 2. Ẩn / Hiện Thanh Bar Ngang (Chat Topbar Toggle & Hotkey Ctrl+Shift+T)
  const toggleChatTopbar = () => {
    if (!chatTopbar) return;
    const isHidden = chatTopbar.classList.toggle('topbar-hidden');
    localStorage.setItem('vincezone_topbar_hidden', isHidden ? 'true' : 'false');
    window.updateFloatingViewControls();
    showToast(isHidden ? 'Đã ẩn thanh bar ngang' : 'Đã hiện thanh bar ngang');
  };

  if (btnHideTopbar) btnHideTopbar.onclick = toggleChatTopbar;
  if (btnFloatingShowTopbar) btnFloatingShowTopbar.onclick = toggleChatTopbar;

  // Khôi phục trạng thái từ localStorage
  if (projectsLayout && localStorage.getItem('vincezone_sidebar_collapsed') === 'true') {
    projectsLayout.classList.add('sidebar-collapsed');
  }
  if (chatTopbar && localStorage.getItem('vincezone_topbar_hidden') === 'true') {
    chatTopbar.classList.add('topbar-hidden');
  }
  window.updateFloatingViewControls();

  // Phím tắt bàn phím
  document.addEventListener('keydown', (e) => {
    const tabProjects = document.getElementById('tab-projects');
    if (!tabProjects || !tabProjects.classList.contains('active')) return;

    // Ctrl + B: Ẩn / Hiện bảng bên
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleProjectsSidebar();
    }
    // Ctrl + Shift + T: Ẩn / Hiện thanh bar ngang
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      toggleChatTopbar();
    }
  });

  // 2. Ẩn / Hiện cụm chọn Provider & Model trên Topbar
  const btnToggleModelsBox = document.getElementById('btn-toggle-chat-models-box');
  const chatModelBadgeBox = document.getElementById('chat-model-badge-box');

  const toggleModelsBox = () => {
    if (!chatModelBadgeBox) return;
    const isHidden = chatModelBadgeBox.classList.toggle('hidden-models');
    if (btnToggleModelsBox) {
      btnToggleModelsBox.classList.toggle('active', !isHidden);
    }
    localStorage.setItem('vincezone_model_box_collapsed', isHidden ? 'true' : 'false');
  };

  if (btnToggleModelsBox) {
    btnToggleModelsBox.addEventListener('click', toggleModelsBox);
  }

  // Khôi phục trạng thái ẩn hiện Model Box (Mặc định ẩn dropdown để gọn gàng như giao diện gốc)
  if (chatModelBadgeBox) {
    const isHiddenSaved = localStorage.getItem('vincezone_model_box_collapsed');
    if (isHiddenSaved === null || isHiddenSaved === 'true') {
      chatModelBadgeBox.classList.add('hidden-models');
      if (btnToggleModelsBox) btnToggleModelsBox.classList.remove('active');
    } else {
      chatModelBadgeBox.classList.remove('hidden-models');
      if (btnToggleModelsBox) btnToggleModelsBox.classList.add('active');
    }
  }

  // 3. Accordion ẩn / hiện Cây tập tin dự án & Danh sách đoạn chat
  const treeSectionHeader = document.getElementById('tree-section-header');
  const treeFilesList = document.getElementById('project-files-list');
  const treeArrow = document.getElementById('tree-toggle-arrow');
  if (treeSectionHeader && treeFilesList) {
    treeSectionHeader.addEventListener('click', () => {
      const isCollapsed = treeFilesList.classList.toggle('collapsed');
      if (treeArrow) treeArrow.classList.toggle('collapsed', isCollapsed);
    });
  }

  const chatsSectionHeader = document.getElementById('chats-section-header');
  const chatsList = document.getElementById('project-chats-list');
  const chatsArrow = document.getElementById('chats-toggle-arrow');
  // 4. Phím tắt Escape để nhanh chóng quay lại chat khi đang xem cấu trúc dự án
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const structView = document.getElementById('project-structure-view');
      if (structView && structView.style.display !== 'none') {
        window.closeProjectStructureView();
      }
    }
  });

  // 5. Khởi tạo tính năng gõ @ hiển thị danh sách AI để giao việc riêng
  setupMentionDropdown();
}

// ==================== @MENTION AGENTS AUTOCOMPLETE ====================
let mentionDropdownIndex = 0;

function setupMentionDropdown() {
  const input = document.getElementById('project-chat-input');
  const dropdown = document.getElementById('project-mention-dropdown');
  const list = document.getElementById('mention-dropdown-list');
  if (!input || !dropdown || !list) return;

  function closeMentionDropdown() {
    dropdown.style.display = 'none';
    mentionDropdownIndex = 0;
  }

  function getActiveChatAgents() {
    return projectsState.activeChat?.agents || [];
  }

  function renderMentionOptions(query = '') {
    const agents = getActiveChatAgents();
    if (agents.length === 0) {
      closeMentionDropdown();
      return;
    }

    const q = query.toLowerCase().trim();
    const items = [
      {
        id: 'all',
        name: 'Cả Nhóm',
        badge: 'ALL',
        badgeClass: 'badge-arch',
        roleTitle: 'Tất cả các AI cùng trao đổi',
        avatar: '👥'
      },
      ...agents.map(a => {
        let av = '💻';
        let bClass = 'badge-coder';
        const b = (a.badge || '').toUpperCase();
        if (b.includes('ARCH')) { av = '🏛️'; bClass = 'badge-arch'; }
        else if (b.includes('TEST')) { av = '🧪'; bClass = 'badge-tester'; }
        else if (b.includes('DATA') || b.includes('SQL')) { av = '🗄️'; bClass = 'badge-database'; }
        else if (b.includes('FRONT') || b.includes('UI')) { av = '🎨'; bClass = 'badge-frontend'; }
        else if (b.includes('SEC')) { av = '🛡️'; bClass = 'badge-security'; }
        else if (b.includes('DEV')) { av = '🚀'; bClass = 'badge-devops'; }
        else if (b.includes('REV')) { av = '🧐'; bClass = 'badge-reviewer'; }
        return {
          id: a.id,
          name: a.name,
          badge: a.badge,
          badgeClass: bClass,
          roleTitle: a.roleTitle || a.name,
          avatar: av,
          model: a.model
        };
      })
    ];

    const filtered = items.filter(it => 
      !q || it.name.toLowerCase().includes(q) || it.roleTitle.toLowerCase().includes(q) || (it.badge && it.badge.toLowerCase().includes(q))
    );

    if (filtered.length === 0) {
      closeMentionDropdown();
      return;
    }

    if (mentionDropdownIndex >= filtered.length) {
      mentionDropdownIndex = 0;
    }

    list.innerHTML = filtered.map((item, idx) => `
      <div class="mention-dropdown-item ${idx === mentionDropdownIndex ? 'selected' : ''}" data-index="${idx}" data-name="${escapeHtml(item.name)}">
        <span class="mention-item-avatar">${item.avatar}</span>
        <div class="mention-item-info">
          <div class="mention-item-title-row">
            <span class="mention-item-name">@${escapeHtml(item.name)}</span>
            <span class="agent-badge ${item.badgeClass}">${escapeHtml(item.badge || 'AI')}</span>
          </div>
          <span class="mention-item-role">${escapeHtml(item.roleTitle)}${item.model ? ` • ${escapeHtml(item.model)}` : ''}</span>
        </div>
      </div>
    `).join('');

    dropdown.style.display = 'block';

    // Click handler chọn item
    list.querySelectorAll('.mention-dropdown-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectMention(el.dataset.name);
      });
    });
  }

  function selectMention(agentName) {
    const val = input.value;
    const cursorPos = input.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const lastAtPos = textBefore.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const textAfter = val.slice(cursorPos);
      const insertText = `@${agentName} `;
      input.value = textBefore.slice(0, lastAtPos) + insertText + textAfter;
      const newCursorPos = lastAtPos + insertText.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
    }
    closeMentionDropdown();
    input.focus();
  }

  input.addEventListener('input', () => {
    const val = input.value;
    const cursorPos = input.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const lastAtPos = textBefore.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const query = textBefore.slice(lastAtPos + 1);
      if (!query.includes('\n')) {
        renderMentionOptions(query);
        return;
      }
    }
    closeMentionDropdown();
  });

  input.addEventListener('keydown', (e) => {
    if (dropdown.style.display !== 'block') return;

    const items = list.querySelectorAll('.mention-dropdown-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionDropdownIndex = (mentionDropdownIndex + 1) % items.length;
      updateSelectedMention(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionDropdownIndex = (mentionDropdownIndex - 1 + items.length) % items.length;
      updateSelectedMention(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const selected = items[mentionDropdownIndex];
      if (selected) {
        e.preventDefault();
        selectMention(selected.dataset.name);
      }
    } else if (e.key === 'Escape') {
      closeMentionDropdown();
    }
  });

  function updateSelectedMention(items) {
    items.forEach((it, idx) => {
      it.classList.toggle('selected', idx === mentionDropdownIndex);
      if (idx === mentionDropdownIndex) {
        it.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) {
      closeMentionDropdown();
    }
  });
}

// ==================== PROJECT AI IMAGE STUDIO & EDITOR ====================
let projImageStudioState = {
  mode: 'gen', // 'gen' | 'edit'
  sourceImageData: null,
  lastGeneratedResult: null
};

window.openProjectImageStudioModal = function() {
  const modal = document.getElementById('modal-project-image-studio');
  if (modal) modal.style.display = 'flex';
};

window.closeProjectImageStudioModal = function() {
  const modal = document.getElementById('modal-project-image-studio');
  if (modal) modal.style.display = 'none';
};

window.setProjImageMode = function(mode) {
  projImageStudioState.mode = mode;
  const btnGen = document.getElementById('btn-proj-mode-gen');
  const btnEdit = document.getElementById('btn-proj-mode-edit');
  const editSourceWrap = document.getElementById('proj-img-edit-source-wrap');
  const btnSubmitLabel = document.getElementById('btn-proj-img-label');
  const promptLabel = document.getElementById('lbl-proj-img-prompt');

  if (mode === 'edit') {
    if (btnGen) btnGen.classList.remove('active');
    if (btnEdit) btnEdit.classList.add('active');
    if (editSourceWrap) editSourceWrap.style.display = 'block';
    if (btnSubmitLabel) btnSubmitLabel.textContent = '✨ Bắt Đầu Chỉnh Sửa Ảnh';
    if (promptLabel) promptLabel.textContent = '3. Mô Tả Yêu Cầu Chỉnh Sửa / Biến Đổi (Prompt):';
  } else {
    if (btnGen) btnGen.classList.add('active');
    if (btnEdit) btnEdit.classList.remove('active');
    if (editSourceWrap) editSourceWrap.style.display = 'none';
    if (btnSubmitLabel) btnSubmitLabel.textContent = '🎨 Bắt Đầu Tạo Ảnh';
    if (promptLabel) promptLabel.textContent = '2. Mô Tả Nội Dung Bức Ảnh (Prompt):';
  }
};

window.setProjQuickPrompt = function(text) {
  const promptInput = document.getElementById('proj-img-prompt-input');
  if (promptInput) {
    promptInput.value = text;
    promptInput.focus();
  }
};

window.handleProjEditSourceUpload = function(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    projImageStudioState.sourceImageData = e.target.result;
    const previewImg = document.getElementById('proj-edit-preview-img');
    const previewWrap = document.getElementById('proj-edit-preview-wrap');
    const placeholder = document.getElementById('proj-edit-placeholder');
    if (previewImg) previewImg.src = e.target.result;
    if (previewWrap) previewWrap.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.clearProjEditSource = function() {
  projImageStudioState.sourceImageData = null;
  const input = document.getElementById('input-proj-edit-file');
  if (input) input.value = '';
  const previewWrap = document.getElementById('proj-edit-preview-wrap');
  const placeholder = document.getElementById('proj-edit-placeholder');
  if (previewWrap) previewWrap.style.display = 'none';
  if (placeholder) placeholder.style.display = 'block';
};

window.runProjectImageStudio = async function() {
  const model = document.getElementById('proj-img-model-select')?.value || '@cf/black-forest-labs/flux-1-schnell';
  const prompt = document.getElementById('proj-img-prompt-input')?.value?.trim();
  const aspect = document.getElementById('proj-img-aspect-select')?.value || '1:1';
  const style = document.getElementById('proj-img-style-select')?.value || 'natural';
  const spinner = document.getElementById('btn-proj-img-spinner');
  const submitBtn = document.getElementById('btn-submit-proj-image');
  const resultWrap = document.getElementById('proj-img-result-wrap');
  const resultImg = document.getElementById('proj-img-result-element');
  const resultMeta = document.getElementById('proj-img-result-meta');
  const downloadLink = document.getElementById('btn-proj-download-img');

  if (!prompt && projImageStudioState.mode === 'gen') {
    showToast('Vui lòng nhập mô tả bức ảnh bạn muốn AI tạo.');
    return;
  }

  if (projImageStudioState.mode === 'edit' && !projImageStudioState.sourceImageData) {
    showToast('Vui lòng chọn ảnh gốc cần chỉnh sửa.');
    return;
  }

  let width = 1024;
  let height = 1024;
  if (aspect === '16:9') { width = 1280; height = 720; }
  else if (aspect === '9:16') { width = 720; height = 1280; }
  else if (aspect === '4:3') { width = 1024; height = 768; }
  else if (aspect === '3:2') { width = 1080; height = 720; }

  try {
    if (spinner) spinner.style.display = 'inline-block';
    if (submitBtn) submitBtn.disabled = true;

    let res;
    if (projImageStudioState.mode === 'edit') {
      const strength = parseFloat(document.getElementById('proj-img-strength-slider')?.value || '0.6');
      res = await fetch('/api/images/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImage: projImageStudioState.sourceImageData,
          prompt: prompt || 'high quality enhanced',
          model,
          style,
          strength,
          width,
          height
        })
      });
    } else {
      res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model,
          width,
          height,
          style
        })
      });
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Lỗi khi tạo ảnh với AI');
    }

    projImageStudioState.lastGeneratedResult = data;
    if (resultWrap) resultWrap.style.display = 'block';
    if (resultImg) resultImg.src = data.url;
    if (resultMeta) resultMeta.textContent = `${data.model || model} • ${data.width || width}x${data.height || height}`;
    if (downloadLink) {
      downloadLink.href = data.url;
      downloadLink.download = `ai-art-${Date.now()}.png`;
    }

    showToast(`✨ Tạo ảnh thành công bằng model ${data.model || model}!`);
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
  }
};

window.attachCurrentProjImageToChat = function() {
  const currentResult = projImageStudioState.lastGeneratedResult;
  if (!currentResult || !currentResult.url) {
    showToast('Chưa có ảnh nào được tạo để đính kèm.');
    return;
  }

  projectsState.attachments.push({
    name: `AI_Generated_${Date.now()}.png`,
    type: 'image/png',
    data: currentResult.url
  });

  renderProjectAttachments();
  window.closeProjectImageStudioModal();
  showToast('📎 Đã đính kèm ảnh vào ô chat dự án!');
};

window.saveCurrentProjImageToProject = async function() {
  const currentResult = projImageStudioState.lastGeneratedResult;
  if (!currentResult || !currentResult.url) {
    showToast('Chưa có ảnh nào được tạo để lưu.');
    return;
  }
  if (!projectsState.activeProjectId) {
    showToast('Vui lòng chọn hoặc mở một dự án trước khi lưu ảnh.');
    return;
  }

  try {
    const filename = `ai_image_${Date.now()}.png`;
    const res = await fetch(`/api/projects/${projectsState.activeProjectId}/save-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagePath: currentResult.url,
        filename,
        folder: 'assets/images'
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Không thể lưu ảnh vào thư mục dự án.');
    }
    showToast(`💾 Đã lưu thành công vào: ${data.relativePath}!`);
    if (typeof loadProjectFiles === 'function') {
      loadProjectFiles(projectsState.activeProjectId);
    }
  } catch (err) {
    showToast('Lỗi khi lưu ảnh vào dự án: ' + err.message);
  }
};

// Tự động khởi chạy Projects listeners khi app load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProjectsEventListeners);
} else {
  initProjectsEventListeners();
}



// Auto route to page based on current URL path
document.addEventListener('DOMContentLoaded', () => {
  const initialTab = parseCurrentUrlRoute();
  switchTabByRoute(initialTab, false);
});

// =============================================================================
// MODAL: SƠ ĐỒ CẤU TRÚC DỰ ÁN, CÔNG VIỆC & FILE ĐÃ CHỈNH CỦA TỪNG AI AGENT
// =============================================================================
let currentStructureData = null;
let activeStructureTab = 'workflow';

window.openProjectStructureModal = async function(projectId) {
  const targetProjId = projectId || projectsState.activeProjectId;
  if (!targetProjId) {
    showToast('Vui lòng chọn hoặc mở một dự án trước.');
    return;
  }

  const modal = document.getElementById('modal-project-structure');
  const bodyEl = document.getElementById('structure-modal-body');
  const footerEl = document.getElementById('structure-footer-stats');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  if (bodyEl) {
    bodyEl.innerHTML = '<div style="text-align: center; padding: 3rem; color: #71717a;">⏳ Đang tải sơ đồ cấu trúc và lịch sử chỉnh file của các AI Agent...</div>';
  }

  try {
    const res = await fetch(`/api/projects/${targetProjId}/structure`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Không thể lấy dữ liệu cấu trúc.');
    }
    currentStructureData = data;

    const subTitle = document.getElementById('modal-structure-subtitle');
    if (subTitle && data.project) {
      subTitle.textContent = `Dự án: ${data.project.name} • Thư mục: ${data.project.path || 'N/A'}`;
    }

    if (footerEl) {
      footerEl.textContent = `Tổng số: ${data.stats.totalChats} Nhóm công việc • ${data.stats.totalAgents} AI Agent tham gia • ${data.stats.totalFilesEdited} File đã chỉnh/tạo`;
    }

    renderActiveStructureTab();
  } catch (err) {
    if (bodyEl) {
      bodyEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #ef4444;">⚠️ Lỗi: ${escapeHtml(err.message)}</div>`;
    }
  }
};

window.closeProjectStructureModal = function() {
  const modal = document.getElementById('modal-project-structure');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
};

window.switchStructureTab = function(tabName) {
  activeStructureTab = tabName;
  const tabs = document.querySelectorAll('.structure-tab-btn');
  tabs.forEach(t => {
    if (t.dataset.tab === tabName) t.classList.add('active');
    else t.classList.remove('active');
  });
  renderActiveStructureTab();
};

function renderActiveStructureTab() {
  const bodyEl = document.getElementById('structure-modal-body');
  if (!bodyEl || !currentStructureData) return;

  if (activeStructureTab === 'workflow') {
    renderStructureWorkflowTab(bodyEl, currentStructureData);
  } else if (activeStructureTab === 'files') {
    renderStructureFilesTab(bodyEl, currentStructureData);
  } else if (activeStructureTab === 'agents') {
    renderStructureAgentsTab(bodyEl, currentStructureData);
  }
}

// Tab 1: Sơ Đồ Luồng Công Việc (Workflow Task Flow)
function renderStructureWorkflowTab(container, data) {
  const workflow = data.workflow || [];
  if (workflow.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #71717a;">Chưa có nhóm công việc nào. Bạn có thể yêu cầu AI tự động tạo các nhóm chat theo công việc!</div>';
    return;
  }

  let html = `
    <div style="margin-bottom: 1rem; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.8rem; color: #93c5fd; display: flex; align-items: center; justify-content: space-between;">
      <span>💡 Các nhóm chat được AI tự động phân bổ theo từng phần việc cụ thể. Bấm vào bất kỳ nhóm nào để vào xem các AI làm việc trực tiếp!</span>
      <button type="button" class="btn-micro" onclick="window.triggerAutoTaskChatsCreation()" style="background: #2563eb; color: #fff; padding: 0.3rem 0.7rem; border-radius: 5px;">⚡ Tự Động Phân Chia Việc</button>
    </div>
    <div class="structure-workflow-grid">
  `;

  workflow.forEach((wf, i) => {
    const isCurrentActive = wf.id === projectsState.activeChatId;
    html += `
      <div class="workflow-card ${isCurrentActive ? 'workflow-card-active' : ''}">
        <div class="workflow-card-header">
          <div class="workflow-step-badge">Bước ${wf.index}</div>
          <strong class="workflow-card-title">${escapeHtml(wf.title)}</strong>
        </div>
        <div class="workflow-agents-row">
          ${(wf.agents || []).map(a => `
            <span class="workflow-agent-chip" style="border-color: ${a.color || '#3b82f6'}; color: ${a.color || '#93c5fd'};">
              ${escapeHtml(a.badge || 'AI')} ${escapeHtml(a.name)}
            </span>
          `).join('')}
        </div>
        <div class="workflow-card-footer">
          <span class="workflow-msg-count">💬 ${wf.messageCount} lượt trao đổi</span>
          <button type="button" class="btn-micro btn-workflow-jump" onclick="window.jumpToChatFromStructure('${wf.id}')">
            ${isCurrentActive ? 'Đang mở' : '👉 Vào Nhóm Này'}
          </button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// Tab 2: File Đã Chỉnh Của Từng AI Agent
function renderStructureFilesTab(container, data) {
  const agents = data.agents || [];
  const files = data.files || [];

  if (files.length === 0 && agents.every(a => a.files.length === 0)) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: #71717a;">
        <span style="font-size: 2rem;">📄</span>
        <p style="margin-top: 0.5rem;">Chưa có file nào được chỉnh sửa hoặc lưu tự động bởi Agent trong dự án này.</p>
        <small style="color: #52525b;">Khi các AI Agent viết code có <code>// File: ...</code>, hệ thống sẽ tự động lưu và hiển thị tại đây.</small>
      </div>
    `;
    return;
  }

  let html = '<div class="structure-agents-files-accordion">';

  agents.forEach(ag => {
    const agFiles = ag.files || [];
    if (agFiles.length === 0) return;

    html += `
      <div class="agent-files-group-card">
        <div class="agent-files-group-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="agent-badge badge-coder" style="background: ${ag.color}22; color: ${ag.color}; border: 1px solid ${ag.color}55;">${escapeHtml(ag.badge)}</span>
            <strong style="color: #fff; font-size: 0.95rem;">${escapeHtml(ag.name)}</strong>
            <span style="font-size: 0.75rem; color: #a1a1aa;">(${escapeHtml(ag.roleTitle)})</span>
          </div>
          <span class="agent-files-counter">${agFiles.length} File đã chỉnh</span>
        </div>
        <div class="agent-files-list">
          ${agFiles.map(f => {
            const fileMeta = files.find(x => x.file === f) || {};
            const sizeStr = fileMeta.sizeBytes ? ` • ${Math.round(fileMeta.sizeBytes / 1024 * 10) / 10} KB` : '';
            const statusBadge = fileMeta.existsOnDisk ? '<span class="file-status-disk">✔ Đã ghi trên đĩa</span>' : '<span class="file-status-auto">⚡ Tự động tạo</span>';
            return `
              <div class="agent-file-item">
                <div class="agent-file-info">
                  <span class="agent-file-icon">📁</span>
                  <span class="agent-file-name" title="${escapeHtml(f)}">${escapeHtml(f)}</span>
                  <span class="agent-file-size">${sizeStr}</span>
                </div>
                <div class="agent-file-actions">
                  ${statusBadge}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// Tab 3: Đội Ngũ & Nhà Cung Cấp
function renderStructureAgentsTab(container, data) {
  const agents = data.agents || [];
  if (agents.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #71717a;">Chưa có dữ liệu Agent.</div>';
    return;
  }

  let html = '<div class="structure-agents-matrix-grid">';
  agents.forEach(ag => {
    html += `
      <div class="agent-matrix-card">
        <div class="agent-matrix-top">
          <span class="agent-badge" style="background: ${ag.color}22; color: ${ag.color}; border: 1px solid ${ag.color}55;">${escapeHtml(ag.badge)}</span>
          <strong class="agent-matrix-name">${escapeHtml(ag.name)}</strong>
        </div>
        <div class="agent-matrix-role">${escapeHtml(ag.roleTitle)}</div>
        <div class="agent-matrix-meta">
          <div><small style="color: #71717a;">Mô hình:</small> <code>${escapeHtml(ag.model)}</code></div>
          <div><small style="color: #71717a;">Tin nhắn đã gửi:</small> <strong>${ag.messagesCount}</strong></div>
          <div><small style="color: #71717a;">File đã chỉnh:</small> <strong style="color: #34d399;">${(ag.files || []).length} file</strong></div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

window.jumpToChatFromStructure = function(chatId) {
  window.closeProjectStructureModal();
  if (typeof selectProjectChat === 'function') {
    selectProjectChat(chatId);
  }
};

window.triggerAutoTaskChatsCreation = async function() {
  window.closeProjectStructureModal();
  const inputEl = document.getElementById('project-chat-input');
  if (inputEl) {
    inputEl.value = 'Hãy tự tạo các nhóm chat theo công việc cụ thể cho dự án và phân công các AI phối hợp';
    if (typeof sendProjectIdea === 'function') {
      sendProjectIdea();
    }
  }
};
