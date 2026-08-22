# 🤖 Cubitix Studios — Discord Bot All In One

Bot Discord "tất cả trong một" với giao diện embed đẹp, có hiệu ứng động,
nhiều màu sắc và đầy đủ thể loại lệnh. Viết bằng **discord.js v14**.

> 💡 Bạn KHÔNG cần biết code. Xem `HUONG_DAN_SU_DUNG.txt` để chạy bot chỉ
> bằng vài cú bấm chuột (có cả cách chạy ẩn, không hiện terminal).

---

## ✨ Tính năng nổi bật

- 🎨 Embed nhiều màu, biểu tượng, bố cục gọn gàng.
- 🎬 Hiệu ứng động: thanh loading, gõ chữ, pháo hoa, cầu vồng, "hack" vui, máy quay slots, xì dách.
- 🧩 Hỗ trợ cả lệnh **prefix** (`c`) lẫn lệnh **slash** (`/`).
- 💰 Hệ thống kinh tế: kiếm xu qua **đi làm, điểm danh (có chuỗi thưởng), cờ bạc** (slots/blackjack/coinflip) và **câu cá**. Các lệnh cờ bạc giới hạn cược **tối đa 250.000 xu/lượt** (áp dụng cả khi cược `all`). Bảng xếp hạng `top` **chia trang 10 người/trang** với nút ⏮️ ◀️ ▶️ ⏭️, menu đổi nhanh **5 hạng mục** (xu · cá · loài cá · may mắn · streak) và nút 🎯 nhảy thẳng tới hạng của chính bạn.
- 🎣 Hệ thống câu cá phong phú: **870 loài cá** qua 8 độ hiếm (common → hidden) với **tỉ lệ ra & giá bán đã cân bằng** (phí câu 10 xu — common 3 xu · uncommon 10 · rare 30 · epic 150 · mythic 1.000 · legendary 6.000 · fable 40.000 · hidden 150.000 xu) với hiệu ứng emoji động cho cá cực hiếm; bể cá (aquarium), bán cá, **Fishdex** lưu tiến độ trọn đời (không mất khi bán), thống kê (`fishstats`) và bảng xếp hạng cần thủ (`fishtop`). Lệnh `profile` xem hồ sơ tổng hợp.
- 🛡️ Quản lý hiện đại: **chống spam thông minh (antispam)**, **timeout/untimeout**, **unban**, kick, ban, clear, khóa kênh, cảnh cáo.
- 👋 **Chào mừng & Tạm biệt**: embed riêng cho người vào và người rời, **đếm lượt mời** (biết ai đã mời thành viên mới và người đó đã mời bao nhiêu người), bật/tắt bằng lệnh `!welcome` dành cho **quản trị viên**.
- ⏰ Đặt **nhắc nhở** theo thời gian (`remind`) và trạng thái **AFK** tự động.
- 🔳 Tạo **mã QR**, xem trước **màu HEX**, đố vui **trivia** (thử tài kiến thức), cho bot **chọn giúp**.
- 📊 Bình chọn nhiều lựa chọn (tối đa 10) và nhiều lệnh tương tác bằng nút bấm.
- 📚 Có lệnh `help` tự động gom nhóm theo danh mục.
- 🗂️ Cấu trúc thư mục rõ ràng, dễ mở rộng.

---

## 🗂️ Cấu trúc thư mục

```
CubitixStudios/
├── index.js                 # Điểm khởi động bot
├── config.js                # Đọc cấu hình từ .env
├── deploy-commands.js       # Đăng lệnh slash lên Discord
├── package.json
├── .env.example             # Mẫu biến môi trường (đổi tên thành .env)
├── CAI_DAT.bat              # Cài thư viện (1 lần)
├── START_BOT.bat            # Chạy bot (có cửa sổ)
├── START_BOT_AN_TERMINAL.vbs# Chạy bot ẨN (không hiện terminal)
├── TAT_BOT.bat              # Tắt bot
├── HUONG_DAN_SU_DUNG.txt    # Hướng dẫn chi tiết bằng tiếng Việt
└── modules/
    ├── core/                # Lõi dùng chung (embed, màu, animation, DB...)
    ├── handlers/            # Nạp lệnh & sự kiện
    ├── events/              # Sự kiện Discord (ready, message, ...)
    └── commands/            # Các lệnh, chia theo danh mục:
        ├── info/            # help, ping, botinfo, serverinfo, userinfo, avatar, roleinfo, servericon,
        │                   #   channelinfo, roles, membercount
        ├── fun/             # 8ball, cointoss, dice, rps, joke, ship, say, roast, quote, rate,
        │                   #   emojify, choose, wyr, fact, pray, curse
        ├── utility/         # poll, calc, timer, base64, embed, reverse, remind, qrcode, color, afk,
        │                   #   password, checklist, prefix
        ├── moderation/      # antispam, kick, ban, unban, clear, slowmode, lock, unlock, warn, timeout, untimeout,
        │                   #   nick, giverole
        ├── economy/         # cash (cũ: balance), give, profile, daily, work, leaderboard, shop, buy, quest
        ├── fishing/         # fish, aquarium, sellfish, fishdex, fishstats, fishtop
        ├── casino/          # slots, blackjack, coinflip, mines, highlow
        ├── games/           # guess, tictactoe, trivia
        ├── giveaway/        # giveaway, gwlist (quay thưởng có nút tham gia, lượt thưởng theo vai trò, huỷ đợt, reroll)
        └── animation/       # loading, hack, typewriter, firework, rainbow, matrix, heartbeat
```

