# Cubitix Studios Bot — Bản LTS v3.1.4

> **182 bài kiểm tra tự động đều ĐẠT** (`npm run selftest`, không cần mạng, không cần token).
> Bản này nâng cấp trực tiếp từ **v3.1.0-LTS**, giữ nguyên toàn bộ tính năng cũ.

---

## 1. Captcha — nâng cấp toàn diện

`modules/core/captcha.js` được **viết lại toàn bộ** (389 → ~1.070 dòng).

| Trước (3.1.0) | Sau (3.1.4) |
| --- | --- |
| 5 loại câu đố | **12 loại câu đố** |
| Tối đa 5 đáp án (1 hàng) | **Tối đa 10 đáp án**, tự chia 2 hàng cân đối |
| Một lượt duy nhất | **2 lượt** (sai lần đầu được đổi câu đố khác) |
| Không có độ khó | **3 mức độ khó** tự điều chỉnh |
| Không chống bấm bừa | **Khoá tạm 10 phút sau 4 lần sai** |
| Random thường | **`secureRandom`** (không đoán được) |

**12 loại câu đố:** đếm emoji · toán học · dãy số · đếm chữ · tìm kẻ lạc loài · vị trí · so sánh · chẵn/lẻ · phân loại nhóm · toán bằng emoji · đảo chữ · đọc giờ.

**Bảy lớp bảo vệ mới:**

1. **Chống trả lời siêu nhanh** — dưới `minAnswerMs` (450ms) là không thể của người thật.
2. **Chống bấm nhiều nút liên tục** (`multiClickMs`) — bấm quét hết nút bị phát hiện.
3. **`nonce` ngẫu nhiên cho mỗi lượt** — không thể đoán trước id nút đúng.
4. **Chỉ người được hỏi mới bấm được**, người khác bấm nhận báo riêng.
5. **Khoá tạm** khi sai quá nhiều lần — tránh dò đáp án bằng máy.
6. **Chống chạy đè câu đố** (`hasActive`) — mỗi người chỉ có 1 câu đố tại một thời điểm.
7. **Tự dọn rác** (`prune`) — không để rò rỉ bộ nhớ khi bot chạy nhiều tháng.

Giao diện cũng đỉnh hơn: thanh thời gian, hiện lượt thứ mấy, giải thích lý do bị hỏi, embed kết quả riêng cho từng trường hợp, tự xoá tin nhắn sau 20s.

Hàm mới xuất ra: `isLocked`, `lockInfo`, `clearLock`, `hasActive`, `reset`, `prune`, `stats`, `TYPES`, `TYPE_LABELS`.

---

## 2. Cá — thêm 169 loài mới (701 → **870 loài**)

Tầng độ hiếm sau khi thêm (ưu tiên độ hiếm thấp đúng yêu cầu):

| Độ hiếm | Số loài | Thêm mới |
| --- | --- | --- |
| common | 252 | +45 |
| uncommon | 203 | +38 |
| rare | 156 | +32 |
| epic | 121 | +25 |
| mythic | 41 | +12 |
| legendary | 36 | +9 |
| fable | 32 | +5 |
| hidden | 29 | +3 |

Đã kiểm tra: **0 id trùng, 0 tên trùng**, mọi độ hiếm đều có loài, `pickCatch()` chạy 3.000 lần không lỗi.

---

## 3. Bể cá (`aquarium`) — chia trang

File mới **`modules/core/aquariumView.js`** dựng giao diện bể cá chia trang, dùng chung cho cả `aquarium` và `fish`.

- **10 loài / trang**, nút ⏮️ ◀️ ▶️ ⏭️ + nút hiện số trang.
- **Lọc theo độ hiếm** (menu 9 mục: tất cả + 8 bậc).
- **Sắp xếp 4 kiểu**: độ hiếm · số lượng · giá trị · tên.
- Nút ↻ làm mới và ✖ đóng bảng; hết thời gian thì nút tự mờ đi.
- Chỉ người mở bảng bấm được (người khác nhận báo riêng), theo đúng nền nếp của `fishtop`.

