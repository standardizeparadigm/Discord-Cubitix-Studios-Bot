// =============================================================
//  checklistStore - danh sách việc cần làm (checklist) cá nhân
//  Lưu theo userId vào data/checklist.json (không phụ thuộc guild).
// =============================================================
const db = require('./Database');

const store = new db.JsonStore('checklist.json', {});
const MAX_ITEMS = 25;
const MAX_LEN = 200;

function list(userId) {
  const arr = store.get(userId, []);
  return Array.isArray(arr) ? arr : [];
}
function saveList(userId, arr) {
  store.set(userId, arr);
  return arr;
}
function add(userId, text) {
  const arr = list(userId);
  if (arr.length >= MAX_ITEMS) return { ok: false, reason: 'full', max: MAX_ITEMS };
  const t = String(text).trim().slice(0, MAX_LEN);
  if (!t) return { ok: false, reason: 'empty' };
  arr.push({ text: t, done: false, at: Date.now() });
  saveList(userId, arr);
  return { ok: true, list: arr };
}
function toggle(userId, index) {
  const arr = list(userId);
  if (index < 0 || index >= arr.length) return { ok: false, reason: 'range', list: arr };
  arr[index].done = !arr[index].done;
  saveList(userId, arr);
  return { ok: true, list: arr, item: arr[index] };
}
function remove(userId, index) {
  const arr = list(userId);
  if (index < 0 || index >= arr.length) return { ok: false, reason: 'range', list: arr };
  const [item] = arr.splice(index, 1);
  saveList(userId, arr);
  return { ok: true, list: arr, item };
}
function clear(userId) {
  saveList(userId, []);
  return { ok: true, list: [] };
}

module.exports = { list, add, toggle, remove, clear, MAX_ITEMS, MAX_LEN };
