import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, orderBy, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let deferredPrompt = null;
let currentPhotoBase64 = "";
let currentUserUid = null;
let myReports = [];
let adminEmailCache = "";

// 1. IL GUARDIANO SILENZIOSO (Auth Anonima)
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserUid = user.uid;
    listenToMyReports();
  } else {
    signInAnonymously(auth).catch((error) => {
      console.error("Autenticazione fallita:", error);
      alert("Connessione ai server fallita. Ricarica la pagina.");
    });
  }
});

// 2. LETTURA IMPOSTAZIONI GLOBALI
function listenToGlobalSettings() {
  const settingsRef = doc(db, "settings", "global_config");
  
  onSnapshot(settingsRef, (docSnap) => {
    const s = docSnap.exists() ? docSnap.data() : {
      appTitle: "Segnalazioni Condominio",
      condominioName: "In attesa configurazione admin...",
      adminName: "Da configurare",
      adminEmail: "test@example.com",
      adminPhone: "+390000000000"
    };

    document.title = s.appTitle;
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

// 3. BOOTSTRAP APPLICAZIONE
window.addEventListener("load", () => {
  listenToGlobalSettings();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
});

// 4. PWA E UI LOGIC
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

window.showTab = (tabId) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if(tabBtn) tabBtn.classList.add("active");
  if (tabId === "reports") window.renderReportsUI();
};

// 5. INVIO SEGNALAZIONE AL SERVER
window.saveReport = async () => {
  if (!currentUserUid) return alert("Inizializzazione connessione in corso. Riprova tra un istante.");

  const name = document.getElementById("reportName").value.trim();
  const area = document.getElementById("reportArea").value;
  const type = document.getElementById("reportType").value;
  const priority = document.getElementById("reportPriority").value;
  const description = document.getElementById("reportDescription").value.trim();

  if (!name || !description) return alert("Il nome/interno e la descrizione sono obbligatori.");

  const btn = document.querySelector("#newReport button.primary");
  const originalText = btn.textContent;
  btn.textContent = "Invio in corso...";
  btn.disabled = true;

  try {
    await addDoc(collection(db, "reports"), {
      uid: currentUserUid,
      createdAt: new Date().toISOString(),
      name, area, type, priority, description,
      status: "Nuova",
      photo: currentPhotoBase64
    });

    document.getElementById("reportName").value = "";
    document.getElementById("reportDescription").value = "";
    document.getElementById("reportPhoto").value = "";
    document.getElementById("photoPreview").classList.add("hidden");
    currentPhotoBase64 = "";

    alert("Segnalazione inviata con successo!");
    window.showTab("reports");
  } catch (error) {
    console.error("Errore salvataggio:", error);
    alert("Errore di rete. Controlla la connessione e riprova.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};

// 6. ASCOLTO SEGNALAZIONI PERSONALI
function listenToMyReports() {
  const q = query(collection(db, "reports"), where("uid", "==", currentUserUid), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    myReports = [];
    snapshot.forEach(doc => myReports.push({ id: doc.id, ...doc.data() }));
    if (document.getElementById("reports").classList.contains("active")) window.renderReportsUI();
  }, (error) => console.error("Errore database:", error));
}

// 7. RENDERIZZAZIONE
window.renderReportsUI = () => {
  const list = document.getElementById("reportsList");
  const statusFilter = document.getElementById("filterStatus").value;
  const priorityFilter = document.getElementById("filterPriority").value;

  let filtered = myReports;
  if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
  if (priorityFilter) filtered = filtered.filter(r => r.priority === priorityFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">Nessuna segnalazione trovata.</div>`;
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
        ${report.photo ? `<img src="${report.photo}" alt="Foto segnalazione" style="width:100%; border-radius:10px; margin-top:10px;">` : ""}
      </article>
    `;
  }).join("");
};

window.sendEmailSummary = () => {
  const body = myReports.slice(0, 20).map(r => `- ${r.area} | ${r.type} | ${r.status} | ${r.description}`).join("\n");
  window.location.href = `mailto:${adminEmailCache}?subject=Riepilogo mie segnalazioni&body=${encodeURIComponent(body || "Nessuna segnalazione.")}`;
};

// UTILS
function resizeImage(file, maxWidth, quality) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, match => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match]));
}
