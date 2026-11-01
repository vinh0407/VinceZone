const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

class AgentEngine {
  constructor(workspaceRoot, options = {}) {
    this.workspaceRoot = workspaceRoot;
    this.gatewayUrl = options.gatewayUrl || 'http://localhost:3000/v1/chat/completions';
    this.apiKey = options.apiKey || 'vz_live_default';
    this.model = options.model || 'kilo-auto/free';
    this.autoApprove = options.autoApprove !== undefined ? options.autoApprove : true;
    this.activeProcess = null;
    this.abortController = null;
  }

  setWorkspace(dir) {
    this.workspaceRoot = dir;
  }

  setModel(model) {
    this.model = model;
  }

  setGateway(url, key) {
    if (url) this.gatewayUrl = url;
    if (key) this.apiKey = key;
  }

  resolvePath(relOrAbsPath) {
    if (!this.workspaceRoot) {
      return path.resolve(relOrAbsPath);
    }
    if (path.isAbsolute(relOrAbsPath)) {
      return relOrAbsPath;
    }
    return path.resolve(this.workspaceRoot, relOrAbsPath);
  }

  // Tools execution implementations
  async readFile(filePath) {
    const fullPath = this.resolvePath(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File không tồn tại: ${filePath}`);
    }
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return this.listDirectory(filePath);
    }
    if (stat.size > 2 * 1024 * 1024) {
      throw new Error(`File quá lớn (> 2MB): ${filePath}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  async writeFile(filePath, content) {
    const fullPath = this.resolvePath(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf8');
    return `Đã ghi thành công file: ${filePath} (${Buffer.byteLength(content, 'utf8')} bytes)`;
  }

  async editFile(filePath, target, replacement) {
    const fullPath = this.resolvePath(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File không tồn tại: ${filePath}`);
    }
    const original = fs.readFileSync(fullPath, 'utf8');
    if (!original.includes(target)) {
      throw new Error(`Không tìm thấy đoạn mã target chính xác trong file ${filePath}. Vui lòng kiểm tra lại khoảng trắng và thụt lề.`);
    }
    const updated = original.split(target).join(replacement);
    fs.writeFileSync(fullPath, updated, 'utf8');
    return `Đã thay thế và cập nhật thành công file: ${filePath}`;
  }

  async listDirectory(dirPath = '.') {
    const fullPath = this.resolvePath(dirPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Thư mục không tồn tại: ${dirPath}`);
    }
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const list = entries
      .filter(e => !['node_modules', '.git', '.next', 'dist', 'build', '.gemini'].includes(e.name))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        path: path.relative(this.workspaceRoot, path.join(fullPath, e.name)).replace(/\\/g, '/')
      }));
    return JSON.stringify(list, null, 2);
  }

  async runCommand(command, shell = 'powershell') {
    return new Promise((resolve) => {
      const cwd = this.workspaceRoot || process.cwd();
      const shellBinary = shell.toLowerCase() === 'cmd' ? 'cmd.exe' : 'powershell.exe';
      const args = shell.toLowerCase() === 'cmd' ? ['/c', command] : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];

      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const child = spawn(shellBinary, args, {
        cwd,
        env: { ...process.env },
        windowsHide: true
      });

      this.activeProcess = child;

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('error', (err) => {
        this.activeProcess = null;
        resolve({
          command,
          exitCode: 1,
          stdout,
          stderr: `Lỗi khởi chạy tiến trình: ${err.message}`,
          durationMs: Date.now() - startTime
        });
      });

      child.on('close', (code) => {
        this.activeProcess = null;
        resolve({
          command,
          exitCode: code !== null ? code : 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          durationMs: Date.now() - startTime
        });
      });
    });
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.activeProcess) {
      try {
        this.activeProcess.kill();
      } catch (e) {}
      this.activeProcess = null;
    }
  }

  // Autonomous Agent Loop (ReAct / Tool-Use Loop)
  async executeTask(taskPrompt, onProgress) {
    this.abortController = new AbortController();
    const workspaceInfo = this.workspaceRoot 
      ? `Thư mục dự án hiện tại (Workspace Root): "${this.workspaceRoot}".`
      : `Chưa mở thư mục dự án cụ thể (Đang chạy tại thư mục mặc định).`;

    const systemPrompt = `Bạn là VinceZone Studio Autonomous AI Agent - Kỹ sư lập trình cấp cao tích hợp trong IDE (tương tự Cursor Agent, OpenCode, VSCode Copilot).
${workspaceInfo}

BẠN CÓ ĐẦY ĐỦ QUYỀN HẠN TỰ DO ĐỂ TRỰC TIẾP SỬA CODE, TẠO FILE VÀ CHẠY TERMINAL TRÊN MÁY TÍNH CỦA NGƯỜI DÙNG:
1. Đọc nội dung file để hiểu cấu trúc và tìm lỗi (read_file).
2. Tạo hoặc ghi đè file (write_file).
3. Sửa từng đoạn code chính xác trong file (edit_file).
4. Liệt kê các file trong thư mục (list_dir).
5. Tự do chạy lệnh trong PowerShell hoặc CMD (run_command) để cài đặt package (npm, pip, cargo...), chạy kiểm thử (npm test, pytest...), chạy build, debug hoặc kiểm tra git status.

QUY TẮC HOẠT ĐỘNG:
- Luôn suy nghĩ logic trước khi hành động.
- Khi được giao nhiệm vụ sửa lỗi hoặc viết tính năng: hãy chủ động đọc file liên quan, viết/sửa code, sau đó dùng lệnh terminal để chạy thử nghiệm hoặc kiểm tra kết quả ngay lập tức.
- Nếu gặp lỗi sau khi chạy lệnh: đọc thông báo lỗi, tự động sửa code tiếp và chạy lại cho đến khi hoàn thành nhiệm vụ!
- Khi hoàn tất, giải thích ngắn gọn, rõ ràng những gì bạn đã làm bằng tiếng Việt.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: taskPrompt }
    ];

    const toolsDefinition = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Đọc nội dung văn bản của một file trong dự án.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Đường dẫn tương đối hoặc tuyệt đối tới file cần đọc.' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Tạo mới hoặc ghi đè toàn bộ nội dung của một file.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Đường dẫn file cần ghi.' },
              content: { type: 'string', description: 'Nội dung file cần lưu.' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: 'Thay thế một đoạn mã chính xác trong file mà không cần ghi đè toàn bộ file.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Đường dẫn file cần sửa.' },
              target: { type: 'string', description: 'Đoạn mã gốc cần thay thế (phải khớp chính xác).' },
              replacement: { type: 'string', description: 'Đoạn mã mới thay thế vào.' }
            },
            required: ['path', 'target', 'replacement']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_command',
          description: 'Chạy một câu lệnh dòng lệnh trong PowerShell hoặc CMD trên máy tính và nhận lại output.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Câu lệnh cần thực thi (vd: npm test, git status, node server.js).' },
              shell: { type: 'string', enum: ['powershell', 'cmd'], description: 'Loại shell thực thi (mặc định: powershell).' }
            },
            required: ['command']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_dir',
          description: 'Liệt kê danh sách các file và thư mục con trong một đường dẫn.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Đường dẫn thư mục (mặc định: . cho thư mục gốc).' }
            }
          }
        }
      }
    ];

    let step = 0;
    const maxSteps = 15;

    while (step < maxSteps) {
      step++;
      if (onProgress) onProgress({ type: 'status', message: `Đang suy nghĩ bước ${step}...` });

      const payload = {
        model: this.model,
        messages,
        tools: toolsDefinition,
        tool_choice: 'auto',
        temperature: 0.2
      };

      let response;
      try {
        response = await fetch(this.gatewayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(payload),
          signal: this.abortController.signal
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          return { status: 'cancelled', message: 'Tác vụ đã bị người dùng dừng lại.' };
        }
        throw new Error(`Lỗi kết nối AI Gateway (${this.gatewayUrl}): ${err.message}`);
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI Gateway lỗi (${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      const choice = resJson.choices && resJson.choices[0];
      if (!choice || !choice.message) {
        throw new Error('Không nhận được phản hồi hợp lệ từ AI Model.');
      }

      const aiMessage = choice.message;
      messages.push(aiMessage);

      if (aiMessage.content && onProgress) {
        onProgress({ type: 'thought', content: aiMessage.content });
      }

      // Check if model called any tools
      const toolCalls = aiMessage.tool_calls || [];
      if (toolCalls.length === 0) {
        // No more tool calls, agent has finished!
        if (onProgress) onProgress({ type: 'done', finalAnswer: aiMessage.content });
        return {
          status: 'success',
          finalAnswer: aiMessage.content,
          stepsCount: step
        };
      }

      // Execute each tool call requested by AI
      for (const call of toolCalls) {
        const fnName = call.function.name;
        let args = {};
        try {
          args = typeof call.function.arguments === 'string' 
            ? JSON.parse(call.function.arguments) 
            : call.function.arguments;
        } catch (e) {
          args = {};
        }

        if (onProgress) {
          onProgress({ type: 'tool_call', toolName: fnName, args, id: call.id });
        }

        let toolResult = '';
        try {
          if (fnName === 'read_file') {
            toolResult = await this.readFile(args.path);
          } else if (fnName === 'write_file') {
            toolResult = await this.writeFile(args.path, args.content);
            if (onProgress) onProgress({ type: 'file_changed', path: args.path, action: 'write' });
          } else if (fnName === 'edit_file') {
            toolResult = await this.editFile(args.path, args.target, args.replacement);
            if (onProgress) onProgress({ type: 'file_changed', path: args.path, action: 'edit' });
          } else if (fnName === 'run_command') {
            const cmdRes = await this.runCommand(args.command, args.shell);
            toolResult = `Exit Code: ${cmdRes.exitCode}\nSTDOUT:\n${cmdRes.stdout || '(không có output)'}\nSTDERR:\n${cmdRes.stderr || '(không có lỗi)'}`;
            if (onProgress) onProgress({ type: 'terminal_output', ...cmdRes });
          } else if (fnName === 'list_dir') {
            toolResult = await this.listDirectory(args.path || '.');
          } else {
            toolResult = `Lỗi: Công cụ không xác định: ${fnName}`;
          }
        } catch (toolErr) {
          toolResult = `Lỗi thực thi công cụ [${fnName}]: ${toolErr.message}`;
        }

        if (onProgress) {
          onProgress({ type: 'tool_result', toolName: fnName, result: toolResult, id: call.id });
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
        });
      }
    }

    return {
      status: 'max_steps_reached',
      message: 'Đã hoàn thành số bước xử lý tối đa cho nhiệm vụ này.'
    };
  }
}

module.exports = AgentEngine;
