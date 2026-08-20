// =============================================================
//  Lệnh: trivia - đố vui trắc nghiệm (nút bấm A/B/C/D) - BẢN LTS
//
//  Nâng cấp so với bản cũ:
//   - Ngân hàng câu hỏi LỚN (150+ câu), chia theo 7 CHỦ ĐỀ và 3 ĐỘ KHÓ.
//   - Đảo thứ tự đáp án mỗi lần chơi -> không thể học vẹt vị trí A/B/C/D.
//   - Không lặp lại câu hỏi gần đây của cùng một người chơi.
//   - CHƠI THUẦN GIẢI TRÍ: KHÔNG cộng/trừ xu, không động vào số dư người chơi.
//     Chỉ ghi nhận thống kê cá nhân (đúng / sai / chuỗi / kỷ lục).
//   - Giao diện đẹp: nút có nhãn nội dung, đồng hồ đếm ngược của Discord,
//     bảng kết quả đánh dấu ✅/❌ từng đáp án, thống kê cá nhân.
//   - Lọc theo chủ đề / độ khó: `!trivia kho congnghe` hoặc `/trivia dokho:kho`.
//
//  An toàn khi chạy 24/7:
//   - Mọi lời gọi Discord đều được bọc try/catch -> không bao giờ tạo
//     "unhandled rejection" làm bẩn log hay dừng tiến trình.
//   - Không cho một người mở hai ván cùng lúc (tránh rối thống kê và chuỗi đúng).
//   - Bộ nhớ tạm (lịch sử câu hỏi, ván đang chạy) tự dọn theo thời gian,
//     không bao giờ phình vô hạn.
//   - Ngân hàng câu hỏi được kiểm tra hợp lệ khi nạp; câu sai định dạng bị
//     bỏ qua thay vì làm hỏng lệnh.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const rng = require('../../core/secureRandom');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');

// -------------------------------------------------------------
//  Chủ đề & độ khó
// -------------------------------------------------------------
const CATEGORIES = {
  science: { label: 'Khoa học', emoji: '🔬', color: colors.aqua },
  geography: { label: 'Địa lý', emoji: '🌍', color: colors.info },
  history: { label: 'Lịch sử', emoji: '🏛️', color: colors.orange },
  tech: { label: 'Công nghệ', emoji: '💻', color: colors.blurple },
  math: { label: 'Toán học', emoji: '🔢', color: colors.purple },
  nature: { label: 'Thiên nhiên', emoji: '🐾', color: colors.success },
  culture: { label: 'Văn hoá & Giải trí', emoji: '🎭', color: colors.pink },
};

const DIFFICULTIES = {
  easy: { key: 'easy', label: 'Dễ', emoji: '🟢', stars: '★☆☆', time: 20000 },
  medium: { key: 'medium', label: 'Vừa', emoji: '🟡', stars: '★★☆', time: 25000 },
  hard: { key: 'hard', label: 'Khó', emoji: '🔴', stars: '★★★', time: 30000 },
};

const LETTERS = ['A', 'B', 'C', 'D'];
const LETTER_EMOJI = ['🇦', '🇧', '🇨', '🇩'];

