// State Management
const state = {
  currentWorkspace: null,
  openTabs: [], // [{ path, name, isDirty, content }]
  activeTabPath: null,
  activeShell: 'powershell',
  isAgentRunning: false,
  agentEvents: []
};

// DOM Elements
const btnOpenWorkspace = document.getElementById('btn-open-workspace');
const btnEmptyOpen = document.getElementById('btn-empty-open');
const workspaceBadge = document.getElementById('workspace-badge');
const workspaceNameLabel = document.getElementById('workspace-name-label');
const treeContainer = document.getElementById('tree-container');
const btnRefreshTree = document.getElementById('btn-refresh-tree');
const btnNewFile = document.getElementById('btn-new-file');

const editorTabsBar = document.getElementById('editor-tabs-bar');
const editorPlaceholder = document.getElementById('editor-placeholder');
const editorActiveBox = document.getElementById('editor-active-box');
const editorTextarea = document.getElementById('code-editor-textarea');
const editorLineNumbers = document.getElementById('editor-line-numbers');

const terminalPanel = document.getElementById('terminal-panel');
const terminalOutput = document.getElementById('terminal-output');
const terminalInputForm = document.getElementById('terminal-input-form');
const terminalInput = document.getElementById('terminal-input');
const btnToggleTerm = document.getElementById('btn-toggle-term');
const btnClearTerm = document.getElementById('btn-clear-term');
const termTabs = document.querySelectorAll('.term-tab');

const agentModelSelect = document.getElementById('agent-model-select');
const chkFullAuto = document.getElementById('chk-full-auto');
const agentFeed = document.getElementById('agent-feed');
const agentForm = document.getElementById('agent-form');
const agentInput = document.getElementById('agent-input');
const agentStatusLabel = document.getElementById('agent-status-label');
const btnSendAgent = document.getElementById('btn-send-agent');
const btnStopAgent = document.getElementById('btn-stop-agent');
const btnClearAgent = document.getElementById('btn-clear-agent-history');
const presetChips = document.querySelectorAll('.preset-chip');

// ---------------- 1. WORKSPACE & FILE EXPLORER ----------------

async function openWorkspaceDialog() {
  if (!window.vzDesktop) return;
  const res = await window.vzDesktop.openFolderDialog();
  if (res && res.rootPath) {
    state.currentWorkspace = res.rootPath;
    workspaceNameLabel.textContent = res.name;
    workspaceBadge.style.display = 'inline-flex';
    await refreshWorkspaceTree();
    logTerminal(`[Workspace] Đã mở dự án: ${res.rootPath}`, 'info');
  }
}

async function refreshWorkspaceTree() {
  if (!state.currentWorkspace || !window.vzDesktop) return;
  const tree = await window.vzDesktop.readTree(state.currentWorkspace);
  renderTree(tree, treeContainer);
}

function renderTree(items, container) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div style="padding: 1rem; color: #71717a; font-size: 0.75rem;">Thư mục trống.</div>';
    return;
  }

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'tree-item';
    
    if (item.type === 'directory') {
      el.innerHTML = `<strong>📁 ${escapeHtml(item.name)}</strong>`;
      
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-folder-group';
      childContainer.style.display = 'block';

      el.addEventListener('click', () => {
        const isHidden = childContainer.style.display === 'none';
        childContainer.style.display = isHidden ? 'block' : 'none';
      });

      container.appendChild(el);
      container.appendChild(childContainer);
      if (item.children) {
        renderTree(item.children, childContainer);
      }
    } else {
      el.innerHTML = `<span>📄 ${escapeHtml(item.name)}</span>`;
      el.dataset.path = item.path;

      el.addEventListener('click', () => {
        openFileInEditor(item.path, item.name);
      });

      container.appendChild(el);
    }
  });
}

// ---------------- 2. MULTI-TAB CODE EDITOR ----------------

