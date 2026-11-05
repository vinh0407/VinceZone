/**
 * VinceZone Studio - Desktop Version
 * Full IDE with Projects, Open IDE, Settings
 */
(function() {
  'use strict';

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const state = {
    activeView: 'explorer',
    activePanel: 'problems',
    activeTab: 'projects',
    files: new Map(),
    openTabs: [],
    activeTabId: null,
    gitStatus: { changes: [], branch: 'main' },
    debugConfigs: [],
    extensions: [],
    providers: {
      'kilo-auto/free': { name: 'Kilo Gateway', baseUrl: 'https://ai-gateway.kilo.ai/api/v1', models: ['kilo-auto/free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'cohere/north-mini-code:free'] },
      'openrouter': { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'cohere/north-mini-code:free', 'openrouter/free'] },
      'cloudflare': { name: 'Cloudflare Workers AI', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/e155cf04b558472645b9444756a0deed/ai/v1', models: ['@cf/meta/llama-3.2-3b-instruct', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'] },
      'opencode': { name: 'OpenCode', baseUrl: 'https://opencode.ai/zen/v1', models: ['deepseek-v4.1-flash-free', 'glm-5.3-flash-free', 'nemotron-3.5-lightning-free'] }
    },
    editor: null,
    terminal: null
  };

  // ==========================================
  // DOM ELEMENTS
  // ==========================================
  const els = {};

  function cacheElements() {
    // Title bar
    els.titleBar = document.getElementById('app-title-bar');
    els.menuItems = document.querySelectorAll('.titlebar-menu-item');
    els.dropdowns = document.querySelectorAll('.titlebar-dropdown');
    els.windowControls = document.querySelectorAll('.win-control-btn');
    els.titlebarActions = document.querySelectorAll('[data-action]');
    els.tabButtons = document.querySelectorAll('[data-tab]');

    // Activity Bar
    els.activityBar = document.getElementById('activityBar');
    els.activityItems = document.querySelectorAll('.activity-bar-item');
    els.activityToggles = document.querySelectorAll('.activity-toggle-btn');

    // Sidebar
    els.sidebarContainer = document.getElementById('sidebarContainer');
    els.sidebarViews = document.querySelectorAll('.sidebar-view');
    els.fileTree = document.getElementById('fileTree');
    els.searchInput = document.getElementById('searchInput');
    els.searchResults = document.getElementById('searchResults');
    els.gitChanges = document.getElementById('gitChanges');
    els.gitMessage = document.getElementById('gitMessage');
    els.debugConfigs = document.getElementById('debugConfigs');
    els.extensionsList = document.getElementById('extensionsList');
    els.settingsContent = document.getElementById('settingsContent');
    els.desktopProvidersList = document.getElementById('desktopProvidersList');

    // Editor
    els.editorTabsBar = document.getElementById('editorTabsBar');
    els.tabsContainer = document.getElementById('tabsContainer');
    els.breadcrumbs = document.getElementById('breadcrumbs');
    els.monacoMount = document.getElementById('monacoMount');
    els.composerOverlay = document.getElementById('composerOverlay');
    els.composerInput = document.getElementById('composerInput');
    els.composerDiff = document.getElementById('composerDiff');

    // Bottom Panel
    els.bottomPanel = document.getElementById('bottomPanel');
    els.panelTabs = document.querySelectorAll('.panel-tab');
    els.panelPanes = document.querySelectorAll('.panel-pane');
    els.terminalOutput = document.getElementById('terminalOutput');
    els.terminalInput = document.getElementById('terminalInput');
    els.terminalShell = document.getElementById('terminalShell');

    // AI Panel
    els.aiPanel = document.getElementById('aiPanel');
    els.aiMessages = document.getElementById('aiMessages');
    els.aiInput = document.getElementById('aiInput');

    // Status Bar
    els.statusGit = document.getElementById('statusGit');
    els.statusErrors = document.getElementById('statusErrors');
    els.statusWarnings = document.getElementById('statusWarnings');
    els.statusCursor = document.getElementById('statusCursor');
    els.statusEncoding = document.getElementById('statusEncoding');
    els.statusEOL = document.getElementById('statusEOL');
    els.statusLanguage = document.getElementById('statusLanguage');
    els.statusIndent = document.getElementById('statusIndent');

    // Command Palette
    els.commandPalette = document.getElementById('commandPalette');
    els.paletteInput = document.getElementById('paletteInput');
    els.paletteList = document.getElementById('paletteList');

    // Composer
    els.composerOverlay = document.getElementById('composerOverlay');
    els.composerInput = document.getElementById('composerInput');
    els.composerDiff = document.getElementById('composerDiff');
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

  function showSidebarView(viewName) {
    state.activeView = viewName;
    $$('.activity-bar-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    $$('.sidebar-view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  }

  function showBottomPanel(panelName) {
    state.activePanel = panelName;
    $$('.panel-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.panel === panelName));
    $$('.panel-pane').forEach(pane => pane.classList.toggle('active', pane.id === `pane-${panelName}`));
  }

  function toggleSidebar() {
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('vz_sidebar_collapsed', document.body.classList.contains('sidebar-collapsed'));
  }

  function togglePanel() {
    document.body.classList.toggle('panel-collapsed');
    localStorage.setItem('vz_panel_collapsed', document.body.classList.contains('panel-collapsed'));
  }

  function toggleAI() {
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel) {
      aiPanel.classList.toggle('open');
    }
  }

  function showTab(tabName) {
    state.activeTab = tabName;
    $$('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // ==========================================
  // FILE TREE
  // ==========================================
  async function loadFileTree() {
    try {
      const res = await fetch('/api/projects/current/files');
      if (!res.ok) throw new Error('Failed to load files');
      const data = await res.json();
      renderFileTree(data.files || []);
    } catch (e) {
      console.error('Failed to load file tree:', e);
      els.fileTree.innerHTML = '<div class="tree-error">Failed to load files</div>';
    }
  }

  function renderFileTree(files, container = els.fileTree) {
    container.innerHTML = files.map(f => renderFileNode(f)).join('');
  }

  function renderFileNode(file, depth = 0) {
    const icon = getFileIcon(file.name);
    const hasChildren = file.children && file.children.length > 0;
    const isDir = file.type === 'directory';

    return `
      <div class="tree-node ${isDir ? 'dir' : 'file'}" data-path="${escapeHtml(file.path)}" style="padding-left: ${depth * 16}px">
        ${isDir ? `<span class="tree-expander" data-expanded="${file.expanded}">${file.expanded ? '▼' : '▶'}</span>` : '<span class="tree-spacer"></span>'}
        <span class="tree-icon">${icon}</span>
        <span class="tree-name">${escapeHtml(file.name)}</span>
      </div>
      ${isDir && file.expanded && file.children ? `<div class="tree-children">${file.children.map(c => renderFileNode(c, depth + 1)).join('')}</div>` : ''}
    `;
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
      js: '📄', ts: '📄', jsx: '📄', tsx: '📄',
      html: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
      json: '📋', md: '📝', txt: '📄',
      py: '🐍', java: '☕', cs: '🔷', cpp: '⚙️', c: '⚙️', h: '⚙️',
      json: '📋', yaml: '📋', yml: '📋',
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
      pdf: '📕', zip: '📦', tar: '📦', gz: '📦',
      dockerfile: '🐳', dockerignore: '🐳',
      gitignore: '🚫', gitattributes: '🚫',
      env: '🔐', config: '⚙️'
    };
    return icons[ext] || '📄';
  }

  // ==========================================
  // MONACO EDITOR
  // ==========================================
  let monacoEditor = null;

  async function initMonaco() {
    if (typeof monaco === 'undefined') {
      await new Promise(resolve => {
        require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
        require(['vs/editor/editor.main'], resolve);
      });
    }

    monacoEditor = monaco.editor.create(document.getElementById('monacoMount'), {
      value: '// Welcome to VinceZone Studio\n// Open a file to start coding',
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      tabSize: 2,
      wordWrap: 'on',
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true }
    });

    // Update status bar on cursor move
    monacoEditor.onDidChangeCursorPosition(e => {
      updateStatusCursor(e.position.lineNumber, e.position.column);
    });

    // Update language status on model change
    monacoEditor.onDidChangeModelLanguage(e => {
      updateStatusLanguage(e.model.getLanguageId());
    });

    return monacoEditor;
  }

  function openFileInEditor(filePath) {
    // Fetch file content
    fetch(`/api/projects/current/read-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        addTab(filePath, data.content);
      } else {
        showToast('Failed to open file: ' + data.error);
      }
    })
    .catch(() => showToast('Failed to open file'));
  }

  function addTab(filePath, content) {
    const existingTab = state.openTabs.find(t => t.path === filePath);
    if (existingTab) {
      activateTab(existingTab.id);
      return;
    }

    const tabId = generateId();
    const tab = { id: tabId, path: filePath, name: filePath.split('/').pop(), dirty: false };
    state.openTabs.push(tab);
    activateTab(tabId);

    // Set editor content
    if (monacoEditor) {
      const lang = getLanguageFromPath(filePath);
      monacoEditor.setModel(monaco.editor.createModel(content, lang, monaco.Uri.file(filePath)));
    }
  }

  function activateTab(tabId) {
    state.activeTabId = tabId;
    $$('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.id === tabId));
    const tab = state.openTabs.find(t => t.id === tabId);
    if (tab && monacoEditor) {
      // Switch model if needed
    }
    updateBreadcrumbs(tabId);
  }

  function updateBreadcrumbs(tabId) {
    const tab = state.openTabs.find(t => t.id === tabId);
    if (!tab) return;

    const parts = tab.path.split('/').filter(p => p);
    let html = '<span class="breadcrumb-root" data-path="">VinceZone</span>';
    let currentPath = '';
    parts.forEach((part, i) => {
      currentPath += (currentPath ? '/' : '') + part;
      const isLast = i === parts.length - 1;
      html += `<span class="breadcrumb-sep">/</span>`;
      if (isLast) {
        html += `<span class="breadcrumb-current">${escapeHtml(part)}</span>`;
      } else {
        html += `<span class="breadcrumb-part" data-path="${escapeHtml(currentPath)}">${escapeHtml(part)}</span>`;
      }
    });
    document.getElementById('breadcrumbs').innerHTML = html;
  }

  function getLanguageFromPath(path) {
    const ext = path.split('.').pop().toLowerCase();
    const langs = {
      js: 'javascript', ts: 'typescript', jsx: 'javascriptreact', tsx: 'typescriptreact',
      html: 'html', css: 'css', scss: 'scss', sass: 'scss',
      json: 'json', md: 'markdown', py: 'python', java: 'java',
      cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c',
      yml: 'yaml', yaml: 'yaml', sh: 'shell', bash: 'shell'
    };
    return langs[ext] || 'plaintext';
  }

  // ==========================================
  // TERMINAL
  // ==========================================
  function initTerminal() {
    const input = document.getElementById('terminalInput');
    if (!input) return;

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const cmd = input.value.trim();
        if (!cmd) return;

        appendTerminalOutput(`PS C:\\VinceZone> ${cmd}`, 'prompt');
        input.value = '';

        try {
          const res = await fetch('/api/projects/current/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, shell: 'powershell' })
          });
          const data = await res.json();
          if (data.output) appendTerminalOutput(data.output, 'output');
          if (data.error) appendTerminalOutput(data.error, 'error');
          appendTerminalOutput(`Exit code: ${data.exitCode}`, 'info');
        } catch (e) {
          appendTerminalOutput('Error: ' + e.message, 'error');
        }
      }
    });
  }

  function appendTerminalOutput(text, type = 'output') {
    const div = document.createElement('div');
    div.className = `terminal-line ${type}`;
    div.textContent = text;
    document.getElementById('terminalOutput').appendChild(div);
    document.getElementById('terminalOutput').scrollTop = document.getElementById('terminalOutput').scrollHeight;
  }

  // ==========================================
  // GIT
  // ==========================================
  async function loadGitStatus() {
    try {
      const res = await fetch('/api/projects/current/git/status');
      const data = await res.json();
      state.gitStatus = data;
      renderGitChanges();
    } catch (e) {
      console.error('Failed to load git status:', e);
    }
  }

  function renderGitChanges() {
    const { changes } = state.gitStatus;
    if (!changes || changes.length === 0) {
      document.getElementById('gitChanges').innerHTML = '<div class="git-empty">No changes detected</div>';
      return;
    }

    document.getElementById('gitChanges').innerHTML = changes.map(c => `
      <div class="git-file ${c.staged ? 'staged' : ''}" data-path="${escapeHtml(c.path)}">
        <span class="git-status">${c.status}</span>
        <span class="git-path">${escapeHtml(c.path)}</span>
      </div>
    `).join('');
  }

  // ==========================================
  // AI PANEL
  // ==========================================
  async function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const text = input.value.trim();
    if (!text) return;

    addAIMessage('user', text);
    input.value = '';

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kilo-auto/free',
          messages: [{ role: 'system', content: 'You are an AI coding assistant in VinceZone Studio.' },
            { role: 'user', content: text }],
          stream: true
        })
      });

      if (state.streaming) {
        // Handle streaming
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let messageDiv = addAIMessage('assistant', '');
        messageDiv.classList.add('streaming');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) updateAIMessage(messageDiv, delta);
              } catch (e) {}
            }
          }
        }
        messageDiv.classList.remove('streaming');
      }
    } catch (e) {
      showToast('AI error: ' + e.message);
    }
  }

  function addAIMessage(role, content) {
    const div = document.createElement('div');
    div.className = `ai-message ${role}`;
    div.innerHTML = role === 'user'
      ? `<div class="ai-message-content">${escapeHtml(content)}</div>`
      : `<div class="ai-message-content">${renderMarkdown(content)}</div>`;
    document.getElementById('aiMessages').appendChild(div);
    document.getElementById('aiMessages').scrollTop = document.getElementById('aiMessages').scrollHeight;
    return div;
  }

  function updateAIMessage(div, delta) {
    const content = div.querySelector('.ai-message-content');
    content.textContent += delta;
    div.parentElement.scrollTop = div.parentElement.scrollHeight;
  }

  // ==========================================
  // SETTINGS
  // ==========================================
  function renderProvidersSettings() {
    if (!els.desktopProvidersList) return;
    els.desktopProvidersList.innerHTML = Object.entries(state.providers).map(([id, p]) => `
      <div class="provider-card">
        <div class="provider-header">
          <h4>${p.name}</h4>
          <span class="badge">${p.models.length} models</span>
        </div>
        <div class="provider-models">
          ${p.models.map(m => `<span class="model-tag">${m}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  // ==========================================
  // COMMAND PALETTE
  // ==========================================
  const commands = [
    { id: 'newFile', label: 'New File', keys: 'Ctrl+N', action: () => showToast('New file') },
    { id: 'openFile', label: 'Open File...', keys: 'Ctrl+O', action: () => showToast('Open file') },
    { id: 'openFolder', label: 'Open Folder...', keys: 'Ctrl+K Ctrl+O', action: () => showToast('Open folder') },
    { id: 'save', label: 'Save', keys: 'Ctrl+S', action: () => showToast('Saved') },
    { id: 'saveAll', label: 'Save All', keys: 'Ctrl+K S', action: () => showToast('All saved') },
    { id: 'toggleSidebar', label: 'Toggle Sidebar', keys: 'Ctrl+B', action: toggleSidebar },
    { id: 'togglePanel', label: 'Toggle Panel', keys: 'Ctrl+`', action: togglePanel },
    { id: 'commands', label: 'Command Palette', keys: 'Ctrl+Shift+P', action: openCommandPalette },
    { id: 'newTerminal', label: 'New Terminal', keys: 'Ctrl+Shift+`', action: () => showBottomPanel('terminal') },
    { id: 'startDebug', label: 'Start Debugging', keys: 'F5', action: () => showToast('Debug started') },
    { id: 'runWithoutDebug', label: 'Run Without Debugging', keys: 'Ctrl+F5', action: () => showToast('Running') },
    { id: 'toggleAI', label: 'Toggle AI Panel', keys: 'Ctrl+Shift+A', action: toggleAI },
    { id: 'openComposer', label: 'Open AI Composer', keys: 'Ctrl+K', action: openComposer },
    { id: 'settings', label: 'Open Settings', keys: 'Ctrl+,', action: () => showSidebarView('settings') }
  ];

  function openCommandPalette() {
    const palette = document.getElementById('commandPalette');
    const input = document.getElementById('paletteInput');
    palette.classList.add('open');
    input.value = '';
    input.focus();
    renderPaletteList('');
  }

  function closeCommandPalette() {
    document.getElementById('commandPalette').classList.remove('open');
  }

  function renderPaletteList(query) {
    const list = document.getElementById('paletteList');
    const filtered = commands.filter(c =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.keys.toLowerCase().includes(query.toLowerCase())
    );
    list.innerHTML = filtered.map(c => `
      <div class="palette-item" data-id="${c.id}">
        <span class="palette-label">${c.label}</span>
        <kbd>${c.keys}</kbd>
      </div>
    `).join('');
  }

  // ==========================================
  // AI COMPOSER
  // ==========================================
  function openComposer() {
    document.getElementById('composerOverlay').classList.add('open');
    document.getElementById('composerInput').focus();
  }

  function closeComposer() {
    document.getElementById('composerOverlay').classList.remove('open');
  }

  async function submitComposer() {
    const input = document.getElementById('composerInput');
    const prompt = input.value.trim();
    if (!prompt) return;

    // Get current file context
    const activeTab = state.openTabs.find(t => t.id === state.activeTabId);
    const context = activeTab ? `File: ${activeTab.path}\n\n` : '';

    input.value = '';
    closeComposer();

    // Show diff in composer
    document.getElementById('composerDiff').style.display = 'block';
    document.getElementById('composerDiff').innerHTML = '<div class="diff-loading">Generating changes...</div>';

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kilo-auto/free',
          messages: [
            { role: 'system', content: 'You are an AI coding assistant. Return only the code changes in unified diff format.' },
            { role: 'user', content: `${context}Task: ${prompt}` }
          ],
          stream: false
        })
      });

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Show diff
      document.getElementById('composerDiff').innerHTML = `
        <div class="diff-header">Suggested Changes</div>
        <pre><code class="language-diff">${escapeHtml(content)}</code></pre>
        <div class="diff-actions">
          <button class="btn-primary" data-action="acceptDiff">Accept Changes</button>
          <button class="btn-secondary" data-action="rejectDiff">Reject</button>
        </div>
      `;
      if (typeof hljs !== 'undefined') hljs.highlightAll();
    } catch (e) {
      document.getElementById('composerDiff').innerHTML = `<div class="diff-error">Error: ${e.message}</div>`;
    }
  }

  // ==========================================
  // STATUS BAR
  // ==========================================
  function updateStatusCursor(line, col) {
    if (els.statusCursor) els.statusCursor.textContent = `Ln ${line}, Col ${col}`;
  }

  function updateStatusLanguage(lang) {
    if (els.statusLanguage) els.statusLanguage.textContent = lang;
  }

  function updateStatusEncoding(enc = 'UTF-8') {
    if (els.statusEncoding) els.statusEncoding.textContent = enc;
  }

  function updateStatusEOL(eol = 'LF') {
    if (els.statusEOL) els.statusEOL.textContent = eol;
  }

  // ==========================================
  // TOAST
  // ==========================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
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
    // Menu items
    $$('.titlebar-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.titlebar-dropdown')) return;
        const dropdown = item.querySelector('.titlebar-dropdown');
        $$('.titlebar-dropdown').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });
        dropdown.classList.toggle('open');
      });
    });

    // Dropdown items
    $$('.dropdown-item[data-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        $$('.titlebar-dropdown').forEach(d => d.classList.remove('open'));
        handleAction(action);
      });
    });

    // Window controls
    $$('.win-control-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action));
    });

    // Tab buttons
    $$('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('activity-bar-item')) {
          showSidebarView(btn.dataset.view);
        } else if (btn.classList.contains('panel-tab')) {
          showBottomPanel(btn.dataset.panel);
        } else if (btn.classList.contains('nav-item') || btn.classList.contains('bottom-nav-item')) {
          showTab(btn.dataset.tab);
        }
      });
    });

    // Activity bar toggles
    $$('.activity-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.id.replace('btn', '').toLowerCase()));
    });

    // Sidebar views
    $$('.sidebar-view').forEach(view => {
      view.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) {
          handleAction(e.target.closest('[data-action]').dataset.action);
        }
      });
    });

    // Panel tabs
    $$('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => showBottomPanel(tab.dataset.panel));
    });

    // Activity toggles
    document.getElementById('btnToggleSidebar')?.addEventListener('click', toggleSidebar);
    document.getElementById('btnTogglePanel')?.addEventListener('click', togglePanel);
    document.getElementById('btnToggleAI')?.addEventListener('click', toggleAI);

    // File tree
    els.fileTree?.addEventListener('click', (e) => {
      const node = e.target.closest('.tree-node');
      if (!node) return;

      const path = node.dataset.path;
      if (e.target.classList.contains('tree-expander')) {
        node.classList.toggle('expanded');
        e.target.textContent = node.classList.contains('expanded') ? '▼' : '▶';
        // Toggle children visibility
        const children = node.nextElementSibling;
        if (children && children.classList.contains('tree-children')) {
          children.style.display = node.classList.contains('expanded') ? 'block' : 'none';
        }
      } else if (e.target.classList.contains('tree-name') || e.target.classList.contains('tree-icon')) {
        // Open file
        openFileInEditor(path);
      }
    });

    // Search
    els.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performSearch(e.target.value);
    });
    document.getElementById('btnSearch')?.addEventListener('click', () => performSearch(els.searchInput.value));

    // Tabs actions
    $$('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action));
    });

    // Terminal
    els.terminalInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = els.terminalInput.value.trim();
        if (!cmd) return;
        appendTerminalOutput(`PS C:\\VinceZone> ${cmd}`, 'prompt');
        els.terminalInput.value = '';
        executeTerminalCommand(cmd);
      }
    });

    // AI Input
    const aiInput = document.getElementById('aiInput');
    const aiSendBtn = document.getElementById('btnAISend');
    aiInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
      }
    });
    aiSendBtn?.addEventListener('click', sendAIMessage);

    // Composer
    document.getElementById('btnComposerSubmit')?.addEventListener('click', submitComposer);
    document.querySelector('[data-action="closeComposer"]')?.addEventListener('click', () => {
      document.getElementById('composerOverlay').classList.remove('open');
    });
    $$('.composer-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('composerInput').value = chip.dataset.prompt;
      });
    });

    // Panel tabs
    $$('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => showBottomPanel(tab.dataset.panel));
    });

    // Panel actions
    document.querySelector('[data-action="clearPanel"]')?.addEventListener('click', () => {
      const activePane = document.querySelector('.panel-pane.active');
      if (activePane) activePane.innerHTML = '<div class="pane-empty">Cleared</div>';
    });

    // Command Palette
    document.getElementById('paletteInput')?.addEventListener('input', (e) => renderPaletteList(e.target.value));
    document.getElementById('paletteInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const item = document.querySelector('.palette-item');
        if (item) {
          const cmd = commands.find(c => c.id === item.dataset.id);
          if (cmd) { cmd.action(); closeCommandPalette(); }
        }
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      }
    });

    // Global shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+P - Command Palette
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault(); openCommandPalette();
      }
      // Ctrl+B - Toggle Sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault(); toggleSidebar();
      }
      // Ctrl+` - Toggle Panel
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault(); togglePanel();
      }
      // Ctrl+K - AI Composer
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault(); openComposer();
      }
      // Escape
      if (e.key === 'Escape') {
        closeCommandPalette();
        document.getElementById('composerOverlay').classList.remove('open');
        document.getElementById('aiPanel').classList.remove('open');
      }
      // F11 - Fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      }
    });

    // Click outside to close dropdowns
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.titlebar-menu-item')) {
        $$('.titlebar-dropdown').forEach(d => d.classList.remove('open'));
      }
      if (!e.target.closest('#commandPalette') && !e.target.closest('[data-action="commands"]')) {
        closeCommandPalette();
      }
    });

    // Composer input
    document.getElementById('composerInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitComposer();
      }
    });

    // Diff actions
    document.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'acceptDiff') {
        showToast('Changes accepted');
        document.getElementById('composerDiff').style.display = 'none';
      } else if (e.target.dataset.action === 'rejectDiff') {
        document.getElementById('composerDiff').style.display = 'none';
      }
    });
  }

  // ==========================================
  // ACTION HANDLERS
  // ==========================================
  function handleAction(action) {
    switch (action) {
      case 'newFile':
        showToast('New file - Feature coming soon');
        break;
      case 'openFile':
        showToast('Open file dialog - Feature coming soon');
        break;
      case 'openFolder':
        if (window.vzDesktop) window.vzDesktop.openFolderDialog();
        else showToast('Open folder - Desktop only');
        break;
      case 'save':
        saveActiveFile();
        break;
      case 'saveAll':
        showToast('All files saved');
        break;
      case 'closeEditor':
        closeActiveTab();
        break;
      case 'exit':
        if (window.vzDesktop) window.vzDesktop.close();
        else window.close();
        break;
      case 'undo':
        document.execCommand('undo');
        break;
      case 'redo':
        document.execCommand('redo');
        break;
      case 'cut':
        document.execCommand('cut');
        break;
      case 'copy':
        document.execCommand('copy');
        break;
      case 'paste':
        document.execCommand('paste');
        break;
      case 'toggleSidebar':
        toggleSidebar();
        break;
      case 'togglePanel':
        togglePanel();
        break;
      case 'toggleAI':
        toggleAI();
        break;
      case 'startDebug':
        showToast('Debug started');
        break;
      case 'runWithoutDebug':
        showToast('Running without debug');
        break;
      case 'stopDebug':
        showToast('Debug stopped');
        break
      case 'restartDebug':
        showToast('Debug restarted');
        break;
      case 'newTerminal':
        showBottomPanel('terminal');
        break;
      case 'splitTerminal':
        showToast('Split terminal - coming soon');
        break;
      case 'runTask':
        showToast('Run task - coming soon');
        break;
      case 'runBuildTask':
        showToast('Build task - coming soon');
        break;
      case 'killTerminal':
        showToast('Terminal killed');
        break;
      case 'commands':
        openCommandPalette();
        break;
      case 'welcome':
        showToast('Welcome to VinceZone Studio!');
        break;
      case 'shortcuts':
        showToast('Keyboard shortcuts - coming soon');
        break;
      case 'about':
        showToast('VinceZone Studio v1.0.0');
        break;
      case 'toggleSidebar':
        toggleSidebar();
        break;
      case 'togglePanel':
        togglePanel();
        break;
      case 'toggleAI':
        toggleAI();
        break;
      case 'startDebug':
        showBottomPanel('debug');
        showToast('Debugger started');
        break;
      case 'runWithoutDebug':
        showToast('Running...');
        break;
      case 'stopDebug':
        showToast('Debug stopped');
        break;
      case 'restartDebug':
        showToast('Debugger restarted');
        break;
      case 'openComposer':
        openComposer();
        break;
      case 'closeComposer':
        document.getElementById('composerOverlay').classList.remove('open');
        break;
      case 'refreshExplorer':
        loadFileTree();
        break;
      case 'collapseAll':
        $$('.tree-node.dir').forEach(n => n.classList.remove('expanded'));
        $$('.tree-children').forEach(c => c.style.display = 'none');
        break;
      case 'refreshGit':
        loadGitStatus();
        break;
      case 'refreshExtensions':
        showToast('Extensions refreshed');
        break;
      case 'gitCommit':
        showToast('Git commit - coming soon');
        break;
      case 'gitCommitPush':
        showToast('Commit & push - coming soon');
        break;
      case 'clearPanel':
        const activePane = document.querySelector('.panel-pane.active');
        if (activePane) activePane.innerHTML = '<div class="pane-empty">Cleared</div>';
        break;
      case 'clearTerminal':
        document.getElementById('terminalOutput').innerHTML = '';
        break;
      case 'killTerminal':
        showToast('Terminal killed');
        break;
      case 'openComposer':
        openComposer();
        break;
      case 'closeComposer':
        document.getElementById('composerOverlay').classList.remove('open');
        break;
      case 'aiAttach':
        showToast('Attach file - coming soon');
        break;
      case 'newFile':
        showToast('New file - Feature coming soon');
        break;
      case 'openFile':
        showToast('Open file - Feature coming soon');
        break;
      case 'openFolder':
        if (window.vzDesktop) window.vzDesktop.openFolderDialog();
        else showToast('Open folder - Desktop only');
        break;
      case 'save':
        saveActiveFile();
        break;
      case 'saveAll':
        showToast('All files saved');
        break;
      case 'closeEditor':
        closeActiveTab();
        break;
      case 'splitEditor':
        showToast('Split editor - coming soon');
        break;
      case 'openComposer':
        openComposer();
        break;
    }
  }

  function saveActiveFile() {
    const tab = state.openTabs.find(t => t.id === state.activeTabId);
    if (!tab || !monacoEditor) { showToast('No file to save'); return; }

    const content = monacoEditor.getValue();
    fetch(`/api/projects/current/save-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tab.path, content })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        tab.dirty = false;
        updateTabDirty(tab.id, false);
        showToast('File saved');
      } else {
        showToast('Save failed: ' + data.error);
      }
    })
    .catch(() => showToast('Save failed'));
  }

  function closeActiveTab() {
    if (!state.activeTabId) return;
    const index = state.openTabs.findIndex(t => t.id === state.activeTabId);
    if (index === -1) return;

    state.openTabs.splice(index, 1);
    const tabEl = document.querySelector(`.editor-tab[data-id="${state.activeTabId}"]`);
    if (tabEl) tabEl.remove();

    // Activate next tab
    if (state.openTabs.length > 0) {
      const newTab = state.openTabs[Math.min(index, state.openTabs.length - 1)];
      activateTab(newTab.id);
    } else {
      state.activeTabId = null;
      document.getElementById('tabsContainer').innerHTML = '<div class="tab-placeholder">No files open</div>';
      if (monacoEditor) monacoEditor.setModel(null);
    }
  }

  function updateTabDirty(tabId, dirty) {
    const tabEl = document.querySelector(`.editor-tab[data-id="${tabId}"]`);
    if (tabEl) tabEl.classList.toggle('dirty', dirty);
  }

  function executeTerminalCommand(cmd) {
    fetch('/api/projects/current/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, shell: 'powershell' })
    })
    .then(res => res.json())
    .then(data => {
      if (data.output) appendTerminalOutput(data.output, 'output');
      if (data.error) appendTerminalOutput(data.error, 'error');
      appendTerminalOutput(`Exit code: ${data.exitCode}`, 'info');
    })
    .catch(() => appendTerminalOutput('Error executing command', 'error'));
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================
  async function init() {
    cacheElements();
    bindEvents();

    // Load persisted UI state
    if (localStorage.getItem('vz_sidebar_collapsed') === 'true') {
      document.body.classList.add('sidebar-collapsed');
    }
    if (localStorage.getItem('vz_panel_collapsed') === 'true') {
      document.body.classList.add('panel-collapsed');
    }

    // Initialize Monaco
    await initMonaco();

    // Load initial data
    await Promise.all([
      loadFileTree(),
      loadGitStatus(),
      renderProvidersSettings()
    ]);

    // Initialize terminal
    initTerminal();

    // Show default view
    showSidebarView('explorer');
    showBottomPanel('problems');

    // Check for vzDesktop
    window.vzDesktop = true;

    console.log('VinceZone Studio Desktop initialized');
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.VinceZoneDesktop = { state, showTab, showSidebarView, showBottomPanel, toggleSidebar, togglePanel, toggleAI, openComposer, showToast };
})();