// -------------------------------------------------------------
//  NGÂN HÀNG CÂU HỎI
//  q: câu hỏi | o: 4 đáp án | a: chỉ số đáp án đúng | c: chủ đề | d: độ khó
// -------------------------------------------------------------
const RAW_QUESTIONS = [
  // ================= KHOA HỌC =================
  { q: 'Nước sôi ở bao nhiêu độ C (áp suất tiêu chuẩn)?', o: ['0°C', '50°C', '100°C', '212°C'], a: 2, c: 'science', d: 'easy' },
  { q: 'Công thức hoá học của nước là gì?', o: ['CO₂', 'H₂O', 'O₂', 'NaCl'], a: 1, c: 'science', d: 'easy' },
  { q: 'Hành tinh nào gần Mặt Trời nhất?', o: ['Sao Kim', 'Trái Đất', 'Sao Thuỷ', 'Sao Hoả'], a: 2, c: 'science', d: 'easy' },
  { q: 'Hành tinh nào lớn nhất Hệ Mặt Trời?', o: ['Trái Đất', 'Sao Mộc', 'Sao Hoả', 'Sao Thổ'], a: 1, c: 'science', d: 'easy' },
  { q: 'Con người hít khí nào để hô hấp?', o: ['Nitơ', 'Hydro', 'Oxy', 'Heli'], a: 2, c: 'science', d: 'easy' },
  { q: 'Cơ quan nào bơm máu đi khắp cơ thể?', o: ['Gan', 'Phổi', 'Tim', 'Thận'], a: 2, c: 'science', d: 'easy' },
  { q: 'Nước chiếm khoảng bao nhiêu phần trăm bề mặt Trái Đất?', o: ['50%', '61%', '71%', '85%'], a: 2, c: 'science', d: 'easy' },
  { q: 'Ký hiệu hoá học của vàng là gì?', o: ['Ag', 'Go', 'Au', 'Gd'], a: 2, c: 'science', d: 'easy' },
  { q: 'Một năm nhuận có bao nhiêu ngày?', o: ['364', '365', '366', '367'], a: 2, c: 'science', d: 'easy' },
  { q: 'Chất nào cứng nhất trong tự nhiên?', o: ['Sắt', 'Kim cương', 'Đá granit', 'Thạch anh'], a: 1, c: 'science', d: 'easy' },
  { q: 'Nhiệt độ đóng băng của nước là bao nhiêu?', o: ['0°C', '-10°C', '4°C', '10°C'], a: 0, c: 'science', d: 'easy' },
  { q: 'Vệ tinh tự nhiên của Trái Đất tên là gì?', o: ['Sao Kim', 'Mặt Trăng', 'Titan', 'Europa'], a: 1, c: 'science', d: 'easy' },
  { q: 'Hành tinh nào được gọi là "hành tinh đỏ"?', o: ['Sao Hoả', 'Sao Kim', 'Sao Mộc', 'Sao Thuỷ'], a: 0, c: 'science', d: 'easy' },
  { q: 'Hành tinh nào có vành đai nổi bật nhất?', o: ['Sao Thiên Vương', 'Sao Hải Vương', 'Sao Thổ', 'Sao Mộc'], a: 2, c: 'science', d: 'easy' },
  { q: 'Bộ phận nào của cây thực hiện quang hợp chủ yếu?', o: ['Rễ', 'Thân', 'Lá', 'Hoa'], a: 2, c: 'science', d: 'easy' },
  { q: 'Ai là tác giả của thuyết tương đối?', o: ['Isaac Newton', 'Albert Einstein', 'Galileo Galilei', 'Nikola Tesla'], a: 1, c: 'science', d: 'easy' },
  { q: 'Đơn vị đo cường độ dòng điện là gì?', o: ['Vôn', 'Ampe', 'Ôm', 'Oát'], a: 1, c: 'science', d: 'easy' },
  { q: 'Ký hiệu hoá học của sắt là gì?', o: ['Fe', 'Ir', 'In', 'Sn'], a: 0, c: 'science', d: 'medium' },
  { q: 'Ánh sáng Mặt Trời đi tới Trái Đất mất khoảng bao lâu?', o: ['8 giây', '8 phút', '8 giờ', '80 phút'], a: 1, c: 'science', d: 'medium' },
  { q: 'Chất nào giúp máu người có màu đỏ?', o: ['Insulin', 'Melanin', 'Hemoglobin', 'Collagen'], a: 2, c: 'science', d: 'medium' },
  { q: 'Âm thanh truyền nhanh nhất trong môi trường nào?', o: ['Chân không', 'Chất khí', 'Chất lỏng', 'Chất rắn'], a: 3, c: 'science', d: 'medium' },
  { q: 'Nguyên tố nào phổ biến nhất trong vũ trụ?', o: ['Oxy', 'Hydro', 'Cacbon', 'Heli'], a: 1, c: 'science', d: 'medium' },
  { q: 'Cơ thể người trưởng thành có bao nhiêu chiếc xương?', o: ['186', '196', '206', '216'], a: 2, c: 'science', d: 'medium' },
  { q: 'Tốc độ ánh sáng trong chân không xấp xỉ bao nhiêu?', o: ['300.000 km/s', '30.000 km/s', '3.000 km/s', '3 triệu km/s'], a: 0, c: 'science', d: 'medium' },
  { q: 'Cơ quan nào đảm nhiệm việc lọc máu trong cơ thể?', o: ['Gan', 'Thận', 'Lá lách', 'Tuỵ'], a: 1, c: 'science', d: 'medium' },
  { q: 'Đơn vị đo năng lượng trong hệ SI là gì?', o: ['Newton', 'Joule', 'Pascal', 'Watt'], a: 1, c: 'science', d: 'medium' },
  { q: 'Khí nào là tác nhân chính gây hiệu ứng nhà kính?', o: ['Oxy', 'Nitơ', 'CO₂', 'Argon'], a: 2, c: 'science', d: 'medium' },
  { q: 'Nguyên tố có số hiệu nguyên tử bằng 1 là gì?', o: ['Heli', 'Hydro', 'Liti', 'Cacbon'], a: 1, c: 'science', d: 'medium' },
  { q: 'Đơn vị đo lực trong hệ SI là gì?', o: ['Joule', 'Newton', 'Pascal', 'Ampe'], a: 1, c: 'science', d: 'medium' },
  { q: 'Hiện tượng nước chuyển từ thể lỏng sang thể khí gọi là gì?', o: ['Ngưng tụ', 'Bay hơi', 'Đông đặc', 'Thăng hoa'], a: 1, c: 'science', d: 'medium' },
  { q: 'Nguyên tố nào chiếm tỉ lệ lớn nhất trong không khí?', o: ['Oxy', 'Nitơ', 'CO₂', 'Hơi nước'], a: 1, c: 'science', d: 'medium' },
  { q: 'Ai được xem là cha đẻ của bảng tuần hoàn các nguyên tố hoá học?', o: ['Marie Curie', 'Dmitri Mendeleev', 'John Dalton', 'Niels Bohr'], a: 1, c: 'science', d: 'hard' },
  { q: 'Đơn vị đo áp suất trong hệ SI là gì?', o: ['Pascal', 'Bar', 'Tesla', 'Henry'], a: 0, c: 'science', d: 'hard' },
  { q: 'DNA là viết tắt của cụm từ nào?', o: ['Dynamic Nuclear Acid', 'Deoxyribonucleic Acid', 'Double Nucleic Atom', 'Direct Nuclear Assembly'], a: 1, c: 'science', d: 'hard' },
  { q: 'Một năm ánh sáng là đơn vị đo của đại lượng nào?', o: ['Thời gian', 'Khoảng cách', 'Vận tốc', 'Khối lượng'], a: 1, c: 'science', d: 'hard' },

  // ================= ĐỊA LÝ =================
  { q: 'Thủ đô của Việt Nam là thành phố nào?', o: ['TP. Hồ Chí Minh', 'Đà Nẵng', 'Hà Nội', 'Huế'], a: 2, c: 'geography', d: 'easy' },
  { q: 'Đại dương nào lớn nhất thế giới?', o: ['Đại Tây Dương', 'Thái Bình Dương', 'Ấn Độ Dương', 'Bắc Băng Dương'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Ngọn núi nào cao nhất thế giới?', o: ['K2', 'Everest', 'Phú Sĩ', 'Kilimanjaro'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Tháp Eiffel nằm ở thành phố nào?', o: ['London', 'Paris', 'Rome', 'Berlin'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Châu lục nào có diện tích lớn nhất?', o: ['Châu Phi', 'Châu Á', 'Châu Mỹ', 'Châu Âu'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Đỉnh núi cao nhất Việt Nam tên là gì?', o: ['Bà Đen', 'Fansipan', 'Bạch Mã', 'Lang Biang'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Vịnh Hạ Long thuộc tỉnh nào của Việt Nam?', o: ['Hải Phòng', 'Quảng Ninh', 'Nam Định', 'Thanh Hoá'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Thủ đô của Nhật Bản là thành phố nào?', o: ['Osaka', 'Kyoto', 'Tokyo', 'Nagoya'], a: 2, c: 'geography', d: 'easy' },
  { q: 'Thủ đô của Hàn Quốc là thành phố nào?', o: ['Busan', 'Seoul', 'Incheon', 'Daegu'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Thủ đô của Thái Lan là thành phố nào?', o: ['Chiang Mai', 'Phuket', 'Bangkok', 'Pattaya'], a: 2, c: 'geography', d: 'easy' },
  { q: 'Vạn Lý Trường Thành nằm ở quốc gia nào?', o: ['Nhật Bản', 'Hàn Quốc', 'Trung Quốc', 'Mông Cổ'], a: 2, c: 'geography', d: 'easy' },
  { q: 'Kim tự tháp Giza nằm ở quốc gia nào?', o: ['Ai Cập', 'Hy Lạp', 'Iraq', 'Maroc'], a: 0, c: 'geography', d: 'easy' },
  { q: 'Châu lục nào lạnh nhất Trái Đất?', o: ['Châu Âu', 'Nam Cực', 'Bắc Mỹ', 'Châu Á'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Quốc gia nào có diện tích lớn nhất thế giới?', o: ['Canada', 'Trung Quốc', 'Nga', 'Hoa Kỳ'], a: 2, c: 'geography', d: 'easy' },
  { q: 'Núi Phú Sĩ nằm ở quốc gia nào?', o: ['Trung Quốc', 'Nhật Bản', 'Hàn Quốc', 'Đài Loan'], a: 1, c: 'geography', d: 'easy' },
  { q: 'Thành phố nào đông dân nhất Việt Nam?', o: ['Hà Nội', 'Hải Phòng', 'TP. Hồ Chí Minh', 'Cần Thơ'], a: 2, c: 'geography', d: 'easy' },
  { q: 'Sa mạc nóng lớn nhất thế giới tên là gì?', o: ['Gobi', 'Sahara', 'Kalahari', 'Atacama'], a: 1, c: 'geography', d: 'medium' },
  { q: 'Thủ đô của Úc là thành phố nào?', o: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], a: 2, c: 'geography', d: 'medium' },
  { q: 'Thủ đô của Canada là thành phố nào?', o: ['Toronto', 'Ottawa', 'Vancouver', 'Montreal'], a: 1, c: 'geography', d: 'medium' },
  { q: 'Đảo nào lớn nhất thế giới?', o: ['Madagascar', 'Greenland', 'Borneo', 'New Guinea'], a: 1, c: 'geography', d: 'medium' },
  { q: 'Hồ nước ngọt sâu nhất thế giới là hồ nào?', o: ['Hồ Baikal', 'Hồ Victoria', 'Ngũ Đại Hồ', 'Hồ Titicaca'], a: 0, c: 'geography', d: 'medium' },
  { q: 'Việt Nam giáp biên giới trên đất liền với bao nhiêu quốc gia?', o: ['2', '3', '4', '5'], a: 1, c: 'geography', d: 'medium' },
  { q: 'Thành phố nào được mệnh danh là "thành phố sương mù"?', o: ['Paris', 'London', 'Seattle', 'Oslo'], a: 1, c: 'geography', d: 'medium' },
  { q: 'Quốc gia nào nhỏ nhất thế giới?', o: ['Monaco', 'Vatican', 'San Marino', 'Nauru'], a: 1, c: 'geography', d: 'medium' },
  { q: '"Đất nước Mặt Trời mọc" là biệt danh của quốc gia nào?', o: ['Hàn Quốc', 'Nhật Bản', 'Thái Lan', 'Philippines'], a: 1, c: 'geography', d: 'medium' },
  { q: 'Sông nào dài nhất nằm trọn trong lãnh thổ Việt Nam?', o: ['Sông Hồng', 'Sông Đồng Nai', 'Sông Mã', 'Sông Cả'], a: 1, c: 'geography', d: 'hard' },
  { q: 'Eo biển nào ngăn cách châu Á và châu Âu tại Istanbul?', o: ['Eo Gibraltar', 'Eo Bosphorus', 'Eo Malacca', 'Eo Bering'], a: 1, c: 'geography', d: 'hard' },
  { q: 'Thủ đô của Brazil là thành phố nào?', o: ['Rio de Janeiro', 'São Paulo', 'Brasília', 'Salvador'], a: 2, c: 'geography', d: 'hard' },
  { q: 'Dãy núi nào dài nhất thế giới trên đất liền?', o: ['Himalaya', 'Andes', 'Rocky', 'Alps'], a: 1, c: 'geography', d: 'hard' },
  { q: 'Biển nào có độ mặn cao nổi tiếng, người có thể nổi dễ dàng?', o: ['Biển Đỏ', 'Biển Chết', 'Biển Đen', 'Biển Caspi'], a: 1, c: 'geography', d: 'medium' },

  // ================= LỊCH SỬ =================
  { q: 'Bác Hồ đọc Tuyên ngôn Độc lập vào năm nào?', o: ['1930', '1945', '1954', '1975'], a: 1, c: 'history', d: 'easy' },
  { q: 'Chiến thắng Điện Biên Phủ diễn ra vào năm nào?', o: ['1945', '1950', '1954', '1968'], a: 2, c: 'history', d: 'easy' },
  { q: 'Đất nước Việt Nam thống nhất vào năm nào?', o: ['1954', '1972', '1975', '1976'], a: 2, c: 'history', d: 'easy' },
  { q: 'Chiến tranh thế giới thứ hai kết thúc vào năm nào?', o: ['1918', '1939', '1945', '1950'], a: 2, c: 'history', d: 'easy' },
  { q: 'Con người lần đầu đặt chân lên Mặt Trăng vào năm nào?', o: ['1957', '1961', '1969', '1972'], a: 2, c: 'history', d: 'easy' },
  { q: 'Ai lãnh đạo chiến thắng Bạch Đằng năm 938?', o: ['Lý Thường Kiệt', 'Ngô Quyền', 'Trần Hưng Đạo', 'Lê Lợi'], a: 1, c: 'history', d: 'easy' },
  { q: 'Nhà nước đầu tiên trong lịch sử Việt Nam có tên là gì?', o: ['Âu Lạc', 'Văn Lang', 'Đại Cồ Việt', 'Đại Việt'], a: 1, c: 'history', d: 'easy' },
  { q: 'Vua Quang Trung có tên thật là gì?', o: ['Nguyễn Nhạc', 'Nguyễn Huệ', 'Nguyễn Lữ', 'Nguyễn Ánh'], a: 1, c: 'history', d: 'easy' },
  { q: 'Kinh đô của triều Nguyễn đặt ở đâu?', o: ['Thăng Long', 'Huế', 'Hoa Lư', 'Gia Định'], a: 1, c: 'history', d: 'easy' },
  { q: 'Ai là người tìm ra châu Mỹ năm 1492?', o: ['Ferdinand Magellan', 'Cristoforo Colombo', 'Vasco da Gama', 'James Cook'], a: 1, c: 'history', d: 'medium' },
  { q: 'Ai là vị vua đầu tiên của triều Nguyễn?', o: ['Minh Mạng', 'Gia Long', 'Tự Đức', 'Thiệu Trị'], a: 1, c: 'history', d: 'medium' },
  { q: 'Ai là người đầu tiên bay vào vũ trụ?', o: ['Neil Armstrong', 'Yuri Gagarin', 'Alan Shepard', 'John Glenn'], a: 1, c: 'history', d: 'medium' },
  { q: 'Bức tường Berlin sụp đổ vào năm nào?', o: ['1985', '1989', '1991', '1993'], a: 1, c: 'history', d: 'medium' },
  { q: 'Tác giả của "Bình Ngô đại cáo" là ai?', o: ['Nguyễn Du', 'Nguyễn Trãi', 'Lê Lợi', 'Nguyễn Bỉnh Khiêm'], a: 1, c: 'history', d: 'medium' },
  { q: 'Hai Bà Trưng khởi nghĩa chống lại ách đô hộ của triều đại nào?', o: ['Nhà Hán', 'Nhà Đường', 'Nhà Tống', 'Nhà Minh'], a: 0, c: 'history', d: 'medium' },
  { q: 'Ai là người thống nhất nước Đức năm 1871?', o: ['Adolf Hitler', 'Otto von Bismarck', 'Wilhelm II', 'Karl Marx'], a: 1, c: 'history', d: 'hard' },
  { q: 'Quốc hiệu "Đại Việt" xuất hiện lần đầu dưới triều đại nào?', o: ['Nhà Đinh', 'Nhà Tiền Lê', 'Nhà Lý', 'Nhà Trần'], a: 2, c: 'history', d: 'hard' },
  { q: 'Ai là người sáng lập nhà Lý?', o: ['Lý Thường Kiệt', 'Lý Công Uẩn', 'Lý Thánh Tông', 'Lý Nhân Tông'], a: 1, c: 'history', d: 'hard' },
  { q: 'Chiến tranh thế giới thứ nhất bắt đầu vào năm nào?', o: ['1912', '1914', '1917', '1920'], a: 1, c: 'history', d: 'medium' },
  { q: 'Ai là hoàng đế đầu tiên của Trung Hoa thống nhất?', o: ['Hán Vũ Đế', 'Tần Thuỷ Hoàng', 'Đường Thái Tông', 'Càn Long'], a: 1, c: 'history', d: 'medium' },

  // ================= CÔNG NGHỆ =================
  { q: 'Ngôn ngữ lập trình nào chạy trực tiếp trên trình duyệt web?', o: ['Python', 'JavaScript', 'C++', 'Java'], a: 1, c: 'tech', d: 'easy' },
  { q: 'Trong máy tính, 1 byte bằng bao nhiêu bit?', o: ['4', '8', '16', '32'], a: 1, c: 'tech', d: 'easy' },
  { q: 'Ai là người đồng sáng lập Microsoft?', o: ['Steve Jobs', 'Bill Gates', 'Elon Musk', 'Larry Page'], a: 1, c: 'tech', d: 'easy' },
  { q: 'iPhone là sản phẩm của công ty nào?', o: ['Samsung', 'Apple', 'Google', 'Sony'], a: 1, c: 'tech', d: 'easy' },
  { q: 'Hệ điều hành mã nguồn mở nổi tiếng nhất là gì?', o: ['Windows', 'macOS', 'Linux', 'iOS'], a: 2, c: 'tech', d: 'easy' },
  { q: 'Trình duyệt web nào do Google phát triển?', o: ['Safari', 'Chrome', 'Firefox', 'Edge'], a: 1, c: 'tech', d: 'easy' },
  { q: 'Ai là người sáng lập Facebook?', o: ['Jack Dorsey', 'Mark Zuckerberg', 'Kevin Systrom', 'Evan Spiegel'], a: 1, c: 'tech', d: 'easy' },
  { q: 'Đơn vị nhỏ nhất của thông tin trong máy tính là gì?', o: ['Byte', 'Bit', 'Kilobyte', 'Pixel'], a: 1, c: 'tech', d: 'easy' },
  { q: 'Hệ đếm nhị phân sử dụng bao nhiêu chữ số?', o: ['2', '8', '10', '16'], a: 0, c: 'tech', d: 'easy' },
  { q: '"AI" là viết tắt của cụm từ nào?', o: ['Automatic Input', 'Artificial Intelligence', 'Advanced Interface', 'Applied Internet'], a: 1, c: 'tech', d: 'easy' },
  { q: 'CPU là viết tắt của cụm từ nào?', o: ['Central Processing Unit', 'Computer Power Unit', 'Control Panel Unit', 'Core Program Unit'], a: 0, c: 'tech', d: 'medium' },
  { q: 'HTML là viết tắt của cụm từ nào?', o: ['HyperText Markup Language', 'High Transfer Machine Language', 'Home Tool Markup Language', 'Hyper Transfer Media Link'], a: 0, c: 'tech', d: 'medium' },
  { q: 'Ngôn ngữ lập trình Python do ai tạo ra?', o: ['James Gosling', 'Guido van Rossum', 'Bjarne Stroustrup', 'Dennis Ritchie'], a: 1, c: 'tech', d: 'medium' },
  { q: '1 KB (kibibyte) bằng bao nhiêu byte?', o: ['100', '1000', '1024', '2048'], a: 2, c: 'tech', d: 'medium' },
  { q: 'RAM là loại bộ nhớ như thế nào?', o: ['Lưu trữ vĩnh viễn', 'Tạm thời, mất khi tắt máy', 'Chỉ đọc', 'Bộ nhớ đám mây'], a: 1, c: 'tech', d: 'medium' },
  { q: 'Git được dùng để làm gì?', o: ['Thiết kế đồ hoạ', 'Quản lý phiên bản mã nguồn', 'Chỉnh sửa video', 'Quét virus'], a: 1, c: 'tech', d: 'medium' },
  { q: 'Định dạng ảnh nào hỗ trợ nền trong suốt?', o: ['JPG', 'PNG', 'BMP', 'RAW'], a: 1, c: 'tech', d: 'medium' },
  { q: 'SQL chủ yếu được dùng để làm gì?', o: ['Tạo giao diện web', 'Truy vấn cơ sở dữ liệu', 'Biên dịch mã máy', 'Thiết kế mạng'], a: 1, c: 'tech', d: 'medium' },
  { q: 'Node.js chạy trên engine JavaScript nào?', o: ['SpiderMonkey', 'V8', 'JavaScriptCore', 'Chakra'], a: 1, c: 'tech', d: 'hard' },
  { q: 'Số nhị phân 1010 bằng bao nhiêu trong hệ thập phân?', o: ['8', '10', '12', '20'], a: 1, c: 'tech', d: 'hard' },
  { q: 'Giao thức nào dùng để truyền trang web an toàn?', o: ['FTP', 'HTTPS', 'SMTP', 'SSH'], a: 1, c: 'tech', d: 'medium' },
  { q: 'Thư viện Node.js phổ biến nhất để viết bot Discord là gì?', o: ['discord.js', 'socket.io', 'express', 'axios'], a: 0, c: 'tech', d: 'medium' },
  { q: 'Địa chỉ IPv4 gồm bao nhiêu bit?', o: ['16', '32', '64', '128'], a: 1, c: 'tech', d: 'hard' },
  { q: 'Trong lập trình, "bug" nghĩa là gì?', o: ['Một tính năng mới', 'Lỗi trong chương trình', 'Một loại biến', 'Trình biên dịch'], a: 1, c: 'tech', d: 'easy' },

  // ================= TOÁN HỌC =================
  { q: '1 giờ có bao nhiêu giây?', o: ['60', '360', '3600', '600'], a: 2, c: 'math', d: 'easy' },
  { q: '7 × 8 bằng bao nhiêu?', o: ['54', '56', '58', '64'], a: 1, c: 'math', d: 'easy' },
  { q: 'Số Pi (π) xấp xỉ bằng bao nhiêu?', o: ['2,17', '3,14', '3,41', '4,13'], a: 1, c: 'math', d: 'easy' },
  { q: 'Số nguyên tố nhỏ nhất là số nào?', o: ['0', '1', '2', '3'], a: 2, c: 'math', d: 'easy' },
  { q: 'Tổng các góc trong một tam giác bằng bao nhiêu độ?', o: ['90°', '180°', '270°', '360°'], a: 1, c: 'math', d: 'easy' },
  { q: 'Căn bậc hai của 144 là bao nhiêu?', o: ['11', '12', '13', '14'], a: 1, c: 'math', d: 'easy' },
  { q: '1 km bằng bao nhiêu mét?', o: ['10', '100', '1000', '10000'], a: 2, c: 'math', d: 'easy' },
  { q: 'Số lớn nhất có ba chữ số là số nào?', o: ['888', '900', '999', '1000'], a: 2, c: 'math', d: 'easy' },
  { q: '9 × 9 bằng bao nhiêu?', o: ['72', '81', '89', '99'], a: 1, c: 'math', d: 'easy' },
  { q: '15% của 200 bằng bao nhiêu?', o: ['15', '25', '30', '35'], a: 2, c: 'math', d: 'medium' },
  { q: '2 mũ 10 bằng bao nhiêu?', o: ['512', '1000', '1024', '2048'], a: 2, c: 'math', d: 'medium' },
  { q: 'Tổng các góc trong một tứ giác bằng bao nhiêu độ?', o: ['180°', '270°', '360°', '540°'], a: 2, c: 'math', d: 'medium' },
  { q: 'Một tuần có bao nhiêu giờ?', o: ['144', '156', '168', '172'], a: 2, c: 'math', d: 'medium' },
  { q: 'Hình có 8 cạnh được gọi là hình gì?', o: ['Lục giác', 'Thất giác', 'Bát giác', 'Cửu giác'], a: 2, c: 'math', d: 'medium' },
  { q: 'Trung bình cộng của 4, 8 và 12 là bao nhiêu?', o: ['6', '8', '10', '12'], a: 1, c: 'math', d: 'medium' },
  { q: 'Công thức tính chu vi hình tròn bán kính r là gì?', o: ['πr²', '2πr', 'πr', '4πr'], a: 1, c: 'math', d: 'medium' },
  { q: 'Giai thừa của 5 (5!) bằng bao nhiêu?', o: ['24', '60', '120', '720'], a: 2, c: 'math', d: 'hard' },
  { q: 'Số nào vừa là số chẵn vừa là số nguyên tố?', o: ['0', '1', '2', '4'], a: 2, c: 'math', d: 'hard' },
  { q: 'Trong tam giác vuông, định lý Pytago phát biểu điều gì?', o: ['a + b = c', 'a² + b² = c²', 'a² − b² = c²', 'a × b = c'], a: 1, c: 'math', d: 'medium' },
  { q: '0,25 bằng phân số nào?', o: ['1/2', '1/3', '1/4', '1/5'], a: 2, c: 'math', d: 'easy' },

  // ================= THIÊN NHIÊN =================
  { q: 'Loài động vật nào lớn nhất thế giới?', o: ['Voi châu Phi', 'Cá voi xanh', 'Hươu cao cổ', 'Cá mập trắng'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Loài động vật nào chạy nhanh nhất trên cạn?', o: ['Ngựa', 'Báo Gêpa', 'Sư tử', 'Linh dương'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Loài chim nào dưới đây không biết bay?', o: ['Chim én', 'Chim cánh cụt', 'Đại bàng', 'Bồ câu'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Con vật nào được mệnh danh là "chúa sơn lâm"?', o: ['Sư tử', 'Hổ', 'Gấu', 'Báo'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Loài nào có chiếc cổ dài nhất?', o: ['Đà điểu', 'Hươu cao cổ', 'Lạc đà', 'Thiên nga'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Ong tạo ra sản phẩm nào?', o: ['Sữa', 'Mật ong', 'Tơ', 'Sáp nến'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Kiến có bao nhiêu chân?', o: ['4', '6', '8', '10'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Nhện có bao nhiêu chân?', o: ['6', '8', '10', '12'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Loài nào có khả năng đổi màu da để nguỵ trang?', o: ['Kỳ nhông', 'Tắc kè hoa', 'Thằn lằn', 'Rắn lục'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Loài vật nào chịu khát giỏi nhất trên sa mạc?', o: ['Ngựa vằn', 'Lạc đà', 'Cáo sa mạc', 'Linh dương'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Loài động vật có vú duy nhất biết bay thật sự là gì?', o: ['Sóc bay', 'Dơi', 'Chim ruồi', 'Cầy bay'], a: 1, c: 'nature', d: 'medium' },
  { q: 'Cá mập thuộc lớp động vật nào?', o: ['Cá xương', 'Cá sụn', 'Bò sát', 'Thú biển'], a: 1, c: 'nature', d: 'medium' },
  { q: 'Loài mèo lớn nhất trong tự nhiên là loài nào?', o: ['Sư tử', 'Hổ', 'Báo đốm', 'Báo tuyết'], a: 1, c: 'nature', d: 'medium' },
  { q: 'Loài cây nào cao nhất thế giới?', o: ['Bạch đàn', 'Cù tùng (Sequoia)', 'Thông', 'Bao báp'], a: 1, c: 'nature', d: 'medium' },
  { q: 'Bạch tuộc có bao nhiêu trái tim?', o: ['1', '2', '3', '4'], a: 2, c: 'nature', d: 'hard' },
  { q: 'Loài chim nào lớn nhất thế giới?', o: ['Đại bàng', 'Đà điểu', 'Chim cánh cụt hoàng đế', 'Thiên nga'], a: 1, c: 'nature', d: 'medium' },
  { q: 'Loài vật nào có thể tái sinh chi bị mất?', o: ['Kỳ giông', 'Chuột', 'Thỏ', 'Mèo'], a: 0, c: 'nature', d: 'hard' },
  { q: 'Rùa biển thường đẻ trứng ở đâu?', o: ['Dưới đáy biển', 'Trên bãi cát', 'Trên cây', 'Trong hang đá'], a: 1, c: 'nature', d: 'medium' },
  { q: 'Gấu Bắc Cực sinh sống chủ yếu ở đâu?', o: ['Nam Cực', 'Bắc Cực', 'Siberia', 'Alaska nội địa'], a: 1, c: 'nature', d: 'easy' },
  { q: 'Loài côn trùng nào tạo ra tơ để dệt lụa?', o: ['Ong mật', 'Tằm', 'Nhện nước', 'Bọ cánh cứng'], a: 1, c: 'nature', d: 'medium' },

  // ================= VĂN HOÁ & GIẢI TRÍ =================
  { q: 'Ai là tác giả của "Truyện Kiều"?', o: ['Nguyễn Trãi', 'Nguyễn Du', 'Hồ Xuân Hương', 'Nguyễn Đình Chiểu'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Môn thể thao nào được gọi là "môn thể thao vua"?', o: ['Bóng rổ', 'Bóng đá', 'Quần vợt', 'Bóng chuyền'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Một trận bóng đá chính thức kéo dài bao nhiêu phút (chưa tính bù giờ)?', o: ['60 phút', '80 phút', '90 phút', '120 phút'], a: 2, c: 'culture', d: 'easy' },
  { q: 'Áo dài là trang phục truyền thống của quốc gia nào?', o: ['Trung Quốc', 'Việt Nam', 'Hàn Quốc', 'Nhật Bản'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Tết Nguyên Đán được tính theo loại lịch nào?', o: ['Dương lịch', 'Âm lịch', 'Lịch Julius', 'Lịch Maya'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Thế vận hội Olympic được tổ chức mấy năm một lần?', o: ['2 năm', '3 năm', '4 năm', '5 năm'], a: 2, c: 'culture', d: 'easy' },
  { q: 'Bàn cờ vua có tổng cộng bao nhiêu ô?', o: ['36', '49', '64', '81'], a: 2, c: 'culture', d: 'easy' },
  { q: 'Cầu thủ nào nổi tiếng với biệt danh "CR7"?', o: ['Lionel Messi', 'Cristiano Ronaldo', 'Neymar', 'Kylian Mbappé'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Bức tranh "Mona Lisa" do hoạ sĩ nào vẽ?', o: ['Vincent van Gogh', 'Leonardo da Vinci', 'Pablo Picasso', 'Michelangelo'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Ai là tác giả bộ truyện "Harry Potter"?', o: ['J.R.R. Tolkien', 'J.K. Rowling', 'Rick Riordan', 'George R.R. Martin'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Doraemon là chú mèo máy đến từ thế kỷ nào?', o: ['Thế kỷ 21', 'Thế kỷ 22', 'Thế kỷ 23', 'Thế kỷ 30'], a: 1, c: 'culture', d: 'medium' },
  { q: 'Nhạc cụ nào có 88 phím?', o: ['Đàn organ', 'Piano', 'Accordion', 'Harpsichord'], a: 1, c: 'culture', d: 'medium' },
  { q: 'Đội tuyển nào vô địch World Cup 2022?', o: ['Pháp', 'Argentina', 'Brazil', 'Croatia'], a: 1, c: 'culture', d: 'medium' },
  { q: 'Trong cờ vua, quân nào có sức mạnh lớn nhất?', o: ['Xe', 'Hậu', 'Mã', 'Tượng'], a: 1, c: 'culture', d: 'medium' },
  { q: 'Một đội bóng rổ có bao nhiêu cầu thủ trên sân?', o: ['5', '6', '7', '11'], a: 0, c: 'culture', d: 'medium' },
  { q: 'Nhân vật Sơn Tinh - Thuỷ Tinh xuất hiện trong thể loại nào?', o: ['Tiểu thuyết', 'Truyền thuyết', 'Tuỳ bút', 'Ký sự'], a: 1, c: 'culture', d: 'medium' },
  { q: 'Giải thưởng điện ảnh danh giá nhất của Mỹ tên là gì?', o: ['Grammy', 'Oscar', 'Emmy', 'Tony'], a: 1, c: 'culture', d: 'medium' },
  { q: 'Món phở nổi tiếng có nguồn gốc từ quốc gia nào?', o: ['Thái Lan', 'Việt Nam', 'Trung Quốc', 'Lào'], a: 1, c: 'culture', d: 'easy' },
  { q: 'Nhạc sĩ nào sáng tác bản "Giao hưởng số 9" nổi tiếng?', o: ['Mozart', 'Beethoven', 'Bach', 'Chopin'], a: 1, c: 'culture', d: 'hard' },
  { q: 'Trong bóng đá, thẻ nào khiến cầu thủ bị truất quyền thi đấu?', o: ['Thẻ vàng', 'Thẻ đỏ', 'Thẻ xanh', 'Thẻ trắng'], a: 1, c: 'culture', d: 'easy' },
];

// -------------------------------------------------------------
//  Kiểm tra hợp lệ ngân hàng câu hỏi khi nạp lệnh.
//  Câu hỏi sai định dạng bị LOẠI thay vì gây lỗi lúc chạy.
// -------------------------------------------------------------
function isValidQuestion(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.q !== 'string' || !item.q.trim()) return false;
  if (!Array.isArray(item.o) || item.o.length !== 4) return false;
  if (!item.o.every((o) => typeof o === 'string' && o.trim())) return false;
  if (new Set(item.o.map((o) => o.trim().toLowerCase())).size !== 4) return false;
  if (!Number.isInteger(item.a) || item.a < 0 || item.a > 3) return false;
  if (!CATEGORIES[item.c]) return false;
  if (!DIFFICULTIES[item.d]) return false;
  return true;
}

const QUESTIONS = RAW_QUESTIONS.filter(isValidQuestion).map((item, index) => ({
  key: `q${index}`,
  q: item.q.trim(),
  o: item.o.map((o) => o.trim()),
  a: item.a,
  c: item.c,
  d: item.d,
}));

// Câu hỏi dự phòng: bảo đảm lệnh KHÔNG BAO GIỜ chạy với ngân hàng rỗng.
if (QUESTIONS.length === 0) {
  QUESTIONS.push({
    key: 'fallback',
    q: '1 + 1 bằng mấy?',
    o: ['1', '2', '3', '4'],
    a: 1,
    c: 'math',
    d: 'easy',
  });
}

// -------------------------------------------------------------
//  Bộ nhớ tạm: lịch sử câu hỏi & ván đang diễn ra
// -------------------------------------------------------------
const HISTORY_LIMIT = 40; // nhớ 40 câu gần nhất của mỗi người
const HISTORY_TTL = 6 * 60 * 60 * 1000; // 6 giờ không chơi thì xoá lịch sử
const SESSION_TTL = 5 * 60 * 1000; // chốt chặn an toàn cho ván "treo"

const history = new Map(); // userId -> { seen: string[], at: number }
const activeGames = new Map(); // userId -> timestamp bắt đầu

function sweepMemory(now) {
  if (history.size > 200) {
    for (const [userId, entry] of history) {
      if (!entry || now - entry.at > HISTORY_TTL) history.delete(userId);
    }
  }
  if (activeGames.size) {
    for (const [userId, startedAt] of activeGames) {
      if (now - startedAt > SESSION_TTL) activeGames.delete(userId);
    }
  }
}

function rememberQuestion(userId, key, now) {
  const entry = history.get(userId) || { seen: [], at: now };
  entry.seen.push(key);
  if (entry.seen.length > HISTORY_LIMIT) entry.seen.splice(0, entry.seen.length - HISTORY_LIMIT);
  entry.at = now;
  history.set(userId, entry);
}

// Bốc một câu hỏi: ưu tiên câu người chơi CHƯA gặp gần đây.
function pickQuestion(userId, pool, now) {
  const entry = history.get(userId);
  const seen = entry && now - entry.at <= HISTORY_TTL ? new Set(entry.seen) : new Set();
  const fresh = pool.filter((item) => !seen.has(item.key));
  const source = fresh.length ? fresh : pool;
  return source[rng.randomInt(source.length)];
}

// -------------------------------------------------------------
//  Lọc theo chủ đề / độ khó
// -------------------------------------------------------------
function normalize(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const DIFFICULTY_ALIASES = {
  easy: ['de', 'easy', 'dedang', 'thap'],
  medium: ['vua', 'trungbinh', 'medium', 'normal', 'binhthuong'],
  hard: ['kho', 'hard', 'khonhan', 'cao', 'difficult'],
};

const CATEGORY_ALIASES = {
  science: ['khoahoc', 'science', 'kh'],
  geography: ['dialy', 'diali', 'geography', 'geo'],
  history: ['lichsu', 'history', 'ls'],
  tech: ['congnghe', 'tech', 'technology', 'it', 'maytinh'],
  math: ['toan', 'toanhoc', 'math', 'maths'],
  nature: ['thiennhien', 'dongvat', 'nature', 'animal', 'sinhhoc'],
  culture: ['vanhoa', 'giaitri', 'culture', 'entertainment', 'thethao', 'sport'],
};

function matchAlias(map, token) {
  if (!token) return null;
  for (const [key, aliases] of Object.entries(map)) {
    if (key === token || aliases.includes(token)) return key;
  }
  return null;
}

// Lấy bộ lọc từ option slash HOẶC từ các tham số của lệnh prefix.
function resolveFilters(ctx) {
  const tokens = [];
  try {
    const d = ctx.getString('dokho');
    if (d) tokens.push(d);
    const c = ctx.getString('chude');
    if (c) tokens.push(c);
  } catch { /* bỏ qua: chế độ prefix có thể không có option */ }
  if (!ctx.isSlash && Array.isArray(ctx.args)) tokens.push(...ctx.args);

  let difficulty = null;
  let category = null;
  for (const raw of tokens) {
    const token = normalize(raw);
    if (!token) continue;
    if (!difficulty) {
      const d = matchAlias(DIFFICULTY_ALIASES, token);
      if (d) { difficulty = d; continue; }
    }
    if (!category) {
      const c = matchAlias(CATEGORY_ALIASES, token);
      if (c) category = c;
    }
  }
  return { difficulty, category };
}

// -------------------------------------------------------------
//  Thống kê đố vui lưu trong ví người chơi
// -------------------------------------------------------------
function ensureTriviaStats(wallet) {
  if (!wallet.trivia || typeof wallet.trivia !== 'object') wallet.trivia = {};
  const t = wallet.trivia;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  t.correct = num(t.correct);
  t.wrong = num(t.wrong);
  t.streak = num(t.streak);
  t.best = num(t.best);
  // Ghi chú: ví của bản cũ có thể còn trường `earned`; ta giữ nguyên dữ liệu đó
  // nhưng KHÔNG cộng thêm và không hiển thị nữa (trivia không còn thưởng xu).
  return t;
}

// -------------------------------------------------------------
//  Giao diện
// -------------------------------------------------------------
function truncate(text, max) {
  const t = String(text);
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// Nút trả lời. Khi đã kết thúc: đáp án đúng xanh, đáp án đã chọn sai đỏ.
function buildRows(idPrefix, options, { disabled = false, correctIdx = -1, pickedIdx = -1 } = {}) {
  const longLabels = options.some((o) => o.length > 18);
  const perRow = longLabels ? 2 : 4;
  const rows = [];
  let row = new ActionRowBuilder();

  for (let i = 0; i < options.length; i++) {
    let style = ButtonStyle.Primary;
    if (disabled) {
      if (i === correctIdx) style = ButtonStyle.Success;
      else if (i === pickedIdx) style = ButtonStyle.Danger;
      else style = ButtonStyle.Secondary;
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:${i}`)
        .setLabel(truncate(`${LETTERS[i]}. ${options[i]}`, 60))
        .setEmoji(LETTER_EMOJI[i])
        .setStyle(style)
        .setDisabled(disabled),
    );
    if (row.components.length >= perRow) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
  }
  if (row.components.length) rows.push(row);
  return rows;
}

function questionEmbed(item, options, meta, diff, endsAt, ctx) {
  const list = options.map((o, i) => `${LETTER_EMOJI[i]} **${LETTERS[i]}.** ${o}`).join('\n');
  const bar = '─'.repeat(18);
  return Embed.custom(meta.color, `${emoji.star} Đố vui • ${meta.emoji} ${meta.label}`)
    .setDescription(
      `### ${item.q}\n` +
        `\`${bar}\`\n` +
        `${list}\n` +
        `\`${bar}\`\n` +
        `${diff.emoji} **Độ khó:** ${diff.label} ${diff.stars}  ${emoji.dot}  🎮 **Chơi vui — không tính xu**\n` +
        `⏱️ **Hết giờ:** <t:${Math.floor(endsAt / 1000)}:R>`,
    )
    .setFooter({ text: `Người chơi: ${ctx.author.username} • Chọn A/B/C/D bên dưới` });
}

function reviewList(options, correctIdx, pickedIdx) {
  return options
    .map((o, i) => {
      if (i === correctIdx) return `✅ **${LETTERS[i]}.** ${o}`;
      if (i === pickedIdx) return `❌ **${LETTERS[i]}.** ${o} *(bạn chọn)*`;
      return `▫️ ${LETTERS[i]}. ${o}`;
    })
    .join('\n');
}

// -------------------------------------------------------------
//  Tiện ích an toàn (không bao giờ ném lỗi ra ngoài)
// -------------------------------------------------------------
async function safeEdit(msg, payload) {
  if (!msg || typeof msg.edit !== 'function') return null;
  try {
    return await msg.edit(payload);
  } catch {
    return null;
  }
}

module.exports = {
  name: 'trivia',
  aliases: ['dovui', 'quiz', 'cauhoi'],
  category: 'games',
  description: 'Đố vui trắc nghiệm giải trí — không cộng xu, chỉ tính chuỗi trả lời đúng',
  usage: '[độ khó] [chủ đề]',
  cooldown: 8,
  guildOnly: true,
  slash: true,
  // Tên option chỉ dùng chữ thường không dấu để khớp tuyệt đối với tên đã
  // đăng ký lên Discord (tên có dấu cách/ký tự lạ sẽ bị đổi -> đọc không ra).
  options: [
    {
      name: 'dokho',
      type: 'string',
      description: 'Chọn độ khó của câu hỏi',
      required: false,
      choices: [
        { name: '🟢 Dễ (20 giây)', value: 'easy' },
        { name: '🟡 Vừa (25 giây)', value: 'medium' },
        { name: '🔴 Khó (30 giây)', value: 'hard' },
      ],
    },
    {
      name: 'chude',
      type: 'string',
      description: 'Chọn chủ đề câu hỏi',
      required: false,
      choices: [
        { name: '🔬 Khoa học', value: 'science' },
        { name: '🌍 Địa lý', value: 'geography' },
        { name: '🏛️ Lịch sử', value: 'history' },
        { name: '💻 Công nghệ', value: 'tech' },
        { name: '🔢 Toán học', value: 'math' },
        { name: '🐾 Thiên nhiên', value: 'nature' },
        { name: '🎭 Văn hoá & Giải trí', value: 'culture' },
      ],
    },
  ],

  async run(ctx) {
    const userId = ctx.author.id;
    const now = Date.now();
    sweepMemory(now);

    // --- Không cho mở hai ván cùng lúc ---
    if (activeGames.has(userId)) {
      return ctx
        .reply({
          embeds: [
            Embed.warn('Bạn đang có một câu đố chưa trả lời', 'Hãy hoàn thành câu đố hiện tại (hoặc đợi hết giờ) rồi chơi tiếp nhé!'),
          ],
        })
        .catch(() => {});
    }

    // --- Lọc câu hỏi theo yêu cầu ---
    const { difficulty, category } = resolveFilters(ctx);
    let pool = QUESTIONS;
    if (category) pool = pool.filter((item) => item.c === category);
    if (difficulty) pool = pool.filter((item) => item.d === difficulty);
    // Nếu bộ lọc quá hẹp, nới dần thay vì báo lỗi cho người chơi.
    if (!pool.length && category) pool = QUESTIONS.filter((item) => item.c === category);
    if (!pool.length && difficulty) pool = QUESTIONS.filter((item) => item.d === difficulty);
    if (!pool.length) pool = QUESTIONS;

    const item = pickQuestion(userId, pool, now);
    const meta = CATEGORIES[item.c] || CATEGORIES.science;
    const diff = DIFFICULTIES[item.d] || DIFFICULTIES.easy;

    // --- Đảo thứ tự đáp án ---
    const order = rng.shuffle([0, 1, 2, 3]);
    const options = order.map((i) => item.o[i]);
    const correctIdx = order.indexOf(item.a);

    rememberQuestion(userId, item.key, now);
    activeGames.set(userId, now);

    // Mỗi ván có một mã riêng -> nút của ván này không lẫn với ván khác.
    const idPrefix = `trivia:${userId}:${rng.randomHex(4)}`;
    const endsAt = now + diff.time;

    let msg = null;
    try {
      msg = await ctx.reply({
        embeds: [questionEmbed(item, options, meta, diff, endsAt, ctx)],
        components: buildRows(idPrefix, options),
      });
    } catch (err) {
      activeGames.delete(userId);
      throw err; // runner sẽ ghi log và báo lỗi thân thiện
    }

    if (!msg || typeof msg.createMessageComponentCollector !== 'function') {
      activeGames.delete(userId);
      return;
    }

    // Ghi nhận nhiệm vụ "chơi trò chơi" ngay khi câu đố được gửi thành công.
    try {
      const w = db.getWallet(userId);
      quests.track(w, 'game', 1);
      db.saveWallet(userId, w);
    } catch { /* không để việc ghi nhiệm vụ làm hỏng ván chơi */ }

    let finished = false;
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => typeof i.customId === 'string' && i.customId.startsWith(`${idPrefix}:`),
      time: diff.time,
    });

    collector.on('collect', async (i) => {
      try {
        if (i.user.id !== userId) {
          return i
            .reply({
              content: `${emoji.error} Đây không phải câu đố của bạn! Gõ \`trivia\` để tự mở câu đố riêng nhé.`,
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
        // Chống bấm nhanh nhiều nút: chỉ lần bấm đầu tiên được tính.
        if (finished) return i.deferUpdate().catch(() => {});
        finished = true;

        const picked = Number.parseInt(String(i.customId).split(':').pop(), 10);
        const validPick = Number.isInteger(picked) && picked >= 0 && picked < options.length;
        const correct = validPick && picked === correctIdx;

        // --- Chỉ ghi thống kê & nhiệm vụ. TUYỆT ĐỐI KHÔNG đổi số dư (w.balance). ---
        let streak = 0;
        let best = 0;
        let totalCorrect = 0;
        let totalWrong = 0;
        try {
          const w = db.getWallet(userId);
          const stats = ensureTriviaStats(w);
          if (correct) {
            stats.correct += 1;
            stats.streak += 1;
            if (stats.streak > stats.best) stats.best = stats.streak;
            quests.track(w, 'triviaCorrect', 1);
          } else {
            stats.wrong += 1;
            stats.streak = 0;
          }
          streak = stats.streak;
          best = stats.best;
          totalCorrect = stats.correct;
          totalWrong = stats.wrong;
          db.saveWallet(userId, w);
        } catch { /* lỗi lưu dữ liệu không được làm hỏng phần hiển thị */ }

        const review = reviewList(options, correctIdx, validPick ? picked : -1);
        let result;
        if (correct) {
          const lines = [
            review,
            '',
            `🔥 **Chuỗi đúng:** ${streak}  ${emoji.dot}  ${emoji.trophy} **Kỷ lục:** ${best}`,
            `📈 **Thống kê:** ✅ ${totalCorrect} đúng  ${emoji.dot}  ❌ ${totalWrong} sai`,
          ];
          result = Embed.success('Chính xác! 🎉', lines.join('\n')).setFooter({
            text: `${meta.label} • ${diff.label} ${diff.stars} • ${ctx.author.username}`,
          });
        } else {
          const lines = [
            review,
            '',
            `Đáp án đúng là **${LETTERS[correctIdx]}. ${options[correctIdx]}**.`,
            '💪 Không sao cả, thử lại câu khác nhé!',
          ];
          result = Embed.error('Sai rồi! 😢', lines.join('\n')).setFooter({
            text: `${meta.label} • ${diff.label} ${diff.stars} • Chuỗi đúng đã về 0`,
          });
        }

        const payload = {
          embeds: [result],
          components: buildRows(idPrefix, options, {
            disabled: true,
            correctIdx,
            pickedIdx: validPick ? picked : -1,
          }),
        };
        try {
          await i.update(payload);
        } catch {
          await safeEdit(msg, payload);
        }
      } catch (err) {
        finished = true;
        ctx.client?.logger?.error?.(`Lỗi xử lý nút trivia: ${err?.stack || err}`);
      } finally {
        try { collector.stop('answered'); } catch { /* bỏ qua */ }
      }
    });

    collector.on('end', () => {
      activeGames.delete(userId);
      if (finished) return;
      finished = true;
      // Hết giờ: chỉ reset chuỗi trả lời đúng, không động gì tới số dư.
      try {
        const w = db.getWallet(userId);
        const stats = ensureTriviaStats(w);
        if (stats.streak !== 0) {
          stats.streak = 0;
          db.saveWallet(userId, w);
        }
      } catch { /* bỏ qua */ }

      const timeout = Embed.warn(
        'Hết giờ ⏰',
        [
          reviewList(options, correctIdx, -1),
          '',
          `Đáp án đúng là **${LETTERS[correctIdx]}. ${options[correctIdx]}**.`,
          'Lần sau nhanh tay hơn nhé!',
        ].join('\n'),
      ).setFooter({ text: `${meta.label} • ${diff.label} ${diff.stars}` });

      safeEdit(msg, {
        embeds: [timeout],
        components: buildRows(idPrefix, options, { disabled: true, correctIdx }),
      });
    });
  },
};
