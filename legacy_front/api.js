/**
 * api.js — Client HTTP O.I.D
 * Fournit : api(), login(), logout(), getCurrentUser(), redirectByRole()
 */

const API_BASE = window.location.origin;

/** Effectue un appel API authentifié. Redirige vers /login.html si 401. */
async function api(path, opts = {}) {
  const token = localStorage.getItem("oid_token");
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  if (res.status === 401) {
    // Token expiré ou invalide → déconnexion propre
    localStorage.removeItem("oid_token");
    localStorage.removeItem("oid_role");
    localStorage.removeItem("oid_nom");
    window.location.replace("/login.html");
    throw new Error("Session expirée. Reconnecte-toi.");
  }
  if (!res.ok) {
    let detail = "Erreur serveur.";
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

/** Connexion : stocke le token, le rôle et le nom. */
async function login(email, password) {
  const data = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("oid_token", data.access_token);
  localStorage.setItem("oid_role", data.role);
  if (data.nom) localStorage.setItem("oid_nom", data.nom);
  return data;
}

/** Déconnexion : efface le token et redirige vers /login.html. */
function logout() {
  localStorage.removeItem("oid_token");
  localStorage.removeItem("oid_role");
  localStorage.removeItem("oid_nom");
  window.location.replace("/login.html");
}

/** Retourne le rôle de l'utilisateur connecté depuis le localStorage. */
function getCurrentRole() {
  return localStorage.getItem("oid_role") || null;
}

/** Retourne le nom de l'utilisateur connecté. */
function getCurrentNom() {
  return localStorage.getItem("oid_nom") || "Utilisateur";
}

/** Redirige vers la page appropriée selon le rôle. */
function redirectByRole(role) {
  const destinations = {
    verificateur: "/verifier.html",
    enqueteur: "/enqueteur.html",
    coordinateur: "/coordinateur.html",
  };
  const dest = destinations[role] || "/login.html";
  window.location.replace(dest);
}

/**
 * Vérifie qu'un token est présent et que le rôle attendu correspond.
 * À appeler en début de chaque page protégée.
 * @param {...string} rolesAutorises — rôles acceptés (ex. "verificateur", "coordinateur")
 */
function requireAuth(...rolesAutorises) {
  const token = localStorage.getItem("oid_token");
  if (!token) {
    window.location.replace("/login.html");
    return false;
  }
  if (rolesAutorises.length > 0) {
    const role = getCurrentRole();
    if (!rolesAutorises.includes(role)) {
      window.location.replace("/login.html");
      return false;
    }
  }
  return true;
}

/**
 * Injecte un bouton de déconnexion dans l'élément cible.
 * @param {string} selector — sélecteur CSS de l'élément conteneur (ex. "#nav-actions")
 */
function injectLogoutButton(selector = "#nav-logout") {
  const el = document.querySelector(selector);
  if (!el) return;
  const btn = document.createElement("button");
  btn.className = "rounded-lg bg-red-100 px-3 py-1 text-sm text-red-800 hover:bg-red-200";
  btn.textContent = "Déconnexion";
  btn.addEventListener("click", logout);
  el.append(btn);
}
