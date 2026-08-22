# 📦 Cubitix Studios — Bản LTS v3.1.0

> Bản LTS (hỗ trợ dài hạn) nâng cấp từ `3.0.0-LTS`.
> Toàn bộ 168 bài kiểm tra tự động đều ĐẠT (`npm run selftest`).

---

## 🎯 Tóm tắt

Bản này tập trung vào **3 hệ thống lõi** và **trung tâm điều khiển cho chủ bot**:

| # | Hệ thống | Trạng thái |
|---|----------|------------|
| 1 | 🤖 Chống bot/macro tự động (`antiAutomation`) | Nâng cấp độ chính xác + hiệu năng |
| 2 | 👥 Chống acc clone (`antiAlt`) | Nâng cấp độ chính xác + hiệu năng |
| 3 | ⚖️ Đánh giá & xử lý warn / mute / ban | **MỚI HOÀN TOÀN** |
| 4 | 🎛️ Trung tâm điều khiển chủ bot (`dashboard`) | **MỚI HOÀN TOÀN** |

---

## ⚖️ Hệ thống 3 (MỚI): Đánh giá — Quyết định — Xử lý

Trước đây bot chỉ biết **chặn lệnh tạm thời**. Nay bot có một "toà án" thật sự:

### Các mức xử lý

| Mức | Nghĩa | Hiệu lực |
|-----|-------|----------|
| 🟢 `none` | Không xử lý | — |
| 🔵 `notice` | Nhắc nhở nhẹ | Chỉ nhắn riêng, không phạt |
| 🟡 `warn` | **Cảnh cáo** | Ghi vào hồ sơ, tự hết hạn sau 30 ngày |
| 🟠 `mute` | **Không cho chơi bot tạm thời** | Thang leo dần: 1 giờ → 6 giờ → 1 ngày → 3 ngày → 7 ngày |
| 🔴 `ban` | **Cấm dùng bot vĩnh viễn** | Đến khi chủ bot tha |

### Nguyên tắc "xử đúng người, đúng tội"

- **Chấm điểm 6 nhóm bằng chứng** có trọng số: macro (26), acc clone (24), né tránh captcha (14), kinh tế/dồn xu (14), mất tin cậy (10), tái phạm (12).
- **Độ tin cậy (confidence)**: mỗi mức án đòi một mức tin cậy tối thiểu
  (nhắc nhở 0.25 · cảnh cáo 0.45 · mute 0.62 · ban 0.85).
  → **Ít dữ liệu thì không bao giờ ra án nặng.**
- **Cần nhiều bằng chứng độc lập**: một dấu hiệu đơn lẻ bị trừ điểm
  (`lonelySignalPenalty`), nhiều nguồn khớp nhau thì được cộng (`corroborationBonus`).
- **Không ban ngay lần đầu** (`neverBanFirstOffence`) — phải leo thang
  cảnh cáo → mute → mute → mute → ban, trừ trường hợp bằng chứng cực nặng.
- **Chờ nguội (cooldown 45 phút)**: vừa xử lý xong thì không phạt lại ngay,
  tránh phạt nhiều lần cho cùng một hành vi.
- **Miễn trừ**: người trong danh sách tin cậy không bao giờ bị xử lý.
- **Chế độ chỉ quan sát** (`observeOnly`): bot đánh giá và ghi log nhưng KHÔNG phạt —
  dùng để chạy thử trước khi bật thật.
- **Lệnh cứu trợ luôn dùng được** dù đang bị ban:
  `verify`, `khangnghi`, `appeal`, `help`, `ping`, `botinfo`, `invite`.

### 4 mức độ cài sẵn

`lenient` (Nhẹ nhàng) · `balanced` (Cân bằng — mặc định) · `strict` (Nghiêm ngặt) · `ironfist` (Sắt đá)

### Kháng nghị

Người bị oan gõ `khangnghi` (hoặc `appeal`) để trình bày. Chủ bot nhận thông báo
kèm **nút bấm xử lý nhanh** (tha / miễn trừ / cấm vĩnh viễn) ngay trong tin nhắn.

---

## 🎛️ Trung tâm điều khiển mới: `dashboard`

Lệnh: `dashboard` (hoặc `bangdieukhien`, `dash`, `trungtam`, `ownerpanel`, `dieukhien`).

