import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, setDoc, getDoc, addDoc, arrayUnion, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let allReports = [];
let adminTenantId = null;

window.showToast = (msg, type='info') => {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3000);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const adminDoc = await getDoc(doc(db, "admins", user.uid));
      if (adminDoc.exists()) {
        adminTenantId = adminDoc.data().tenantId;
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("adminDashboard").style.display = "grid";
        document.getElementById("displayTenantId").textContent = `Codice: ${adminTenantId}`;
        
        listenToReports();
        listenToAssembliesAdmin();
        loadGlobalSettingsAdmin();
        showToast("Accesso Riuscito", "success");
      } else {
        showToast("Utente non abilitato.", "error");
        signOut(auth);
      }
    } catch (e) {
      console.error(e);
      showToast("Errore permessi database.", "error");
    }
  } else {
    document.getElementById("loginScreen").style.display = "block";
    document.getElementById("adminDashboard").style.display = "none";
    adminTenantId = null;
  }
});

window.loginAdmin = () => {
  const e = document.getElementById("adminEmail").value;
  const p = document.getElementById("adminPassword").value;
  signInWithEmailAndPassword(auth, e, p).catch(() => showToast("Credenziali errate", "error"));
};

window.logoutAdmin = () => signOut(auth);

window.showAdminPage = (id) => {
  document.querySelectorAll(".admin-page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-v button").forEach(b => b.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.getElementById("btn-" + id).classList.add("active");
};

function listenToReports() {
  if(!adminTenantId) return;
  const q = query(collection(db, "reports"), where("tenantId", "==", adminTenantId), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    allReports = snap.docs.map(d => ({id: d.id, ...d.data()}));
    renderAdminReports();
  });
}

window.renderAdminReports = () => {
  const search = document.getElementById("adminSearch").value.toLowerCase();
  document.getElementById("kpi-total").textContent = allReports.length;
  document.getElementById("kpi-todo").textContent = allReports.filter(r => r.status !== 'Risolta').length;
  document.getElementById("kpi-urgent").textContent = allReports.filter(r => r.priority === 'Urgente').length;

  const filtered = allReports.filter(r => r.name.toLowerCase().includes(search) || r.type.toLowerCase().includes(search));
  document.getElementById("adminReportsList").innerHTML = filtered.map(r => `
    <div class="card" style="border-left:5px solid ${r.status==='Risolta'?'var(--success)':'var(--primary)'}">
      <h4>${r.type} - ${r.area} (${r.name})</h4>
      <p>${escapeHtml(r.description)}</p>
      ${r.photo ? `<img src="${r.photo}" style="max-width:200px; border-radius:12px; margin-bottom:10px;">` : ""}
      
      <div style="display:flex; gap: 10px; margin-top: 15px; padding-bottom: 15px; border-bottom: 1px solid rgba(0,0,0,0.1);">
        <select onchange="updateStatus('${r.id}', this.value)" style="width: auto; padding: 8px;">
          <option ${r.status==='Nuova'?'selected':''}>Nuova</option>
          <option ${r.status==='In lavorazione'?'selected':''}>In lavorazione</option>
          <option ${r.status==='Risolta'?'selected':''}>Risolta</option>
        </select>
        <button class="danger" style="padding: 8px 12px; margin:0;" onclick="deleteReport('${r.id}')">Elimina</button>
      </div>

      <div class="chat-box">
        <div class="chat-history">${(r.messages || []).map(m => `<div class="msg ${m.sender==='Amministratore'?'user':'admin'}"><strong>${m.sender}:</strong> ${escapeHtml(m.text)}</div>`).join("")}</div>
        <div class="chat-input-group">
          <input type="text" id="admin-chat-${r.id}" placeholder="Scrivi al condomino...">
          <button onclick="addAdminMessage('${r.id}')">Rispondi</button>
        </div>
      </div>
    </div>
  `).join("");
};

window.addAdminMessage = async (id) => {
  const input = document.getElementById(`admin-chat-${id}`);
  if(!input.value) return;
  await updateDoc(doc(db, "reports", id), {
    messages: arrayUnion({ sender: 'Amministratore', text: input.value, date: new Date().toISOString() })
  });
  input.value = "";
};

window.updateStatus = async (id, s) => await updateDoc(doc(db, "reports", id), { status: s });
window.deleteReport = async (id) => { if(confirm("Eliminare?")) await deleteDoc(doc(db, "reports", id)); };

window.publishAssembly = async (type) => {
  const isVerb = type === 'verbale';
  const title = document.getElementById(isVerb ? 'verb_title' : 'ass_title').value;
  const content = document.getElementById(isVerb ? 'verb_content' : 'ass_content').value;

  if(!title || !content) return showToast("Dati mancanti", "error");

  const data = {
    tenantId: adminTenantId,
    type, title, content,
    createdAt: new Date().toISOString()
  };

  if(!isVerb) {
    data.date = document.getElementById('ass_date').value;
    data.time = document.getElementById('ass_time').value;
    data.location = document.getElementById('ass_location').value;
  }

  await addDoc(collection(db, "assemblies"), data);
  showToast("Pubblicato in bacheca!", "success");
  
  if(isVerb) { document.getElementById('verb_title').value = ''; document.getElementById('verb_content').value = ''; }
  else { document.getElementById('ass_title').value = ''; document.getElementById('ass_content').value = ''; }
};

function listenToAssembliesAdmin() {
  if(!adminTenantId) return;
  onSnapshot(query(collection(db, "assemblies"), where("tenantId", "==", adminTenantId), orderBy("createdAt", "desc")), (snap) => {
    document.getElementById("adminAssembliesList").innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<div class="card" style="border-left:5px solid ${a.type==='verbale'?'var(--success)':'var(--accent)'}">
        <strong>${a.type.toUpperCase()}</strong> - ${a.title}
        <button class="danger" style="float:right; padding:5px 10px;" onclick="deleteAssembly('${d.id}')">Elimina</button>
      </div>`;
    }).join("");
  });
}
window.deleteAssembly = async (id) => { if(confirm("Eliminare?")) await deleteDoc(doc(db, "assemblies", id)); };

async function loadGlobalSettingsAdmin() {
  if(!adminTenantId) return;
  const snap = await getDoc(doc(db, "settings", adminTenantId));
  if(snap.exists()) {
    const s = snap.data();
    document.getElementById("admin_settingAppTitle").value = s.appTitle || "";
    document.getElementById("admin_settingCondominioName").value = s.condominioName || "";
    document.getElementById("admin_settingAdminName").value = s.adminName || "";
    document.getElementById("admin_settingAdminEmail").value = s.adminEmail || "";
    document.getElementById("admin_settingAdminPhone").value = s.adminPhone || "";
  }
}

window.saveGlobalSettings = async () => {
  const data = {
    tenantId: adminTenantId, // Salva anche il tenantId per sicurezza
    appTitle: document.getElementById("admin_settingAppTitle").value,
    condominioName: document.getElementById("admin_settingCondominioName").value,
    adminName: document.getElementById("admin_settingAdminName").value,
    adminEmail: document.getElementById("admin_settingAdminEmail").value,
    adminPhone: document.getElementById("admin_settingAdminPhone").value
  };
  await setDoc(doc(db, "settings", adminTenantId), data);
  showToast("Dati Studio Salvati", "success");
};

function escapeHtml(text) { return String(text).replace(/[&<>"']/g, match => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match])); }
