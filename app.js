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

// --- ATTIVAZIONE MODALITÀ BUNKER (Persistenza Offline) ---
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn("Attenzione: App aperta in più schede. Modalità offline limitata.");
  } else if (err.code == 'unimplemented') {
    console.warn("Il browser corrente non supporta il database offline profondo.");
  }
});

let currentUserUid = null;
let myReports = [];
let adminEmailCache = "";

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
  } else {
    signInAnonymously(auth).catch(err => console.error(err));
  }
});

function listenToGlobalSettings() {
  onSnapshot(doc(db, "settings", "global_config"), (docSnap) => {
    const s = docSnap.exists() ? docSnap.data() : {
      appTitle: "Condominio", condominioName: "Configurazione...", 
      adminName: "Amministratore", adminEmail: "", adminPhone: ""
    };
    document.getElementById("appTitle").textContent = s.appTitle;
    document.getElementById("condominioName").textContent = s.condominioName;
    adminEmailCache = s.adminEmail;
    
    if(document.getElementById("adminNameView")) document.getElementById("adminNameView").textContent = s.adminName;
    if(document.getElementById("adminEmailView")) {
        document.getElementById("adminEmailView").textContent = s.adminEmail;
        document.getElementById("adminEmailView").href = `mailto:${s.adminEmail}`;
    }
    if(document.getElementById("adminPhoneView")) {
        document.getElementById("adminPhoneView").textContent = s.adminPhone;
        document.getElementById("adminPhoneView").href = `tel:${s.adminPhone}`;
    }
    if(document.getElementById("adminWhatsappView")) {
        document.getElementById("adminWhatsappView").href = `https://wa.me/${s.adminPhone.replace(/\D/g, "")}`;
    }
  });
}

window.addEventListener("load", () => {
  listenToGlobalSettings();
});

window.showTab = (tabId) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(t => t.classList.remove("active"));
  
  document.getElementById(tabId).classList.add("active");
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if(navBtn) navBtn.classList.add("active");

  if (tabId === "reports") window.renderReportsUI();
  window.scrollTo(0, 0);
};

// Algoritmo Compressione Foto Estrema
document.getElementById("reportPhoto")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 600 / img.width);
      canvas.width = img.width * scale; 
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const preview = document.getElementById("photoPreview");
      preview.src = canvas.toDataURL("image/jpeg", 0.5);
      preview.classList.remove("hidden");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// Motore Invio Resiliente (No-Block)
window.saveReport = () => {
  const name = document.getElementById("reportName").value.trim();
  const description = document.getElementById("reportDescription").value.trim();

  if (!name || !description) return showToast("Compila i campi obbligatori", "error");

  const btn = document.querySelector("#newReport button.primary");
  btn.disabled = true;

  try {
    const photoData = document.getElementById("photoPreview").src.startsWith("data:") ? document.getElementById("photoPreview").src : "";
    
    if(photoData && photoData.length > 800000) {
      showToast("Foto troppo complessa. Riprova con un'altra inquadratura.", "error");
      btn.disabled = false;
      return;
    }

    const payload = {
      uid: currentUserUid,
      createdAt: new Date().toISOString(),
      name, description,
      area: document.getElementById("reportArea").value,
      type: document.getElementById("reportType").value,
      priority: document.getElementById("reportPriority").value,
      status: "Nuova",
      messages: [],
      photo: photoData
    };

    // Logica di feedback in base allo stato della rete
    if (!navigator.onLine) {
      showToast("Modalità Offline: Segnalazione salvata. Verrà inviata in automatico.", "info");
    } else {
      showToast("Segnalazione inviata con successo!", "success");
    }

    // FIRE AND FORGET: Firebase gestisce la coda in background. L'app non si blocca mai.
    addDoc(collection(db, "reports"), payload);

    // Reset interfaccia immediato
    document.getElementById("reportName").value = "";
    document.getElementById("reportDescription").value = "";
    document.getElementById("photoPreview").classList.add("hidden");
    window.showTab("reports");

  } catch (e) {
    console.error(e);
    showToast("Errore di sistema", "error");
  } finally {
    btn.disabled = false;
  }
};

function listenToMyReports() {
  const q = query(collection(db, "reports"), where("uid", "==", currentUserUid), orderBy("createdAt", "desc"));
  onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    myReports = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    window.renderReportsUI();
  });
}

// Chat con supporto offline
window.addMessage = (reportId) => {
  const input = document.getElementById(`chat-input-${reportId}`);
  const text = input.value.trim();
  if (!text) return;

  const btn = input.nextElementSibling;
  input.disabled = true; btn.disabled = true;

  try {
    if (!navigator.onLine) showToast("Offline: Messaggio in coda.", "info");

    // Fire and forget
    updateDoc(doc(db, "reports", reportId), {
      messages: arrayUnion({ sender: 'Condomino', text: text, date: new Date().toISOString() })
    });
    
    input.value = "";
  } catch (error) {
    console.error(error);
    showToast("Errore nell'invio", "error");
  } finally {
    input.disabled = false; btn.disabled = false;
  }
};

window.renderReportsUI = () => {
  const list = document.getElementById("reportsList");
  if (!list) return;

  const statusFilter = document.getElementById("filterStatus").value;
  let filtered = statusFilter ? myReports.filter(r => r.status === statusFilter) : myReports;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">Nessuna segnalazione trovata.</div>`;
    return;
  }

  list.innerHTML = filtered.map(r => {
    const messagesHtml = (r.messages || []).map(m => `
      <div class="msg ${m.sender === 'Amministratore' ? 'admin' : 'user'}">
        <strong>${m.sender}</strong><br>${escapeHtml(m.text)}
        <span class="msg-date">${new Date(m.date).toLocaleString('it-IT', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'short'})}</span>
      </div>
    `).join("");

    return `
      <article class="report card ${r.priority === 'Urgente' ? 'urgent' : ''} ${r.status === 'Risolta' ? 'done' : ''}">
        <div class="report-head">
          <div>
            <h3 style="margin: 0 0 5px 0;">${r.type} - ${r.area}</h3>
            <p style="font-size: 12px; margin: 0; color: var(--muted)">${new Date(r.createdAt).toLocaleString("it-IT")}</p>
          </div>
        </div>
        <div class="badges">
          <span class="badge">${r.priority}</span>
          <span class="badge" style="background: #e7f3ff; color: #007bff">${r.status}</span>
        </div>
        <p style="margin: 10px 0 font-weight: 600;">${escapeHtml(r.description)}</p>
        ${r.photo ? `<img src="${r.photo}" style="width:100%; border-radius:10px; margin-bottom: 10px; border: 1px solid #eee;">` : ""}
        
        <div class="chat-box">
          <div class="chat-history">
            ${messagesHtml || '<p style="text-align:center; font-size:12px; color:var(--muted); margin:0;">Nessun messaggio.</p>'}
          </div>
          <div class="chat-input-group">
            <input type="text" id="chat-input-${r.id}" placeholder="Rispondi all'amministratore...">
            <button class="primary" onclick="addMessage('${r.id}')">Invia</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, match => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match]));
}

window.sendEmailSummary = () => {
  const body = myReports.map(r => `- ${r.area}: ${r.status}`).join("\n");
  window.location.href = `mailto:${adminEmailCache}?subject=Mio Riepilogo&body=${encodeURIComponent(body)}`;
};