**7 trang, chuyển qua lại bằng nút, không cần gõ lại lệnh:**

1. **Tổng quan** — tình trạng 3 lá chắn + danh sách **"Việc cần bạn để ý"** (kháng nghị đang chờ, hệ thống đang tắt, chế độ chỉ quan sát...).
2. **Công tắc** — bật/tắt từng hệ thống trên **mọi máy chủ**, bật tất cả / tắt tất cả / trả về mặc định.
3. **Phát hiện** — acc đang bị đánh dấu, các cụm acc clone, quét lại cụm.
4. **Xử lý** — số án đang treo, đổi mức độ cài sẵn, xem hồ sơ, tha bổng toàn bộ.
5. **Sức khoẻ** — RAM, CPU, thời gian chạy, độ trễ, phiên bản Node/discord.js.
6. **Dữ liệu** — lưu xuống ổ đĩa, dọn dữ liệu cũ, dựng lại cụm, **xuất báo cáo JSON** tải về được.
7. **Nhật ký** — nhật ký hành động gần đây.

---

## 🚀 Nâng cấp hệ thống 1 & 2

### Độ chính xác

- **Dồn xu**: trước chỉ đếm **số lần** chuyển (10 lần × 1 xu bị chấm như 10 lần × 100.000 xu).
  Nay xét cả **số lần** và **số tiền**, lấy mức cao hơn.
- **Vai "đầu mối" (hub)**: acc chính nhận xu từ nhiều acc clone trước đây luôn thoát
  (vì nó lâu năm, có avatar, chat nhiều). Nay có dấu hiệu riêng cho vai đầu mối.
- **Dấu hiệu "thuộc cụm lớn"**: càng nhiều acc trong cùng cụm thì điểm càng cao.
- **Bộ giảm nhiễu người thật**: người có chat thật sẽ được giảm điểm nghi macro
  (`noteHuman`) — trước đây hàm này **không được gọi ở đâu cả** (xem phần Sửa lỗi).
- **Độ tin cậy** cho điểm rủi ro acc clone: dựa trên lượng dữ liệu, số dấu hiệu mạnh
  và độ đa dạng bằng chứng.

### Hiệu năng

- **Chỉ mục liên kết** (`linkedTo`, `neighbourhood`): tra người có liên hệ trực tiếp
  bằng `O(bậc)` thay vì quét **toàn bộ** danh sách liên kết.
  → Áp dụng cho `checkTransfer` (chạy mỗi lần chuyển xu) và `candidateIds`.
- **Chỉ mục cạnh chuyển xu** (`fastEdgesOf`) thay cho quét toàn bảng.
- **Bộ nhớ đệm phân tích** + throttle: không phân tích lại cùng một người liên tục.
- **Dọn dữ liệu tự động** mỗi 6 giờ (hồ sơ cũ, án hết hạn).

---

## 🐞 Lỗi đã tìm ra và sửa

| # | Lỗi | Mức độ |
|---|-----|--------|
| 1 | `noteHuman()` — bộ giảm nhiễu người thật **chưa bao giờ được gọi**, nên người chat thật vẫn bị chấm điểm macro như nhau | 🔴 Nặng |
| 2 | `checkTransfer()` **nuốt lỗi im lặng** (`catch { return {ok:true} }`) — lỗi hệ thống biến mất không dấu vết, không thể debug | 🔴 Nặng |
| 3 | Mojibake (4 ký tự lỗi `U+FFFD`) trong tiêu đề embed người chơi nhìn thấy: `'[4 ký tự lỗi] Phát hiện dùng máy tự động'` → `'🤖 ...'` | 🟠 Vừa |
| 4 | `prune(true)` gọi sai chữ ký — hàm thật là `prune(now, force)`, nên `true` bị hiểu thành `now = 1` và **xoá sạch dữ liệu vừa ghi** | 🔴 Nặng |
| 5 | Đọc sai kết quả `globalSwitch.toggle()` (`st.on` thay vì `res.state.on`) | 🟠 Vừa |
| 6 | `amnesty()` trả về **số**, nhưng code đọc `res.count` → luôn hiện `undefined` | 🟠 Vừa |
| 7 | `Mathice(...)` — lỗi gõ gây `TypeError` khi chuẩn hoá bằng chứng | 🔴 Nặng |
| 8 | Bài kiểm tra chính tả **tự quét chính nó** nên không bao giờ chạy đúng | 🟡 Nhẹ |
| 9 | Hàng loạt lỗi chính tả tiếng Việt trong tin nhắn người chơi thấy: `dệ xu` → `dồn xu`, `chứ chơi` → `cứ chơi`, `đáng nghờ` → `đáng nghi`, `Dụng bảng` → `Dựng bảng`, `công tắt` → `công tắc` (6 chỗ), `MọI lỗi` → `Mọi lỗi`, `nứa` → `nữa`, `gủi` → `gửi` | 🟡 Nhẹ |

