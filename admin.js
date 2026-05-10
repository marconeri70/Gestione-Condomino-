import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaRvdsTWGCJK59lbbGzU6qnoaJrwCnaJI",
  authDomain: "condominio-admin-1abcf.firebaseapp.com",
  projectId: "condominio-admin-1abcf",
  storageBucket: "condominio-admin-1abcf.firebasestorage.app",
  messagingSenderId: "944250769876",
  appId: "1:944250769876:web:d53d8b5d4ef789e5764641",
  measurementId: "G-210EP3Q2T9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// STATO AUTENTICAZIONE
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "grid";
    listenToReports();
  } else {
    document.getElementById("loginScreen").style.display = "block";
    document.getElementById("adminDashboard").style.display = "none";
  }
});

// LOGICA LOGIN/LOGOUT
window.loginAdmin = async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const errorEl = document.getElementById("loginError");
  
  if(!email || !password) return;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    errorEl.classList.add("hidden");
  } catch (error) {
    errorEl.textContent = "Credenziali errate o accesso non autorizzato.";
    errorEl.classList.remove("hidden");
  }
};

window.logoutAdmin = () => signOut(auth);

// MOTORE REAL-TIME
function listenToReports() {
  const reportsRef = collection(db, "reports");
  const q = query(reportsRef, orderBy("createdAt", "desc"));
  
  onSnapshot(q, (snapshot) => {
    const list = document.getElementById("adminReportsList");
    let html = "";
    
    if(snapshot.empty) {
      list.innerHTML = "<p>Nessuna segnalazione nel sistema.</p>";
      return;
    }

    snapshot.forEach((docSnapshot) => {
      const report = docSnapshot.data();
      const id = docSnapshot.id;
      const date = new Date(report.createdAt).toLocaleString("it-IT");
      
      html += `
        <div class="report card" style="margin-bottom: 15px; border-left: 5px solid ${getStatusColor(report.status)}">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <h4 style="margin:0 0 5px 0;">${report.type} - ${report.area}</h4>
              <p style="margin:0 0 10px 0; font-size:14px; color: #666;"><strong>${report.name}</strong> • ${date}</p>
            </div>
            <span class="badge" style="background:#f4f7fb; padding:5px 10px; border-radius:10px;">Priorità: ${report.priority}</span>
          </div>
          <p>${report.description}</p>
          ${report.photo ? `<img src="${report.photo}" style="max-width:200px; border-radius:10px; display:block; margin: 10px 0;">` : ""}
          
          <div style="display:flex; gap: 10px; align-items: center; margin-top: 15px;">
            <select onchange="updateStatus('${id}', this.value)" style="width: auto; padding: 8px;">
              <option value="Nuova" ${report.status === 'Nuova' ? 'selected' : ''}>Nuova</option>
              <option value="In lavorazione" ${report.status === 'In lavorazione' ? 'selected' : ''}>In lavorazione</option>
              <option value="Risolta" ${report.status === 'Risolta' ? 'selected' : ''}>Risolta</option>
              <option value="Archiviata" ${report.status === 'Archiviata' ? 'selected' : ''}>Archiviata</option>
            </select>
            <button class="danger" style="padding: 8px 12px; margin:0;" onclick="deleteReport('${id}')">Elimina</button>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  });
}

// AZIONI SUL DATABASE
window.updateStatus = async (id, newStatus) => {
  await updateDoc(doc(db, "reports", id), { status: newStatus });
};

window.deleteReport = async (id) => {
  if(confirm("Eliminare definitivamente questa segnalazione dal database centrale?")) {
    await deleteDoc(doc(db, "reports", id));
  }
};

function getStatusColor(status) {
  switch(status) {
    case 'Nuova': return '#0f4c81';
    case 'In lavorazione': return '#f2b705';
    case 'Risolta': return '#16794c';
    default: return '#667085';
  }
}
