# Nông Trại 1 Mùa — Oakshire Valley (3D)

Bản 3D diorama (Three.js): camera góc cao ~58°, tilt-shift, màu pastel, map mở rộng (cầu gỗ, hồ, đảo rương, cột đá phát sáng dịch chuyển), art phong cách cartoon isometric viền nâu mềm — nhà bản 5 (chuồng đỏ lớn, khung gỗ trắng, cối xay gió), Arthur bản 4 (khăn bandana đỏ, cầm chĩa), bò bản 5 (Jersey nâu nhạt gặm cỏ).

## Chạy game

`index.html` là file duy nhất, tự chứa toàn bộ code + dữ liệu (Three.js nhúng local, không cần CDN). Vẫn cần chạy qua web server (không mở bằng `file://`):

```powershell
cd C:\Users\Admin\farm-game
python -m http.server 8931
```

Mở <http://localhost:8931> trong trình duyệt. Nhấn `Ctrl+C` để dừng server.

## Phím điều khiển

- `WASD` hoặc phím mũi tên: đi bộ; `Shift`: chạy; chạm/click vào bản đồ: đi tới vị trí đó (không còn joystick).
- Click ô đất trống để chọn hạt; click cây đã trồng để tưới/thu hoạch; click ao để câu cá.
- `E`: gieo; `F`: tưới; `Space`: thu hoạch; `B`: xưởng chế biến; `M`: thuê nhân công; `P`: câu cá; `Esc`: ngủ.
- `I`: kho; `Q`: nhiệm vụ; `C`: dân làng; `Z`: tự farm; `K`: sổ tay.
- Không có thanh máu/tim. Thời tiết thật (nắng/mưa/âm u/gió) đổi cả hiệu ứng lẫn màu cảnh.

## Luật chơi

1 mùa 30 ngày, 15 ô đất, 15 cây, 14 công thức chế biến, nhân công ăn cơm, 4 dân làng + đơn hàng mỗi sáng, sự kiện ngày 10/15/22/28, ao câu cá 4 loại cá, chợ. Tiến trình tự lưu trong `localStorage` (`nong-trai-1-mua-save-v16`). Đăng nhập Google, đồng bộ đám mây và quảng cáo thật chưa được nối trong bản demo.

## File

- `index.html`: toàn bộ game 3D (file duy nhất).
- `v16-2d/`: bản 2D DOM v16 cũ (index.html, styles.css, app.js, data.json, assets/) — giữ lại làm lịch sử, không dùng cho bản 3D.
