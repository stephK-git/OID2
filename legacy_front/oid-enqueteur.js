// OID Enqueteur Terrain Logic
document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("enqueteur");
  if (!user) return;

  const agentCardName = document.getElementById("agent-card-name");
  if (agentCardName) agentCardName.textContent = user.nom || "Enquêteur Terrain";

  const zoneNom = (user.zone && user.zone.nom) ? user.zone.nom : "District d'Abidjan";
  const agentHeaderZone = document.getElementById("agent-header-zone");
  const agentCardZone = document.getElementById("agent-card-zone");
  if (agentHeaderZone) agentHeaderZone.textContent = zoneNom;
  if (agentCardZone) agentCardZone.textContent = zoneNom;

  const btnLogout = document.getElementById("btn-logout-enqueteur");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => logout());
  }

  let allDossiers = [];
  let currentFilter = "all";

  const refreshBtn = document.getElementById("refresh-sync-btn");
  const syncIcon = document.getElementById("sync-icon");

  async function loadDossiers() {
    if (syncIcon) syncIcon.classList.add("rotate-180");
    const container = document.getElementById("dossiers-list");
    try {
      allDossiers = await api("/enquete/mes-dossiers");
      updateCounts(allDossiers);
      renderDossiers(filterDossiers(allDossiers, currentFilter));
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div class="p-6 text-center bg-surface-container-lowest rounded-2xl shadow-sm text-error font-body-md">
            Erreur de synchronisation: ${err.message}
          </div>
        `;
      }
    } finally {
      if (syncIcon) {
        setTimeout(() => syncIcon.classList.remove("rotate-180"), 500);
      }
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadDossiers);
  }

  function updateCounts(dossiers) {
    const countAll = dossiers.length;
    const countPHigh = dossiers.filter(d => (d.score_priorite >= 70 || d.danger_immediat)).length;
    const countTodo = dossiers.filter(d => d.evaluation_statut === "aucune").length;
    const countDraft = dossiers.filter(d => d.evaluation_statut === "brouillon").length;
    const countDone = dossiers.filter(d => d.evaluation_statut === "soumise").length;

    const elAll = document.getElementById("count-all");
    const elPHigh = document.getElementById("count-phigh");
    const elTodo = document.getElementById("count-todo");
    const elDraft = document.getElementById("count-draft");
    const elDone = document.getElementById("count-done");

    if (elAll) elAll.textContent = countAll;
    if (elPHigh) elPHigh.textContent = countPHigh;
    if (elTodo) elTodo.textContent = countTodo;
    if (elDraft) elDraft.textContent = countDraft;
    if (elDone) elDone.textContent = countDone;
  }

  function filterDossiers(dossiers, filter) {
    if (filter === "p-high") {
      return dossiers.filter(d => d.score_priorite >= 70 || d.danger_immediat);
    }
    if (filter === "todo") {
      return dossiers.filter(d => d.evaluation_statut === "aucune");
    }
    if (filter === "draft") {
      return dossiers.filter(d => d.evaluation_statut === "brouillon");
    }
    if (filter === "done") {
      return dossiers.filter(d => d.evaluation_statut === "soumise");
    }
    return dossiers;
  }

  function formatTimeAgo(isoStr) {
    if (!isoStr) return "récemment";
    const dt = new Date(isoStr);
    const diffMin = Math.round((Date.now() - dt.getTime()) / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH} h`;
    return `il y a ${Math.floor(diffH / 24)} j`;
  }

  function renderDossiers(dossiers) {
    const container = document.getElementById("dossiers-list");
    if (!container) return;

    if (!dossiers || dossiers.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center bg-surface-container-lowest rounded-2xl shadow-sm space-y-3">
          <span class="material-symbols-outlined text-4xl text-outline">folder_open</span>
          <p class="font-headline-md text-on-surface">Aucun dossier dans cette catégorie</p>
          <p class="font-body-md text-secondary">Tous les dossiers du secteur pour ce filtre sont traités ou en attente d'affectation.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = dossiers.map(d => {
      const isUrgent = d.score_priorite >= 70 || d.danger_immediat;
      const scoreColor = d.score_priorite >= 70 ? "text-tertiary bg-tertiary-container/20" : (d.score_priorite >= 50 ? "text-primary bg-primary-container/20" : "text-secondary bg-surface-container-high");

      let statutBadge = "";
      if (d.evaluation_statut === "soumise") {
        statutBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-container-highest text-on-surface font-label-sm text-label-sm font-semibold"><span class="material-symbols-outlined text-[14px] text-primary">verified</span>Évaluation transmise</span>';
      } else if (d.evaluation_statut === "brouillon") {
        statutBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary-container text-on-secondary-fixed font-label-sm text-label-sm font-semibold"><span class="material-symbols-outlined text-[14px]">edit_note</span>Brouillon enregistré</span>';
      } else {
        statutBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-container text-on-surface font-label-sm text-label-sm font-semibold"><span class="material-symbols-outlined text-[14px]">pending_actions</span>À évaluer</span>';
      }

      const coordsStr = d.coords ? `${d.coords.lat.toFixed(4)} N, ${d.coords.lon.toFixed(4)} W` : "Localisation transmise";
      const navUrl = d.coords ? `https://www.google.com/maps/dir/?api=1&destination=${d.coords.lat},${d.coords.lon}` : "#";

      const timeAgo = formatTimeAgo(d.cree_le);

      return `
        <article class="bg-surface-container-lowest rounded-2xl p-4 shadow-sm flex flex-col gap-3 transition-transform active:scale-[0.99]">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="font-label-sm text-label-sm text-primary uppercase tracking-wider font-extrabold">${d.type || "Inondation"}</span>
                <span class="text-outline text-xs">•</span>
                <span class="font-label-sm text-label-sm text-on-surface-variant font-mono">${d.reference_publique}</span>
              </div>
              <h2 class="font-headline-md text-headline-md text-on-surface leading-tight">Dossier #${d.id} · ${d.type || "Sinistre"}</h2>
            </div>
            <div class="shrink-0 flex flex-col items-center">
              <div class="w-12 h-12 rounded-full ${scoreColor} flex items-center justify-center shadow-inner">
                <span class="font-data-metric text-[20px] leading-none font-bold">${d.score_priorite}</span>
              </div>
              <span class="font-label-sm text-[10px] text-secondary mt-0.5 font-bold uppercase tracking-wider">Score</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            ${isUrgent ? '<span class="inline-flex items-center px-2 py-1 rounded-md bg-tertiary-container text-on-tertiary-container font-label-sm text-label-sm font-bold uppercase tracking-wide">Critique</span>' : ''}
            ${d.danger_immediat ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-tertiary text-on-tertiary font-label-sm text-label-sm font-extrabold shadow-sm animate-pulse"><span class="material-symbols-outlined text-[15px]">warning</span><span>🚨 Danger immédiat</span></span>' : ''}
            ${statutBadge}
          </div>

          <div class="bg-surface-container-low rounded-xl p-2.5 flex flex-col gap-1.5">
            <div class="flex items-center gap-1.5 text-on-surface-variant">
              <span class="material-symbols-outlined text-[18px] text-primary shrink-0">location_on</span>
              <span class="font-label-md text-label-md text-on-surface truncate">${coordsStr}</span>
            </div>
            <div class="flex items-center justify-between text-outline px-0.5 text-xs font-label-sm">
              <div class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">schedule</span>
                <span>${timeAgo}</span>
              </div>
              <div class="flex items-center gap-1 text-primary font-semibold">
                <span class="material-symbols-outlined text-[14px]">near_me</span>
                <span>Secteur d'affectation</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <a href="${navUrl}" target="_blank" rel="noopener noreferrer" class="min-h-[50px] px-3 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-surface-container-high active:scale-95 transition-all">
              <span class="material-symbols-outlined text-[20px] text-primary">directions</span>
              <span>Itinéraire</span>
            </a>
            <a href="/evaluation.html?incident_id=${d.id}" class="min-h-[50px] px-3 rounded-xl bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 shadow-md hover:bg-primary-container active:scale-95 transition-all">
              <span class="material-symbols-outlined text-[20px]">assignment_turned_in</span>
              <span>${d.evaluation_statut === "soumise" ? "Voir l'évaluation" : (d.evaluation_statut === "brouillon" ? "Reprendre" : "Évaluer")}</span>
            </a>
          </div>
        </article>
      `;
    }).join("");
  }

  // Filter Tabs Event Listeners
  const filterTabs = document.querySelectorAll(".filter-tab");
  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabs.forEach(t => {
        t.classList.remove("bg-primary", "text-on-primary", "shadow-sm");
        t.classList.add("bg-surface-container", "text-on-surface");
      });
      tab.classList.remove("bg-surface-container", "text-on-surface");
      tab.classList.add("bg-primary", "text-on-primary", "shadow-sm");

      currentFilter = tab.getAttribute("data-filter") || "all";
      renderDossiers(filterDossiers(allDossiers, currentFilter));
    });
  });

  // Recenter GPS
  const recenterBtn = document.getElementById("recenter-gps-btn");
  if (recenterBtn && navigator.geolocation) {
    recenterBtn.addEventListener("click", () => {
      showNotification("Recherche de la position GPS de l'agent...", "info");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          showNotification(`Position fixée : ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, "success");
        },
        (err) => {
          showNotification("Impossible d'obtenir la position GPS: " + err.message, "error");
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    });
  }

  // Initial load
  await loadDossiers();
});