Đã thứ với bể **900 con / 471 loài**: không trang nào vượt giới hạn embed của Discord, số trang quá lớn hoặc âm đều bị kẹp lại đúng.

---

## 4. Gộp `dashboard` vào `antiabuse` (có slash)

Hai lệnh nay còn **một lệnh duy nhất: `antiabuse`** (đã đăng ký `/antiabuse`).

- **Alias giữ cả tên cũ**: `chonggianlan, chongbot, antibot, antialt, chongclone, aa, dashboard, bangdieukhien, dash, trungtam, ownerpanel, dieukhien` — ai quen gõ `dashboard` vẫn dùng được.
- **9 trang trong cùng một bảng**, đổi trang bằng menu: Chính · Danh sách bị gắn cờ · Cụm acc clone · Sổ tay · Tổng quan hệ thống · Công tắc toàn cục · Hệ thống xứ lý · Sức khoẻ máy móc · Dữ liệu & bảo dưỡng.
- **21 lựa chọn** cho lệnh ghạch chéo, mở thẳng từng trang: `overview`, `switches`, `sanction`, `health`, `data`.
- **Không mất tính năng nào**: toàn bộ nút của `dashboard` (công tắc tổng, bật/tắt tất cả, đặt lại, mức độ xứ lý, lưu đĩa, dọn dữ liệu, dựng lại chỉ mục, xuất file) đều còn, chỉ đổi tiền tố nút `db:` → `aa:`.
- **Bỏ phần trùng**: trang "Phát hiện gian lậ̣n" của `dashboard` bị bỏ vì `antiabuse` đã có sẵn (chi tiết hơn).
- Phần dựng giao diện của `dashboard` được tách ra file dùng chung **`modules/core/dashboardViews.js`**.
- File cũ `modules/commands/owner/dashboard.js` đã **xoá**.

---

## 5. Chống bot/macro — CHỈ tính khi người chơi **gõ lệnh**

Đây là thay đổi quan trọng nhất về sự công bằng.

**Hợp đồng mới (ghi thành code, không chỉ là lời hứa):**

| Hành động của người chơi | Có bị tính điểm nghi? |
| --- | --- |
| Gõ lệnh prefix hoặc lệnh gạch chéo | **Có** — đúng mục đích của hệ thống |
| Chat bình thường | **Không** — chỉ được **hạ** điểm nghi |
| Bấm nút / chọn menu khi chơi (câu cá, xì dách, slots, bảng xếp hạng…) | **Không** |
| Bấm nút giveaway, nút báo án | **Không** |

**Chặn ở hai tầng để không bao giờ lọt:**

1. `modules/core/antiAutomation.js` — `observe()` nhận thêm `source`; bất kỳ `source` khác `'command'` đều bị trả về ngay, **không tạo hồ sơ, không ghi nhịp gõ**.
2. `modules/core/abuseGuard.js` — `guard()` thoát sớm nếu không có `command` hoặc nếu ngữ cảnh là nút bấm (`ctx.isComponent`), và chỉ gọi `observe({ source: 'command' })`.

### Kết quả soát các hệ thống khác (theo yêu cầu "kiểm tra xem những hệ thống khác có bị tương tự")

