# Taste Skill & Visual Frontend Design Guide

Bộ skill định hình thẩm mỹ và phong cách thiết kế giao diện đỉnh cao (Taste Frontend), giúp AI tạo ra UI/UX hiện đại, có chiều sâu, loại bỏ hoàn toàn các thiết kế generic, thô sơ hoặc lỗi thời.

## 1. design-taste-frontend / design-taste-frontend-v1
- **Mục tiêu**: Định hình tư duy thẩm mỹ (Design Taste) cho Web/Mobile App.
- **Nguyên tắc cốt lõi**:
  - Tỉ lệ khoảng cách (Spatial Rhythm): Sử dụng grid 8pt/4pt nghiêm ngặt, padding cân xứng, phân cấp visual hierarchy rõ ràng qua kích thước chữ và trọng lượng font.
  - Phối màu (Sophisticated Palettes): Tránh màu neon rực rỡ quá mức; sử dụng Dark Theme sâu (#09090b, #121215, #18181b) kết hợp viền mờ (subtle borders #27272a) và accent color có chủ đích.
  - Micro-interactions: Hiệu ứng hover, focus mượt mà (transitions 150-200ms cubic-bezier), cursor pointer đúng chuẩn, active state rõ ràng.

## 2. gpt-taste
- **Mục tiêu**: Kỹ thuật prompt tinh chỉnh để các mô hình LLM sinh code HTML/CSS đạt chuẩn nghệ thuật cao cấp.
- **Áp dụng**: Ép mô hình tuân thủ typography hiện đại (Inter, Plus Jakarta Sans, Geist, SF Pro), độ tương phản WCAG AAA, và layout Bento-grid hoặc Card-deck hiện đại.

## 3. high-end-visual-design
- **Mục tiêu**: Tạo nên các sản phẩm web có visual cao cấp như Linear, Stripe, Vercel, Apple.
- **Đặc trưng**:
  - Gradient viền (border glow/gradient strokes).
  - Background blurs (`backdrop-filter: blur(12px)`).
  - Glassmorphism tinh tế.
  - Phân vùng nội dung thoáng đãng, nhiều khoảng thở (white-space).

## 4. stitch-design-taste
- **Mục tiêu**: Đồng bộ phong cách giữa các component và module con trong một hệ thống lớn, tránh việc mỗi trang một kiểu.
