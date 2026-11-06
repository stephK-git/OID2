// OID Admin & User Management Logic
document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("coordinateur");
  if (!user) return;

  const userDisplayName = document.getElementById("user-display-name");
  if (userDisplayName) {
    userDisplayName.textContent = user.nom || "Coordinateur O.I.D";
  }

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => logout());
  }

  // Tabs
  const tabUsers = document.getElementById("tab-btn-users");
  const tabAudit = document.getElementById("tab-btn-audit");
  const paneUsers = document.getElementById("tab-pane-users");
  const paneAudit = document.getElementById("tab-pane-audit");

  function switchTab(showUsers) {
    if (showUsers) {
      tabUsers.classList.add("bg-surface-container-lowest", "text-primary", "shadow-sm");
      tabUsers.classList.remove("text-secondary", "hover:text-on-surface", "hover:bg-surface-container");
      tabUsers.setAttribute("aria-selected", "true");

      tabAudit.classList.remove("bg-surface-container-lowest", "text-primary", "shadow-sm");
      tabAudit.classList.add("text-secondary", "hover:text-on-surface", "hover:bg-surface-container");
      tabAudit.setAttribute("aria-selected", "false");

      paneUsers.classList.remove("hidden");
      paneAudit.classList.add("hidden");
    } else {
      tabAudit.classList.add("bg-surface-container-lowest", "text-primary", "shadow-sm");
      tabAudit.classList.remove("text-secondary", "hover:text-on-surface", "hover:bg-surface-container");
      tabAudit.setAttribute("aria-selected", "true");

      tabUsers.classList.remove("bg-surface-container-lowest", "text-primary", "shadow-sm");
      tabUsers.classList.add("text-secondary", "hover:text-on-surface", "hover:bg-surface-container");
      tabUsers.setAttribute("aria-selected", "false");

      paneAudit.classList.remove("hidden");
      paneUsers.classList.add("hidden");
      loadAudit();
    }
  }

  if (tabUsers) tabUsers.addEventListener("click", () => switchTab(true));
  if (tabAudit) tabAudit.addEventListener("click", () => switchTab(false));

  // Modal Create User
  const modal = document.getElementById("modal-create-user");
  const btnOpenModal = document.getElementById("btn-open-create-user");
  const btnCloseModal = document.getElementById("modal-close-btn");
  const btnCancelModal = document.getElementById("modal-cancel-btn");
  const formCreate = document.getElementById("create-user-form");
  const togglePwd = document.getElementById("toggle-pwd");
  const inputPwd = document.getElementById("create-user-password");

  if (btnOpenModal) {
    btnOpenModal.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  }

  const closeModal = () => {
    if (modal) modal.classList.add("hidden");
  };

  if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeModal);

  if (togglePwd && inputPwd) {
    togglePwd.addEventListener("click", () => {
      const isPwd = inputPwd.type === "password";
      inputPwd.type = isPwd ? "text" : "password";
      const icon = togglePwd.querySelector(".material-symbols-outlined");
      if (icon) icon.textContent = isPwd ? "visibility_off" : "visibility";
    });
  }

  // Load Zones in Create Modal
  try {
    const zones = await api("/coordination/zones");
    const zoneSelect = document.getElementById("create-user-zone");
    if (zoneSelect && zones) {
      zoneSelect.innerHTML = '<option value="">Aucune zone restreinte (District complet)</option>' +
        zones.map(z => `<option value="${z.id}">${z.nom}</option>`).join("");
    }
  } catch (err) {
    console.error("Erreur chargement zones:", err);
  }

  // Submit Create User
  if (formCreate) {
    formCreate.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nom = document.getElementById("create-user-nom")?.value?.trim();
      const email = document.getElementById("create-user-email")?.value?.trim();
      const role = document.getElementById("create-user-role")?.value;
      const zoneIdVal = document.getElementById("create-user-zone")?.value;
      const password = inputPwd?.value;

      if (!nom || !email || !role || !password) {
        showNotification("Veuillez remplir tous les champs obligatoires.", "error");
        return;
      }

      if (password.length < 8) {
        showNotification("Le mot de passe doit comporter au moins 8 caractères.", "error");
        return;
      }

      try {
        const payload = {
          nom,
          email,
          role,
          password,
          zone_id: zoneIdVal ? parseInt(zoneIdVal, 10) : null
        };
        await api("/coordination/utilisateurs", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        showNotification(`Compte créé avec succès pour ${nom}.`, "success");
        formCreate.reset();
        closeModal();
        await loadUsers();
      } catch (err) {
        showNotification(err.message || "Erreur lors de la création du compte.", "error");
      }
    });
  }

  // Export audit logs CSV
  const btnExportLogs = document.getElementById("btn-export-logs");
  if (btnExportLogs) {
    btnExportLogs.addEventListener("click", async () => {
      try {
        showNotification("Préparation de l'export d'audit...", "info");
        const token = getToken();
        const resp = await fetch("/coordination/audit/export/csv", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error("Erreur de téléchargement");
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-oid-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showNotification("Export d'audit téléchargé avec succès.", "success");
      } catch (err) {
        showNotification("Erreur lors de l'export d'audit: " + err.message, "error");
      }
    });
  }

  // Users State & Rendering
  let allUsers = [];

  async function loadUsers() {
    const tbody = document.getElementById("users-table-body");
    try {
      allUsers = await api("/coordination/utilisateurs");
      renderMetrics(allUsers);
      renderUsers(filterUsersList(allUsers));
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-error font-body-md">Erreur: ${err.message}</td></tr>`;
      }
    }
  }

  function renderMetrics(users) {
    const totalEl = document.getElementById("metric-total-users");
    const enqEl = document.getElementById("metric-enqueteurs");
    const verifEl = document.getElementById("metric-verificateurs");
    const coordEl = document.getElementById("metric-coordinateurs");

    if (totalEl) totalEl.textContent = users.length;
    if (enqEl) enqEl.textContent = users.filter(u => u.role === "enqueteur").length;
    if (verifEl) verifEl.textContent = users.filter(u => u.role === "verificateur").length;
    if (coordEl) coordEl.textContent = users.filter(u => u.role === "coordinateur").length;
  }

  function filterUsersList(users) {
    const searchVal = document.getElementById("users-search-input")?.value?.toLowerCase().trim() || "";
    const roleVal = document.getElementById("users-role-filter")?.value || "";
    const activeVal = document.getElementById("users-active-filter")?.value || "";

    return users.filter(u => {
      const matchSearch = !searchVal || u.nom.toLowerCase().includes(searchVal) || u.email.toLowerCase().includes(searchVal);
      const matchRole = !roleVal || u.role === roleVal;
      const matchActive = !activeVal || (activeVal === "true" ? u.actif : !u.actif);
      return matchSearch && matchRole && matchActive;
    });
  }

  function getInitials(nom) {
    if (!nom) return "??";
    const parts = nom.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderUsers(users) {
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-secondary font-label-md">Aucun utilisateur correspondant.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const initials = getInitials(u.nom);
      const roleConfig = {
        coordinateur: { label: "Coordinateur Opérations", icon: "shield", class: "bg-inverse-surface text-inverse-on-surface" },
        verificateur: { label: "Vérificateur Expert", icon: "fact_check", class: "bg-surface-container text-on-surface" },
        enqueteur: { label: "Enquêteur Terrain", icon: "directions_walk", class: "bg-secondary-container text-on-secondary-container" }
      }[u.role] || { label: u.role, icon: "person", class: "bg-surface-container text-on-surface" };

      const isSelf = user.id === u.id;

      return `
        <tr class="hover:bg-surface-container-low/60 transition-colors">
          <td class="py-3.5 px-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-md text-label-md font-bold shrink-0">
                ${initials}
              </div>
              <div class="min-w-0">
                <div class="font-label-md text-label-md font-semibold text-on-surface flex items-center gap-2">
                  <span>${u.nom}</span>
                  ${isSelf ? '<span class="px-1.5 py-0.5 rounded bg-primary text-on-primary text-[10px] font-bold">VOUS</span>' : ''}
                </div>
                <div class="font-label-sm text-label-sm text-secondary truncate">${u.email}</div>
              </div>
            </div>
          </td>
          <td class="py-3.5 px-4">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-label-sm text-label-sm font-semibold ${roleConfig.class}">
              <span class="material-symbols-outlined text-[14px]">${roleConfig.icon}</span>
              ${roleConfig.label}
            </span>
          </td>
          <td class="py-3.5 px-4">
            <div class="flex items-center gap-1.5 text-on-surface font-label-sm">
              <span class="material-symbols-outlined text-[16px] text-secondary">location_city</span>
              <span>${u.zone ? u.zone.nom : "District complet"}</span>
            </div>
          </td>
          <td class="py-3.5 px-4">
            <label class="relative inline-flex items-center cursor-pointer ${isSelf ? 'opacity-50 cursor-not-allowed' : ''}">
              <input type="checkbox" class="sr-only peer user-active-toggle" data-user-id="${u.id}" ${u.actif ? "checked" : ""} ${isSelf ? "disabled" : ""}/>
              <div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </td>
          <td class="py-3.5 px-4">
            <span class="font-label-sm text-label-sm text-secondary">
              ${u.actif ? '<span class="text-primary font-semibold">Actif</span>' : '<span class="text-error font-semibold">Désactivé</span>'}
            </span>
          </td>
          <td class="py-3.5 px-4 text-right">
            <div class="inline-flex items-center gap-1">
              <button class="w-8 h-8 rounded-lg text-secondary hover:bg-surface-container flex items-center justify-center transition-colors btn-reset-pwd" data-user-id="${u.id}" data-user-nom="${u.nom}" title="Réinitialiser le mot de passe" type="button">
                <span class="material-symbols-outlined text-[18px]">lock_reset</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Wire Active Toggles
    tbody.querySelectorAll(".user-active-toggle").forEach(toggle => {
      toggle.addEventListener("change", async (e) => {
        const uid = e.target.getAttribute("data-user-id");
        const isActif = e.target.checked;
        try {
          await api(`/coordination/utilisateurs/${uid}/actif?actif=${isActif}`, { method: "PATCH" });
          showNotification(`Statut utilisateur mis à jour.`, "info");
          await loadUsers();
        } catch (err) {
          showNotification(err.message || "Erreur lors de la modification.", "error");
          e.target.checked = !isActif;
        }
      });
    });

    // Wire Reset Password
    tbody.querySelectorAll(".btn-reset-pwd").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = btn.getAttribute("data-user-id");
        const nom = btn.getAttribute("data-user-nom");
        showPromptModal(`Nouveau mot de passe pour ${nom} (au moins 8 caractères) :`, async (newPwd) => {
          if (!newPwd || newPwd.trim().length < 8) {
            showNotification("Le mot de passe doit comporter au moins 8 caractères.", "error");
            return;
          }
          try {
            await api(`/coordination/utilisateurs/${uid}/mot-de-passe?nouveau_mot_de_passe=${encodeURIComponent(newPwd.trim())}`, { method: "PATCH" });
            showNotification(`Mot de passe réinitialisé pour ${nom}.`, "success");
          } catch (err) {
            showNotification(err.message || "Erreur de réinitialisation.", "error");
          }
        });
      });
    });
  }

  // Filter Event Listeners
  ["users-search-input", "users-role-filter", "users-active-filter"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => renderUsers(filterUsersList(allUsers)));
  });

  const resetFiltersBtn = document.getElementById("users-reset-filters");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      const search = document.getElementById("users-search-input");
      const role = document.getElementById("users-role-filter");
      const active = document.getElementById("users-active-filter");
      if (search) search.value = "";
      if (role) role.value = "";
      if (active) active.value = "";
      renderUsers(allUsers);
    });
  }

  // Audit Logs
  let allLogs = [];

  async function loadAudit() {
    const tbody = document.getElementById("audit-table-body");
    try {
      allLogs = await api("/coordination/audit");
      renderAudit(filterAuditList(allLogs));
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-error font-body-md">Erreur: ${err.message}</td></tr>`;
      }
    }
  }

  function filterAuditList(logs) {
    const searchVal = document.getElementById("audit-search-input")?.value?.toLowerCase().trim() || "";
    return logs.filter(l => {
      if (!searchVal) return true;
      return (
        (l.action && l.action.toLowerCase().includes(searchVal)) ||
        (l.objet_type && l.objet_type.toLowerCase().includes(searchVal)) ||
        (l.utilisateur_nom && l.utilisateur_nom.toLowerCase().includes(searchVal)) ||
        (l.motif && l.motif.toLowerCase().includes(searchVal)) ||
        String(l.objet_id).includes(searchVal)
      );
    });
  }

  function renderAudit(logs) {
    const tbody = document.getElementById("audit-table-body");
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-secondary font-label-md">Aucune entrée d'audit trouvée.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const dateStr = l.cree_le ? new Date(l.cree_le).toLocaleString("fr-FR", { timeZone: "UTC" }) + " GMT" : "--";
      return `
        <tr class="hover:bg-surface-container-low/60 transition-colors">
          <td class="py-3.5 px-4 whitespace-nowrap font-label-sm text-label-sm font-semibold text-secondary">
            ${dateStr}
          </td>
          <td class="py-3.5 px-4 whitespace-nowrap">
            <span class="font-label-md text-label-md font-medium text-on-surface">${l.utilisateur_nom || "Système"}</span>
          </td>
          <td class="py-3.5 px-4">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-semibold">
              <span class="material-symbols-outlined text-[14px]">history</span>
              ${l.action}
            </span>
          </td>
          <td class="py-3.5 px-4">
            <span class="font-label-md text-label-md font-semibold text-primary">${l.objet_type} #${l.objet_id}</span>
          </td>
          <td class="py-3.5 px-4 whitespace-nowrap">
            <div class="inline-flex items-center gap-1.5 font-label-sm text-label-sm">
              <span class="px-2 py-0.5 rounded bg-surface-container text-secondary">${l.ancien_statut || "Initial"}</span>
              <span class="material-symbols-outlined text-[14px] text-outline">arrow_forward</span>
              <span class="px-2 py-0.5 rounded bg-primary-container text-on-primary font-semibold">${l.nouveau_statut || l.action}</span>
            </div>
          </td>
          <td class="py-3.5 px-4 font-body-md text-body-md text-on-surface max-w-sm truncate" title="${l.motif || ''}">
            ${l.motif || '<span class="text-outline italic">Sans motif</span>'}
          </td>
        </tr>
      `;
    }).join("");
  }

  const auditSearch = document.getElementById("audit-search-input");
  if (auditSearch) {
    auditSearch.addEventListener("input", () => renderAudit(filterAuditList(allLogs)));
  }

  // Initial load
  await loadUsers();
});
