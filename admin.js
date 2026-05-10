import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, setDoc, getDoc, addDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let adminSettings = {};

window.showToast = (msg, type='info') => {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3000);
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "grid";
    listenToReports();
    listenToAssembliesAdmin();
    loadGlobalSettingsAdmin();
  } else {
    document.getElementById("loginScreen").style.display = "block";
    document.getElementById("adminDashboard").style.display = "none";
  }
});

window.loginAdmin = () => {
  const e = document.getElementById("adminEmail").value;
  const p = document.getElementById("adminPassword").value;
  signInWithEmailAndPassword(auth, e, p).catch(() => showToast("Errore login", "error"));
};

window.logoutAdmin = () => signOut(auth);

window.showAdminPage = (id) => {
  document.querySelectorAll(".admin-page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-v button").forEach(b => b.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.getElementById("btn-" + id).classList.add("active");
};

// --- GESTIONE ASSEMBLEE ---
window.publishAssembly = async (type) => {
  const isVerb = type === 'verbale';
  const title = document.getElementById(isVerb ? 'verb_title' : 'ass_title').value;
  const content = document.getElementById(isVerb ? 'verb_content' : 'ass_content').value;

  if(!title || !content) return showToast("Titolo e contenuto mancanti", "error");

  const data = {
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
  
  // Reset campi
  if(isVerb) { document.getElementById('verb_title').value = ''; document.getElementById('verb_content').value = ''; }
  else { document.getElementById('ass_title').value = ''; document.getElementById('ass_content').value = ''; }
};

function listenToAssembliesAdmin() {
  onSnapshot(query(collection(db, "assemblies"), orderBy("createdAt", "desc")), (snap) => {
    const list = document.getElementById("adminAssembliesList");
    list.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<div class="card" style="border-left:5px solid ${a.type==='verbale'?'#188038':'#f2b705'}">
        <strong>${a.type.toUpperCase()}</strong> - ${a.title}
        <button class="danger" style="float:right; padding:5px 10px;" onclick="deleteAssembly('${d.id}')">Elimina</button>
      </div>`;
    }).join("");
  });
}

window.deleteAssembly = async (id) => {
  if(confirm("Eliminare questo avviso?")) await deleteDoc(doc(db, "assemblies", id));
};

// --- GESTIONE SEGNALAZIONI (KPI e Ricerca) ---
function listenToReports() {
  onSnapshot(query(collection(db, "reports"), orderBy("createdAt", "desc")), (snap) => {
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
    <div class="report card" style="border-left:5px solid ${r.status==='Risolta'?'#188038':'#0f4c81'}">
      <h4>${r.type} - ${r.area} (${r.name})</h4>
      <p>${r.description}</p>
      <select onchange="updateStatus('${r.id}', this.value)">
        <option ${r.status==='Nuova'?'selected':''}>Nuova</option>
        <option ${r.status==='In lavorazione'?'selected':''}>In lavorazione</option>
        <option ${r.status==='Risolta'?'selected':''}>Risolta</option>
      </select>
      <button class="primary" onclick="addAdminMessage('${r.id}')">Rispondi</button>
      <button class="danger" onclick="deleteReport('${r.id}')">Elimina</button>
      <div class="chat-history">${(r.messages || []).map(m => `<div><strong>${m.sender}:</strong> ${m.text}</div>`).join("")}</div>
      <input type="text" id="admin-chat-${r.id}" placeholder="Scrivi al condomino...">
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

async function loadGlobalSettingsAdmin() {
  const snap = await getDoc(doc(db, "settings", "global_config"));
  if(snap.exists()) {
    const s = snap.data();
    document.getElementById("admin_settingAppTitle").value = s.appTitle;
    document.getElementById("admin_settingCondominioName").value = s.condominioName;
    document.getElementById("admin_settingAdminName").value = s.adminName;
    document.getElementById("admin_settingAdminEmail").value = s.adminEmail;
    document.getElementById("admin_settingAdminPhone").value = s.adminPhone;
  }
}

window.saveGlobalSettings = async () => {
  const data = {
    appTitle: document.getElementById("admin_settingAppTitle").value,
    condominioName: document.getElementById("admin_settingCondominioName").value,
    adminName: document.getElementById("admin_settingAdminName").value,
    adminEmail: document.getElementById("admin_settingAdminEmail").value,
    adminPhone: document.getElementById("admin_settingAdminPhone").value
  };
  await setDoc(doc(db, "settings", "global_config"), data);
  showToast("Impostazioni salvate!", "success");
};
