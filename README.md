# Nông Trại 1 Mùa — Oakshire Valley

## Chạy game

Game tải `data.json` bằng `fetch`, vì vậy cần chạy qua web server, không mở `index.html` trực tiếp bằng `file://`.

Trong PowerShell, chạy:

```powershell
cd C:\Users\Admin\farm-game
python -m http.server 8931
```

Mở <http://localhost:8931> trong trình duyệt. Nhấn `Ctrl+C` để dừng server.

## Phím điều khiển

- `WASD` hoặc phím mũi tên: đi bộ; `Shift`: chạy; nhấp vào bản đồ: đi tới vị trí đó.
- Click an empty plot to choose a seed; click a planted crop to water or harvest it.
- `E`: plant at the nearest plot; `F`: water; `Space`: harvest; `B`: workshops; `M`: hire workers; `P`: go fish; `Esc`: sleep.
- `I`: open storage; `Q`: quests; `C`: villagers; `Z`: auto farm; `K`: handbook; `M`: workers; `P`: fishing.
- Trên điện thoại, dùng joystick và nút hành động trên màn hình.

## File chính

- `index.html`: cấu trúc màn chơi.
- `styles.css`: giao diện pixel-art và responsive.
- `app.js`: di chuyển, trồng trọt, thời tiết, chế biến, chợ, làng, câu cá và lưu game.
- `data.json`: cây trồng, công thức, thời tiết, sự kiện, vật nuôi, đơn hàng và nhiệm vụ.
- `assets/farm-map-v2.png`: background map with 15 aligned planting spots.

Tiến trình tự lưu trong `localStorage` của trình duyệt. Sổ tay cho phép tạo mã lưu để chuyển tiến trình sang thiết bị khác. Đăng nhập Google, đồng bộ đám mây và quảng cáo thật chưa được nối trong bản demo.