| Hệ thống | Nhận dữ liệu từ đâu | Kết luậ̣n |
| --- | --- | --- |
| Chống macro (`antiAutomation`) | chỉ `abuseGuard.guard()` | Đã sửa: chỉ nhận lệnh |
| `abuseGuard.guard()` / `after()` | chỉ `modules/core/runner.js` | Đúng — runner chỉ chạy khi có lệnh |
| `noteMessage()` (tin nhắn) | `messageCreate` | An toàn — **chỉ hạ** điểm nghi, không bao giờ tăng |
| `noteJoin()` (vào server) | `guildMemberAdd` | Đúng việc — dùng cho acc clone, không phải macro |
| Chống acc clone (`antiAlt`) | hồ sơ + lệnh | Không liên quan nhịp bấm nút |
| Hệ thống xứ lý (`sanctionEngine`) | bằng chứng từ đường lệnh | Số tin nhắn chỉ **giảm** độ tin chắc |
| Chống spam chat (`antiSpam`) | `messageCreate` | Hệ thống riêng để dọn spam, **không** nạp điểm nghi macro |
| Nút bấm khi chơi | collector trong từng lệnh | Không đi qua `guard()` — đã kiểm tra toàn bộ |

---

## 6. Lỗi đã tìm ra và sửa

1. **Mô tả lệnh `antiabuse` dài 120 ký tự** — Discord chỉ cho 100 → **đăng ký slash sẽ bị từ chối**. Đã rút xuống 86 ký tự.
2. **Captcha bị khoá tạm hoặc đang chờ vẫn bị tính là "trượt"** → một lần sai bị phạt nhiều lần. Đã sửa ở cả `guard()` và `selfVerify()`.
3. **`pickCatch()` có thể làm bot vỡ** nếu một bậc độ hiếm không còn loài nào → đã thêm lối thoát an toàn.
4. **35 loài cá trùng tên** (khác nhau chỉ ở chứ hoa/thường, ví dụ *Cá bống cát* và *Cá Bống Cát*) → thay bằng 35 loài mới hoàn toàn.
5. **4 chỗ chữ bị hỏng thành dấu `�`** (emoji điểm tin cậy trong bảng chủ bot, chữ "bạn" trong tin nhắn người chơi thấy, emoji con rùa, tên một bài kiểm tra) → đã sửa hết.
6. **Bể cá nhiều cá làm embed tràn giới hạn Discord** → đã chia trang.
7. **Bài kiểm tra captcha cũ chặn ở 5 đáp án** → nới lên 10 và kiểm tra đủ 12 loại câu đố.
8. **Lỗi chính tả**: "dự liệu" → "dữ liệu", "công tắt" → "công tắc".
9. **Các chỗ còn nhắc lệnh `dashboard` đã bị xoá** (trong `sanction`, `maintenance`, README, hướng dẫn) → đã trỏ sang `antiabuse`.

---

## 8. File đã thêm / sửa / xoá

**Thêm (3 file)**

```
modules/core/aquariumView.js      giao diện bể cá chia trang
modules/core/dashboardViews.js    5 trang chuyển từ lệnh dashboard
CHANGELOG_LTS_v3.1.4.md           chính file này
```

**Sửa (13 file)**

```
modules/core/captcha.js                 viết lại toàn bộ
modules/core/fishing.js                 +169 loài cá, sửa pickCatch, sửa tên trùng
modules/core/antiAutomation.js          chỉ nhận dữ liệu từ lệnh (source)
modules/core/abuseGuard.js              hợp đồng chỉ-tính-lệnh + sửa lỗi captcha
modules/commands/fishing/aquarium.js    chia trang, lọc, sắp xếp
modules/commands/fishing/fish.js        dùng chung aquariumView
modules/commands/owner/antiabuse.js     gộp toàn bộ dashboard vào
modules/commands/owner/sanction.js      trỏ sang lệnh antiabuse
modules/commands/owner/maintenance.js   sửa chú thích lệnh cũ
tools/selftest.js                       +13 bài kiểm tra mới
package.json                            3.1.0-LTS -> 3.1.4-LTS
README.md                               cập nhật số liệu & mục bảng gộp
HUONG_DAN_SU_DUNG.txt                   cập nhật hướng dẫn tiếng Việt
```

**Xoá (1 file)**

```
modules/commands/owner/dashboard.js     đã gộp vào antiabuse.js
```

---
