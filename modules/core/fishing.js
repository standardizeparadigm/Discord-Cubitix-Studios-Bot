const rng = require('./secureRandom');
// =============================================================
//  fishing - dữ liệu & tiện ích cho hệ thống câu cá
//  - Định nghĩa các độ hiếm (rarity) và loài cá (species)
//  - Bốc cá ngẫu nhiên theo trọng số
//  - Tạo khung "emoji động" (animation) cho legendary / fable / hidden
// =============================================================

// Giá thả cần mỗi lần câu
const FISH_COST = 10;

// -------------------------------------------------------------
//  Bảng độ hiếm. weight = trọng số xuất hiện (càng cao càng dễ ra)
//  min/max = khoảng giá bán khi thu hoạch từ aquarium.
// -------------------------------------------------------------
const RARITIES = {
  common:    { key: 'common',    label: 'Thường',      badge: '⚪', color: 0x95a5a6, weight: 58,     min: 2,      max: 5,       order: 1 },
  uncommon:  { key: 'uncommon',  label: 'Ít gặp',      badge: '🟢', color: 0x2ecc71, weight: 28,     min: 8,      max: 14,      order: 2 },
  rare:      { key: 'rare',      label: 'Hiếm',        badge: '🔵', color: 0x3498db, weight: 11,     min: 24,     max: 40,      order: 3 },
  epic:      { key: 'epic',      label: 'Sử thi',      badge: '🟣', color: 0x9b59b6, weight: 2.5,    min: 120,    max: 190,     order: 4 },
  mythic:    { key: 'mythic',    label: 'Thần thoại',  badge: '🔴', color: 0xe91e63, weight: 0.4,    min: 800,    max: 1300,    order: 5 },
  legendary: { key: 'legendary', label: 'Huyền thoại', badge: '🟡', color: 0xffd700, weight: 0.08,   min: 4800,   max: 7500,    order: 6, animated: true },
  fable:     { key: 'fable',     label: 'Cổ tích',     badge: '🔷', color: 0x38bdf8, weight: 0.015,  min: 32000,  max: 50000,   order: 7, animated: true },
  hidden:    { key: 'hidden',    label: 'Ẩn giấu',     badge: '⬛', color: 0x111827, weight: 0.005,  min: 120000, max: 190000,  order: 8, animated: true },
};

// -------------------------------------------------------------
//  Danh sách loài cá (nhiều loại, nhiều độ hiếm)
//  id: khóa duy nhất (không dấu) • name: tên hiển thị • emoji • rarity
// -------------------------------------------------------------
// -------------------------------------------------------------
//  Giá bán CỐ ĐỊNH theo độ hiếm (xu) — đã cân bằng lại với phí thả cần
//  (FISH_COST = 10 xu). Nguyên tắc cân bằng:
//   • Mỗi bậc đóng góp một phần lợi nhuận tương đương nhau, bậc càng hiếm
//     càng đóng góp nhiều hơn một chút — không còn bậc nào "vô dụng".
//   • Kỳ vọng ~33,9 xu/lượt câu, lãi ròng ~23,9 xu/lượt (có lãi nhưng không phá vỡ kinh tế).
//   • fable / hidden giờ CÓ THỂ đạt được (1/6.667 và 1/20.000) thay vì 1/100.000 và 1/1.000.000.
// -------------------------------------------------------------
const PRICES = {
  common: 3,
  uncommon: 10,
  rare: 30,
  epic: 150,
  mythic: 1000,
  legendary: 6000,
  fable: 40000,
  hidden: 150000,
};

