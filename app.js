const STORAGE_REPORTS = "condominio_reports_v1";
const STORAGE_SETTINGS = "condominio_settings_v1";

let deferredPrompt = null;
let currentPhotoBase64 = "";

const defaultSettings = {
  appTitle: "Segnalazioni Condominio",
  condominioName: "Gestione semplice di guasti, richieste e interventi",
  adminName: "Studio Condominio",
  adminEmail: "amministratore@example.com",
  adminPhone: "+390000000000"
};

window.addEventListener("load", () => {
  loadSettings();
  renderReports();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
});

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

function showTab(tabId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

  document.getElementById(tabId).classList.add("active");
  document.querySelector(`[data-tab="${tabId}"]`).classList.add("active");

  if (tabId === "reports") renderReports();
}

function getReports() {
  return JSON.parse(localStorage.getItem(STORAGE_REPORTS) || "[]");
}

function setReports(reports) {
  localStorage.setItem(STORAGE_REPORTS, JSON.stringify(reports));
}

function saveReport() {
  const name = document.getElementById("reportName").value.trim();
  const area = document.getElementById("reportArea").value;
  const type = document.getElementById("reportType").value;
  const priority = document.getElementById("reportPriority").value;
  const description = document.getElementById("reportDescription").value.trim();

  if (!name || !description) {
    alert("Inserisci almeno nome/interno e descrizione.");
    return;
  }

  const report = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    name,
    area,
    type,
    priority,
    description,
    status: "Nuova",
    photo: currentPhotoBase64
  };

  const reports = getReports();
  reports.unshift(report);
  setReports(reports);

  document.getElementById("reportName").value = "";
  document.getElementById("reportDescription").value = "";
  document.getElementById("reportPhoto").value = "";
  document.getElementById("photoPreview").classList.add("hidden");
  currentPhotoBase64 = "";

  alert("Segnalazione salvata correttamente.");
  showTab("reports");
}

function renderReports() {
  const list = document.getElementById("reportsList");
  const statusFilter = document.getElementById("filterStatus").value;
  const priorityFilter = document.getElementById("filterPriority").value;

  let reports = getReports();

  if (statusFilter) reports = reports.filter(r => r.status === statusFilter);
  if (priorityFilter) reports = reports.filter(r => r.priority === priorityFilter);

  if (reports.length === 0) {
    list.innerHTML = `<div class="empty">Nessuna segnalazione trovata.</div>`;
    return;
  }

  list.innerHTML = reports.map(report => {
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
          <select onchange="updateStatus('${report.id}', this.value)">
            ${["Nuova", "In lavorazione", "Risolta", "Archiviata"].map(s =>
              `<option ${report.status === s ? "selected" : ""}>${s}</option>`
            ).join("")}
          </select>
        </div>

        <div class="badges">
          <span class="badge priority-${report.priority}">Priorità: ${report.priority}</span>
          <span class="badge status-${report.status}">Stato: ${report.status}</span>
        </div>

        <p>${escapeHtml(report.description)}</p>
        ${report.photo ? `<img src="${report.photo}" alt="Foto segnalazione">` : ""}

        <div class="report-actions">
          <button class="secondary" onclick="shareReport('${report.id}')">Condividi</button>
          <button class="danger" onclick="deleteReport('${report.id}')">Elimina</button>
        </div>
      </article>
    `;
  }).join("");
}

function updateStatus(id, status) {
  const reports = getReports().map(r => r.id === id ? { ...r, status } : r);
  setReports(reports);
  renderReports();
}

function deleteReport(id) {
  if (!confirm("Vuoi eliminare questa segnalazione?")) return;
  const reports = getReports().filter(r => r.id !== id);
  setReports(reports);
  renderReports();
}

function shareReport(id) {
  const report = getReports().find(r => r.id === id);
  if (!report) return;

  const text = `Segnalazione condominiale
Zona: ${report.area}
Tipo: ${report.type}
Priorità: ${report.priority}
Stato: ${report.status}
Condomino: ${report.name}
Descrizione: ${report.description}`;

  if (navigator.share) {
    navigator.share({ title: "Segnalazione Condominio", text });
  } else {
    navigator.clipboard.writeText(text);
    alert("Testo copiato negli appunti.");
  }
}

function exportBackup() {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    reports: getReports()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-segnalazioni-condominio-${new Date().toISOString().slice(0,10)}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.reports)) setReports(data.reports);
      if (data.settings) localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(data.settings));
      loadSettings();
      renderReports();
      alert("Backup importato correttamente.");
    } catch {
      alert("File non valido.");
    }
  };
  reader.readAsText(file);
}

function saveSettings() {
  const settings = {
    appTitle: document.getElementById("settingAppTitle").value.trim() || defaultSettings.appTitle,
    condominioName: document.getElementById("settingCondominioName").value.trim() || defaultSettings.condominioName,
    adminName: document.getElementById("settingAdminName").value.trim() || defaultSettings.adminName,
    adminEmail: document.getElementById("settingAdminEmail").value.trim() || defaultSettings.adminEmail,
    adminPhone: document.getElementById("settingAdminPhone").value.trim() || defaultSettings.adminPhone
  };

  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  loadSettings();
  alert("Impostazioni salvate.");
}

function getSettings() {
  return { ...defaultSettings, ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}") };
}

function loadSettings() {
  const s = getSettings();

  document.title = s.appTitle;
  document.getElementById("appTitle").textContent = s.appTitle;
  document.getElementById("condominioName").textContent = s.condominioName;

  document.getElementById("settingAppTitle").value = s.appTitle;
  document.getElementById("settingCondominioName").value = s.condominioName;
  document.getElementById("settingAdminName").value = s.adminName;
  document.getElementById("settingAdminEmail").value = s.adminEmail;
  document.getElementById("settingAdminPhone").value = s.adminPhone;

  document.getElementById("adminNameView").textContent = s.adminName;
  document.getElementById("adminEmailView").textContent = s.adminEmail;
  document.getElementById("adminEmailView").href = `mailto:${s.adminEmail}`;
  document.getElementById("adminPhoneView").textContent = s.adminPhone;
  document.getElementById("adminPhoneView").href = `tel:${s.adminPhone}`;
  document.getElementById("adminWhatsappView").href = `https://wa.me/${s.adminPhone.replace(/\D/g, "")}`;
}

function sendEmailSummary() {
  const s = getSettings();
  const reports = getReports();

  const body = reports.slice(0, 20).map(r =>
    `- ${r.area} | ${r.type} | ${r.priority} | ${r.status} | ${r.description}`
  ).join("\n");

  window.location.href = `mailto:${s.adminEmail}?subject=Riepilogo segnalazioni condominiali&body=${encodeURIComponent(body || "Nessuna segnalazione presente.")}`;
}

function clearAllData() {
  if (!confirm("Vuoi cancellare tutte le segnalazioni e le impostazioni?")) return;
  localStorage.removeItem(STORAGE_REPORTS);
  localStorage.removeItem(STORAGE_SETTINGS);
  loadSettings();
  renderReports();
  alert("Dati cancellati.");
}

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