async function openFileInEditor(relPath, fileName) {
  let tab = state.openTabs.find(t => t.path === relPath);
  if (!tab) {
    try {
      const content = await window.vzDesktop.readFile(relPath);
      tab = { path: relPath, name: fileName || relPath.split('/').pop(), content, isDirty: false };
      state.openTabs.push(tab);
    } catch (err) {
      alert(`Không thể đọc file: ${err.message}`);
      return;
    }
  }

  setActiveTab(relPath);
}

function setActiveTab(relPath) {
  state.activeTabPath = relPath;
  const tab = state.openTabs.find(t => t.path === relPath);
  if (!tab) return;

  renderEditorTabs();

  editorPlaceholder.style.display = 'none';
  editorActiveBox.style.display = 'flex';
  editorTextarea.value = tab.content;
  updateLineNumbers();
}

function closeTab(relPath, e) {
  if (e) e.stopPropagation();
  state.openTabs = state.openTabs.filter(t => t.path !== relPath);

  if (state.activeTabPath === relPath) {
    if (state.openTabs.length > 0) {
      setActiveTab(state.openTabs[state.openTabs.length - 1].path);
    } else {
      state.activeTabPath = null;
      editorPlaceholder.style.display = 'block';
      editorActiveBox.style.display = 'none';
    }
  }
  renderEditorTabs();
}

function renderEditorTabs() {
  editorTabsBar.innerHTML = '';
  state.openTabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `editor-tab ${tab.path === state.activeTabPath ? 'active' : ''}`;
    tabEl.innerHTML = `
      <span>${escapeHtml(tab.name)}</span>
      <span class="editor-tab-close" title="Đóng tab">✕</span>
    `;

    tabEl.addEventListener('click', () => setActiveTab(tab.path));
    tabEl.querySelector('.editor-tab-close').addEventListener('click', (e) => closeTab(tab.path, e));
    editorTabsBar.appendChild(tabEl);
  });
}

async function saveCurrentFile() {
  if (!state.activeTabPath || !window.vzDesktop) return;
  const tab = state.openTabs.find(t => t.path === state.activeTabPath);
  if (!tab) return;

  try {
    const content = editorTextarea.value;
    await window.vzDesktop.saveFile(tab.path, content);
    tab.content = content;
    tab.isDirty = false;
    logTerminal(`[Editor] Đã lưu thành công: ${tab.path}`, 'info');
  } catch (err) {
    logTerminal(`[Editor Lỗi] Không thể lưu file: ${err.message}`, 'error');
  }
}

function updateLineNumbers() {
  const lines = editorTextarea.value.split('\n').length;
  editorLineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
}

editorTextarea.addEventListener('input', () => {
  updateLineNumbers();
  const tab = state.openTabs.find(t => t.path === state.activeTabPath);
  if (tab) {
    tab.content = editorTextarea.value;
    tab.isDirty = true;
  }
});

editorTextarea.addEventListener('scroll', () => {
  editorLineNumbers.scrollTop = editorTextarea.scrollTop;
});

// Keyboard shortcuts (Ctrl+S to save)
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveCurrentFile();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
    e.preventDefault();
    toggleTerminal();
  }
});

// ---------------- 3. INTEGRATED TERMINAL (POWERSHELL / CMD) ----------------

function toggleTerminal() {
  terminalPanel.classList.toggle('collapsed');
  btnToggleTerm.textContent = terminalPanel.classList.contains('collapsed') ? 'Mở Rộng' : 'Thu Gọn';
}

function logTerminal(text, type = 'stdout') {
  const line = document.createElement('div');
  if (type === 'cmd') line.className = 'term-line-cmd';
  else if (type === 'error' || type === 'stderr') line.className = 'term-line-err';
  else if (type === 'info') line.className = 'term-line-info';
  
  line.textContent = text;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

termTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    termTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeShell = tab.dataset.shell;
    logTerminal(`[Terminal] Đã chuyển sang: ${tab.dataset.shell.toUpperCase()}`, 'info');
  });
});

terminalInputForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cmd = terminalInput.value.trim();
  if (!cmd || !window.vzDesktop) return;

  terminalInput.value = '';
  logTerminal(`> ${cmd}`, 'cmd');

  try {
    const res = await window.vzDesktop.runCommand(cmd, state.activeShell);
    if (res.stdout) logTerminal(res.stdout);
    if (res.stderr) logTerminal(res.stderr, 'stderr');
    logTerminal(`(Exit code: ${res.exitCode} • ${res.durationMs}ms)`, res.exitCode === 0 ? 'info' : 'error');
  } catch (err) {
    logTerminal(`Lỗi: ${err.message}`, 'error');
  }
});

btnClearTerm.addEventListener('click', () => {
  terminalOutput.innerHTML = '';
});

btnToggleTerm.addEventListener('click', toggleTerminal);

// ---------------- 4. AUTONOMOUS AI AGENT ENGINE ----------------

presetChips.forEach(chip => {
  chip.addEventListener('click', () => {
    agentInput.value = chip.dataset.task;
    agentInput.focus();
  });
});

agentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = agentInput.value.trim();
  if (!prompt || state.isAgentRunning || !window.vzDesktop) return;

  agentInput.value = '';
  state.isAgentRunning = true;
  updateAgentStatus(true, 'Đang phân tích nhiệm vụ...');

  // Append user message
  appendAgentMessage('user', prompt);

  const model = agentModelSelect.value;
  const autoApprove = chkFullAuto.checked;

  try {
    const res = await window.vzDesktop.startAgent(prompt, {
      model,
      autoApprove
    });

    if (res.status === 'success' && res.finalAnswer) {
      appendAgentMessage('assistant', res.finalAnswer);
      updateAgentStatus(false, 'Nhiệm vụ hoàn thành');
    } else if (res.status === 'cancelled') {
      appendAgentMessage('assistant', 'Đã dừng tác vụ theo yêu cầu.');
      updateAgentStatus(false, 'Đã dừng');
    } else {
      appendAgentMessage('assistant', res.message || 'Hoàn thành bước xử lý.');
      updateAgentStatus(false, 'Sẵn sàng');
    }
  } catch (err) {
    appendAgentMessage('assistant', `Lỗi: ${err.message}`);
    updateAgentStatus(false, 'Gặp lỗi');
  } finally {
    state.isAgentRunning = false;
  }
});

btnStopAgent.addEventListener('click', async () => {
  if (window.vzDesktop) {
    await window.vzDesktop.stopAgent();
    state.isAgentRunning = false;
    updateAgentStatus(false, 'Đã dừng');
  }
});

btnClearAgent.addEventListener('click', () => {
  agentFeed.innerHTML = `
    <div class="agent-welcome-card">
      <h4>AI Agent Sẵn Sàng</h4>
      <p>Nhập yêu cầu để Agent tự động đọc code, sửa file và chạy lệnh PowerShell/CMD.</p>
    </div>
  `;
});

function updateAgentStatus(isRunning, text) {
  agentStatusLabel.textContent = text;
  btnSendAgent.style.display = isRunning ? 'none' : 'block';
  btnStopAgent.style.display = isRunning ? 'block' : 'none';
}

function appendAgentMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `agent-bubble ${role}`;
  if (role === 'user') {
    bubble.textContent = text;
  } else {
    bubble.innerHTML = window.marked ? window.marked.parse(text) : escapeHtml(text);
  }
  agentFeed.appendChild(bubble);
  agentFeed.scrollTop = agentFeed.scrollHeight;
}

