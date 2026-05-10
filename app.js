import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, orderBy, doc, updateDoc, arrayUnion, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaRvdsTWGCJK59lbbGzU6qnoaJrwCnaJI",
  authDomain: "condominio-admin-1abcf.firebaseapp.com",
  projectId: "condominio-admin-1abcf",
  storageBucket: "condominio-admin-1abcf.firebasestorage.app",
  messagingSenderId: "944250769876",
  appId: "1:944250769876:web:d53d8b5d4ef789e5764641"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch(() => {});

let currentUserUid = null;
let myReports = [];
let adminSettings = {};

window.showToast = (message, type = 'info') => {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserUid = user.uid;
    listenToMyReports();
    listenToAssemblies();
  } else {
    signInAnonymously(auth);
  }
});

function listenToGlobalSettings() {
  onSnapshot(doc(db, "settings", "global_config"), (docSnap) => {
    adminSettings = docSnap.exists() ? docSnap.data() : {};
    document.getElementById("appTitle").textContent = adminSettings.appTitle || "Condominio";
    document.getElementById("condominioName").textContent = adminSettings.condominioName || "Sistema Attivo";
    
    const contactsHtml = `
      <div style="background: var(--bg); box-shadow: var(--shadow-in); padding: 15px; border-radius: 16px; margin-bottom: 10px;">
        <p style="margin:0; font-size: 13px; color: var(--muted)">Nome Studio</p>
        <p style="margin:0; font-weight: 700;">${adminSettings.adminName || '-'}</p>
      </div>
      <div style="background: var(--bg); box-shadow: var(--shadow-in); padding: 15px; border-radius: 16px; margin-bottom: 10px;">
        <p style="margin:0; font-size: 13px; color: var(--muted)">Email Diretta</p>
        <p style="margin:0; font-weight: 700;"><a href="mailto:${adminSettings.adminEmail}" style="color:var(--primary); text-decoration:none;">${adminSettings.adminEmail || '-'}</a></p>
      </div>
      <div style="background: var(--bg); box-shadow: var(--shadow-in); padding: 15px; border-radius: 16px; margin-bottom: 15px;">
        <p style="margin:0; font-size: 13px; color: var(--muted)">Telefono / WhatsApp</p>
        <p style="margin:0; font-weight: 700;">
          <a href="tel:${adminSettings.adminPhone}" style="color:var(--text); text-decoration:none;">${adminSettings.adminPhone || '-'}</a>
        </p>
      </div>
      <button class="primary full" onclick="window.open('https://wa.me/${(adminSettings.adminPhone || '').replace(/\D/g, "")}', '_blank')">Apri Chat WhatsApp</button>
    `;
    const container = document.getElementById("adminContactDetails");
    if(container) container.innerHTML = contactsHtml;
  });
}

function listenToAssemblies() {
  const q = query(collection(db, "assemblies"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    const list = document.getElementById("assembliesList");
    if(!list) return;
    
    if(snapshot.empty) {
      list.innerHTML = `<div class="empty">Nessun avviso in bacheca.</div>`;
      return;
    }

    list.innerHTML = snapshot.docs.map(docSnap => {
      const a = docSnap.data();
      const isVerbale = a.type === 'verbale';
      return `
        <article class="card" style="border-left: 5px solid ${isVerbale ? 'var(--success)' : 'var(--accent)'}">
          <div style="display:flex; justify-content:space-between; align-items:start;">
             <span class="badge" style="color:${isVerbale ? 'var(--success)' : '#b05e00'}">
                ${isVerbale ? '📄 VERBALE' : '📅 CONVOCAZIONE'}
             </span>
             <small style="color:var(--muted)">${new Date(a.createdAt).toLocaleDateString()}</small>
          </div>
          <h3 style="margin:15px 0 5px 0;">${escapeHtml(a.title)}</h3>
          <p style="white-space: pre-wrap; font-size:14px;">${escapeHtml(a.content)}</p>
          ${!isVerbale ? `<div style="background:var(--bg); box-shadow:var(--shadow-in); padding:15px; border-radius:12px; margin-top:15px; font-size:14px;">
             <strong style="color:var(--primary)">Data:</strong> ${a.date} ore ${a.time}<br>
             <strong style="color:var(--primary)">Luogo:</strong> ${a.location}
          </div>` : ''}
        </article>
      `;
    }).join("");
  });
}

