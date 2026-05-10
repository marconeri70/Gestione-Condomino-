import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, setDoc, getDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

window.showToast = (message, type = 'info') => {
  const container = document.getElementById("toastContainer");
  if(!container) return alert(message);
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "grid";
    listenToReports();
    loadGlobalSettingsAdmin();
  } else {
    document.getElementById("loginScreen").style.display = "block";
    document.getElementById("adminDashboard").style.display = "none";
  }
});

window.loginAdmin = async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const errorEl = document.getElementById("loginError");
  
  if(!email || !password) return;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    errorEl.classList.add("hidden");
  } catch (error) {
    errorEl.textContent = "Credenziali errate o accesso negato.";
    errorEl.classList.remove("hidden");
  }
};

window.logoutAdmin = () => signOut(auth);

// Risposta dall'Amministratore
window.addAdminMessage = async (reportId) => {
  const input = document.getElementById(`admin-chat-${reportId}`);
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;
  try {
    await updateDoc(doc(db, "reports", reportId), {
      messages: arrayUnion({
        sender: 'Amministratore',
        text: text,
        date: new Date().toISOString()
      })
    });
    input.value = "";
    showToast("Risposta inviata", "success");
  } catch (error) {
    console.error(error);
    showToast("Errore di rete", "error");
  } finally {
    input.disabled = false;
  }
};

function listenToReports() {
  const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
  
  onSnapshot(q, (snapshot) => {
    const list = document.getElementById("adminReportsList");
    let html = "";
    
    if(snapshot.empty) {
      list.innerHTML = "<p style='color: var(--muted)'>Nessuna segnalazione nel sistema.</p>";
      return;
    }

    snapshot.forEach((docSnap) => {
      const r = docSnap.data();
      const id = docSnap.id;
      const date = new Date(r.createdAt).toLocaleString("it-IT");
      let borderCol = r.status === 'Nuova' ? '#0f4c81' : r.status === 'In lavorazione' ? '#f2b705' : r.status === 'Risolta' ? '#16794c' : '#667085';
      
      const messagesHtml = (r.messages || []).map(m => `
        <div class="msg ${m.sender === 'Amministratore' ? 'user' : 'admin'}" style="background: ${m.sender === 'Amministratore' ? 'var(--primary)' : '#e8f0fe'}; color: ${m.sender === 'Amministratore' ? 'white' : 'var(--primary-dark)'};">
          <strong>${m.sender}</strong><br>${escapeHtml(m.text)}
          <span class="msg-date" style="color: ${m.sender === 'Amministratore' ? '#fff' : '#666'}">${new Date(m.date).toLocaleString('it-IT', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'short'})}</span>
        </div>
      `).join("");

      html += `
        <div class="report card" style="margin-bottom: 20px; border-left: 5px solid ${borderCol}">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <h4 style="margin:0 0 5px 0;">${r.type} - ${r.area}</h4>
              <p style="margin:0 0 10px 0; font-size:14px; color: #666;"><strong>${r.name}</strong> • ${date}</p>
            </div>
            <span class="badge" style="background:#f4f7fb; padding:5px 10px; border-radius:10px;">Priorità: ${r.priority}</span>
          </div>
          <p>${escapeHtml(r.description)}</p>
          ${r.photo ? `<img src="${r.photo}" style="max-width:250px; border-radius:10px; display:block; margin: 10px 0;">` : ""}
          
          <div style="display:flex; gap: 10px; align-items: center; margin-top: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
            <select onchange="updateStatus('${id}', this.value)" style="width: auto; padding: 8px;">
              <option value="Nuova" ${r.status === 'Nuova' ? 'selected' : ''}>Nuova</option>
              <option value="In lavorazione" ${r.status === 'In lavorazione' ? 'selected' : ''}>In lavorazione</option>
              <option value="Risolta" ${r.status === 'Risolta' ? 'selected' : ''}>Risolta</option>
              <option value="Archiviata" ${r.status === 'Archiviata' ? 'selected' : ''}>Archiviata</option>
            </select>
            <button class="danger" style="padding: 8px 12px; margin:0;" onclick="deleteReport('${id}')">Elimina Report</button>
          </div>

          <div class="chat-box" style="margin-top: 15px;">
            <h5 style="margin-top:0; color:var(--muted);">Comunicazioni col condomino</h5>
            <div class="chat-history">
              ${messagesHtml || '<p style="font-size:12px; color:var(--muted); margin:0;">Nessun messaggio.</p>'}
            </div>
            <div class="chat-input-group" style="margin-top: 10px;">
              <input type="text" id="admin-chat-${id}" placeholder="Invia una risposta al condomino...">
              <button class="primary" onclick="addAdminMessage('${id}')">Rispondi</button>
            </div>
          </div>

        </div>
      `;
    });
    list.innerHTML = html;
  });
}

window.updateStatus = async (id, newStatus) => {
  await updateDoc(doc(db, "reports", id), { status: newStatus });
  showToast("Stato aggiornato!", "success");
};

window.deleteReport = async (id) => {
  if(confirm("Eliminare definitivamente questa segnalazione?")) {
    await deleteDoc(doc(db, "reports", id));
    showToast("Segnalazione eliminata", "success");
  }
};

async function loadGlobalSettingsAdmin() {
  const docSnap = await getDoc(doc(db, "settings", "global_config"));
  if (docSnap.exists()) {
    const s = docSnap.data();
    document.getElementById("admin_settingAppTitle").value = s.appTitle || "";
    document.getElementById("admin_settingCondominioName").value = s.condominioName || "";
    document.getElementById("admin_settingAdminName").value = s.adminName || "";
    document.getElementById("admin_settingAdminEmail").value = s.adminEmail || "";
    document.getElementById("admin_settingAdminPhone").value = s.adminPhone || "";
  }
}

window.saveGlobalSettings = async () => {
  const btn = document.querySelector("button[onclick='saveGlobalSettings()']");
  btn.textContent = "Salvataggio...";
  
  const newSettings = {
    appTitle: document.getElementById("admin_settingAppTitle").value.trim(),
    condominioName: document.getElementById("admin_settingCondominioName").value.trim(),
    adminName: document.getElementById("admin_settingAdminName").value.trim(),
    adminEmail: document.getElementById("admin_settingAdminEmail").value.trim(),
    adminPhone: document.getElementById("admin_settingAdminPhone").value.trim()
  };

  try {
    await setDoc(doc(db, "settings", "global_config"), newSettings);
    showToast("Impostazioni distribuite ai client", "success");
  } catch (error) {
    showToast("Errore di autorizzazione", "error");
  } finally {
    btn.textContent = "Salva e Distribuisci Dati";
  }
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, match => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match]));
}
