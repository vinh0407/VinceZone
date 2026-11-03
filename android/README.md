# VinceZone Mobile (Native Android Kotlin)

Phiên bản ứng dụng Android Native thuần Kotlin cho VinceZone AI Gateway. Thiết kế theo ngôn ngữ hiện đại tối giản phong cách ChatGPT:
- **Tone màu chủ đạo**: Nền đen (`#09090b`), chữ trắng (`#ffffff`), điểm nhấn xám kim loại (`#27272a`, `#3f3f46`, `#71717a`).
- **Giao diện**:
  - Thanh header tối giản với Model selector pill hiển thị model miễn phí `kilo-auto/free` ⚡.
  - Nút mở drawer lịch sử chat, nút tạo chat mới, nút cài đặt.
  - Màn hình khởi đầu với Logo VinceZone và các gợi ý prompt tiện lợi (Code, Tạo ảnh, Giải thích kỹ thuật...).
  - Khung nhập tin nhắn dạng viên thuốc bo tròn (Pill input) kèm nút gửi tròn dạng mũi tên hướng lên đặc trưng.
  - Hỗ trợ xem lịch sử các đoạn chat ngay trong Navigation Drawer.
  - Màn hình cài đặt địa chỉ Gateway (`server_url`) và API key tùy chọn.

---

## 🚀 Hướng Dẫn Mở & Build Ứng Dụng

### Yêu cầu
- Android Studio Iguana / Jellyfish / Koala (hoặc mới hơn)
- JDK 17
- Android SDK 34 (Android 14)

### Cách mở dự án
1. Khởi động **Android Studio**.
2. Chọn **Open** và duyệt tới thư mục `c:\VisualStudio\VinceZone\android`.
3. Chờ Gradle đồng bộ (Sync Project with Gradle Files).
4. Nhấn **Run 'app'** (`Shift + F10`) để chạy trên máy ảo hoặc thiết bị Android thật.

### Cấu hình kết nối Gateway
- **Android Emulator**: Sử dụng địa chỉ mặc định `http://10.0.2.2:3000` (đây là IP loopback trỏ về máy tính host đang chạy VinceZone server).
- **Thiết bị thật kết nối chung mạng Wi-Fi**: Vào Cài đặt trong app, đổi địa chỉ thành `http://<IP-MÁY-TÍNH>:3000` (ví dụ: `http://192.168.1.15:3000`).
- Mặc định ứng dụng đã được cấu hình chạy model miễn phí: `kilo-auto/free`.
