import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaRvdsTWGCJK59lbbGzU6qnoaJrwCnaJI",
  authDomain: "condominio-admin-1abcf.firebaseapp.com",
  projectId: "condominio-admin-1abcf",
  storageBucket: "condominio-admin-1abcf.firebasestorage.app",
  messagingSenderId: "944250769876",
  appId: "1:944250769876:web:d53d8b5d4ef789e5764641",
  measurementId: "G-210EP3Q2T9"
};

// Inizializzazione Ecosistema
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STORAGE_SETTINGS = "condominio_settings_v1";
let deferredPrompt = null;
let currentPhotoBase64 = "";
let currentUserUid = null;
let myReports = []; // Cache locale per la UI alimentata in real-time

const defaultSettings = {
  appTitle: "Segnalazioni Condominio",
  condominioName: "Gestione semplice di guasti, richieste e interventi",
  adminName: "Studio Condominio",
  adminEmail: "amministratore@example.com",
  adminPhone: "+390000000000"
};

// 1. IL GUARDIANO SILENZIOSO (Autenticazione Anonima)
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserUid = user.uid;
    listenToMyReports(); // L'utente è riconosciuto, apriamo il tunnel dati
  } else {
    // Se è la prima volta, registriamo il dispositivo invisibilmente
    signInAnonymously(auth).catch((error) => {
      console.error("Errore critico di autenticazione:", error);
      alert("Connessione ai server fallita. Ricarica la pagina.");
    });
  }
});

// 2. BOOTSTRAP APPLICAZIONE
window.addEventListener("load", () => {
  loadSettings();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
});

// 3. GESTIONE PWA E FOTOCAMERA
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("installBtn").classList.remove("hidden");
});

document.getElementById("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById("installBtn").classList.add("hidden");
});

document.getElementById("reportPhoto").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  currentPhotoBase64 = await resizeImage(file, 1200, 0.75);
  const preview = document.getElementById("photoPreview");
  preview.src = currentPhotoBase64;
  preview.classList.remove("hidden");
});

// 4. NAVIGAZIONE UI
window.showTab = (tabId) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

  document.getElementById(tabId).classList.add("active");
  const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if(tabBtn) tabBtn.classList.add("active");

  if (tabId === "reports") renderReportsUI(); // Aggiorna la vista con i dati in cache
};

