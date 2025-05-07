import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getDatabase,
  ref,
  child,
  get,
  set,
  update,
  onValue,
  push,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

const SECRET_KEY = "h2ncloudchat_secret";

function encryptMessage(text) {
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

function decryptMessage(cipherText) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8) || cipherText;
  } catch (e) {
    return cipherText;
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyAZ6LaoUs7F2Cds0s4XeiwutqFRI1polYE",
  authDomain: "h2ncloudchat.firebaseapp.com",
  databaseURL: "https://h2ncloudchat-default-rtdb.firebaseio.com",
  projectId: "h2ncloudchat",
  storageBucket: "h2ncloudchat.appspot.com",
  messagingSenderId: "170748712005",
  appId: "1:170748712005:web:7bb6935b004c1a6e65ff2c"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const me = sessionStorage.getItem("me");
let currentChatUid = null;

const historyBtn = document.getElementById("historyBtn");
const friendsBtn = document.getElementById("friendsBtn");
const historyList = document.getElementById("historyList");
const friendsList = document.getElementById("friendsList");
const sendBtn = document.getElementById("sendBtn");
const chatBox = document.getElementById("chatBox");
const chatHeader = document.getElementById("chatHeader");
const msgInput = document.getElementById("msgInput");
// … các import, cấu hình, encrypt/decrypt…

// 1) Hàm đánh dấu đã đọc
async function markAllRead(friendId) {
  const chatId = [me, friendId].sort().join("_");
  const chatSnap = await get(ref(db, `chats/${chatId}`));
  if (!chatSnap.exists()) return;
  const updates = {};
  chatSnap.forEach(ms => {
    const m = ms.val();
    if (m.from !== me && m.read === false) {
      updates[`chats/${chatId}/${ms.key}/read`] = true;
    }
  });
  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

// 2) Phiên bản startChat “chuẩn”
function startChat(toUid, toName) {
  currentChatUid = toUid;
  chatHeader.textContent = `Đang trò chuyện với ${toName}`;
  msgInput.disabled = false;
  sendBtn.disabled = false;

  // đánh dấu đã đọc → load lại history → lắng nghe tin nhắn
  markAllRead(toUid).then(() => {
    loadHistory();
    listenToMessages(toUid);
  });
}

// … rồi mới tới các hàm khác (sendBtn.onclick, loadHistory, loadFriends, …) …

historyBtn.onclick = () => {
  historyBtn.classList.add("active");
  friendsBtn.classList.remove("active");
  historyList.classList.remove("hidden");
  friendsList.classList.add("hidden");
  loadHistory();
};

friendsBtn.onclick = () => {
  friendsBtn.classList.add("active");
  historyBtn.classList.remove("active");
  friendsList.classList.remove("hidden");
  historyList.classList.add("hidden");
  loadFriends();
};

document.getElementById("searchBtn").onclick = async () => {
  const email = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!email) return alert("Vui lòng nhập email");
  const res = await fetch("/api/search_user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const user = await res.json();
  if (!res.ok) return alert(user.error || "Không tìm thấy người dùng");

  chatHeader.innerHTML = `
    <div class="profile-card">
      <img src="${user.avatar}" class="profile-avatar" />
      <h4>${user.name}</h4>
      <p>${user.email}</p>
      <button id="actionBtn" class="friend-button"></button>
    </div>
  `;
  chatBox.innerHTML = "";

  const btn = document.getElementById("actionBtn");
  const friendRef = child(ref(db), `users/${me}/friends/${user.uid}`);
  get(friendRef).then(async snap => {
    const val = snap.exists() ? snap.val() : null;
    if (val === true) {
      btn.textContent = "Nhắn tin";
      btn.onclick = () => startChat(user.uid, user.name);
    } else {
      btn.textContent = "Kết bạn";
      btn.onclick = async () => {
        await update(ref(db), {
          [`users/${me}/friends/${user.uid}`]: false,
          [`users/${user.uid}/friend_requests/${me}`]: true
        });
        btn.disabled = true;
        btn.textContent = "✔ Đã gửi lời mời";
      };
    }
  });
};


sendBtn.onclick = () => {
  const text = msgInput.value.trim();
  if (!text || !currentChatUid) return;
  const chatId = [me, currentChatUid].sort().join("_");
  const ts = Date.now();
  set(ref(db, `chats/${chatId}/${ts}`), {
    from: me,
    to: currentChatUid,
    message: encryptMessage(text),
    time: ts,
    read: false
  });
  msgInput.value = "";
};

window.addEventListener("DOMContentLoaded", () => {
  loadHistory();
});

function listenToMessages(friendId) {
  const chatId = [me, friendId].sort().join("_");
  const chatRef = ref(db, `chats/${chatId}`);
  onValue(chatRef, snap => {
    chatBox.innerHTML = "";
    snap.forEach(ms => {
      const m = ms.val();
      m.message = decryptMessage(m.message);
      const div = document.createElement("div");
      div.className = "message " + (m.from === me ? "sent" : "received");
      div.innerHTML = `<div class="message-content">${m.message}</div>`;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

async function loadHistory() {
  historyList.innerHTML = "";
  const chatsSnap = await get(ref(db, "chats"));
  if (!chatsSnap.exists()) {
    historyList.innerHTML = `<div class="message-placeholder">Chưa có lịch sử chat.</div>`;
    return;
  }

  const chatIds = Object.keys(chatsSnap.val()).filter(id => id.includes(me));
  if (!chatIds.length) {
    historyList.innerHTML = `<div class="message-placeholder">Chưa có lịch sử chat.</div>`;
    return;
  }
  const partnerIds = [
  ...new Set(
    chatIds.map(chatId => {
      const [a, b] = chatId.split("_");
      return a === me ? b : a;
    })
  )
];
  for (let chatId of chatIds) {
    const [a, b] = chatId.split("_");
    const partnerId = a === me ? b : a;
    const userSnap = await get(child(ref(db), `users/${partnerId}`));
    const user = userSnap.val();

    // --- LẤY TIN NHẮN CUỐI (giới hạn 1) để kiểm tra read ---
    const lastMsgQuery = query(
      ref(db, `chats/${chatId}`),
      orderByChild("time"),
      limitToLast(1)
    );
    const lastSnap = await get(lastMsgQuery);
    let hasUnread = false;
    try {
  const lastSnap = await get(lastMsgQuery);
  lastSnap.forEach(ms => {
    const m = ms.val();
    if (m.from !== me && m.read === false) {
      hasUnread = true;
    }
  });
} catch (e) {
  console.warn("Không thể query tin nhắn cuối do thiếu index:", e);
  // fallback: không hiển thị dot
};

    // --- TẠO item ---
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <img src="${user.avatar}"/>
      <span class="chat-name">${user.name}</span>
      ${hasUnread ? `<span class="unread-dot"></span>` : ""}
      <button class="delete-chat" title="Xoá trò chuyện">🗑️</button>
    `;
    item.querySelector(".chat-name").onclick = () => startChat(partnerId, user.name);
    item.querySelector(".delete-chat").onclick = async (e) => {
      e.stopPropagation();
      const confirmed = confirm(`Xác nhận xoá toàn bộ cuộc trò chuyện với ${user.name}?`);
      if (confirmed) {
        const chatId = [me, partnerId].sort().join("_");
        await set(ref(db, `chats/${chatId}`), null);
        loadHistory();
      }
    };
    historyList.appendChild(item);
  }
}

async function loadFriends() {
  friendsList.innerHTML = "";
  const friendsSnap = await get(child(ref(db), `users/${me}/friends`));
  if (!friendsSnap.exists()) {
    friendsList.innerHTML = `<div class="message-placeholder">Bạn chưa có bạn bè nào.</div>`;
    return;
  }

  const requestsSnap = await get(child(ref(db), `users/${me}/friend_requests`));
  if (requestsSnap.exists()) {
    for (let uid of Object.keys(requestsSnap.val())) {
      const userSnap = await get(child(ref(db), `users/${uid}`));
      const user = userSnap.val();
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <img src="${user.avatar}"/>
        <span>${user.name}</span>
        <button class="accept">Chấp nhận</button>
      `;
      item.querySelector(".accept").onclick = async () => {
        await update(ref(db), {
          [`users/${me}/friends/${uid}`]: true,
          [`users/${uid}/friends/${me}`]: true,
          [`users/${me}/friend_requests/${uid}`]: null
        });
        loadFriends();
      };
      friendsList.appendChild(item);
    }
  }

  for (let uid of Object.keys(friendsSnap.val())) {
    if (!friendsSnap.val()[uid]) continue;
    const userSnap = await get(child(ref(db), `users/${uid}`));
    const user = userSnap.val();
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <img src="${user.avatar}"/>
      <span>${user.name}</span>
      <button class="unfriend-btn" title="Huỷ kết bạn">❌</button>
    `;
    item.querySelector("span").onclick = () => startChat(uid, user.name);
    // Thay thế toàn bộ handler .unfriend-btn bằng đoạn sau:
item.querySelector(".unfriend-btn").onclick = async (e) => {
  e.stopPropagation();
  const chatId = [me, uid].sort().join("_");
  const confirmUnfriend = confirm(
    `Bạn có chắc muốn huỷ kết bạn với ${user.name}? Việc này sẽ xoá toàn bộ lịch sử tin nhắn.`
  );
  if (!confirmUnfriend) return;

  // 1. Huỷ kết bạn hai chiều
  await update(ref(db), {
    [`users/${me}/friends/${uid}`]: false,
    [`users/${uid}/friends/${me}`]: false
  });

  // 2. Xoá luôn toàn bộ cuộc trò chuyện
  await set(ref(db, `chats/${chatId}`), null);

  // 3. Thông báo và reload danh sách bạn bè
  alert("Đã huỷ kết bạn và xoá tất cả lịch sử tin nhắn.");
  loadFriends();
};

    friendsList.appendChild(item);
  }
}

document.getElementById("fileBtn").onclick = () => {
  document.getElementById("fileInput").click();
};

document.getElementById("fileInput").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !currentChatUid) return;

  const chatId = [me, currentChatUid].sort().join("_");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 10000);
  const publicId = `${me}-${today}-${rand}`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "unsigned_upload");
  formData.append("public_id", publicId);
  formData.append("folder", `H2NCloudChat/${chatId}`);

  try {
    const res = await fetch("https://api.cloudinary.com/v1_1/dlwmhbuic/auto/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (!res.ok || !data.secure_url) {
      console.error("Upload failed:", data);
      alert("❌ Upload thất bại: " + (data.error?.message || "Không rõ lý do"));
      return;
    }

    const fileURL = data.secure_url;
    const ts = Date.now();
    const isImage = file.type.startsWith("image/");
    const messageContent = isImage
      ? `<img src="${fileURL}" style="max-width:200px; border-radius:8px;">`
      : `📎 <a href="${fileURL}" target="_blank">${file.name}</a>`;

    await set(ref(db, `chats/${chatId}/${ts}`), {
      from: me,
      to: currentChatUid,
      message: encryptMessage(messageContent),
      time: ts,
      read: false
    });

    await push(ref(db, 'uploads'), {
      uid: me,
      to: currentChatUid,
      fileName: file.name,
      fileURL,
      time: ts,
      type: isImage ? 'image' : 'file',
      chatId
    });

  } catch (err) {
    console.error("Upload exception:", err);
    alert("❌ Lỗi kết nối tới Cloudinary");
  }
};

function fileNameFromUrl(url) {
  return decodeURIComponent(url.split('/').pop().split('?')[0]);
}
