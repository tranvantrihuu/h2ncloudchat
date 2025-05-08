// admin.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  remove      // <-- dùng remove để xóa
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// 1) Cấu hình Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAZ6LaoUs7F2Cds0s4XeiwutqFRI1polYE",
  authDomain: "h2ncloudchat.firebaseapp.com",
  databaseURL: "https://h2ncloudchat-default-rtdb.firebaseio.com",
  projectId: "h2ncloudchat",
  storageBucket: "h2ncloudchat.appspot.com",
  messagingSenderId: "170748712005",
  appId: "1:170748712005:web:7bb6935b004c1a6e65ff2c"
};

// 2) Khởi tạo App & Database
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 3) Đếm tổng số user
async function loadUserCount() {
  const countEl = document.getElementById('userCount');
  const emailsEl = document.getElementById('userEmailsList');

  try {
    const snap = await get(ref(db, 'users'));
    if (!snap.exists()) {
      countEl.textContent = 0;
      emailsEl.innerHTML = '<li>Không có tài khoản nào</li>';
      return;
    }

    const users = snap.val();
    const uids = Object.keys(users);
    const count = uids.length;
    const emails = uids
      .map(uid => users[uid].email)
      .filter(email => !!email);

    countEl.textContent = count;

    if (emails.length) {
      emailsEl.innerHTML = emails
        .map((email, idx) => `<li>${idx + 1}. ${email}</li>`)
        .join('');
    } else {
      emailsEl.innerHTML = '<li>Chưa có email nào</li>';
    }

  } catch (err) {
    countEl.textContent = 'Lỗi';
    emailsEl.innerHTML = `<li>Lỗi: ${err.message}</li>`;
  }
}



// 4) Đếm tổng số chat rooms
async function loadChatCount() {
  try {
    const snap = await get(ref(db, 'chats'));
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    document.getElementById('chatCount').textContent = count;
  } catch {
    document.getElementById('chatCount').textContent = 'Lỗi';
  }
}

// 5) Tìm uid theo email
async function getUidByEmail(email) {
  const snap = await get(ref(db, 'users'));
  if (!snap.exists()) return null;
  const users = snap.val();
  return Object.keys(users).find(uid => users[uid].email === email) || null;
}

// 6) Load và hiển thị lịch sử chat, kèm nút Xóa
async function loadHistoryByEmail(email) {
  const listEl = document.getElementById('historyAdminList');
  listEl.innerHTML = 'Đang tải…';

  const uid = await getUidByEmail(email);
  if (!uid) {
    listEl.innerHTML = `<p style="color:red;">Không tìm thấy người dùng với email "${email}".</p>`;
    return;
  }

  const chatsSnap = await get(ref(db, 'chats'));
  if (!chatsSnap.exists()) {
    listEl.innerHTML = `<p>Chưa có cuộc trò chuyện nào.</p>`;
    return;
  }

  const chatIds = Object.keys(chatsSnap.val()).filter(id => id.includes(uid));
  if (!chatIds.length) {
    listEl.innerHTML = `<p>Người này chưa tham gia cuộc trò chuyện nào.</p>`;
    return;
  }

  listEl.innerHTML = '';
  for (const chatId of chatIds) {
    // Lấy thông tin người kia
    const otherUid = chatId.split('_').find(u => u !== uid);
    const otherSnap = await get(ref(db, `users/${otherUid}`));
    const otherData = otherSnap.exists() ? otherSnap.val() : {};
    const otherName = otherData.name || otherUid;
    const otherEmail = otherData.email || '—';

    // Tạo row
    const row = document.createElement('div');
    row.classList.add('history-row');
    row.innerHTML = `
      <span>Chat với <strong>${otherName}</strong> (<em>${otherEmail}</em>)</span>
      <button class="delete-history-btn" title="Xóa lịch sử">🗑️</button>
    `;

    // Gắn sự kiện Xóa
    row.querySelector('.delete-history-btn').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Bạn có chắc muốn xóa lịch sử chat với ${otherName}?`)) return;
      try {
        await remove(ref(db, `chats/${chatId}`));
        loadHistoryByEmail(email);
      } catch (err) {
        alert('Xóa thất bại: ' + err.message);
      }
    });

    listEl.appendChild(row);
  }
}

// 7) Bắt sự kiện nút tìm kiếm
document.getElementById('searchHistoryBtn').addEventListener('click', () => {
  const email = document.getElementById('emailInput').value.trim().toLowerCase();
  if (!email) return alert('Vui lòng nhập email.');
  loadHistoryByEmail(email);
});

// 8) Khi DOM ready, load thống kê
window.addEventListener('DOMContentLoaded', () => {
  loadUserCount();
  loadChatCount();
});