---

## 🚀 Cài đặt nhanh

1. Cài **Node.js 18+** từ <https://nodejs.org>.
2. Đổi tên `.env.example` thành `.env`, điền `DISCORD_TOKEN` và `CLIENT_ID`.
3. Bấm đúp `CAI_DAT.bat` để cài thư viện.
4. Bấm đúp `START_BOT_AN_TERMINAL.vbs` (chạy ẩn) hoặc `START_BOT.bat`.

Gõ `!help` hoặc `/help` trong Discord để xem toàn bộ lệnh.

---

## 🧩 Cách thêm lệnh mới

Tạo một file `.js` trong thư mục danh mục tương ứng dưới `modules/commands/`,
và export theo mẫu:

```js
module.exports = {
  name: 'tenlenh',
  aliases: ['bidanh'],
  category: 'fun',
  description: 'Mô tả ngắn gọn về lệnh',
  usage: '<tham số>',
  cooldown: 3,
  slash: true,
  options: [{ name: 'noi_dung', type: 'string', description: '...', required: true }],
  async run(ctx) {
    await ctx.reply('Xin chào!');
  },
};
```

Bot sẽ tự động nạp lệnh mới khi khởi động lại.

---

© Cubitix Studios. Chúc bạn vui vẻ! 🎉

---

## 🔧 Chế độ bảo trì (chỉ chủ bot)

Lệnh `!baotri` (hay `!maintenance`, `/maintenance`) tạm khoá toàn bộ bot khi bạn cần
cập nhật hoặc bảo trì máy chủ. Khi bật, **mọi lệnh prefix và slash của người chơi
đều bị chặn**, chỉ chủ bot và những người được miễn trừ vẫn dùng được.

| Câu lệnh | Tác dụng |
| --- | --- |
| `!baotri` | Mở bảng điều khiển có nút bấm |
| `!baotri on 30m Nâng cấp DB` | Bật bảo trì 30 phút kèm lý do |
| `!baotri off` | Mở lại bot cho mọi người |
| `!baotri status` | Xem trạng thái và thống kê |
| `!baotri allow @ai_đó` | Cho phép một người dùng lệnh khi đang bảo trì |
| `!baotri deny @ai_đó` | Gỡ quyền miễn trừ |
| `!baotri log` | Xem nhật ký thao tác |
| `!baotri cmd work 30m Lý do` | **Bảo trì riêng lệnh `work`** trong 30 phút, các lệnh khác vẫn chạy |
| `!baotri cmdoff work` | Mở lại riêng lệnh `work` |
| `!baotri cmdlist` | Xem danh sách lệnh đang bảo trì riêng |
| `!baotri cmd` | Mở thẳng trang **Bảo trì theo lệnh** trên bảng điều khiển |

Thời lượng nhận `30m`, `2h`, `1d`, `1h30m`, `90s` hoặc số phút; để trống hoặc `0`
là không hẹn giờ. Trạng thái được lưu vào `data/maintenance.json` nên bot khởi động
lại vẫn nhớ, và tự mở lại đúng hẹn kể cả khi bot tắt ngang giữa chừng.

### Miễn trừ theo người và theo vai trò

| Câu lệnh | Tác dụng |
| --- | --- |
| `!baotri allow @ai_đó` | Miễn trừ cho một người |
| `!baotri allow @Tên_Vai_Trò` | Miễn trừ cho cả vai trò |
| `!baotri allow everyone` | Miễn trừ cho vai trò @everyone |
| `!baotri allow <ID>` | Nhập thẳng ID, bot tự nhận biết người hay vai trò |
| `!baotri deny …` | Gỡ miễn trừ, cú pháp y hệt |