// Subscribe to real-time agent events
if (window.vzDesktop && window.vzDesktop.onAgentEvent) {
  window.vzDesktop.onAgentEvent((data) => {
    if (data.type === 'status') {
      agentStatusLabel.textContent = data.message;
    } else if (data.type === 'thought') {
      const card = document.createElement('div');
      card.className = 'agent-thought-card';
      card.innerHTML = `<strong>Suy nghĩ:</strong> ${escapeHtml(data.content)}`;
      agentFeed.appendChild(card);
      agentFeed.scrollTop = agentFeed.scrollHeight;
    } else if (data.type === 'tool_call') {
      const pill = document.createElement('div');
      pill.className = 'agent-tool-pill';
      pill.id = `tool-${data.id}`;
      
      const badgeClass = data.toolName;
      let argsDesc = '';
      if (data.toolName === 'read_file') argsDesc = data.args.path;
      else if (data.toolName === 'write_file') argsDesc = `${data.args.path} (${(data.args.content || '').length} ký tự)`;
      else if (data.toolName === 'edit_file') argsDesc = data.args.path;
      else if (data.toolName === 'run_command') argsDesc = `${data.args.shell || 'powershell'} > ${data.args.command}`;
      else if (data.toolName === 'list_dir') argsDesc = data.args.path || '.';

      pill.innerHTML = `
        <div class="tool-header-line">
          <span class="tool-name-badge ${badgeClass}">${data.toolName}</span>
          <span style="color: #71717a;">Đang thực thi...</span>
        </div>
        <div style="color: #f4f4f5;">${escapeHtml(argsDesc)}</div>
      `;
      agentFeed.appendChild(pill);
      agentFeed.scrollTop = agentFeed.scrollHeight;
    } else if (data.type === 'tool_result') {
      const pill = document.getElementById(`tool-${data.id}`);
      if (pill) {
        const header = pill.querySelector('.tool-header-line span:last-child');
        if (header) header.textContent = 'Hoàn tất';
        
        const resBox = document.createElement('div');
        resBox.className = 'tool-result-box';
        resBox.textContent = data.result.length > 500 ? data.result.substring(0, 500) + '... (đã rút gọn)' : data.result;
        pill.appendChild(resBox);
      }
    } else if (data.type === 'terminal_output') {
      // Pipe agent shell output directly to integrated terminal
      logTerminal(`[Agent ${data.command}]`, 'cmd');
      if (data.stdout) logTerminal(data.stdout);
      if (data.stderr) logTerminal(data.stderr, 'stderr');
      logTerminal(`(Exit code: ${data.exitCode} • ${data.durationMs}ms)`, data.exitCode === 0 ? 'info' : 'error');
    } else if (data.type === 'file_changed') {
      // Auto refresh tree and currently open tab if needed
      refreshWorkspaceTree();
      if (state.activeTabPath === data.path) {
        window.vzDesktop.readFile(data.path).then(content => {
          editorTextarea.value = content;
          updateLineNumbers();
        });
      }
    }
  });
}

// ---------------- 5. EVENT LISTENERS INITIALIZATION ----------------

btnOpenWorkspace.addEventListener('click', openWorkspaceDialog);
btnEmptyOpen.addEventListener('click', openWorkspaceDialog);
btnRefreshTree.addEventListener('click', refreshWorkspaceTree);

btnNewFile.addEventListener('click', async () => {
  if (!state.currentWorkspace || !window.vzDesktop) {
    alert('Vui lòng mở thư mục dự án trước.');
    return;
  }
  const fileName = prompt('Nhập tên tệp mới (ví dụ: test.js, README.md, src/utils.py):');
  if (fileName) {
    await window.vzDesktop.createFile(fileName, false);
    await refreshWorkspaceTree();
    await openFileInEditor(fileName, fileName.split('/').pop());
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Check gateway connection on startup
window.addEventListener('DOMContentLoaded', async () => {
  if (window.vzDesktop) {
    const status = await window.vzDesktop.getGatewayStatus();
    const statusPill = document.getElementById('gateway-status-pill');
    const statusText = document.getElementById('gateway-status-text');
    if (status && status.online) {
      statusPill.querySelector('.status-dot').className = 'status-dot active';
      statusText.textContent = `Gateway: Online :3000 (${(status.providers || []).length} Providers)`;
    } else {
      statusPill.querySelector('.status-dot').className = 'status-dot';
      statusText.textContent = 'Gateway: Sẵn sàng kết nối';
    }
  }
});
