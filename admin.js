import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// QUESTE CHIAVI LE PRENDEREMO DAL TUO PROGETTO FIREBASE
const firebaseConfig = {
  apiKey: "INSERISCI_LA_TUA_API_KEY",
  authDomain: "TUO_PROGETTO.firebaseapp.com",
  projectId: "TUO_PROGETTO",
  storageBucket: "TUO_PROGETTO.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Gestione Stato Autenticazione (Il Guardiano)
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "grid";
    listenToReports(); // Avvia il tunnel real-time con il database
  } else {
    document.getElementById("loginScreen").style.display = "block";
    document.getElementById("adminDashboard").style.display = "none";
  }
});

// Funzione di Login
window.loginAdmin = () => {
  const email = document.getElementById("adminEmail").value;
  const password = document.getElementById("adminPassword").value;
  
  signInWithEmailAndPassword(auth, email, password)
    .catch((error) => {
      const errorEl = document.getElementById("loginError");
      errorEl.textContent = "Credenziali non valide o accesso negato.";
      errorEl.classList.remove("hidden");
    });
};

window.logoutAdmin = () => signOut(auth);

// Tunnel Real-time per le segnalazioni
function listenToReports() {
  const q = collection(db, "reports");
  
  // onSnapshot reagisce istantaneamente a qualsiasi modifica nel database
  onSnapshot(q, (snapshot) => {
    const reportsList = document.getElementById("adminReportsList");
    let html = "";
    
    snapshot.forEach((doc) => {
      const report = doc.data();
      html += `
        <div class="report card">
          <h4>${report.area} - ${report.type}</h4>
          <p>Condomino: ${report.name}</p>
          <p>Stato attuale: <strong>${report.status}</strong></p>
          <select onchange="updateReportStatus('${doc.id}', this.value)">
            <option value="Nuova" ${report.status === 'Nuova' ? 'selected' : ''}>Nuova</option>
            <option value="In lavorazione" ${report.status === 'In lavorazione' ? 'selected' : ''}>In lavorazione</option>
            <option value="Risolta" ${report.status === 'Risolta' ? 'selected' : ''}>Risolta</option>
          </select>
        </div>
      `;
    });
    
    reportsList.innerHTML = html;
  });
}

// Funzione per aggiornare lo stato nel database
window.updateReportStatus = async (docId, newStatus) => {
  const reportRef = doc(db, "reports", docId);
  await updateDoc(reportRef, { status: newStatus });
  // Non serve aggiornare la UI manualmente, onSnapshot se ne occuperà da solo in millisecondi.
};
