/**
 * oid-ui.js — Composants d'interface, notifications, modales et navigation O.I.D
 */

// Échappement HTML sécurisé
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Toasts de notification non-bloquants
function showToast(message, type = "info", duration = 4000) {
  let container = document.getElementById("oid-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "oid-toast-container";
    container.className = "fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all transform duration-300 translate-y-4 opacity-0";

  let bgClass = "bg-white text-slate-800 border-slate-200";
  let icon = "info";
  let iconColor = "text-blue-600";

  if (type === "success") {
    bgClass = "bg-emerald-50 text-emerald-950 border-emerald-200";
    icon = "check_circle";
    iconColor = "text-emerald-600";
  } else if (type === "error") {
    bgClass = "bg-rose-50 text-rose-950 border-rose-200";
    icon = "error";
    iconColor = "text-rose-600";
  } else if (type === "warning") {
    bgClass = "bg-amber-50 text-amber-950 border-amber-200";
    icon = "warning";
    iconColor = "text-amber-600";
  }

  toast.className += ` ${bgClass}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-lg ${iconColor}">${icon}</span>
    <div class="flex-1">${escapeHtml(message)}</div>
    <button class="text-slate-400 hover:text-slate-700 text-xs ml-2" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-4", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Modale de confirmation accessible
function showConfirmModal({
  title = "Confirmation",
  message = "Êtes-vous sûr de vouloir continuer ?",
  confirmText = "Confirmer",
  cancelText = "Annuler",
  danger = false,
}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in";
    const btnColor = danger ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-[#005ea4] hover:bg-[#004b84] text-white";

    backdrop.innerHTML = `
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 transform transition-all">
        <h3 class="text-lg font-bold text-slate-900 mb-2">${escapeHtml(title)}</h3>
        <p class="text-sm text-slate-600 mb-6 leading-relaxed">${escapeHtml(message)}</p>
        <div class="flex items-center justify-end gap-3">
          <button id="oid-modal-cancel" class="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            ${escapeHtml(cancelText)}
          </button>
          <button id="oid-modal-confirm" class="px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors ${btnColor}">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const cleanup = (result) => {
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector("#oid-modal-cancel").onclick = () => cleanup(false);
    backdrop.querySelector("#oid-modal-confirm").onclick = () => cleanup(true);
    backdrop.onclick = (e) => {
      if (e.target === backdrop) cleanup(false);
    };
  });
}