window.addEventListener("load", () => listenToGlobalSettings());

window.showTab = (tabId) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(t => t.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if(navBtn) navBtn.classList.add("active");
  if (tabId === "reports") window.renderReportsUI();
  window.scrollTo(0, 0);
};

window.saveReport = async () => {
  const name = document.getElementById("reportName").value.trim();
  const description = document.getElementById("reportDescription").value.trim();
  if (!name || !description) return showToast("Campi obbligatori mancanti", "error");

  const btn = document.querySelector("#newReport button.primary");
  btn.disabled = true;

  const payload = {
    uid: currentUserUid,
    createdAt: new Date().toISOString(),
    name, description,
    area: document.getElementById("reportArea").value,
    type: document.getElementById("reportType").value,
    priority: document.getElementById("reportPriority").value,
    status: "Nuova", messages: [],
    photo: document.getElementById("photoPreview").src.startsWith("data:") ? document.getElementById("photoPreview").src : ""
  };

  addDoc(collection(db, "reports"), payload);
  showToast("Segnalazione in viaggio...", "success");
  document.getElementById("reportName").value = "";
  document.getElementById("reportDescription").value = "";
  document.getElementById("photoPreview").classList.add("hidden");
  window.showTab("reports");
  btn.disabled = false;
};

function listenToMyReports() {
  const q = query(collection(db, "reports"), where("uid", "==", currentUserUid), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    myReports = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    window.renderReportsUI();
  });
}

window.addMessage = (reportId) => {
  const input = document.getElementById(`chat-input-${reportId}`);
  const text = input.value.trim();
  if (!text) return;
  updateDoc(doc(db, "reports", reportId), {
    messages: arrayUnion({ sender: 'Condomino', text: text, date: new Date().toISOString() })
  });
  input.value = "";
};

window.renderReportsUI = () => {
  const list = document.getElementById("reportsList");
  if (!list) return;
  const statusFilter = document.getElementById("filterStatus").value;
  let filtered = statusFilter ? myReports.filter(r => r.status === statusFilter) : myReports;
  
  if (filtered.length === 0) { list.innerHTML = `<div class="empty">Nessuna segnalazione.</div>`; return; }

  list.innerHTML = filtered.map(r => `
    <article class="card">
      <h3 style="margin-top:0; color:var(--primary);">${r.type} - ${r.area}</h3>
      <div class="badges">
        <span class="badge priority-${r.priority}">${r.priority}</span> 
        <span class="badge status-${r.status}">${r.status}</span>
      </div>
      <p style="margin:15px 0;">${escapeHtml(r.description)}</p>
      ${r.photo ? `<img src="${r.photo}" style="width:100%; border-radius:16px; margin-bottom:15px;">` : ""}
      <div class="chat-box">
        <div style="display:flex; flex-direction:column; gap:8px;">
           ${(r.messages || []).map(m => `<div class="msg ${m.sender==='Amministratore'?'admin':'user'}"><strong>${m.sender}</strong><br>${escapeHtml(m.text)}</div>`).join("")}
        </div>
        <div class="chat-input-group"><input type="text" id="chat-input-${r.id}" placeholder="Scrivi..."><button onclick="addMessage('${r.id}')">Invia</button></div>
      </div>
    </article>
  `).join("");
};

document.getElementById("reportPhoto")?.addEventListener("change", (e) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 600 / img.width);
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      document.getElementById("photoPreview").src = canvas.toDataURL("image/jpeg", 0.5);
      document.getElementById("photoPreview").classList.remove("hidden");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(e.target.files[0]);
});

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, match => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match]));
}

window.sendEmailSummary = () => {
  const body = myReports.map(r => `- ${r.area}: ${r.status}`).join("\n");
  window.location.href = `mailto:${adminSettings.adminEmail}?subject=Riepilogo&body=${encodeURIComponent(body)}`;
};
