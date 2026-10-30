# VinceZone AI Workplay & Unified Gateway

Ứng dụng **Workplay & AI Gateway** giúp bạn gom tất cả các nhà cung cấp AI API (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Groq, Ollama, hoặc bất kỳ Custom API nào) vào một đầu mối duy nhất tương tự như OpenCode / LiteLLM.

## Tính Năng Nổi Bật

1. **Giao diện chuẩn Minimalism Dark Theme:**
   - Nền đen sâu (`#000000`, `#09090b`), chữ trắng tương phản cao (`#ffffff`, `#f4f4f5`), và các chi tiết phụ viền/thẻ màu xám tinh tế (`#27272a`, `#3f3f46`, `#71717a`).

2. **Workplay (AI Playground):**
   - Thử nghiệm trực tiếp các mô hình AI với luồng Streaming thời gian thực (SSE).
   - Tùy chỉnh `System Prompt`, `Temperature`, `Max Tokens`.
   - Hiển thị Markdown, khối code và trạng thái phản hồi.

3. **Providers Hub (Gom các AI API):**
   - Thêm/Sửa/Xóa và Bật/Tắt các nhà cung cấp:
     - **OpenAI:** `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`...
     - **Google Gemini:** `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-1.5-flash`...
     - **Anthropic Claude:** `claude-3-7-sonnet`, `claude-3-5-sonnet`, `claude-3-5-haiku`...
     - **OpenAI-Compatible:** DeepSeek, Groq, OpenRouter, Mistral, Ollama (Local), vLLM, LM Studio.
   - Nút **"Ping Test"** kiểm tra kết nối và đo độ trễ (latency ms) tức thì.

4. **Unified API Gateway (Gọi API vào ứng dụng):**
   - Cung cấp endpoint chuẩn OpenAI:
     `POST http://localhost:3000/v1/chat/completions`
   - Quản lý **Gateway Access Keys** (dạng `Bearer vz_live_...`).
   - Tự động chuyển đổi định dạng (adapter conversion) giữa chuẩn OpenAI sang định dạng của Google Gemini và Anthropic Claude, giúp ứng dụng bên ngoài chỉ cần dùng 1 SDK duy nhất để gọi mọi AI.

5. **Audit Logs & Giám sát:**
   - Theo dõi từng lượt gọi API: Thời gian, Endpoint, Model, Provider, Client IP, HTTP Status, Độ trễ (ms), và lượng Tokens tiêu thụ.

---

## Hướng Dẫn Khởi Chạy

### 1. Cài đặt phụ thuộc:
```bash
npm install
```

### 2. Khởi chạy server:
```bash
npm start
```
* **Giao diện Workplay Web:** [http://localhost:3000](http://localhost:3000)
* **Điểm cuối API Gateway:** `http://localhost:3000/v1/chat/completions`

---

## Cách Gọi API Từ Ứng Dụng Bên Ngoài

### cURL:
```bash
curl -X POST "http://localhost:3000/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <GATEWAY_API_KEY>" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      { "role": "user", "content": "Xin chào từ cURL!" }
    ]
  }'
```

### Python (Sử dụng thư viện `openai` chính thức):
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="vz_live_your_gateway_key"
)

response = client.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[
        {"role": "user", "content": "Xin chào từ Python!"}
    ]
)
print(response.choices[0].message.content)
```