const SPECIES = [
  // ---- Common ----
  { id: 'ca_com',       name: 'Cá cơm',            emoji: '🐟', rarity: 'common' },
  { id: 'ca_moi',       name: 'Cá mòi',            emoji: '🐟', rarity: 'common' },
  { id: 'ca_trich',     name: 'Cá trích',          emoji: '🐟', rarity: 'common' },
  { id: 'tep_riu',      name: 'Tép riu',           emoji: '🦐', rarity: 'common' },
  { id: 'oc_bien',      name: 'Ốc biển',           emoji: '🐌', rarity: 'common' },
  { id: 'vo_so',        name: 'Vỏ sò',             emoji: '🐚', rarity: 'common' },
  { id: 'rong_bien',    name: 'Rong biển',         emoji: '🌿', rarity: 'common' },
  { id: 'ca_bong',      name: 'Cá bống',            emoji: '🐟', rarity: 'common' },
  { id: 'hen_bien',     name: 'Hến biển',           emoji: '🦪', rarity: 'common' },

  // ---- Uncommon ----
  { id: 'ca_bay_mau',   name: 'Cá bảy màu',        emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_vang',      name: 'Cá vàng',           emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_ro',        name: 'Cá rô phi',         emoji: '🐟', rarity: 'uncommon' },
  { id: 'cua_dong',     name: 'Cua đồng',          emoji: '🦀', rarity: 'uncommon' },
  { id: 'sao_bien',     name: 'Sao biển',          emoji: '⭐', rarity: 'uncommon' },
  { id: 'sua_nho',      name: 'Sứa nhỏ',           emoji: '🪼', rarity: 'uncommon' },
  { id: 'ca_chep',      name: 'Cá chép',            emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_tre',       name: 'Cá trê',             emoji: '🐟', rarity: 'uncommon' },

  // ---- Rare ----
  { id: 'ca_noc',       name: 'Cá nóc',            emoji: '🐡', rarity: 'rare' },
  { id: 'muc_ong',      name: 'Mực ống',           emoji: '🦑', rarity: 'rare' },
  { id: 'cua_hoang_de', name: 'Cua hoàng đế',      emoji: '🦀', rarity: 'rare' },
  { id: 'tom_hum',      name: 'Tôm hùm',           emoji: '🦞', rarity: 'rare' },
  { id: 'rua_bien',     name: 'Rùa biển',          emoji: '🐢', rarity: 'rare' },
  { id: 'ca_ngu',       name: 'Cá ngừ đại dương',   emoji: '🐟', rarity: 'rare' },
  { id: 'muc_khong_lo', name: 'Mực khổng lồ',        emoji: '🦑', rarity: 'rare' },

  // ---- Epic ----
  { id: 'bach_tuoc',    name: 'Bạch tuộc',         emoji: '🐙', rarity: 'epic' },
  { id: 'ca_heo',       name: 'Cá heo',            emoji: '🐬', rarity: 'epic' },
  { id: 'hai_cau',      name: 'Hải cẩu',           emoji: '🦭', rarity: 'epic' },
  { id: 'ca_sau',       name: 'Cá sấu',            emoji: '🐊', rarity: 'epic' },
  { id: 'ca_duoi_manta', name: 'Cá đuối Manta',      emoji: '🐟', rarity: 'epic' },
  { id: 'ca_map_voi',   name: 'Cá mập voi',          emoji: '🦈', rarity: 'epic' },

  // ---- Mythic ----
  { id: 'ca_map',       name: 'Cá mập trắng',      emoji: '🦈', rarity: 'mythic' },
  { id: 'ca_voi',       name: 'Cá voi lưng gù',    emoji: '🐋', rarity: 'mythic' },
  { id: 'ca_voi_xanh',  name: 'Cá voi xanh',       emoji: '🐳', rarity: 'mythic' },
  { id: 'rong_bien_co', name: 'Rồng biển cổ',        emoji: '🐉', rarity: 'mythic' },

  // ---- Legendary (vàng, lấp lánh vàng) ----
  { id: 'hai_long_vang', name: 'Hải Long Hoàng Kim', emoji: '🐉', rarity: 'legendary' },
  { id: 'kraken_vang',   name: 'Kraken Ánh Vàng',    emoji: '🦑', rarity: 'legendary' },
  { id: 'phuong_hoang_nuoc', name: 'Phượng Hoàng Nước', emoji: '🦚', rarity: 'legendary' },
  { id: 'ngoc_long_vang', name: 'Ngọc Long Hoàng Kim', emoji: '🐲', rarity: 'legendary' },

  // ---- Fable (xanh da trời, lấp lánh xanh) ----
  { id: 'nang_tien_ca',  name: 'Nàng Tiên Cá',      emoji: '🧜', rarity: 'fable' },
  { id: 'giao_long_lam', name: 'Giao Long Lam',     emoji: '🐲', rarity: 'fable' },
  { id: 'thuy_than_lam', name: 'Thủy Thần Lam',       emoji: '🌊', rarity: 'fable' },

  // ---- Hidden (lúc ẩn lúc hiện) ----
  { id: 'bong_ma_dai_duong', name: 'Bóng Ma Đại Dương', emoji: '👻', rarity: 'hidden' },
  { id: 'mat_vuc_tham',      name: 'Mắt Vực Thẳm',       emoji: '👁️', rarity: 'hidden' },
  { id: 'hu_khong_ngu',      name: 'Hư Không Ngư',        emoji: '🌌', rarity: 'hidden' },

  // ---- Bổ sung LTS: thêm nhiều loài cá mới ----
  // Common (thêm)
  { id: 'ca_linh',       name: 'Cá linh',            emoji: '🐟', rarity: 'common' },
  { id: 'ca_chach',      name: 'Cá chạch',           emoji: '🐟', rarity: 'common' },
  { id: 'oc_buou',       name: 'Ốc bươu',            emoji: '🐌', rarity: 'common' },
  { id: 'ca_man',        name: 'Cá mắm',             emoji: '🐟', rarity: 'common' },
  // Uncommon (thêm)
  { id: 'ca_koi',        name: 'Cá Koi',             emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_thac_lac',   name: 'Cá thác lác',        emoji: '🐟', rarity: 'uncommon' },
  { id: 'tom_cang',      name: 'Tôm càng xanh',      emoji: '🦐', rarity: 'uncommon' },
  { id: 'ca_lang',       name: 'Cá lăng',            emoji: '🐟', rarity: 'uncommon' },
  // Rare (thêm)
  { id: 'ca_mu',         name: 'Cá mú',              emoji: '🐟', rarity: 'rare' },
  { id: 'so_diep',       name: 'Sò điệp',            emoji: '🦪', rarity: 'rare' },
  { id: 'muc_nang',      name: 'Mực nang',           emoji: '🦑', rarity: 'rare' },
  // Epic (thêm)
  { id: 'ca_buom_bien',  name: 'Cá bướm biển',       emoji: '🐠', rarity: 'epic' },
  { id: 'ca_kiem',       name: 'Cá kiếm',            emoji: '🗡️', rarity: 'epic' },
  { id: 'ca_map_bua',    name: 'Cá mập búa',         emoji: '🦈', rarity: 'epic' },
  // Mythic (thêm)
  { id: 'bach_tuoc_khong_lo', name: 'Bạch tuộc khổng lồ', emoji: '🐙', rarity: 'mythic' },
  { id: 'ca_nha_tang',   name: 'Cá nhà táng',        emoji: '🐋', rarity: 'mythic' },
  // Legendary (thêm)
  { id: 'ngu_vuong_vang', name: 'Ngư Vương Hoàng Kim', emoji: '🐡', rarity: 'legendary' },
  { id: 'thanh_kiem_bien', name: 'Thánh Kiếm Đại Dương', emoji: '⚔️', rarity: 'legendary' },
  // Fable (thêm)
  { id: 'hai_vuong_lam', name: 'Hải Vương Lam',      emoji: '🔱', rarity: 'fable' },
  { id: 'tinh_linh_song', name: 'Tinh Linh Sóng Nước', emoji: '🧚', rarity: 'fable' },
  // Hidden (thêm)
  { id: 'u_linh_bien',   name: 'U Linh Biển Sâu',    emoji: '🦑', rarity: 'hidden' },
  { id: 'quy_vuc_sau',   name: 'Quỷ Vực Sâu',        emoji: '👺', rarity: 'hidden' },
  // ---- Bổ sung LTS đợt 2: thêm nhiều loài ở tất cả độ hiếm ----
  // Common (thêm)
  { id: 'ca_dieu_hong', name: 'Cá diêu hồng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_sac', name: 'Cá sặc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_ro_dong', name: 'Cá rô đồng', emoji: '🐟', rarity: 'common' },
  { id: 'oc_len', name: 'Ốc len', emoji: '🐌', rarity: 'common' },
  { id: 'ngheu', name: 'Nghêu', emoji: '🦪', rarity: 'common' },
  { id: 'ca_don', name: 'Cá đối', emoji: '🐟', rarity: 'common' },
  { id: 'ca_nuc', name: 'Cá nục', emoji: '🐟', rarity: 'common' },
  { id: 'tep_bac', name: 'Tép bạc', emoji: '🦐', rarity: 'common' },
  { id: 'ca_bong_tuong', name: 'Cá bống tượng', emoji: '🐟', rarity: 'common' },
  // Uncommon (thêm)
  { id: 'ca_he', name: 'Cá hề', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_dia', name: 'Cá đĩa', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_thien_than', name: 'Cá thiên thần', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_ngua', name: 'Cá ngựa', emoji: '🐠', rarity: 'uncommon' },
  { id: 'luon_bien', name: 'Lươn biển', emoji: '🐍', rarity: 'uncommon' },
  { id: 'ca_bo', name: 'Cá bò', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_hoi', name: 'Cá hồi', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_trap', name: 'Cá tráp', emoji: '🐟', rarity: 'uncommon' },
  // Rare (thêm)
  { id: 'ca_su_tu', name: 'Cá sư tử', emoji: '🐡', rarity: 'rare' },
  { id: 'ca_dao', name: 'Cá đao', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_mat_trang', name: 'Cá mặt trăng', emoji: '🌕', rarity: 'rare' },
  { id: 'ca_chinh', name: 'Cá chình', emoji: '🐍', rarity: 'rare' },
  { id: 'oc_anh_vu', name: 'Ốc anh vũ', emoji: '🐚', rarity: 'rare' },
  { id: 'sam_bien', name: 'Sam biển', emoji: '🦀', rarity: 'rare' },
  { id: 'ca_hong', name: 'Cá hồng', emoji: '🐟', rarity: 'rare' },
  // Epic (thêm)
  { id: 'ca_map_ho', name: 'Cá mập hổ', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_xanh', name: 'Cá mập xanh', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_voi_sat_thu', name: 'Cá voi sát thủ', emoji: '🐋', rarity: 'epic' },
  { id: 'rua_luyt', name: 'Rùa luýt', emoji: '🐢', rarity: 'epic' },
  { id: 'muc_ma_ca_rong', name: 'Mực ma cà rồng', emoji: '🦑', rarity: 'epic' },
  { id: 'ca_mat_quy', name: 'Cá mặt quỷ', emoji: '🐡', rarity: 'epic' },
  // Mythic (thêm)
  { id: 'thuong_long', name: 'Thương Long', emoji: '🐉', rarity: 'mythic' },
  { id: 'ca_map_megalodon', name: 'Megalodon', emoji: '🦈', rarity: 'mythic' },
  { id: 'hai_quai', name: 'Hải Quái', emoji: '🐙', rarity: 'mythic' },
  { id: 'ca_rong_co_dai', name: 'Cá Rồng Cổ Đại', emoji: '🐲', rarity: 'mythic' },
  { id: 'thuy_xa', name: 'Thủy Xà Khổng Lồ', emoji: '🐍', rarity: 'mythic' },
  // Legendary (thêm)
  { id: 'thuy_hoang_kim', name: 'Thủy Hoàng Kim Ngư', emoji: '🐋', rarity: 'legendary' },
  { id: 'kim_quy_than', name: 'Kim Quy Thần', emoji: '🐢', rarity: 'legendary' },
  { id: 'hoa_long_ngu', name: 'Hỏa Long Ngư', emoji: '🐲', rarity: 'legendary' },
  { id: 'bach_kim_ngu_vuong', name: 'Bạch Kim Ngư Vương', emoji: '🐡', rarity: 'legendary' },
  // Fable (thêm)
  { id: 'hai_tinh_lam', name: 'Hải Tinh Lam', emoji: '🌊', rarity: 'fable' },
  { id: 'bang_long_lam', name: 'Băng Long Lam', emoji: '🐉', rarity: 'fable' },
  { id: 'ngoc_giao_lam', name: 'Ngọc Giao Lam', emoji: '🐲', rarity: 'fable' },
  { id: 'tien_ngu_lam', name: 'Tiên Ngư Lam', emoji: '🧜', rarity: 'fable' },
  // Hidden (thêm)
  { id: 'hu_vo_ngu', name: 'Hư Vô Ngư', emoji: '🌌', rarity: 'hidden' },
  { id: 'am_anh_bien_sau', name: 'Ám Ảnh Biển Sâu', emoji: '👻', rarity: 'hidden' },
  { id: 'ma_ngu_vuc_tham', name: 'Ma Ngư Vực Thẳm', emoji: '👺', rarity: 'hidden' },
  { id: 'bong_toi_vinh_hang', name: 'Bóng Tối Vĩnh Hằng', emoji: '🕳️', rarity: 'hidden' },
  // ===== Bổ sung thêm loài (LTS đợt 2) =====
  // Common (thêm)
  { id: 'ca_bong_lau', name: 'Cá bông lau', emoji: '🐟', rarity: 'common' },
  { id: 'ca_diec', name: 'Cá diếc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_mai', name: 'Cá mài', emoji: '🐟', rarity: 'common' },
  { id: 'ca_muong', name: 'Cá mương', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bac_ma', name: 'Cá bạc má', emoji: '🐟', rarity: 'common' },
  { id: 'ca_phen', name: 'Cá phèn', emoji: '🐟', rarity: 'common' },
  { id: 'oc_huong', name: 'Ốc hương', emoji: '🐚', rarity: 'common' },
  { id: 'oc_mo', name: 'Ốc mỡ', emoji: '🐚', rarity: 'common' },
  { id: 'so_long', name: 'Sò lông', emoji: '🦪', rarity: 'common' },
  { id: 'tep_dat', name: 'Tép đất', emoji: '🦐', rarity: 'common' },
  // Uncommon (thêm)
  { id: 'ca_chim', name: 'Cá chim', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_dua', name: 'Cá dứa', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_mang', name: 'Cá măng', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_tai_tuong', name: 'Cá tai tượng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_ali', name: 'Cá Ali', emoji: '🐠', rarity: 'uncommon' },
  { id: 'tom_su', name: 'Tôm sú', emoji: '🦐', rarity: 'uncommon' },
  { id: 'tom_the', name: 'Tôm thẻ', emoji: '🦐', rarity: 'uncommon' },
  { id: 'muc_la', name: 'Mực lá', emoji: '🦑', rarity: 'uncommon' },
  { id: 'ca_phuong_hoang', name: 'Cá phượng hoàng', emoji: '🐠', rarity: 'uncommon' },
  // Rare (thêm)
  { id: 'ca_thu', name: 'Cá thu', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_cam', name: 'Cá cam', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_bop', name: 'Cá bớp', emoji: '🐟', rarity: 'rare' },
  { id: 'muc_ma', name: 'Mực ma', emoji: '🦑', rarity: 'rare' },
  { id: 'ghe_xanh', name: 'Ghẹ xanh', emoji: '🦀', rarity: 'rare' },
  { id: 'tom_tit', name: 'Tôm tít', emoji: '🦐', rarity: 'rare' },
  { id: 'ca_chem', name: 'Cá chẽm', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_tam', name: 'Cá tầm', emoji: '🐟', rarity: 'rare' },
  // Epic (thêm)
  { id: 'ca_map_trang', name: 'Cá mập chanh vàng', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_coi', name: 'Cá mập côi', emoji: '🦈', rarity: 'epic' },
  { id: 'luon_dien', name: 'Lươn điện', emoji: '⚡', rarity: 'epic' },
  { id: 'hai_ma_khong_lo', name: 'Hải mã khổng lồ', emoji: '🐎', rarity: 'epic' },
  { id: 'muc_hoang_de', name: 'Mực hoàng đế', emoji: '🦑', rarity: 'epic' },
  { id: 'hai_tuong', name: 'Hải tượng', emoji: '🦭', rarity: 'epic' },
  { id: 'ky_lan_bien', name: 'Kỳ lân biển', emoji: '🦄', rarity: 'epic' },
  // Mythic (thêm)
  { id: 'bach_tuoc_ma', name: 'Bạch tuộc ma', emoji: '🐙', rarity: 'mythic' },
  { id: 'xa_bien_khong_lo', name: 'Xà biển khổng lồ', emoji: '🐉', rarity: 'mythic' },
  { id: 'ca_map_yeu_tinh', name: 'Cá mập yêu tinh', emoji: '🦈', rarity: 'mythic' },
  { id: 'quai_vat_ho', name: 'Quái vật hồ', emoji: '🦕', rarity: 'mythic' },
  { id: 'hai_xa_than', name: 'Hải xà thần', emoji: '🐍', rarity: 'mythic' },
  { id: 'thuy_ma', name: 'Thủy ma', emoji: '👻', rarity: 'mythic' },
  // Legendary (thêm)
  { id: 'long_vuong_vang', name: 'Long vương vàng', emoji: '🐲', rarity: 'legendary' },
  { id: 'kim_ngu_vuong', name: 'Kim ngư vương', emoji: '🐟', rarity: 'legendary' },
  { id: 'hai_ho_vang', name: 'Hải hổ vàng', emoji: '🐅', rarity: 'legendary' },
  { id: 'quy_vuong_vang', name: 'Quy vương vàng', emoji: '🐢', rarity: 'legendary' },
  { id: 'bach_long_vang', name: 'Bạch long vàng', emoji: '🐉', rarity: 'legendary' },
  // Fable (thêm)
  { id: 'thuy_long_lam', name: 'Thủy long lam', emoji: '🐉', rarity: 'fable' },
  { id: 'bach_tuoc_lam', name: 'Bạch tuộc lam', emoji: '🐙', rarity: 'fable' },
  { id: 'phuong_hoang_lam', name: 'Phượng hoàng lam', emoji: '🔥', rarity: 'fable' },
  { id: 'ngan_ha_ngu_lam', name: 'Ngân hà ngư lam', emoji: '🌌', rarity: 'fable' },
  // Hidden (thêm)
  { id: 'vuc_tham_vuong', name: 'Vực thẳm vương', emoji: '🌑', rarity: 'hidden' },
  { id: 'bong_toi_nguyen_thuy', name: 'Bóng tối nguyên thủy', emoji: '⬛', rarity: 'hidden' },
  { id: 'ac_mong_bien', name: 'Ác mộng biển', emoji: '💀', rarity: 'hidden' },
  { id: 'hu_vo_than', name: 'Hư vô thần', emoji: '🕳️', rarity: 'hidden' },
  // ===== Bổ sung LTS đợt 3: thêm nhiều loài common/uncommon/rare/epic =====
  // Common (thêm)
  { id: 'ca_chai', name: 'Cá chai', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_da', name: 'Cá bống đá', emoji: '🐟', rarity: 'common' },
  { id: 'ca_lau_kieng', name: 'Cá lau kiếng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bay_trau', name: 'Cá bảy trầu', emoji: '🐟', rarity: 'common' },
  { id: 'ca_liet', name: 'Cá liệt', emoji: '🐟', rarity: 'common' },
  { id: 'ca_ngan', name: 'Cá ngân', emoji: '🐟', rarity: 'common' },
  { id: 'ca_com_than', name: 'Cá cơm than', emoji: '🐟', rarity: 'common' },
  { id: 'ca_keo', name: 'Cá kèo', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_sao', name: 'Cá bống sao', emoji: '🐟', rarity: 'common' },
  { id: 'oc_gao', name: 'Ốc gạo', emoji: '🐚', rarity: 'common' },
  { id: 'oc_vit', name: 'Ốc vịt', emoji: '🐚', rarity: 'common' },
  { id: 'so_huyet', name: 'Sò huyết', emoji: '🦪', rarity: 'common' },
  { id: 'tep_rong', name: 'Tép rong', emoji: '🦐', rarity: 'common' },
  { id: 'ca_ranh', name: 'Cá rằm', emoji: '🐟', rarity: 'common' },
  // Uncommon (thêm)
  { id: 'ca_la_han', name: 'Cá la hán', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_neon', name: 'Cá neon', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_molly', name: 'Cá molly', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_kiem_duoi', name: 'Cá kiếm đuôi', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_sac_ran', name: 'Cá sặc rằn', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_loc', name: 'Cá lóc', emoji: '🐟', rarity: 'uncommon' },
  { id: 'luon_dong', name: 'Lươn đồng', emoji: '🐍', rarity: 'uncommon' },
  { id: 'ca_chach_lau', name: 'Cá chạch lấu', emoji: '🐟', rarity: 'uncommon' },
  { id: 'cua_ca_ra', name: 'Cua cà ra', emoji: '🦀', rarity: 'uncommon' },
  { id: 'oc_nhoi', name: 'Ốc nhồi', emoji: '🐚', rarity: 'uncommon' },
  { id: 'ca_nheo', name: 'Cá nheo', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_leo', name: 'Cá leo', emoji: '🐟', rarity: 'uncommon' },
  // Rare (thêm)
  { id: 'ca_duoi_dien', name: 'Cá đuối điện', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_map_meo', name: 'Cá mập mèo', emoji: '🦈', rarity: 'rare' },
  { id: 'hai_sam', name: 'Hải sâm', emoji: '🥒', rarity: 'rare' },
  { id: 'cau_gai', name: 'Cầu gai', emoji: '🦔', rarity: 'rare' },
  { id: 'bao_ngu', name: 'Bào ngư', emoji: '🦪', rarity: 'rare' },
  { id: 'tu_hai', name: 'Tu hài', emoji: '🦪', rarity: 'rare' },
  { id: 'ca_ho', name: 'Cá hổ', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_rong', name: 'Cá rồng', emoji: '🐉', rarity: 'rare' },
  { id: 'ca_can', name: 'Cá căng', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_song', name: 'Cá song', emoji: '🐟', rarity: 'rare' },
  { id: 'so_mai', name: 'Sò mai', emoji: '🦪', rarity: 'rare' },
  { id: 'ca_uc', name: 'Cá úc', emoji: '🐟', rarity: 'rare' },
  // Epic (thêm)
  { id: 'ca_ngu_vay_xanh', name: 'Cá ngừ vây xanh', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_map_dai_duong', name: 'Cá mập đại dương', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_voi_xam', name: 'Cá voi xám', emoji: '🐋', rarity: 'epic' },
  { id: 'luon_moray', name: 'Lươn Moray khổng lồ', emoji: '🐍', rarity: 'epic' },
  { id: 'sua_hop', name: 'Sứa hộp', emoji: '🪼', rarity: 'epic' },
  { id: 'cua_nhen_bien', name: 'Cua nhện biển', emoji: '🦀', rarity: 'epic' },
  { id: 'ca_thai_duong', name: 'Cá thái dương', emoji: '🐟', rarity: 'epic' },
  { id: 'hai_cau_voi', name: 'Hải cẩu voi', emoji: '🦭', rarity: 'epic' },
  { id: 'ca_duoi_gai_doc', name: 'Cá đuối gai độc', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_map_san_ho', name: 'Cá mập rạn san hô', emoji: '🦈', rarity: 'epic' },

  // ===================================================================
  //  BỔ SUNG LTS ĐỢT 3 — 210 loài cá mới, trải đều ở cả 8 độ hiếm.
  //  Toàn bộ id và tên đều duy nhất (đã kiểm tra tự động khi chèn).
  // ===================================================================

  // ---- Common (46 loài mới) ----
  { id: 'ca_ro_phi_vang', name: 'Cá rô phi vàng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_tram_co', name: 'Cá trắm cỏ', emoji: '🐟', rarity: 'common' },
  { id: 'ca_me_trang', name: 'Cá mè trắng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_me_hoa', name: 'Cá mè hoa', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_cat', name: 'Cá bống cát', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_trung', name: 'Cá bống trứng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_linh_ong', name: 'Cá linh ống', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chot', name: 'Cá chốt', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chot_giay', name: 'Cá chốt giấy', emoji: '🐟', rarity: 'common' },
  { id: 'ca_sat', name: 'Cá sát', emoji: '🐟', rarity: 'common' },
  { id: 'ca_sat_soc', name: 'Cá sát sọc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_thieu', name: 'Cá thiều', emoji: '🐟', rarity: 'common' },
  { id: 'ca_tra_song', name: 'Cá tra sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_du_song', name: 'Cá dứa sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_he_vang', name: 'Cá hè vàng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_lanh_canh', name: 'Cá lành canh', emoji: '🐟', rarity: 'common' },
  { id: 'ca_ngat', name: 'Cá ngạnh', emoji: '🐟', rarity: 'common' },
  { id: 'ca_uc_nau', name: 'Cá úc nâu', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_keo', name: 'Cá bống kèo', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_dua', name: 'Cá bống dừa', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_xeo', name: 'Cá bống xẹo', emoji: '🐟', rarity: 'common' },
  { id: 'ca_liet_soc', name: 'Cá liệt sọc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_nuc_hoa', name: 'Cá nục hoa', emoji: '🐟', rarity: 'common' },
  { id: 'ca_trich_xuong', name: 'Cá trích xương', emoji: '🐟', rarity: 'common' },
  { id: 'ca_com_song', name: 'Cá cơm sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_moi_dau', name: 'Cá mòi dầu', emoji: '🐟', rarity: 'common' },
  { id: 'ca_phen_hong', name: 'Cá phèn hồng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bac_ma_nho', name: 'Cá bạc má nhỏ', emoji: '🐟', rarity: 'common' },
  { id: 'ca_ranh_song', name: 'Cá ranh sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_mai_song', name: 'Cá mài sông', emoji: '🐟', rarity: 'common' },
  { id: 'tep_song', name: 'Tép sông', emoji: '🦐', rarity: 'common' },
  { id: 'tep_moi', name: 'Tép mòi', emoji: '🦐', rarity: 'common' },
  { id: 'tep_bien', name: 'Tép biển', emoji: '🦐', rarity: 'common' },
  { id: 'oc_dua', name: 'Ốc dừa', emoji: '🐌', rarity: 'common' },
  { id: 'oc_sen_bien', name: 'Ốc sên biển', emoji: '🐌', rarity: 'common' },
  { id: 'oc_tu_va', name: 'Ốc tù và', emoji: '🐚', rarity: 'common' },
  { id: 'oc_mong_tay', name: 'Ốc móng tay', emoji: '🐚', rarity: 'common' },
  { id: 'so_giay', name: 'Sò giấy', emoji: '🐚', rarity: 'common' },
  { id: 'so_dua', name: 'Sò dừa', emoji: '🐚', rarity: 'common' },
  { id: 'hen_song', name: 'Hến sông', emoji: '🦪', rarity: 'common' },
  { id: 'ngheu_lua', name: 'Nghêu lụa', emoji: '🦪', rarity: 'common' },
  { id: 'vem_xanh', name: 'Vẹm xanh', emoji: '🦪', rarity: 'common' },
  { id: 'vo_oc_nho', name: 'Vỏ ốc nhỏ', emoji: '🐚', rarity: 'common' },
  { id: 'rong_mo', name: 'Rong mơ', emoji: '🌿', rarity: 'common' },
  { id: 'rong_nho', name: 'Rong nho', emoji: '🌿', rarity: 'common' },
  { id: 'rau_cau_bien', name: 'Rau câu biển', emoji: '🌿', rarity: 'common' },

  // ---- Uncommon (40 loài mới) ----
  { id: 'ca_chep_giay', name: 'Cá chép giấy', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_chep_vay_rong', name: 'Cá chép vảy rồng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_koi_kohaku', name: 'Cá Koi Kohaku', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_koi_showa', name: 'Cá Koi Showa', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_vang_duoi_quat', name: 'Cá vàng đuôi quạt', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_vang_dau_lan', name: 'Cá vàng đầu lân', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_dia_bo_cau', name: 'Cá đĩa bồ câu', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_dia_lam', name: 'Cá đĩa lam', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_ali_xanh', name: 'Cá Ali xanh', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_la_han_kim', name: 'Cá la hán kim', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_hoi_do', name: 'Cá hồi đỏ', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_trap_vang', name: 'Cá tráp vàng', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_chim_trang', name: 'Cá chim trắng', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_chim_den', name: 'Cá chim đen', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_dua_xanh', name: 'Cá dứa xanh', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_mang_ro', name: 'Cá măng rổ', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_ro_bien', name: 'Cá rô biển', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_bo_giap', name: 'Cá bò giáp', emoji: '🐡', rarity: 'uncommon' },
  { id: 'ca_nheo_song', name: 'Cá nheo sông', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_leo_song', name: 'Cá leo sông', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_loc_bong', name: 'Cá lóc bông', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_thac_lac_com', name: 'Cá thác lác cườm', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_sac_buom', name: 'Cá sặc bướm', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_kiem_xanh', name: 'Cá kiếm xanh', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_neon_xanh', name: 'Cá neon xanh', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_molly_den', name: 'Cá Molly đen', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_phuong_hoang_lua', name: 'Cá phượng hoàng lửa', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_thien_than_van', name: 'Cá thiên thần vằn', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_ngua_gai', name: 'Cá ngựa gai', emoji: '🦄', rarity: 'uncommon' },
  { id: 'luon_com', name: 'Lươn cơm', emoji: '🐍', rarity: 'uncommon' },
  { id: 'tom_sat', name: 'Tôm sắt', emoji: '🦐', rarity: 'uncommon' },
  { id: 'tom_bac_bien', name: 'Tôm bạc biển', emoji: '🦐', rarity: 'uncommon' },
  { id: 'tom_cang_lua', name: 'Tôm càng lửa', emoji: '🦐', rarity: 'uncommon' },
  { id: 'muc_com', name: 'Mực cơm', emoji: '🦑', rarity: 'uncommon' },
  { id: 'muc_tuoc', name: 'Mực tuộc', emoji: '🦑', rarity: 'uncommon' },
  { id: 'cua_bien', name: 'Cua biển', emoji: '🦀', rarity: 'uncommon' },
  { id: 'cua_lot', name: 'Cua lột', emoji: '🦀', rarity: 'uncommon' },
  { id: 'oc_tai_tuong', name: 'Ốc tai tượng', emoji: '🐚', rarity: 'uncommon' },
  { id: 'sua_lua', name: 'Sứa lửa', emoji: '🪼', rarity: 'uncommon' },
  { id: 'sao_bien_do', name: 'Sao biển đỏ', emoji: '⭐', rarity: 'uncommon' },

  // ---- Rare (35 loài mới) ----
  { id: 'ca_hong_my', name: 'Cá hồng Mỹ', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_thu_ao', name: 'Cá thu ảo', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_mu_den', name: 'Cá mú đen', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_mu_do', name: 'Cá mú đỏ', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_song_vang', name: 'Cá song vàng', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_chem_bien', name: 'Cá chẽm biển', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_tam_song', name: 'Cá tầm sông', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_bop_den', name: 'Cá bớp đen', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_cam_bien', name: 'Cá cam biển', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_noc_hoa', name: 'Cá nóc hoa', emoji: '🐡', rarity: 'rare' },
  { id: 'ca_dao_lon', name: 'Cá đao lớn', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_chinh_bien', name: 'Cá chình biển', emoji: '🐍', rarity: 'rare' },
  { id: 'ca_ho_bien', name: 'Cá hố biển', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_rong_song', name: 'Cá rồng sông', emoji: '🐉', rarity: 'rare' },
  { id: 'muc_ong_lon', name: 'Mực ống lớn', emoji: '🦑', rarity: 'rare' },
  { id: 'muc_nang_hoa', name: 'Mực nang hoa', emoji: '🦑', rarity: 'rare' },
  { id: 'muc_sim', name: 'Mực sim', emoji: '🦑', rarity: 'rare' },
  { id: 'ghe_do', name: 'Ghẹ đỏ', emoji: '🦀', rarity: 'rare' },
  { id: 'cua_da', name: 'Cua đá', emoji: '🦀', rarity: 'rare' },
  { id: 'cua_huynh_de', name: 'Cua huỳnh đế', emoji: '🦀', rarity: 'rare' },
  { id: 'tom_hum_bong', name: 'Tôm hùm bông', emoji: '🦞', rarity: 'rare' },
  { id: 'tom_hum_xanh', name: 'Tôm hùm xanh', emoji: '🦞', rarity: 'rare' },
  { id: 'tom_tit_lon', name: 'Tôm tít lớn', emoji: '🦐', rarity: 'rare' },
  { id: 'hai_sam_den', name: 'Hải sâm đen', emoji: '🪱', rarity: 'rare' },
  { id: 'cau_gai_den', name: 'Cầu gai đen', emoji: '🌰', rarity: 'rare' },
  { id: 'bao_ngu_vang', name: 'Bào ngư vàng', emoji: '🦪', rarity: 'rare' },
  { id: 'tu_hai_lon', name: 'Tu hài lớn', emoji: '🦪', rarity: 'rare' },
  { id: 'so_diep_lon', name: 'Sò điệp lớn', emoji: '🦪', rarity: 'rare' },
  { id: 'oc_huong_bien', name: 'Ốc hương biển', emoji: '🐚', rarity: 'rare' },
  { id: 'oc_giac', name: 'Ốc giác', emoji: '🐚', rarity: 'rare' },
  { id: 'oc_mat_troi', name: 'Ốc mặt trời', emoji: '🐚', rarity: 'rare' },
  { id: 'sao_bien_gai', name: 'Sao biển gai', emoji: '⭐', rarity: 'rare' },
  { id: 'sao_bien_xanh', name: 'Sao biển xanh', emoji: '⭐', rarity: 'rare' },
  { id: 'rua_xanh', name: 'Rùa xanh', emoji: '🐢', rarity: 'rare' },
  { id: 'rua_doi_moi', name: 'Rùa đồi mồi', emoji: '🐢', rarity: 'rare' },

  // ---- Epic (30 loài mới) ----
  { id: 'ca_map_mako', name: 'Cá mập Mako', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_duoi_dai', name: 'Cá mập đuôi dài', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_ho_cat', name: 'Cá mập hổ cát', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_bo', name: 'Cá mập bò', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_thien_than', name: 'Cá mập thiên thần', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_voi_bryde', name: 'Cá voi Bryde', emoji: '🐋', rarity: 'epic' },
  { id: 'ca_voi_minke', name: 'Cá voi Minke', emoji: '🐋', rarity: 'epic' },
  { id: 'ca_voi_vay', name: 'Cá voi vây', emoji: '🐋', rarity: 'epic' },
  { id: 'ca_heo_hong', name: 'Cá heo hồng', emoji: '🐬', rarity: 'epic' },
  { id: 'ca_heo_mo_dai', name: 'Cá heo mõm dài', emoji: '🐬', rarity: 'epic' },
  { id: 'hai_cau_xam', name: 'Hải cẩu xám', emoji: '🦭', rarity: 'epic' },
  { id: 'bach_tuoc_vong_xanh', name: 'Bạch tuộc vòng xanh', emoji: '🐙', rarity: 'epic' },
  { id: 'bach_tuoc_dumbo', name: 'Bạch tuộc Dumbo', emoji: '🐙', rarity: 'epic' },
  { id: 'muc_nam_cuc', name: 'Mực khổng lồ Nam Cực', emoji: '🦑', rarity: 'epic' },
  { id: 'sua_khong_lo', name: 'Sứa khổng lồ', emoji: '🪼', rarity: 'epic' },
  { id: 'sua_bui_bien', name: 'Sứa bụi biển', emoji: '🪼', rarity: 'epic' },
  { id: 'cua_vua_alaska', name: 'Cua vua Alaska', emoji: '🦀', rarity: 'epic' },
  { id: 'tom_hum_khong_lo', name: 'Tôm hùm khổng lồ', emoji: '🦞', rarity: 'epic' },
  { id: 'ca_duoi_dai_bang', name: 'Cá đuối đại bàng', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_duoi_do', name: 'Cá đuối đỏ', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_co_kiem', name: 'Cá cờ kiếm', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_buom_hoang_gia', name: 'Cá bướm hoàng gia', emoji: '🐠', rarity: 'epic' },
  { id: 'rua_dau_to', name: 'Rùa đầu to', emoji: '🐢', rarity: 'epic' },
  { id: 'ca_sau_song', name: 'Cá sấu sông', emoji: '🐊', rarity: 'epic' },
  { id: 'luon_dien_khong_lo', name: 'Lươn điện khổng lồ', emoji: '🐍', rarity: 'epic' },
  { id: 'ca_ngu_kiem', name: 'Cá ngừ kiếm', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_mat_ma', name: 'Cá mắt ma', emoji: '🐡', rarity: 'epic' },
  { id: 'ca_rong_la', name: 'Cá rồng lá', emoji: '🐉', rarity: 'epic' },
  { id: 'hai_quy_bien', name: 'Hải quỷ biển', emoji: '🐡', rarity: 'epic' },
  { id: 'ca_vay_thep', name: 'Cá vảy thép', emoji: '🐟', rarity: 'epic' },

  // ---- Mythic (18 loài mới) ----
  { id: 'thanh_long_ngu', name: 'Thanh Long Ngư', emoji: '🐉', rarity: 'mythic' },
  { id: 'hac_long_ngu', name: 'Hắc Long Ngư', emoji: '🐉', rarity: 'mythic' },
  { id: 'huyen_vu_ngu', name: 'Huyền Vũ Ngư', emoji: '🐢', rarity: 'mythic' },
  { id: 'bach_ho_ngu', name: 'Bạch Hổ Ngư', emoji: '🐅', rarity: 'mythic' },
  { id: 'kim_xa_than', name: 'Kim Xà Thần', emoji: '🐍', rarity: 'mythic' },
  { id: 'thach_long_ngu', name: 'Thạch Long Ngư', emoji: '🪨', rarity: 'mythic' },
  { id: 'van_long_ngu', name: 'Vân Long Ngư', emoji: '🌫️', rarity: 'mythic' },
  { id: 'loi_long_ngu', name: 'Lôi Long Ngư', emoji: '⚡', rarity: 'mythic' },
  { id: 'phong_long_ngu', name: 'Phong Long Ngư', emoji: '🌪️', rarity: 'mythic' },
  { id: 'bang_ngu_than', name: 'Băng Ngư Thần', emoji: '❄️', rarity: 'mythic' },
  { id: 'viem_ngu_than', name: 'Viêm Ngư Thần', emoji: '🔥', rarity: 'mythic' },
  { id: 'tinh_ngu_than', name: 'Tinh Ngư Thần', emoji: '🌟', rarity: 'mythic' },
  { id: 'hai_de_ngu', name: 'Hải Đế Ngư', emoji: '🔱', rarity: 'mythic' },
  { id: 'cuu_dau_xa', name: 'Cửu Đầu Xà', emoji: '🐍', rarity: 'mythic' },
  { id: 'thien_ngu_khong_lo', name: 'Thiên Ngư Khổng Lồ', emoji: '🐋', rarity: 'mythic' },
  { id: 'dia_ngu_quai', name: 'Địa Ngư Quái', emoji: '🐙', rarity: 'mythic' },
  { id: 'hon_don_ngu', name: 'Hỗn Độn Ngư', emoji: '🌀', rarity: 'mythic' },
  { id: 'van_co_ngu', name: 'Vạn Cổ Ngư', emoji: '🧬', rarity: 'mythic' },

  // ---- Legendary (15 loài mới) ----
  { id: 'kim_giao_vuong', name: 'Kim Giao Vương', emoji: '🐉', rarity: 'legendary' },
  { id: 'hoang_kim_kraken', name: 'Hoàng Kim Kraken', emoji: '🐙', rarity: 'legendary' },
  { id: 'kim_phuong_ngu', name: 'Kim Phượng Ngư', emoji: '🕊️', rarity: 'legendary' },
  { id: 'thien_kim_ngu', name: 'Thiên Kim Ngư', emoji: '💫', rarity: 'legendary' },
  { id: 'kim_lan_ngu', name: 'Kim Lân Ngư', emoji: '🐲', rarity: 'legendary' },
  { id: 'hoang_kim_quy_vuong', name: 'Hoàng Kim Quy Vương', emoji: '🐢', rarity: 'legendary' },
  { id: 'kim_xa_vuong', name: 'Kim Xà Vương', emoji: '🐍', rarity: 'legendary' },
  { id: 'kim_hac_ngu', name: 'Kim Hạc Ngư', emoji: '🦩', rarity: 'legendary' },
  { id: 'dai_kim_ngu_than', name: 'Đại Kim Ngư Thần', emoji: '🐋', rarity: 'legendary' },
  { id: 'kim_thuy_than', name: 'Kim Thủy Thần', emoji: '🌊', rarity: 'legendary' },
  { id: 'hoang_kim_hai_vuong', name: 'Hoàng Kim Hải Vương', emoji: '🔱', rarity: 'legendary' },
  { id: 'kim_ma_ngu', name: 'Kim Mã Ngư', emoji: '🐎', rarity: 'legendary' },
  { id: 'kim_diep_ngu', name: 'Kim Điệp Ngư', emoji: '🦋', rarity: 'legendary' },
  { id: 'kim_tuoc_ngu', name: 'Kim Tước Ngư', emoji: '🐦', rarity: 'legendary' },
  { id: 'kim_long_than', name: 'Kim Long Thần', emoji: '🐲', rarity: 'legendary' },

  // ---- Fable (13 loài mới) ----
  { id: 'thuy_tinh_lam', name: 'Thủy Tinh Lam', emoji: '💎', rarity: 'fable' },
  { id: 'lam_ngoc_ngu', name: 'Lam Ngọc Ngư', emoji: '💙', rarity: 'fable' },
  { id: 'hai_nguyet_lam', name: 'Hải Nguyệt Lam', emoji: '🌙', rarity: 'fable' },
  { id: 'thanh_lam_giao', name: 'Thanh Lam Giao', emoji: '🐉', rarity: 'fable' },
  { id: 'lam_vu_ngu', name: 'Lam Vũ Ngư', emoji: '🌧️', rarity: 'fable' },
  { id: 'tinh_hai_lam', name: 'Tinh Hải Lam', emoji: '🌌', rarity: 'fable' },
  { id: 'lam_quang_ngu', name: 'Lam Quang Ngư', emoji: '✨', rarity: 'fable' },
  { id: 'huyen_lam_ngu', name: 'Huyền Lam Ngư', emoji: '🔵', rarity: 'fable' },
  { id: 'lam_phong_ngu', name: 'Lam Phong Ngư', emoji: '🌬️', rarity: 'fable' },
  { id: 'thuong_lam_ngu', name: 'Thượng Lam Ngư', emoji: '🌊', rarity: 'fable' },
  { id: 'lam_tuyet_ngu', name: 'Lam Tuyết Ngư', emoji: '❄️', rarity: 'fable' },
  { id: 'lam_dieu_ngu', name: 'Lam Diệu Ngư', emoji: '🪸', rarity: 'fable' },
  { id: 'hai_lam_than', name: 'Hải Lam Thần', emoji: '🧜', rarity: 'fable' },

  // ---- Hidden (13 loài mới) ----
  { id: 'hu_anh_ngu', name: 'Hư Ảnh Ngư', emoji: '🌫️', rarity: 'hidden' },
  { id: 'vong_linh_bien', name: 'Vong Linh Biển', emoji: '👻', rarity: 'hidden' },
  { id: 'tich_mich_ngu', name: 'Tịch Mịch Ngư', emoji: '🕳️', rarity: 'hidden' },
  { id: 'hac_vuc_ngu', name: 'Hắc Vực Ngư', emoji: '⬛', rarity: 'hidden' },
  { id: 'vo_danh_ngu', name: 'Vô Danh Ngư', emoji: '❓', rarity: 'hidden' },
  { id: 'am_vuc_than', name: 'Âm Vực Thần', emoji: '👺', rarity: 'hidden' },
  { id: 'tan_the_ngu', name: 'Tận Thế Ngư', emoji: '☠️', rarity: 'hidden' },
  { id: 'hu_tich_ngu', name: 'Hư Tịch Ngư', emoji: '🌑', rarity: 'hidden' },
  { id: 'mong_du_ngu', name: 'Mộng Du Ngư', emoji: '💤', rarity: 'hidden' },
  { id: 'hac_am_vuong', name: 'Hắc Âm Vương', emoji: '🌚', rarity: 'hidden' },
  { id: 'tuyet_vong_ngu', name: 'Tuyệt Vọng Ngư', emoji: '🕸️', rarity: 'hidden' },
  { id: 'lang_quen_ngu', name: 'Lãng Quên Ngư', emoji: '🌀', rarity: 'hidden' },
  { id: 'hu_khong_vuong', name: 'Hư Không Vương', emoji: '🕯️', rarity: 'hidden' },

  // ===================================================================
  //  BỔ SUNG ĐỢT 4 — mở rộng mạnh các bậc phổ thông (common → epic),
  //  chỉ thêm 1-2 loài cho các bậc cực hiếm (mythic → hidden).
  // ===================================================================

  // ---- Common (+57) ----
  { id: 'ca_tram_den', name: 'Cá trắm đen', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chep_gion', name: 'Cá chép giòn', emoji: '🐟', rarity: 'common' },
  { id: 'ca_me_vinh', name: 'Cá mè vinh', emoji: '🐟', rarity: 'common' },
  { id: 'ca_he_song', name: 'Cá he sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_et_moi', name: 'Cá ét mọi', emoji: '🐟', rarity: 'common' },
  { id: 'ca_danh', name: 'Cá dảnh', emoji: '🐟', rarity: 'common' },
  { id: 'ca_long_tong', name: 'Cá lòng tong', emoji: '🐟', rarity: 'common' },
  { id: 'ca_mai_bac', name: 'Cá mại bạc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_thieu_song', name: 'Cá thiểu sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_nhai', name: 'Cá nhái', emoji: '🐟', rarity: 'common' },
  { id: 'ca_kim_bien', name: 'Cá kìm biển', emoji: '🐟', rarity: 'common' },
  { id: 'ca_suot', name: 'Cá suốt', emoji: '🐟', rarity: 'common' },
  { id: 'ca_duc', name: 'Cá đục', emoji: '🐟', rarity: 'common' },
  { id: 'ca_luong', name: 'Cá lượng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_du', name: 'Cá đù', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bon_cat', name: 'Cá bơn cát', emoji: '🐟', rarity: 'common' },
  { id: 'ca_luoi_trau', name: 'Cá lưỡi trâu', emoji: '🐟', rarity: 'common' },
  { id: 'ca_khoai', name: 'Cá khoai', emoji: '🐟', rarity: 'common' },
  { id: 'ca_lep', name: 'Cá lẹp', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chao', name: 'Cá cháo', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chuon', name: 'Cá chuồn', emoji: '🐟', rarity: 'common' },
  { id: 'ca_ba_trau', name: 'Cá bã trầu', emoji: '🐟', rarity: 'common' },
  { id: 'ca_mom', name: 'Cá móm', emoji: '🐟', rarity: 'common' },
  { id: 'ca_trao', name: 'Cá tráo', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_moi', name: 'Cá bống mọi', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_tran', name: 'Cá bống trân', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chai_song', name: 'Cá chài sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_cong', name: 'Cá cấn', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bay_mau_hoang', name: 'Cá bảy màu hoang', emoji: '🐟', rarity: 'common' },
  { id: 'ca_don_song', name: 'Cá đối sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_tuc', name: 'Cá tức', emoji: '🐟', rarity: 'common' },
  { id: 'oc_bun', name: 'Ốc bùn', emoji: '🐌', rarity: 'common' },
  { id: 'oc_ruoc', name: 'Ốc ruốc', emoji: '🐌', rarity: 'common' },
  { id: 'oc_da', name: 'Ốc đá', emoji: '🐌', rarity: 'common' },
  { id: 'oc_ca_na', name: 'Ốc cà na', emoji: '🐚', rarity: 'common' },
  { id: 'oc_mut', name: 'Ốc mút', emoji: '🐚', rarity: 'common' },
  { id: 'oc_bien_nho', name: 'Ốc biển nhỏ', emoji: '🐚', rarity: 'common' },
  { id: 'so_lua', name: 'Sò lụa', emoji: '🦪', rarity: 'common' },
  { id: 'so_nua', name: 'Sò nứa', emoji: '🦪', rarity: 'common' },
  { id: 'hau_sua', name: 'Hàu sữa', emoji: '🦪', rarity: 'common' },
  { id: 'hau_da', name: 'Hàu đá', emoji: '🦪', rarity: 'common' },
  { id: 'vem_den', name: 'Vẹm đen', emoji: '🦪', rarity: 'common' },
  { id: 'don_bien', name: 'Don biển', emoji: '🦪', rarity: 'common' },
  { id: 'dat_bien', name: 'Dắt biển', emoji: '🦪', rarity: 'common' },
  { id: 'tep_trung', name: 'Tép trứng', emoji: '🦐', rarity: 'common' },
  { id: 'tep_bo', name: 'Tép bò', emoji: '🦐', rarity: 'common' },
  { id: 'ruoc_bien', name: 'Ruốc biển', emoji: '🦐', rarity: 'common' },
  { id: 'cua_da_nho', name: 'Cua đá nhỏ', emoji: '🦀', rarity: 'common' },
  { id: 'cong_gio', name: 'Còng gió', emoji: '🦀', rarity: 'common' },
  { id: 'ba_khia', name: 'Ba khía', emoji: '🦀', rarity: 'common' },
  { id: 'rong_cau', name: 'Rong câu', emoji: '🌿', rarity: 'common' },
  { id: 'rong_da', name: 'Rong đá', emoji: '🌿', rarity: 'common' },
  { id: 'co_bien', name: 'Cỏ biển', emoji: '🌿', rarity: 'common' },
  { id: 'beo_nuoc', name: 'Bèo nước', emoji: '🌿', rarity: 'common' },
  { id: 'la_muc_rua', name: 'Lá mục trôi', emoji: '🍂', rarity: 'common' },
  { id: 'vo_hau_cu', name: 'Vỏ hàu cũ', emoji: '🐚', rarity: 'common' },
  { id: 'day_reu', name: 'Dây rêu nước', emoji: '🌿', rarity: 'common' },

  // ---- Uncommon (+41) ----
  { id: 'ca_betta', name: 'Cá betta', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_vang_ba_duoi', name: 'Cá vàng ba đuôi', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_tu_van', name: 'Cá tứ vân', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_hong_ket', name: 'Cá hồng két', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_mun', name: 'Cá mún', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_but_chi', name: 'Cá bút chì', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_otto', name: 'Cá otto', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_chuot_cory', name: 'Cá chuột cory', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_sac_gam', name: 'Cá sặc gấm', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_tre_vang', name: 'Cá trê vàng', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_hoi_van', name: 'Cá hồi vân', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_tuyet', name: 'Cá tuyết', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_bon_sao', name: 'Cá bơn sao', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_doi_muc', name: 'Cá đối mục', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_hanh', name: 'Cá hanh', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_nhech', name: 'Cá nhệch', emoji: '🐍', rarity: 'uncommon' },
  { id: 'ca_huong', name: 'Cá hường', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_bong_bop', name: 'Cá bống bớp', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_ong_dieu', name: 'Cá ong điêu', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_dao_nuoc_ngot', name: 'Cá đao nước ngọt', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_ngan_bien', name: 'Cá ngân biển', emoji: '🐟', rarity: 'uncommon' },
  { id: 'tom_dat', name: 'Tôm đất', emoji: '🦐', rarity: 'uncommon' },
  { id: 'tom_hum_dat', name: 'Tôm hùm đất', emoji: '🦐', rarity: 'uncommon' },
  { id: 'tep_sakura', name: 'Tép cảnh Sakura', emoji: '🦐', rarity: 'uncommon' },
  { id: 'cua_gach', name: 'Cua gạch', emoji: '🦀', rarity: 'uncommon' },
  { id: 'ghe_ba_cham', name: 'Ghẹ ba chấm', emoji: '🦀', rarity: 'uncommon' },
  { id: 'muc_trung', name: 'Mực trứng', emoji: '🦑', rarity: 'uncommon' },
  { id: 'bach_tuoc_mini', name: 'Bạch tuộc mini', emoji: '🐙', rarity: 'uncommon' },
  { id: 'sua_sen', name: 'Sứa sen', emoji: '🪼', rarity: 'uncommon' },
  { id: 'hai_quy', name: 'Hải quỳ', emoji: '🪸', rarity: 'uncommon' },
  { id: 'san_ho_mem', name: 'San hô mềm', emoji: '🪸', rarity: 'uncommon' },
  { id: 'oc_vu_nang', name: 'Ốc vú nàng', emoji: '🐚', rarity: 'uncommon' },
  { id: 'diep_quat', name: 'Điệp quạt', emoji: '🦪', rarity: 'uncommon' },
  { id: 'hau_thai_binh', name: 'Hàu Thái Bình Dương', emoji: '🦪', rarity: 'uncommon' },
  { id: 'ca_song_bien', name: 'Cá sòng biển', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_bang_chai_nho', name: 'Cá bàng chài nhỏ', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_thia_bien', name: 'Cá thia biển', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_bay_sac', name: 'Cá bảy sắc cầu vồng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_kim_cuong', name: 'Cá kim cương', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_hoang_de_nho', name: 'Cá hoàng đế nhỏ', emoji: '🐠', rarity: 'uncommon' },
  { id: 'luon_suoi', name: 'Lươn suối', emoji: '🐍', rarity: 'uncommon' },

  // ---- Rare (+24) ----
  { id: 'ca_nhong_lon', name: 'Cá nhồng lớn', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_ngu_van', name: 'Cá ngừ vằn', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_mu_sao', name: 'Cá mú sao', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_mu_nghe', name: 'Cá mú nghệ', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_hong_do', name: 'Cá hồng đỏ', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_du_vang', name: 'Cá đù vàng', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_su_vang', name: 'Cá sủ vàng', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_anh_vu', name: 'Cá anh vũ', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_lang_cham', name: 'Cá lăng chấm', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_chien_song', name: 'Cá chiên sông', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_dam_xanh', name: 'Cá dầm xanh', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_chay_dat', name: 'Cá chày đất', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_vuoc_den', name: 'Cá vược đen', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_mo', name: 'Cá mó', emoji: '🐠', rarity: 'rare' },
  { id: 'ca_bang_chai_lon', name: 'Cá bàng chài lớn', emoji: '🐠', rarity: 'rare' },
  { id: 'cua_da_bien', name: 'Cua đá biển', emoji: '🦀', rarity: 'rare' },
  { id: 'oc_voi_voi', name: 'Ốc vòi voi', emoji: '🐚', rarity: 'rare' },
  { id: 'oc_nhay', name: 'Ốc nhảy', emoji: '🐚', rarity: 'rare' },
  { id: 'nhim_bien_do', name: 'Nhím biển đỏ', emoji: '🦔', rarity: 'rare' },
  { id: 'ca_duoi_buom', name: 'Cá đuối bướm', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_map_tre', name: 'Cá mập tre', emoji: '🦈', rarity: 'rare' },
  { id: 'ca_bo_hom', name: 'Cá bò hòm', emoji: '🐡', rarity: 'rare' },
  { id: 'ca_nog_gai', name: 'Cá nóc gai', emoji: '🐡', rarity: 'rare' },
  { id: 'ca_thia_hoang_gia', name: 'Cá thia hoàng gia', emoji: '🐠', rarity: 'rare' },

  // ---- Epic (+17) ----
  { id: 'ca_co_kiem_xanh', name: 'Cá cờ kiếm xanh', emoji: '🗡️', rarity: 'epic' },
  { id: 'ca_buom_dai_duong', name: 'Cá buồm đại dương', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_ngu_vay_vang', name: 'Cá ngừ vây vàng', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_mu_khong_lo', name: 'Cá mú khổng lồ', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_duoi_quy', name: 'Cá đuối quỷ', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_duoi_o', name: 'Cá đuối ó', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_map_vay_trang', name: 'Cá mập vây trắng', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_mieng_to', name: 'Cá mập miệng to', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_tham', name: 'Cá mập thảm', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_phoi_nang', name: 'Cá mập phơi nắng', emoji: '🦈', rarity: 'epic' },
  { id: 'cua_dua_khong_lo', name: 'Cua dừa khổng lồ', emoji: '🦀', rarity: 'epic' },
  { id: 'rua_xanh_dai_duong', name: 'Rùa xanh đại dương', emoji: '🐢', rarity: 'epic' },
  { id: 'hai_cau_bao', name: 'Hải cẩu báo', emoji: '🦭', rarity: 'epic' },
  { id: 'su_tu_bien', name: 'Sư tử biển', emoji: '🦭', rarity: 'epic' },
  { id: 'lon_bien', name: 'Lợn biển', emoji: '🦭', rarity: 'epic' },
  { id: 'ca_voi_mom_khoam', name: 'Cá voi mõm khoằm', emoji: '🐋', rarity: 'epic' },
  { id: 'ca_mat_trang_khong_lo', name: 'Cá mặt trăng khổng lồ', emoji: '🌕', rarity: 'epic' },

  // ---- Mythic (+2) ----
  { id: 'xa_vuong_dai_duong', name: 'Xà Vương Đại Dương', emoji: '🐍', rarity: 'mythic' },
  { id: 'ca_voi_hu_anh', name: 'Cá Voi Hư Ảnh', emoji: '🐋', rarity: 'mythic' },

  // ---- Legendary (+2) ----
  { id: 'kim_lan_hai_vuong', name: 'Kim Lân Hải Vương', emoji: '👑', rarity: 'legendary' },
  { id: 'than_ngu_bao_to', name: 'Thần Ngư Bão Tố', emoji: '⚡', rarity: 'legendary' },

  // ---- Fable (+2) ----
  { id: 'nguyet_tien_ngu', name: 'Nguyệt Tiên Ngư', emoji: '🌙', rarity: 'fable' },
  { id: 'thien_ha_giao_lam', name: 'Thiên Hà Giao Lam', emoji: '🌌', rarity: 'fable' },

  // ---- Hidden (+1) ----
  { id: 'tich_diet_ngu', name: 'Tịch Diệt Ngư', emoji: '🕳️', rarity: 'hidden' },

  // =====================================================================
  // Bổ sung LTS đợt 3 — thêm nhiều loài độ hiếm thấp, 1-2 loài độ hiếm cao
  // =====================================================================

  // ---- Common / Thường (+45) ----
  { id: 'ca_bong_hoa', name: 'Cá bống hoa', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_vay', name: 'Cá bống vảy', emoji: '🐟', rarity: 'common' },
  { id: 'ca_bong_bun', name: 'Cá bống bùn', emoji: '🐟', rarity: 'common' },
  { id: 'ca_com_soc', name: 'Cá cơm sọc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_trich_bac', name: 'Cá trích bạc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_moi_co', name: 'Cá mòi cờ', emoji: '🐟', rarity: 'common' },
  { id: 'ca_nuc_gai', name: 'Cá nục gai', emoji: '🐟', rarity: 'common' },
  { id: 'ca_liet_bac', name: 'Cá liệt bạc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_phen_soc', name: 'Cá phèn sọc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_duc_bac', name: 'Cá đục bạc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_luong_vang', name: 'Cá lượng vàng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_du_bac', name: 'Cá đù bạc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_khoai_bien', name: 'Cá khoai biển', emoji: '🐟', rarity: 'common' },
  { id: 'ca_lep_vang', name: 'Cá lẹp vàng', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chao_bien', name: 'Cá cháo biển', emoji: '🐟', rarity: 'common' },
  { id: 'ca_mom_soc', name: 'Cá móm sọc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_ranh_dat', name: 'Cá ranh đất', emoji: '🐟', rarity: 'common' },
  { id: 'ca_mai_hoa', name: 'Cá mại hoa', emoji: '🐟', rarity: 'common' },
  { id: 'ca_long_tong_da', name: 'Cá lòng tong đá', emoji: '🐟', rarity: 'common' },
  { id: 'ca_chach_suoi', name: 'Cá chạch suối', emoji: '🐟', rarity: 'common' },
  { id: 'ca_ro_suoi', name: 'Cá rô suối', emoji: '🐟', rarity: 'common' },
  { id: 'ca_diec_bac', name: 'Cá diếc bạc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_muong_soc', name: 'Cá mương sọc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_thieu_bac', name: 'Cá thiểu bạc', emoji: '🐟', rarity: 'common' },
  { id: 'ca_nhai_song', name: 'Cá nhái sông', emoji: '🐟', rarity: 'common' },
  { id: 'ca_suot_bac', name: 'Cá suốt bạc', emoji: '🐟', rarity: 'common' },
  { id: 'tep_da', name: 'Tép đá', emoji: '🦐', rarity: 'common' },
  { id: 'tep_suoi', name: 'Tép suối', emoji: '🦐', rarity: 'common' },
  { id: 'tep_lot', name: 'Tép lột', emoji: '🦐', rarity: 'common' },
  { id: 'oc_xoan', name: 'Ốc xoắn', emoji: '🐚', rarity: 'common' },
  { id: 'oc_nhoi_dong', name: 'Ốc nhồi đồng', emoji: '🐚', rarity: 'common' },
  { id: 'oc_que', name: 'Ốc que', emoji: '🐚', rarity: 'common' },
  { id: 'oc_dia', name: 'Ốc đĩa', emoji: '🐚', rarity: 'common' },
  { id: 'oc_tim', name: 'Ốc tím', emoji: '🐚', rarity: 'common' },
  { id: 'so_quat', name: 'Sò quạt', emoji: '🐚', rarity: 'common' },
  { id: 'so_tram', name: 'Sò trám', emoji: '🐚', rarity: 'common' },
  { id: 'hen_da', name: 'Hến đá', emoji: '🐚', rarity: 'common' },
  { id: 'ngheu_trang', name: 'Nghêu trắng', emoji: '🐚', rarity: 'common' },
  { id: 'vem_nau', name: 'Vẹm nâu', emoji: '🐚', rarity: 'common' },
  { id: 'hau_nho', name: 'Hàu nhỏ', emoji: '🐚', rarity: 'common' },
  { id: 'rong_duoi_cho', name: 'Rong đuôi chó', emoji: '🌿', rarity: 'common' },
  { id: 'rong_xoan', name: 'Rong xoắn', emoji: '🌿', rarity: 'common' },
  { id: 'rong_luoi_meo', name: 'Rong lưỡi mèo', emoji: '🌿', rarity: 'common' },
  { id: 'co_lac_nuoc', name: 'Cỏ lác nước', emoji: '🌿', rarity: 'common' },
  { id: 'vo_so_vun', name: 'Vỏ sò vụn', emoji: '🐚', rarity: 'common' },

  // ---- Uncommon / Ít gặp (+35) ----
  { id: 'ca_koi_sanke', name: 'Cá Koi Sanke', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_koi_bach_kim', name: 'Cá Koi Bạch Kim', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_vang_mat_rong', name: 'Cá vàng mắt rồng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_betta_koi', name: 'Cá Betta Koi', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_betta_rong', name: 'Cá Betta rồng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_dia_bach_tuyet', name: 'Cá đĩa bạch tuyết', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_dia_da_beo', name: 'Cá đĩa da beo', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_la_han_ngoc_trai', name: 'Cá la hán ngọc trai', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_neon_vua', name: 'Cá neon vua', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_tu_van_vang', name: 'Cá tứ vân vàng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_mun_cam', name: 'Cá mún cam', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_chuot_thuy_tinh', name: 'Cá chuột thủy tinh', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_sac_lua', name: 'Cá sặc lửa', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_thanh_ngoc', name: 'Cá thanh ngọc', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_lia_thia', name: 'Cá lia thia', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_hong_ket_vang', name: 'Cá hồng két vàng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_ali_vang', name: 'Cá Ali vàng', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_phuong_hoang_bong', name: 'Cá phượng hoàng bông', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_kiem_do', name: 'Cá kiếm đỏ', emoji: '🐠', rarity: 'uncommon' },
  { id: 'ca_thac_lac_hoa', name: 'Cá thác lác hoa', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_loc_den', name: 'Cá lóc đen', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_tre_phi', name: 'Cá trê phi', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_lang_vang', name: 'Cá lăng vàng', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_chem_song', name: 'Cá chẽm sông', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_hoi_bac', name: 'Cá hồi bạc', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_trap_den', name: 'Cá tráp đen', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_hanh_vang', name: 'Cá hanh vàng', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_doi_vay_to', name: 'Cá đối vảy to', emoji: '🐟', rarity: 'uncommon' },
  { id: 'ca_nhech_song', name: 'Cá nhệch sông', emoji: '🐍', rarity: 'uncommon' },
  { id: 'tom_cang_song', name: 'Tôm càng sông', emoji: '🦐', rarity: 'uncommon' },
  { id: 'tom_the_chan_trang', name: 'Tôm thẻ chân trắng', emoji: '🦐', rarity: 'uncommon' },
  { id: 'muc_la_vang', name: 'Mực lá vàng', emoji: '🦑', rarity: 'uncommon' },
  { id: 'cua_ram', name: 'Cua rằm', emoji: '🦀', rarity: 'uncommon' },
  { id: 'ghe_hoa', name: 'Ghẹ hoa', emoji: '🦀', rarity: 'uncommon' },
  { id: 'sao_bien_vang', name: 'Sao biển vàng', emoji: '⭐', rarity: 'uncommon' },

  // ---- Rare / Hiếm (+26) ----
  { id: 'ca_mu_cop', name: 'Cá mú cọp', emoji: '🐡', rarity: 'rare' },
  { id: 'ca_mu_chuot', name: 'Cá mú chuột', emoji: '🐡', rarity: 'rare' },
  { id: 'ca_song_do', name: 'Cá song đỏ', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_hong_bac', name: 'Cá hồng bạc', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_thu_vach', name: 'Cá thu vạch', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_cam_soc', name: 'Cá cam sọc', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_bop_bien', name: 'Cá bớp biển', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_nhong_vang', name: 'Cá nhồng vàng', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_tam_beluga', name: 'Cá tầm Beluga', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_chinh_hoa', name: 'Cá chình hoa', emoji: '🐍', rarity: 'rare' },
  { id: 'ca_chinh_nhat', name: 'Cá chình Nhật', emoji: '🐍', rarity: 'rare' },
  { id: 'ca_duoi_van', name: 'Cá đuối vằn', emoji: '🐟', rarity: 'rare' },
  { id: 'ca_map_vay_den', name: 'Cá mập vây đen', emoji: '🦈', rarity: 'rare' },
  { id: 'ca_map_bao', name: 'Cá mập báo', emoji: '🦈', rarity: 'rare' },
  { id: 'muc_ong_hoa', name: 'Mực ống hoa', emoji: '🦑', rarity: 'rare' },
  { id: 'muc_nang_van', name: 'Mực nang vằn', emoji: '🦑', rarity: 'rare' },
  { id: 'cua_hoang_de_do', name: 'Cua hoàng đế đỏ', emoji: '🦀', rarity: 'rare' },
  { id: 'cua_tuyet', name: 'Cua tuyết', emoji: '🦀', rarity: 'rare' },
  { id: 'tom_hum_da', name: 'Tôm hùm đá', emoji: '🦞', rarity: 'rare' },
  { id: 'tom_hum_sen', name: 'Tôm hùm sen', emoji: '🦞', rarity: 'rare' },
  { id: 'rua_quan_dong', name: 'Rùa quản đồng', emoji: '🐢', rarity: 'rare' },
  { id: 'so_diep_hoa', name: 'Sò điệp hoa', emoji: '🐚', rarity: 'rare' },
  { id: 'bao_ngu_chin_lo', name: 'Bào ngư chín lỗ', emoji: '🐚', rarity: 'rare' },
  { id: 'oc_xa_cu', name: 'Ốc xà cừ', emoji: '🐚', rarity: 'rare' },
  { id: 'hai_sam_gai', name: 'Hải sâm gai', emoji: '🥒', rarity: 'rare' },
  { id: 'cau_gai_tim', name: 'Cầu gai tím', emoji: '🌰', rarity: 'rare' },

  // ---- Epic / Sử thi (+18) ----
  { id: 'ca_map_dau_bua_lon', name: 'Cá mập đầu búa lớn', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_hang_dong', name: 'Cá mập hang động', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_sau_mang', name: 'Cá mập sáu mang', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_map_trang_xanh', name: 'Cá mập trắng xanh', emoji: '🦈', rarity: 'epic' },
  { id: 'ca_voi_sei', name: 'Cá voi Sei', emoji: '🐋', rarity: 'epic' },
  { id: 'ca_voi_dau_bo', name: 'Cá voi đầu bò', emoji: '🐋', rarity: 'epic' },
  { id: 'ca_voi_hoa_tieu', name: 'Cá voi hoa tiêu', emoji: '🐋', rarity: 'epic' },
  { id: 'ca_heo_trang', name: 'Cá heo trắng', emoji: '🐬', rarity: 'epic' },
  { id: 'ca_heo_irrawaddy', name: 'Cá heo Irrawaddy', emoji: '🐬', rarity: 'epic' },
  { id: 'hai_cau_rau', name: 'Hải cẩu râu', emoji: '🦭', rarity: 'epic' },
  { id: 'bach_tuoc_do_khong_lo', name: 'Bạch tuộc đỏ khổng lồ', emoji: '🐙', rarity: 'epic' },
  { id: 'muc_kiem_khong_lo', name: 'Mực kiếm khổng lồ', emoji: '🦑', rarity: 'epic' },
  { id: 'sua_bom_bien', name: 'Sứa bờm biển', emoji: '🪼', rarity: 'epic' },
  { id: 'cua_nhen_nhat_ban', name: 'Cua nhện Nhật Bản', emoji: '🦀', rarity: 'epic' },
  { id: 'ca_duoi_dien_khong_lo', name: 'Cá đuối điện khổng lồ', emoji: '🐟', rarity: 'epic' },
  { id: 'ca_mat_trang_dai_duong', name: 'Cá mặt trăng đại dương', emoji: '🌕', rarity: 'epic' },
  { id: 'rua_da_khong_lo', name: 'Rùa da khổng lồ', emoji: '🐢', rarity: 'epic' },
  { id: 'ca_sau_nuoc_man', name: 'Cá sấu nước mặn', emoji: '🐊', rarity: 'epic' },

  // ---- Mythic / Thần thoại (+2) ----
  { id: 'bang_hai_than_ngu', name: 'Băng Hải Thần Ngư', emoji: '🐉', rarity: 'mythic' },
  { id: 'cuu_vi_hai_ngu', name: 'Cửu Vĩ Hải Ngư', emoji: '🐉', rarity: 'mythic' },

  // ---- Legendary / Huyền thoại (+2) ----
  { id: 'kim_vu_ngu_de', name: 'Kim Vũ Ngư Đế', emoji: '👑', rarity: 'legendary' },
  { id: 'hoang_kim_thuong_long', name: 'Hoàng Kim Thương Long', emoji: '🐲', rarity: 'legendary' },

  // ---- Fable / Cổ tích (+2) ----
  { id: 'lam_tinh_giao_long', name: 'Lam Tinh Giao Long', emoji: '💠', rarity: 'fable' },
  { id: 'bich_hai_tien_ngu', name: 'Bích Hải Tiên Ngư', emoji: '💙', rarity: 'fable' },

  // ---- Hidden / Ẩn giấu (+1) ----
  { id: 'vo_tan_hu_ngu', name: 'Vô Tận Hư Ngư', emoji: '🕳️', rarity: 'hidden' },
];

const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

function rarityMeta(key) {
  return RARITIES[key] || RARITIES.common;
}

function speciesById(id) {
  return SPECIES_BY_ID[id] || null;
}

function speciesByRarity(key) {
  return SPECIES.filter((s) => s.rarity === key);
}

// Giá trị thực tế của một con cá trong bể (luôn theo bảng giá hiện tại).
// Nhờ vậy khi cân bằng lại giá, cá cũ trong bể không còn giữ giá cũ (tránh lạm phát
// hoặc thiệt thòi cho người chơi cũ). Có dự phòng cho loài đã bị gỡ khỏi danh sách.
function valueOf(fish) {
  if (!fish) return 0;
  const sp = speciesById(fish.id);
  if (sp && typeof PRICES[sp.rarity] === 'number') return PRICES[sp.rarity];
  return Number(fish.value) || 0;
}

function randInt(min, max) {
  return Math.floor(min + rng.randomFloat() * (max - min + 1));
}

// Bốc một độ hiếm theo trọng số
function pickRarity() {
  const keys = Object.keys(RARITIES);
  const total = keys.reduce((a, k) => a + RARITIES[k].weight, 0);
  let r = rng.randomFloat() * total;
  for (const k of keys) {
    if ((r -= RARITIES[k].weight) <= 0) return k;
  }
  return 'common';
}

// Bốc một mẻ câu: { species, rarity(meta), rarityKey, value }
function pickCatch() {
  const rarityKey = pickRarity();
  const pool = speciesByRarity(rarityKey);
  const species = pool[Math.floor(rng.randomFloat() * pool.length)];
  const meta = rarityMeta(rarityKey);
  const value = PRICES[rarityKey];
  return { species, rarity: meta, rarityKey, value };
}

// -------------------------------------------------------------
//  "Emoji động": các khung hình để chỉnh sửa (edit) tin nhắn liên tục,
//  tạo cảm giác lấp lánh / ẩn hiện cho cá hiếm nhất.
//  Trả về mảng { text, color }.
// -------------------------------------------------------------
function animationFrames(species, rarityKey) {
  const e = species.emoji;
  const name = species.name;

  if (rarityKey === 'legendary') {
    // Lấp lánh ÁNH VÀNG
    const golds = [0xffd700, 0xffdf3f, 0xf1c40f, 0xffec8b, 0xffd700];
    const frames = [
      `✨🌟  ${e}  🌟✨`,
      `🌟💫  ${e}  💫🌟`,
      `💛⭐  ${e}  ⭐💛`,
      `⭐✨  ${e}  ✨⭐`,
      `🌟💛  ${e}  💛🌟`,
    ];
    return frames.map((f, i) => ({
      text: `\`\`\`✨ CÁ HUYỀN THOẠI ✨\`\`\`\n${f}\n**${name}** rực rỡ ánh vàng!`,
      color: golds[i % golds.length],
    }));
  }

  if (rarityKey === 'fable') {
    // Lấp lánh ÁNH XANH DA TRỜI
    const blues = [0x38bdf8, 0x60a5fa, 0x22d3ee, 0x7dd3fc, 0x38bdf8];
    const frames = [
      `💠🔷  ${e}  🔷💠`,
      `🔷🌀  ${e}  🌀🔷`,
      `💧💙  ${e}  💙💧`,
      `🌀💠  ${e}  💠🌀`,
      `💙🔷  ${e}  🔷💙`,
    ];
    return frames.map((f, i) => ({
      text: `\`\`\`🔷 CÁ CỔ TÍCH 🔷\`\`\`\n${f}\n**${name}** lấp lánh ánh xanh da trời!`,
      color: blues[i % blues.length],
    }));
  }

  if (rarityKey === 'hidden') {
    // Lúc BIẾN lúc XUẤT HIỆN
    const dark = 0x111827;
    const glow = 0x6d28d9;
    return [
      { text: `\`\`\`⬛ ??? ⬛\`\`\`\n〰️〰️  🌫️  〰️〰️\n*Có gì đó vừa lướt qua...*`, color: dark },
      { text: `\`\`\`⬛ ??? ⬛\`\`\`\n👁️‍🗨️  ${e}  👁️‍🗨️\n*Nó hiện ra trong chớp mắt!*`, color: glow },
      { text: `\`\`\`⬛ ??? ⬛\`\`\`\n〰️〰️  🌫️  〰️〰️\n*...rồi lại biến mất.*`, color: dark },
      { text: `\`\`\`⬛ ??? ⬛\`\`\`\n✨  ${e}  ✨\n*Bạn đã tóm được nó!*`, color: glow },
      { text: `\`\`\`⬛ ẨN GIẤU ⬛\`\`\`\n🫧  ${e}  🫧\n**${name}** — sinh vật của bóng tối!`, color: glow },
    ];
  }

  return null; // các độ hiếm thường không có animation
}

module.exports = {
  FISH_COST,
  RARITIES,
  PRICES,
  SPECIES,
  rarityMeta,
  speciesById,
  speciesByRarity,
  valueOf,
  pickRarity,
  pickCatch,
  animationFrames,
};
