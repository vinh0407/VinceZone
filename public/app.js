/**
 * VinceZone AI - Web Version
 * Playground, Prompts, Settings with kilo-auto/free
 */
(function() {
  'use strict';

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const state = {
    activeTab: 'playground',
    messages: [],
    currentChatId: null,
    model: 'kilo-auto/free',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: 'You are a helpful AI assistant.',
    streaming: true,
    autoSave: true,
    providers: {
      'kilo-auto/free': {
        name: 'Kilo Gateway',
        baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
        model: 'kilo-auto/free'
      }
    },
    prompts: {
      'Coding': [
        { title: 'Python Binary Search', prompt: 'Write a Python function for binary search with type hints and docstring' },
        { title: 'React Component', prompt: 'Create a reusable React component with TypeScript and Tailwind CSS' },
        { title: 'REST API Design', prompt: 'Design a RESTful API for a todo application with proper HTTP status codes' },
        { title: 'SQL Optimization', prompt: 'How to optimize slow SQL queries? Explain with examples' },
        { title: 'Dockerfile Best Practices', prompt: 'Create an optimized multi-stage Dockerfile for a Node.js app' },
        { title: 'Git Workflow', prompt: 'Explain Git branching strategy for a team of 5 developers' }
      ],
      'Writing': [
        { title: 'Technical Blog Post', prompt: 'Write a technical blog post outline about microservices architecture' },
        { title: 'Documentation', prompt: 'Write clear API documentation with examples' },
        { title: 'Code Review Comment', prompt: 'Write a constructive code review comment for a PR' }
      ],
      'Analysis': [
        { title: 'Code Review', prompt: 'Review this code for bugs, performance, and security issues' },
        { title: 'Architecture Review', prompt: 'Analyze this system architecture for scalability concerns' },
        { title: 'Performance Optimization', prompt: 'Identify bottlenecks in this code and suggest optimizations' }
      ],
      'Learning': [
        { title: 'Explain Concept', prompt: 'Explain {{topic}} in simple terms with examples' },
        { title: 'Compare Technologies', prompt: 'Compare {{tech1}} vs {{tech2}} for {{use_case}}' },
        { title: 'Best Practices', prompt: 'What are the best practices for {{topic}}?' }
      ]
    }
  };

  // ==========================================
  // DOM ELEMENTS
  // ==========================================
  const els = {};

  function cacheElements() {
    // Tabs
    els.navItems = document.querySelectorAll('.nav-item, .bottom-nav-item');
    els.tabPanels = document.querySelectorAll('.tab-panel');
    els.mobileTopBar = document.getElementById('mobileTopBar');
    els.sidebar = document.getElementById('sidebar');
    els.sidebarOverlay = document.getElementById('sidebarOverlay');
    els.mobileTopBar = document.getElementById('mobileTopBar');
    els.btnMenu = document.getElementById('btnMenu');
    els.btnNewChat = document.getElementById('btnNewChat');
    els.mobileBottomNav = document.getElementById('mobileBottomNav');

    // Playground
    els.chatMessages = document.getElementById('chatMessages');
    els.welcomeScreen = document.getElementById('welcomeScreen');
    els.chatInput = document.getElementById('chatInput');
    els.btnSend = document.getElementById('btnSend');
    els.btnAttach = document.getElementById('btnAttach');
    els.attachMenu = document.getElementById('attachMenu');
    els.chatInputArea = document.getElementById('chatInputArea');
    els.suggestionBtns = document.querySelectorAll('.suggestion-btn');

    // Model Sheet
    els.mobileModelSheet = document.getElementById('mobileModelSheet');
    els.sheetOverlay = document.getElementById('sheetOverlay');
    els.btnCloseSheet = document.getElementById('btnCloseSheet');
    els.modelSelect = document.getElementById('modelSelect');
    els.temperature = document.getElementById('temperature');
    els.tempValue = document.getElementById('tempValue');
    els.maxTokens = document.getElementById('maxTokens');
    els.systemPrompt = document.getElementById('systemPrompt');

    // Settings
    els.providersList = document.getElementById('providersList');
    els.settingAutoSave = document.getElementById('settingAutoSave');
    els.settingStreaming = document.getElementById('settingStreaming');
    els.btnSignIn = document.getElementById('btnSignIn');
    els.btnClearData = document.getElementById('btnClearData');

    // Prompts
    els.promptsCategories = document.getElementById('promptsCategories');
    els.promptsList = document.getElementById('promptsList');
    els.promptsSearch = document.getElementById('promptsSearch');
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================
  function $(selector, parent = document) {
    return parent.querySelector(selector);
  }

  function $$(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  function showTab(tabName) {
    state.activeTab = tabName;

    // Update nav items
    $$('.nav-item, .bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab panels
    $$('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    });

    // Close mobile sidebar
    closeSidebar();

    // Scroll to top
    window.scrollTo(0, 0);
  }

  function openSidebar() {
    els.sidebar.classList.add('open');
    els.sidebarOverlay.classList.add('visible');
    els.sidebarOverlay.setAttribute('aria-hidden', 'false');
    els.sidebar.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarOverlay.classList.remove('visible');
    els.sidebarOverlay.setAttribute('aria-hidden', 'true');
    els.sidebar.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function toggleModelSheet(open) {
    if (open) {
      els.mobileModelSheet.classList.add('open');
      els.sheetOverlay.classList.add('visible');
      els.mobileModelSheet.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    } else {
      els.mobileModelSheet.classList.remove('open');
      els.sheetOverlay.classList.remove('visible');
      els.mobileModelSheet.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  function toggleAttachMenu(open) {
    if (open) {
      els.attachMenu.classList.add('open');
    } else {
      els.attachMenu.classList.remove('open');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // ==========================================
  // CHAT FUNCTIONALITY
  // ==========================================
  function addMessage(role, content, isStreaming = false) {
    // Hide welcome screen
    if (els.welcomeScreen) {
      els.welcomeScreen.style.display = 'none';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.dataset.id = generateId();

    const time = formatTime();

    if (role === 'user') {
      messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(content)}</div>
        <div class="message-meta">${time}</div>
      `;
    } else {
      messageDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-bubble">
          <div class="message-content">${renderMarkdown(content)}</div>
          <div class="message-meta">${time} • kilo-auto/free</div>
        </div>
      `;
    }

    els.chatMessages.appendChild(messageDiv);
    scrollToBottom();

    return messageDiv;
  }

  function updateLastMessage(content) {
    const lastMessage = els.chatMessages.querySelector('.message.assistant:last-child');
    if (lastMessage) {
      const contentEl = lastMessage.querySelector('.message-content');
      if (contentEl) {
        contentEl.innerHTML = renderMarkdown(content);
      }
    }
    scrollToBottom();
  }

  function scrollToBottom() {
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
      return marked.parse(text, { breaks: true, gfm: true });
    }
    // Fallback: simple line breaks and code blocks
    return escapeHtml(text)
      .replace(/\n/g, '<br>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  }

  async function sendMessage(content) {
    if (!content.trim()) return;

    // Add user message
    addMessage('user', content);
    state.messages.push({ role: 'user', content });

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing';
    typingDiv.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-bubble">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    `;
    els.chatMessages.appendChild(typingDiv);
    scrollToBottom();

    try {
      // Call API
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: state.model,
          messages: [
            { role: 'system', content: state.systemPrompt },
            ...state.messages.slice(-10) // Last 10 messages for context
          ],
          temperature: state.temperature,
          max_tokens: state.maxTokens,
          stream: state.streaming
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Remove typing indicator
      typingDiv.remove();

      if (state.streaming) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let messageDiv = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  fullContent += delta;
                  if (!messageDiv) {
                    messageDiv = addMessage('assistant', '');
                    messageDiv.classList.add('streaming');
                  }
                  updateLastMessage(fullContent);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }

        if (messageDiv) {
          messageDiv.classList.remove('streaming');
        }

        // Save to history
        state.messages.push({ role: 'assistant', content: fullContent });
        saveChatHistory();
      } else {
        // Non-streaming
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || 'No response';
        addMessage('assistant', content);
        state.messages.push({ role: 'assistant', content });
        saveChatHistory();
      }
    } catch (error) {
      typingDiv.remove();
      addMessage('assistant', `Error: ${error.message}. Please check your connection and try again.`);
      console.error('Chat error:', error);
    }
  }

  function handleSend() {
    const content = els.chatInput.value.trim();
    if (!content) return;

    els.chatInput.value = '';
    els.chatInput.style.height = 'auto';
    sendMessage(content);
  }

  // ==========================================
  // PROMPTS FUNCTIONALITY
  // ==========================================
  function renderPrompts() {
    if (!els.promptsCategories || !els.promptsList) return;

    // Render categories
    const categories = Object.keys(state.prompts);
    els.promptsCategories.innerHTML = categories.map((cat, i) =>
      `<button class="category-btn ${i === 0 ? 'active' : ''}" data-category="${cat}">${cat}</button>`
    ).join('');

    // Render first category
    renderPromptsList(categories[0]);

    // Category click handlers
    $$('.category-btn', els.promptsCategories).forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.category-btn', els.promptsCategories).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPromptsList(btn.dataset.category);
      });
    });
  }

  function renderPromptsList(category) {
    if (!els.promptsList) return;
    const prompts = state.prompts[category] || [];
    els.promptsList.innerHTML = prompts.map(p =>
      `<button class="prompt-item" data-prompt="${escapeHtml(p.prompt)}">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
         <span>${escapeHtml(p.title)}</span>
       </button>`
    ).join('');

    // Prompt click handlers
    $$('.prompt-item', els.promptsList).forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        showTab('playground');
        els.chatInput.value = prompt;
        els.chatInput.focus();
        // Auto-expand textarea
        els.chatInput.style.height = 'auto';
        els.chatInput.style.height = Math.min(els.chatInput.scrollHeight, 150) + 'px';
      });
    });
  }

  function filterPrompts(query) {
    const items = $$('.prompt-item', els.promptsList);
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query.toLowerCase()) ? 'flex' : 'none';
    });
  }

  // ==========================================
  // SETTINGS FUNCTIONALITY
  // ==========================================
  function renderProviders() {
    if (!els.providersList) return;

    const providers = [
      { id: 'kilo', name: 'Kilo Gateway', models: ['kilo-auto/free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'cohere/north-mini-code:free'], enabled: true, default: true },
      { id: 'openrouter', name: 'OpenRouter', models: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'cohere/north-mini-code:free', 'openrouter/free'], enabled: false },
      { id: 'cloudflare', name: 'Cloudflare Workers AI', models: ['@cf/meta/llama-3.2-3b-instruct', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', '@cf/meta/llama-3.2-11b-vision-instruct'], enabled: false },
      { id: 'opencode', name: 'OpenCode', models: ['deepseek-v4.1-flash-free', 'glm-5.3-flash-free', 'nemotron-3.5-lightning-free'], enabled: false }
    ];

    els.providersList.innerHTML = providers.map(p => `
      <div class="provider-card ${p.enabled ? 'enabled' : ''} ${p.default ? 'default' : ''}">
        <div class="provider-header">
          <div>
            <h4>${p.name} ${p.default ? '<span class="badge default">Default</span>' : ''}</h4>
            <p class="provider-models">${p.models.length} models</p>
          </div>
          <label class="toggle ${p.enabled ? 'active' : ''}" data-provider="${p.id}">
            <input type="checkbox" ${p.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="provider-models-list">
          ${p.models.map(m => `<span class="model-tag">${m}</span>`).join('')}
        </div>
      </div>
    `).join('');

    // Toggle handlers
    $$('.toggle[data-provider]', els.providersList).forEach(toggle => {
      toggle.addEventListener('click', () => {
        const providerId = toggle.dataset.provider;
        const isEnabled = !toggle.classList.contains('active');
        toggle.classList.toggle('active');
        toggle.querySelector('input').checked = isEnabled;
        // In a real app, save to backend
        showToast(`${providerId} ${isEnabled ? 'enabled' : 'disabled'}`);
      });
    });
  }

  function loadSettings() {
    // Load from localStorage
    const saved = localStorage.getItem('vincezone_settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        state.temperature = settings.temperature || 0.7;
        state.maxTokens = settings.maxTokens || 2000;
        state.systemPrompt = settings.systemPrompt || 'You are a helpful AI assistant.';
        state.streaming = settings.streaming !== false;
        state.autoSave = settings.autoSave !== false;

        if (els.temperature) els.temperature.value = state.temperature;
        if (els.tempValue) els.tempValue.textContent = state.temperature;
        if (els.maxTokens) els.maxTokens.value = state.maxTokens;
        if (els.systemPrompt) els.systemPrompt.value = state.systemPrompt;
        if (els.settingAutoSave) els.settingAutoSave.checked = state.autoSave;
        if (els.settingStreaming) els.settingStreaming.checked = state.streaming;
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    }
  }

  function saveSettings() {
    const settings = {
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      systemPrompt: state.systemPrompt,
      streaming: state.streaming,
      autoSave: state.autoSave
    };
    localStorage.setItem('vincezone_settings', JSON.stringify(settings));
  }

  // ==========================================
  // CHAT HISTORY
  // ==========================================
  function saveChatHistory() {
    if (!state.autoSave) return;
    try {
      localStorage.setItem('vincezone_chat_history', JSON.stringify({
        messages: state.messages.slice(-50), // Keep last 50
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  }

  function loadChatHistory() {
    try {
      const saved = localStorage.getItem('vincezone_chat_history');
      if (saved) {
        const data = JSON.parse(saved);
        state.messages = data.messages || [];
        // Restore messages to UI
        state.messages.forEach(msg => addMessage(msg.role, msg.content));
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
  }

  function clearAllData() {
    if (!confirm('Are you sure you want to delete all chat history and settings? This cannot be undone.')) return;
    if (!confirm('This action is irreversible. Are you absolutely sure?')) return;

    localStorage.removeItem('vincezone_chat_history');
    localStorage.removeItem('vincezone_settings');
    state.messages = [];
    els.chatMessages.innerHTML = '';
    if (els.welcomeScreen) els.welcomeScreen.style.display = 'flex';
    showToast('All data cleared');
  }

  // ==========================================
  // TOAST NOTIFICATIONS
  // ==========================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================
  function bindEvents() {
    // Tab navigation
    $$('.nav-item, .bottom-nav-item').forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });

    // Mobile menu
    els.btnMenu?.addEventListener('click', openSidebar);
    els.sidebarOverlay?.addEventListener('click', closeSidebar);
    els.btnNewChat?.addEventListener('click', () => {
      state.messages = [];
      els.chatMessages.innerHTML = '';
      if (els.welcomeScreen) els.welcomeScreen.style.display = 'flex';
      closeSidebar();
    });

    // Chat input
    els.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      } else {
        // Auto-resize
        els.chatInput.style.height = 'auto';
        els.chatInput.style.height = Math.min(els.chatInput.scrollHeight, 150) + 'px';
      }
    });

    els.btnSend?.addEventListener('click', handleSend);

    // Suggestion buttons
    $$('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        els.chatInput.value = prompt;
        handleSend();
      });
    });

    // Model sheet
    // Removed model selector button - using fixed kilo-auto/free
    els.btnCloseSheet?.addEventListener('click', () => toggleModelSheet(false));
    els.sheetOverlay?.addEventListener('click', () => toggleModelSheet(false));

    // Model settings
    els.temperature?.addEventListener('input', (e) => {
      state.temperature = parseFloat(e.target.value);
      if (els.tempValue) els.tempValue.textContent = state.temperature.toFixed(1);
    });

    els.maxTokens?.addEventListener('change', (e) => {
      state.maxTokens = parseInt(e.target.value) || 2000;
    });

    els.systemPrompt?.addEventListener('change', (e) => {
      state.systemPrompt = e.target.value;
    });

    // Model select
    // Removed - using fixed kilo-auto/free

    // Settings toggles
    els.settingAutoSave?.addEventListener('change', (e) => {
      state.autoSave = e.target.checked;
      saveSettings();
    });

    els.settingStreaming?.addEventListener('change', (e) => {
      state.streaming = e.target.checked;
      saveSettings();
    });

    // Settings buttons
    els.btnSignIn?.addEventListener('click', () => showToast('Sign in feature coming soon'));
    els.btnClearData?.addEventListener('click', clearAllData);

    // Attach menu
    els.btnAttach?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAttachMenu(!els.attachMenu.classList.contains('open'));
    });

    document.addEventListener('click', (e) => {
      if (!els.attachMenu.contains(e.target) && e.target !== els.btnAttach) {
        toggleAttachMenu(false);
      }
      if (!els.mobileModelSheet.contains(e.target) && !e.target.closest('#btnModelSheet')) {
        toggleModelSheet(false);
      }
    });

    $$('.attach-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        toggleAttachMenu(false);
        showToast(`${item.querySelector('span').textContent} - Feature coming soon`);
      });
    });

    // Prompts search
    els.promptsSearch?.addEventListener('input', (e) => filterPrompts(e.target.value));

    // Model sheet settings
    els.temperature?.addEventListener('input', (e) => {
      state.temperature = parseFloat(e.target.value);
      if (els.tempValue) els.tempValue.textContent = state.temperature.toFixed(1);
      saveSettings();
    });

    els.maxTokens?.addEventListener('change', (e) => {
      state.maxTokens = parseInt(e.target.value) || 2000;
      saveSettings();
    });

    els.systemPrompt?.addEventListener('change', (e) => {
      state.systemPrompt = e.target.value;
      saveSettings();
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!els.mobileModelSheet.contains(e.target) && !e.target.closest('#btnModelSheet')) {
        toggleModelSheet(false);
      }
      if (!els.attachMenu.contains(e.target) && e.target !== els.btnAttach) {
        toggleAttachMenu(false);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K for new chat
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        state.messages = [];
        els.chatMessages.innerHTML = '';
        if (els.welcomeScreen) els.welcomeScreen.style.display = 'flex';
        showTab('playground');
      }
      // Escape to close sheets/sidebar
      if (e.key === 'Escape') {
        closeSidebar();
        toggleModelSheet(false);
        toggleAttachMenu(false);
      }
    });
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================
  function init() {
    cacheElements();
    bindEvents();
    loadSettings();
    loadChatHistory();
    renderPrompts();
    renderProviders();

    // Set initial state
    showTab('playground');

    // Set model badge
    document.querySelectorAll('.chat-model-badge').forEach(el => {
      el.textContent = 'kilo-auto/free';
    });

    console.log('VinceZone AI Web initialized');
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.VinceZone = { state, showTab, sendMessage, showToast };
})();