// 5. MOTORE DI SCRITTURA (Invio al Server)
window.saveReport = async () => {
  if (!currentUserUid) {
    alert("Inizializzazione connessione in corso. Riprova tra un istante.");
    return;
  }

  const name = document.getElementById("reportName").value.trim();
  const area = document.getElementById("reportArea").value;
  const type = document.getElementById("reportType").value;
  const priority = document.getElementById("reportPriority").value;
  const description = document.getElementById("reportDescription").value.trim();

  if (!name || !description) {
    alert("Il nome/interno e la descrizione sono obbligatori.");
    return;
  }

  // Blocco UI per prevenire invii multipli
  const btn = document.querySelector("#newReport button.primary");
  const originalText = btn.textContent;
  btn.textContent = "Invio in corso...";
  btn.disabled = true;

  try {
    await addDoc(collection(db, "reports"), {
      uid: currentUserUid, // La firma digitale del dispositivo
      createdAt: new Date().toISOString(),
      name,
      area,
      type,
      priority,
      description,
      status: "Nuova",
      photo: currentPhotoBase64
    });

    // Reset Form
    document.getElementById("reportName").value = "";
    document.getElementById("reportDescription").value = "";
    document.getElementById("reportPhoto").value = "";
    document.getElementById("photoPreview").classList.add("hidden");
    currentPhotoBase64 = "";

    alert("Segnalazione inviata con successo!");
    showTab("reports");
  } catch (error) {
    console.error("Errore salvataggio:", error);
    alert("Errore di rete. Controlla la connessione e riprova.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};

// 6. MOTORE DI LETTURA REAL-TIME (Tunnel Firebase)
function listenToMyReports() {
  const reportsRef = collection(db, "reports");
  // Query chirurgica: prendi solo i documenti creati da questo dispositivo
  const q = query(reportsRef, where("uid", "==", currentUserUid), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    myReports = []; // Svuota la cache
    snapshot.forEach((doc) => {
      myReports.push({ id: doc.id, ...doc.data() });
    });
    
    // Se l'utente sta guardando la tab archivio, aggiorna l'interfaccia istantaneamente
    if (document.getElementById("reports").classList.contains("active")) {
      renderReportsUI();
    }
  }, (error) => {
    // Gestione errori di indici mancanti o permessi
    console.error("Errore di lettura dal database:", error);
  });
}

// 7. RENDERIZZAZIONE UI (Archivio Personale)
function renderReportsUI() {
  const list = document.getElementById("reportsList");
  const statusFilter = document.getElementById("filterStatus") ? document.getElementById("filterStatus").value : "";
  const priorityFilter = document.getElementById("filterPriority") ? document.getElementById("filterPriority").value : "";

  let filtered = myReports;

  if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
  if (priorityFilter) filtered = filtered.filter(r => r.priority === priorityFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">Nessuna segnalazione trovata o inviata da questo dispositivo.</div>`;
    return;
  }

  list.innerHTML = filtered.map(report => {
    const date = new Date(report.createdAt).toLocaleString("it-IT");
    const urgentClass = report.priority === "Urgente" ? "urgent" : report.priority === "Alta" ? "high" : "";
    const doneClass = report.status === "Risolta" ? "done" : "";

    return `
      <article class="report ${urgentClass} ${doneClass}">
        <div class="report-head">
          <div>
            <h3>${escapeHtml(report.type)} - ${escapeHtml(report.area)}</h3>
            <p><strong>${escapeHtml(report.name)}</strong> • ${date}</p>
          </div>
        </div>
        <div class="badges">
          <span class="badge priority-${report.priority}">Priorità: ${report.priority}</span>
          <span class="badge status-${report.status}">Stato: ${report.status}</span>
        </div>
        <p>${escapeHtml(report.description)}</p>
        ${report.photo ? `<img src="${report.photo}" alt="Foto segnalazione">` : ""}
      </article>
    `;
  }).join("");
}

// L'utente non può più eliminare o cambiare stato. Lo fa solo l'admin.
// Abbiamo rimosso i bottoni "Elimina" e il selettore di stato dal frontend.

// 8. LOGICA SETTINGS LOCALI (Manteniamo nel telefono per personalizzazione)
window.saveSettings = () => {
  const settings = {
    appTitle: document.getElementById("settingAppTitle").value.trim() || defaultSettings.appTitle,
    condominioName: document.getElementById("settingCondominioName").value.trim() || defaultSettings.condominioName,
    adminName: document.getElementById("settingAdminName").value.trim() || defaultSettings.adminName,
    adminEmail: document.getElementById("settingAdminEmail").value.trim() || defaultSettings.adminEmail,
    adminPhone: document.getElementById("settingAdminPhone").value.trim() || defaultSettings.adminPhone
  };

  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  loadSettings();
  alert("Impostazioni salvate localmente.");
};

function getSettings() {
  return { ...defaultSettings, ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}") };
}

function loadSettings() {
  const s = getSettings();
  document.title = s.appTitle;
  document.getElementById("appTitle").textContent = s.appTitle;
  document.getElementById("condominioName").textContent = s.condominioName;

  if(document.getElementById("settingAppTitle")) document.getElementById("settingAppTitle").value = s.appTitle;
  if(document.getElementById("settingCondominioName")) document.getElementById("settingCondominioName").value = s.condominioName;
  if(document.getElementById("settingAdminName")) document.getElementById("settingAdminName").value = s.adminName;
  if(document.getElementById("settingAdminEmail")) document.getElementById("settingAdminEmail").value = s.adminEmail;
  if(document.getElementById("settingAdminPhone")) document.getElementById("settingAdminPhone").value = s.adminPhone;

  if(document.getElementById("adminNameView")) document.getElementById("adminNameView").textContent = s.adminName;
  if(document.getElementById("adminEmailView")) {
    document.getElementById("adminEmailView").textContent = s.adminEmail;
    document.getElementById("adminEmailView").href = `mailto:${s.adminEmail}`;
  }
  if(document.getElementById("adminPhoneView")) {
    document.getElementById("adminPhoneView").textContent = s.adminPhone;
    document.getElementById("adminPhoneView").href = `tel:${s.adminPhone}`;
  }
  if(document.getElementById("adminWhatsappView")) document.getElementById("adminWhatsappView").href = `https://wa.me/${s.adminPhone.replace(/\D/g, "")}`;
}

window.clearAllData = () => {
  if (!confirm("Attenzione: questo disconnetterà il dispositivo. Le segnalazioni resteranno nel server, ma perderai l'accesso per visualizzarle qui. Procedere?")) return;
  auth.signOut();
  localStorage.removeItem(STORAGE_SETTINGS);
  location.reload();
};

// 9. UTILITY
function resizeImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, match => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[match]));
}

// Esponi renderReportsUI globalmente per i filtri onchange
window.renderReportsUI = renderReportsUI;