> Đã xác minh **không còn ký tự lỗi `U+FFFD`** nào trong toàn bộ mã nguồn.

### Đã kiểm tra và xác nhận KHÔNG phải lỗi (giữ nguyên)

- Captcha hết giờ do bot không tạo được collector: đã có `reason: 'error'` và
  **không phạt** người chơi trong trường hợp này → đúng.
- `help.js` tự dựng menu từ `client.commands`, nên 3 lệnh mới hiện ra tự động → không cần sửa.
- `Sò nứa` trong `fishing.js` là **tên vật phẩm hợp lệ**, không phải lỗi chính tả.

---

**168 bài kiểm tra / 10 nhóm**, chạy không cần mạng và không cần token:

1. Nạp được toàn bộ module
2. Khai báo lệnh hợp lệ (99 lệnh, 285 alias, không trùng)
3. Khai báo sự kiện
4. Hệ thống 1 — chống bot tự động
5. Hệ thống 2 — chống acc clone
6. Hệ thống 3 — bộ đánh giá
7. Kho lưu án
8. Tầng vận hành
9. Công tắc toàn cục & kho chống gian lận
10. Tiện ích chung (captcha, chính tả, đường dẫn `require`)

Bộ kiểm tra **tự sao lưu và phục hồi** `antiAbuse.json`, `sanctions.json`,
`globalSwitches.json` nên **không làm mất dữ liệu thật**.

---

## 📁 File đã thêm (8)

```
modules/core/sanctionEngine.js          Bộ não đánh giá mức độ nghiêm trọng
modules/core/sanctionStore.js           Kho lưu án, cảnh cáo, kháng nghị, hồ sơ
modules/core/sanctions.js               Tầng vận hành: chặn lệnh, nhắn tin, leo thang
modules/commands/owner/dashboard.js     Trung tâm điều khiển 7 trang cho chủ bot
modules/commands/owner/sanction.js      Lệnh xử lý thủ công (warn/mute/ban/tha)
modules/commands/utility/appeal.js      Lệnh kháng nghị cho người chơi
tools/selftest.js                       168 bài kiểm tra tự động
CHANGELOG_LTS_v3.1.0.md                 File này
```

## ✏️ File đã chỉnh sửa (14)

```
index.js                                Lưu đủ 4 kho khi tắt bot, dừng hẹn giờ gọn gàng
modules/core/antiAlt.js                 Dồn xu theo tiền, vai đầu mối, cụm lớn, độ tin cậy
modules/core/antiAutomation.js          noteHuman(), thêm tín hiệu, giảm nhiễu
modules/core/abuseStore.js              Chỉ mục liên kết/cạnh, thống kê mới, dọn dữ liệu
modules/core/abuseGuard.js              Nối hệ thống xử lý, sửa nuốt lỗi, tối ưu tra cứu
modules/core/globalSwitch.js            Nhật ký, lastClear(), setMany()
modules/core/captcha.js                 Thêm loại câu đố, sửa chính tả
modules/core/runner.js                  Thêm chốt kiểm tra án trước khi chạy lệnh
modules/events/ready.js                 Khởi động hẹn giờ hết án + dọn dữ liệu 6 giờ/lần
modules/events/interactionCreate.js     Nút xử lý nhanh cho chủ bot
modules/commands/utility/verify.js      Hiện thêm thông tin án, sửa chính tả
package.json                            3.0.0-LTS -> 3.1.0-LTS, thêm script selftest
README.md                               Tài liệu hệ thống 3 + trung tâm điều khiển
HUONG_DAN_SU_DUNG.txt                   Hướng dẫn tiếng Việt cho tính năng mới
```

---