Slash: `/maintenance hành_động:allow thành_viên:@ai_đó` hoặc `vai_trò:@Tên_Vai_Trò`.

Sau mỗi lần `allow`/`deny`, bot hiện ngay bảng điều khiển đã cập nhật. Bảng có thanh
tiến độ phiên bảo trì, ô riêng cho người và vai trò được miễn trừ, mốc chặn gần
nhất, menu chọn người/vai trò để thêm – gỡ miễn trừ chỉ bằng một lần bấm, và nút
xoá toàn bộ danh sách miễn trừ.

### 🧰 Bảo trì theo từng lệnh ngay trên bảng điều khiển

Bấm nút **🧰 Bảo trì theo lệnh** là vào thẳng trang quản lý khoá lệnh, **không cần gõ
lệnh slash nữa**. Tại đây bạn có thể:

- Chọn **nhóm lệnh** (kinh tế, câu cá, quản lý…) từ menu thả xuống.
- Chọn **lệnh cần khoá** → hiện ô nhập **thời lượng + lý do** rồi xác nhận.
- Bấm **⌨️ Nhập tên lệnh** nếu muốn gõ tay tên lệnh.
- **Mở lại** một hay nhiều lệnh cùng lúc, hoặc **🧹 Mở lại mọi lệnh**.

Bảng điều khiển có **3 trạng thái màu** để không bị hiểu nhầm nữa:

| Trạng thái | Ý nghĩa |
| --- | --- |
| 🔴 `🔧 CHẾ ĐỘ BẢO TRÌ — ĐANG BẬT` | Toàn bộ bot đang khoá |
| 🟡 `🧰 BẢO TRÌ RIÊNG — N LỆNH ĐANG KHOÁ` | Bot vẫn chạy, chỉ một số lệnh bị khoá |
| 🟢 `✅ CHẾ ĐỘ BẢO TRÌ — ĐANG TẮT` | Mọi thứ bình thường |

Mọi bảng điều khiển đang mở **tự đồng bộ với nhau**: bạn đổi gì ở một bảng (hoặc
bằng lệnh prefix/slash) thì các bảng còn lại cập nhật theo ngay, không còn cảnh
bảng này báo "đang tắt" trong khi bảng kia đã bật.

---

## 👋 Chào mừng, Tạm biệt & Đếm lượt mời

Lệnh `!welcome` (hay `!chaomung`, `!wc`, `/welcome`) — **chỉ quản trị viên**
(quyền `Administrator`) mới dùng được.

| Câu lệnh | Tác dụng |
| --- | --- |
| `!welcome` | Mở bảng điều khiển có nút bật/tắt |
| `!welcome on` / `!welcome off` | Bật / tắt **cả hai** lời chào mừng và tạm biệt |
| `!welcome welcomeon` / `welcomeoff` | Chỉ bật / tắt lời **chào mừng** |
| `!welcome goodbyeon` / `goodbyeoff` | Chỉ bật / tắt lời **tạm biệt** |
| `!welcome inviteon` / `inviteoff` | Bật / tắt **đếm lượt mời** |
| `!welcome test` | Xem thử hai embed ngay tại chỗ |
| `!welcome reset` | Trả mọi thiết lập về mặc định trong `.env` |

Bảng điều khiển còn có hai menu chọn kênh để đổi **kênh chào mừng** và **kênh tạm
biệt** riêng biệt. Thiết lập lưu theo từng máy chủ trong `data/welcome.json`.

### 💌 Đếm lượt mời hoạt động thế nào?

Khi có người vào máy chủ, bot so sánh số lượt dùng của từng lời mời để biết **ai
đã mời người đó**, rồi hiện ngay trong embed chào mừng:

> 💌 **Người mời** — @AnTon (đã mời 12 người)

- Lượt mời còn hiệu lực = **đã mời vào − đã rời đi + tặng thêm**.
- Ai rời máy chủ thì người mời họ bị trừ 1 lượt (không bao giờ xuống dưới 0).
- Hỗ trợ cả **link rút gọn riêng của máy chủ** (vanity URL) và lời mời đã dùng hết lượt.
- Dữ liệu lưu ở `data/invites.json`.

> ⚠️ Bot cần quyền **Quản lý máy chủ (Manage Server)** và intent **Server Members**
> thì mới đếm được lượt mời. Thiếu quyền thì lời chào vẫn gửi bình thường,
> chỉ bỏ phần người mời.

---
