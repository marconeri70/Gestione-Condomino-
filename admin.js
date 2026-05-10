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

// Cache globale per ricerca e statistiche
let allReports = [];
let adminSettingsCache = {};

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

// 1. SINCRONIZZAZIONE DATI
function listenToReports() {
  const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allReports = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
    window.renderAdminReports(); // Ricalcola tutto alla ricezione di nuovi dati
  });
}

// 2. MOTORE DI RICERCA E ANALISI
window.renderAdminReports = () => {
  const list = document.getElementById("adminReportsList");
  
  // Calcolo KPI (Statistiche Real-Time)
  document.getElementById("kpi-total").textContent = allReports.length;
  document.getElementById("kpi-todo").textContent = allReports.filter(r => r.status === 'Nuova' || r.status === 'In lavorazione').length;
  document.getElementById("kpi-urgent").textContent = allReports.filter(r => r.priority === 'Urgente' || r.priority === 'Alta').length;

  // Motore di Ricerca "Fuzzy"
  const searchTerm = document.getElementById("adminSearch").value.toLowerCase().trim();
  let filtered = allReports;
  
  if (searchTerm) {
    filtered = allReports.filter(r => 
      (r.name && r.name.toLowerCase().includes(searchTerm)) ||
      (r.area && r.area.toLowerCase().includes(searchTerm)) ||
      (r.type && r.type.toLowerCase().includes(searchTerm)) ||
      (r.description && r.description.toLowerCase().includes(searchTerm)) ||
      (r.status && r.status.toLowerCase().includes(searchTerm))
    );
  }

  if(filtered.length === 0) {
    list.innerHTML = "<p style='color: var(--muted)'>Nessuna segnalazione corrisponde alla ricerca.</p>";
    return;
  }

  // Generazione Interfaccia
  list.innerHTML = filtered.map(r => {
    const date = new Date(r.createdAt).toLocaleString("it-IT");
    let borderCol = r.status === 'Nuova' ? '#0f4c81' : r.status === 'In lavorazione' ? '#f2b705' : r.status === 'Risolta' ? '#16794c' : '#667085';
    
    const messagesHtml = (r.messages || []).map(m => `
      <div class="msg ${m.sender === 'Amministratore' ? 'user' : 'admin'}" style="background: ${m.sender === 'Amministratore' ? 'var(--primary)' : '#e8f0fe'}; color: ${m.sender === 'Amministratore' ? 'white' : 'var(--primary-dark)'};">
        <strong>${m.sender}</strong><br>${escapeHtml(m.text)}
        <span class="msg-date" style="color: ${m.sender === 'Amministratore' ? '#fff' : '#666'}">${new Date(m.date).toLocaleString('it-IT', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'short'})}</span>
      </div>
    `).join("");

    return `
      <div class="report card" style="margin-bottom: 20px; border-left: 5px solid ${borderCol}">
        <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="margin:0 0 5px 0; font-size: 18px;">${r.type} - ${r.area}</h4>
            <p style="margin:0 0 10px 0; font-size:14px; color: #666;"><strong>${r.name}</strong> • ${date}</p>
          </div>
          <div style="display:flex; gap:8px;">
            <span class="badge" style="background:#f4f7fb; padding:5px 10px; border-radius:10px;">Priorità: ${r.priority}</span>
            <button class="secondary" style="padding: 6px 12px; font-size: 12px; border-radius: 8px;" onclick="generatePDF('${r.id}')">📄 Scarica PDF</button>
          </div>
        </div>
        <p style="font-weight: 500; font-size: 15px;">${escapeHtml(r.description)}</p>
        ${r.photo ? `<img src="${r.photo}" style="max-width:250px; border-radius:10px; display:block; margin: 10px 0; border:1px solid #eee;">` : ""}
        
        <div style="display:flex; gap: 10px; align-items: center; margin-top: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; flex-wrap: wrap;">
          <select onchange="updateStatus('${r.id}', this.value)" style="width: auto; padding: 8px;">
            <option value="Nuova" ${r.status === 'Nuova' ? 'selected' : ''}>Nuova</option>
            <option value="In lavorazione" ${r.status === 'In lavorazione' ? 'selected' : ''}>In lavorazione</option>
            <option value="Risolta" ${r.status === 'Risolta' ? 'selected' : ''}>Risolta</option>
            <option value="Archiviata" ${r.status === 'Archiviata' ? 'selected' : ''}>Archiviata</option>
          </select>
          <button class="danger" style="padding: 8px 12px; margin:0;" onclick="deleteReport('${r.id}')">Elimina Report</button>
        </div>

        <div class="chat-box" style="margin-top: 15px;">
          <h5 style="margin-top:0; color:var(--muted);">Comunicazioni col condomino</h5>
          <div class="chat-history">
            ${messagesHtml || '<p style="font-size:12px; color:var(--muted); margin:0;">Nessun messaggio.</p>'}
          </div>
          <div class="chat-input-group" style="margin-top: 10px;">
            <input type="text" id="admin-chat-${r.id}" placeholder="Invia una risposta al condomino...">
            <button class="primary" onclick="addAdminMessage('${r.id}')">Rispondi</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
};

// 3. MOTORE ESPORTAZIONE PDF (Ordine di Lavoro)
window.generatePDF = (id) => {
  const r = allReports.find(x => x.id === id);
  if(!r) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Intestazione
  doc.setFontSize(22);
  doc.setTextColor(15, 76, 129); // Colore Primary
  doc.text("ORDINE DI LAVORO - TICKET INTERVENTO", 20, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${adminSettingsCache.appTitle || 'Amministrazione Condominiale'}`, 20, 30);
  doc.text(`ID Report: ${r.id}`, 20, 35);

  doc.setLineWidth(0.5);
  doc.line(20, 40, 190, 40);

  // Corpo Dati
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(`Data Segnalazione: ${new Date(r.createdAt).toLocaleString('it-IT')}`, 20, 50);
  doc.text(`Condomino / Interno: ${r.name}`, 20, 60);
  doc.text(`Zona Interessata: ${r.area}`, 20, 70);
  doc.text(`Tipo Guasto: ${r.type}`, 20, 80);
  
  // Priorità e Stato (Stile bold)
  doc.setFont("helvetica", "bold");
  doc.text(`Priorità: ${r.priority.toUpperCase()}`, 20, 95);
  doc.text(`Stato Attuale: ${r.status.toUpperCase()}`, 120, 95);
  
  doc.setFont("helvetica", "normal");
  doc.text("Descrizione del Problema:", 20, 110);
  const splitDesc = doc.splitTextToSize(r.description, 170);
  doc.text(splitDesc, 20, 120);

  // Calcola altezza della descrizione per posizionare la foto
  let currentY = 120 + (splitDesc.length * 7);

  // Inserimento Immagine se presente (solo JPEG nativi Base64)
  if(r.photo && r.photo.startsWith('data:image/jpeg')) {
    doc.text("Foto Allegata:", 20, currentY + 10);
    try {
      doc.addImage(r.photo, 'JPEG', 20, currentY + 15, 100, 100);
    } catch(e) {
      doc.text("(Impossibile renderizzare la foto nel PDF)", 20, currentY + 15);
    }
  }

  // Chiusura Documento
  doc.save(`OrdineLavoro_${r.area.replace(/\s+/g, '')}_${r.type.replace(/\s+/g, '')}.pdf`);
  showToast("PDF Generato con successo", "success");
};

// --- AZIONI AL DATABASE (Invariate) ---
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

window.addAdminMessage = async (reportId) => {
  const input = document.getElementById(`admin-chat-${reportId}`);
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    await updateDoc(doc(db, "reports", reportId), {
      messages: arrayUnion({ sender: 'Amministratore', text: text, date: new Date().toISOString() })
    });
    input.value = "";
    showToast("Risposta inviata", "success");
  } catch (error) {
    showToast("Errore di rete", "error");
  } finally {
    input.disabled = false;
  }
};

async function loadGlobalSettingsAdmin() {
  const docSnap = await getDoc(doc(db, "settings", "global_config"));
  if (docSnap.exists()) {
    adminSettingsCache = docSnap.data();
    document.getElementById("admin_settingAppTitle").value = adminSettingsCache.appTitle || "";
    document.getElementById("admin_settingCondominioName").value = adminSettingsCache.condominioName || "";
    document.getElementById("admin_settingAdminName").value = adminSettingsCache.adminName || "";
    document.getElementById("admin_settingAdminEmail").value = adminSettingsCache.adminEmail || "";
    document.getElementById("admin_settingAdminPhone").value = adminSettingsCache.adminPhone || "";
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
    adminSettingsCache = newSettings;
  } catch (error) {
    showToast("Errore di autorizzazione", "error");
  } finally {
    btn.textContent = "Salva e Distribuisci Dati";
  }
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, match => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match]));
}