// Modale de saisie de texte (ex. motif de rejet, réouverture, etc.)
function showPromptModal({
  title = "Saisie requise",
  message = "Veuillez saisir les informations nécessaires :",
  placeholder = "",
  defaultValue = "",
  confirmText = "Valider",
  cancelText = "Annuler",
  required = true,
}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4";

    backdrop.innerHTML = `
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
        <h3 class="text-lg font-bold text-slate-900 mb-2">${escapeHtml(title)}</h3>
        <p class="text-sm text-slate-600 mb-4 leading-relaxed">${escapeHtml(message)}</p>
        <textarea id="oid-prompt-input" rows="3" placeholder="${escapeHtml(placeholder)}" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005ea4] focus:border-transparent mb-4">${escapeHtml(defaultValue)}</textarea>
        <div class="flex items-center justify-end gap-3">
          <button id="oid-prompt-cancel" class="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            ${escapeHtml(cancelText)}
          </button>
          <button id="oid-prompt-confirm" class="px-4 py-2 text-sm font-semibold bg-[#005ea4] hover:bg-[#004b84] text-white rounded-lg shadow-sm transition-colors">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const input = backdrop.querySelector("#oid-prompt-input");
    input.focus();

    const cleanup = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector("#oid-prompt-cancel").onclick = () => cleanup(null);
    backdrop.querySelector("#oid-prompt-confirm").onclick = () => {
      const val = input.value.trim();
      if (required && !val) {
        input.classList.add("border-rose-500");
        return;
      }
      cleanup(val);
    };
    backdrop.onclick = (e) => {
      if (e.target === backdrop) cleanup(null);
    };
  });
}

// Formatage des dates
function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return iso;
  }
}

function formatRelatif(iso) {
  if (!iso) return "—";
  try {
    const diff = Math.floor((new Date() - new Date(iso)) / 1000);
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return `Il y a ${Math.floor(diff / 86400)} j`;
  } catch (_) {
    return iso;
  }
}

// Labels et badges lisibles
function formatType(t) {
  const map = {
    habitation: "Habitation inondée",
    rue: "Rue / Voie submergée",
    route: "Axe routier coupé",
    cours_eau: "Débordement cours d'eau",
    infrastructure: "Infrastructure touchée",
    autre: "Autre incident",
  };
  return map[t] || t || "Incident";
}

function formatStatut(s) {
  const map = {
    recu: { label: "Reçu", class: "bg-slate-100 text-slate-700" },
    valide: { label: "Validé", class: "bg-emerald-100 text-emerald-800" },
    rejete: { label: "Rejeté", class: "bg-rose-100 text-rose-800" },
    doublon: { label: "Doublon", class: "bg-amber-100 text-amber-800" },
    ouvert: { label: "Ouvert", class: "bg-blue-100 text-blue-800" },
    affecte: { label: "Affecté", class: "bg-indigo-100 text-indigo-800" },
    evalue: { label: "Évalué", class: "bg-purple-100 text-purple-800" },
    cloture: { label: "Clôturé", class: "bg-emerald-100 text-emerald-800" },
    rouvert: { label: "Rouvert", class: "bg-rose-100 text-rose-800" },
  };
  return map[s] || { label: s, class: "bg-slate-100 text-slate-700" };
}

// Barre de navigation unifiée
function renderNavBar(currentPage) {
  const navContainer = document.getElementById("oid-global-nav");
  if (!navContainer) return;

  const role = getCurrentRole();
  const nom = getCurrentNom();

  let links = [];
  if (!role) {
    links = [
      { href: "/index.html", label: "Signaler", icon: "add_alert" },
      { href: "/suivi.html", label: "Suivi", icon: "search" },
      { href: "/login.html", label: "Espace Agent", icon: "lock" },
    ];
  } else if (role === "verificateur") {
    links = [
      { href: "/verifier.html", label: "File de vérification", icon: "fact_check" },
      { href: "/index.html", label: "Portail Public", icon: "public" },
    ];
  } else if (role === "enqueteur") {
    links = [
      { href: "/enqueteur.html", label: "Mes dossiers", icon: "assignment" },
      { href: "/index.html", label: "Portail Public", icon: "public" },
    ];
  } else if (role === "coordinateur") {
    links = [
      { href: "/coordinateur.html", label: "Coordination & Carte", icon: "map" },
      { href: "/admin.html", label: "Administration & Audit", icon: "admin_panel_settings" },
      { href: "/verifier.html", label: "File Vérification", icon: "fact_check" },
      { href: "/index.html", label: "Portail Public", icon: "public" },
    ];
  }

  const roleLabels = {
    verificateur: "Vérificateur",
    enqueteur: "Enquêteur Terrain",
    coordinateur: "Coordinateur",
  };

  const navLinksHtml = links.map(l => {
    const isActive = window.location.pathname.endsWith(l.href) || (l.href === "/index.html" && window.location.pathname === "/");
    const activeClass = isActive
      ? "text-[#005ea4] font-semibold border-b-2 border-[#005ea4]"
      : "text-slate-600 hover:text-slate-900";
    return `
      <a href="${l.href}" class="flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${activeClass}">
        <span class="material-symbols-outlined text-[18px]">${l.icon}</span>
        <span>${escapeHtml(l.label)}</span>
      </a>
    `;
  }).join("");

  const userBadgeHtml = role ? `
    <div class="flex items-center gap-3 pl-3 border-l border-slate-200">
      <div class="hidden sm:flex flex-col text-right">
        <span class="text-xs font-semibold text-slate-900">${escapeHtml(nom)}</span>
        <span class="text-[10px] text-slate-500 font-medium uppercase tracking-wider">${roleLabels[role] || role}</span>
      </div>
      <button id="nav-btn-logout" title="Se déconnecter" class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 transition-colors">
        <span class="material-symbols-outlined text-[18px]">logout</span>
      </button>
    </div>
  ` : "";

  navContainer.innerHTML = `
    <header class="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <div class="flex items-center gap-6">
          <a href="/index.html" class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-[#005ea4] flex items-center justify-center text-white font-black text-sm tracking-wider">
              OID
            </div>
            <div class="flex flex-col">
              <span class="font-bold text-slate-900 text-sm tracking-tight leading-none">O.I.D</span>
              <span class="text-[10px] text-slate-500 font-medium leading-tight">Observatoire Inondations</span>
            </div>
          </a>
          <nav class="hidden md:flex items-center gap-1">
            ${navLinksHtml}
          </nav>
        </div>
        <div class="flex items-center gap-2">
          ${userBadgeHtml}
        </div>
      </div>
      <div class="md:hidden flex items-center gap-1 px-4 py-1.5 border-t border-slate-100 overflow-x-auto">
        ${navLinksHtml}
      </div>
    </header>
  `;

  const logoutBtn = document.getElementById("nav-btn-logout");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      logout();
    };
  }
}
