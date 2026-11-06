/**
 * oid-coordinateur.js — Tableau de bord opérationnel, carte tactique et supervision
 */
(async () => {
  if (!requireAuth("coordinateur", "verificateur")) return;

  // Éléments DOM
  const tableBody = document.getElementById("incidents-table-body");
  const paginationInfo = document.getElementById("pagination-info");
  const statusFilter = document.getElementById("incidents-status-filter");
  const searchInput = document.getElementById("search-input");
  const refreshBtn = document.getElementById("btn-refresh-coord");
  const csvBtn = document.getElementById("btn-export-csv");
  const sitrepBtn = document.getElementById("btn-export-sitrep");
  const logoutBtn = document.getElementById("btn-logout");
  const recenterMapBtn = document.getElementById("btn-recenter-map");
  const filterStatutMap = document.getElementById("filter-statut-map");
  const filterGraviteMap = document.getElementById("filter-gravite-map");

  // Panneau d'affectation
  const affectPanel = document.getElementById("affectation-panel");
  const affectRef = document.getElementById("affect-incident-ref");
  const affectType = document.getElementById("affect-incident-type");
  const affectLoc = document.getElementById("affect-incident-loc");
  const affectScore = document.getElementById("affect-incident-score");
  const affectStatut = document.getElementById("affect-incident-statut");
  const affectRadios = document.getElementById("affect-enqueteurs-radios");
  const affectCancel = document.getElementById("affect-btn-cancel");
  const affectConfirm = document.getElementById("affect-btn-confirm");

  let map = null;
  let markersLayer = null;
  let rawIncidents = [];
  let enqueteurs = [];
  let rawGeoJSON = null;
  let incidentToAssign = null;

  // Affichage du nom d'utilisateur
  const me = getCurrentUser();
  if (me && me.nom) {
    const el = document.getElementById("user-display-name");
    if (el) el.textContent = me.nom;
  }

  // Déconnexion
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      logout();
      window.location.href = "/login.html";
    };
  }

  // Initialisation Carte Leaflet
  function initMap() {
    const mapEl = document.getElementById("oid-coord-map");
    if (!mapEl || !window.L || map) return;

    map = L.map("oid-coord-map").setView([5.35, -4.01], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    if (recenterMapBtn) {
      recenterMapBtn.onclick = () => {
        map.setView([5.35, -4.01], 12);
      };
    }

    if (filterStatutMap) filterStatutMap.onchange = renderMapMarkers;
    if (filterGraviteMap) filterGraviteMap.onchange = renderMapMarkers;
  }

  function renderMapMarkers() {
    if (!map || !markersLayer || !rawGeoJSON || !rawGeoJSON.features) return;
    markersLayer.clearLayers();

    const statutFilter = filterStatutMap ? filterStatutMap.value : "all";
    const graviteFilter = filterGraviteMap ? filterGraviteMap.value : "all";

    const bounds = [];
    rawGeoJSON.features.forEach(f => {
      const p = f.properties;
      if (statutFilter !== "all" && p.statut !== statutFilter) return;

      if (graviteFilter === "critique" && !(p.danger_immediat || p.score_priorite >= 90)) return;
      if (graviteFilter === "elevee" && (p.score_priorite < 70 || p.score_priorite >= 90)) return;
      if (graviteFilter === "moderee" && p.score_priorite >= 70) return;

      const [lon, lat] = f.geometry.coordinates;
      bounds.push([lat, lon]);

      let color = "#005ea4"; // primary
      if (p.danger_immediat || p.score_priorite >= 90) color = "#b6171e"; // critique / rouge
      else if (p.score_priorite >= 70) color = "#4d5f7d"; // élevée / secondaire
      else if (p.statut === "evalue" || p.statut === "cloture") color = "#059669"; // vert

      const marker = L.circleMarker([lat, lon], {
        radius: 9,
        fillColor: color,
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      });

      marker.bindPopup(`
        <div class="p-2 space-y-1 text-xs font-sans">
          <div class="font-bold text-sm text-slate-900">Incident #${p.id}</div>
          <div class="font-mono text-[11px] text-slate-500">${p.reference_publique || ''}</div>
          <div>Type : <strong>${formatType ? formatType(p.type) : p.type}</strong></div>
          <div>Statut : <strong>${p.statut}</strong></div>
          <div>Priorité : <strong class="text-rose-600">${p.score_priorite}/100</strong></div>
          ${p.danger_immediat ? '<div class="text-rose-600 font-bold">🚨 Danger immédiat</div>' : ''}
          <div class="pt-2 border-t mt-1">
            <button onclick="window.dispatchAssignIncident(${p.id})" class="px-2.5 py-1 bg-[#005ea4] text-white rounded text-xs font-bold hover:bg-[#004881] w-full cursor-pointer">
              Affecter l'enquêteur
            </button>
          </div>
        </div>
      `);

      markersLayer.addLayer(marker);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }

  // Téléchargement sécurisé
  async function download(path, filename) {
    const token = localStorage.getItem("oid_token");
    try {
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Export impossible.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (typeof showToast === "function") showToast(`${filename} téléchargé.`, "success");
    } catch (e) {
      if (typeof showToast === "function") showToast(e.message, "error");
    }
  }

  if (csvBtn) csvBtn.onclick = () => download("/rapports/export/csv", "incidents.csv");
  if (sitrepBtn) sitrepBtn.onclick = () => download("/rapports/sitrep.pdf", "OID-SITREP.pdf");

  // Rendu de la charge par enquêteur
  function renderEnqueteursWorkload() {
    const container = document.getElementById("enqueteurs-list-container");
    const countBadge = document.getElementById("enqueteurs-count-badge");
    if (!container) return;

    if (countBadge) countBadge.textContent = `${enqueteurs.length} Actif(s)`;
    container.innerHTML = "";

    if (!enqueteurs.length) {
      container.innerHTML = '<div class="text-xs text-outline text-center py-4">Aucun enquêteur de terrain actif.</div>';
      return;
    }

    enqueteurs.forEach(eq => {
      const quota = 6;
      const actifs = eq.dossiers_actifs || 0;
      const pct = Math.min(100, Math.round((actifs / quota) * 100));

      let badgeClass = "bg-primary-fixed text-on-primary-fixed-variant";
      let badgeLabel = "DISPONIBLE";
      let barColor = "bg-primary";

      if (actifs >= quota) {
        badgeClass = "bg-tertiary text-on-tertiary";
        badgeLabel = "SURCHARGÉ";
        barColor = "bg-tertiary";
      } else if (actifs > 0) {
        badgeClass = "bg-secondary-container text-on-secondary-container";
        badgeLabel = "EN MISSION";
        barColor = "bg-secondary";
      }

      // Initiales
      const initials = (eq.nom || "Agent")
        .split(" ")
        .map(w => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      const item = document.createElement("div");
      item.className = "p-3 rounded-lg bg-surface-container-low flex flex-col gap-2";
      item.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs">
              ${initials}
            </div>
            <div class="flex flex-col">
              <span class="font-label-sm text-label-sm font-bold text-on-surface">${escapeHtml(eq.nom)}</span>
              <span class="text-[11px] text-outline">${escapeHtml(eq.email)}</span>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full ${badgeClass} font-label-sm text-[10px] font-bold uppercase">${badgeLabel}</span>
        </div>
        <div class="flex items-center justify-between text-xs mt-1">
          <span class="font-medium text-secondary">${actifs} / ${quota} dossiers assignés</span>
          <span class="font-bold ${actifs >= quota ? 'text-tertiary' : 'text-primary'}">${pct}%</span>
        </div>
        <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
          <div class="h-full ${barColor} rounded-full" style="width: ${pct}%;"></div>
        </div>
      `;
      container.appendChild(item);
    });
  }

  // Rendu de la table des incidents
  function renderIncidentsTable() {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const filterVal = statusFilter ? statusFilter.value : "all";
    const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

    const filtered = rawIncidents.filter(inc => {
      if (filterVal !== "all" && inc.statut !== filterVal) return false;
      if (q) {
        const ref = (inc.reference_publique || "").toLowerCase();
        const tp = (inc.type || "").toLowerCase();
        const st = (inc.statut || "").toLowerCase();
        if (!ref.includes(q) && !tp.includes(q) && !st.includes(q)) return false;
      }
      return true;
    });

    if (paginationInfo) {
      paginationInfo.textContent = `Affichage de ${filtered.length} sur ${rawIncidents.length} incident(s)`;
    }

    if (!filtered.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="py-8 text-center text-outline text-sm">
            Aucun incident ne correspond aux critères de filtre.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(inc => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-surface-container-low/60 transition-colors";
      if (inc.danger_immediat) {
        tr.classList.add("bg-tertiary-fixed/10");
      }

      // Priorité styling
      let scoreBadge = "bg-primary text-on-primary";
      if (inc.score_priorite >= 90) scoreBadge = "bg-tertiary text-on-tertiary";
      else if (inc.score_priorite >= 70) scoreBadge = "bg-secondary text-on-secondary";

      // Statut badge
      const st = formatStatut(inc.statut);

      // Enquêteur
      let eqName = '<span class="text-tertiary font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">person_off</span> Non affecté</span>';
      if (inc.enqueteur_id) {
        const eq = enqueteurs.find(u => u.id === inc.enqueteur_id);
        eqName = `<span class="font-medium text-on-surface flex items-center gap-1"><span class="material-symbols-outlined text-[16px] text-primary">person</span> ${eq ? escapeHtml(eq.nom) : 'Agent #' + inc.enqueteur_id}</span>`;
      }

      // Bouton d'action
      let actionBtn = "";
      if (inc.statut === "ouvert" || inc.statut === "rouvert") {
        actionBtn = `
          <button onclick="window.dispatchAssignIncident(${inc.id})" class="h-8 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-label-sm text-label-sm shadow-sm cursor-pointer" type="button">
            Affecter
          </button>
        `;
      } else if (inc.statut === "evalue") {
        actionBtn = `
          <button onclick="window.dispatchCloturerIncident(${inc.id})" class="h-8 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-label-sm text-label-sm shadow-sm cursor-pointer" type="button">
            Clôturer
          </button>
        `;
      } else if (inc.statut === "cloture") {
        actionBtn = `
          <button onclick="window.dispatchRouvrirIncident(${inc.id})" class="h-8 px-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 hover:bg-rose-100 font-label-sm text-label-sm cursor-pointer" type="button">
            Rouvrir
          </button>
        `;
      } else {
        actionBtn = `
          <span class="text-xs text-outline font-medium">En mission</span>
        `;
      }

      tr.innerHTML = `
        <td class="py-3 px-4 font-bold ${inc.danger_immediat ? 'text-tertiary' : 'text-primary'} whitespace-nowrap">
          <div class="flex items-center gap-1.5">
            ${inc.danger_immediat ? '<span class="w-2 h-2 rounded-full bg-tertiary animate-ping"></span>' : ''}
            ${inc.reference_publique || ('#' + inc.id)}
          </div>
        </td>
        <td class="py-3 px-4">
          <div class="font-semibold text-on-surface">${formatType ? formatType(inc.type) : inc.type}</div>
        </td>
        <td class="py-3 px-4 text-center">
          <span class="px-2 py-0.5 rounded-full ${scoreBadge} font-label-sm text-label-sm font-bold">${inc.score_priorite}</span>
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded-md ${st.class} font-label-sm text-label-sm font-semibold">${st.label}</span>
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <span class="text-xs text-on-surface flex items-center gap-1 font-medium">
            <span class="material-symbols-outlined text-[14px] text-primary">verified</span> ${inc.niveau_fiabilite || 'Standard'}
          </span>
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          ${eqName}
        </td>
        <td class="py-3 px-4 whitespace-nowrap text-secondary font-medium text-xs">
          ${inc.maj_le ? (formatRelatif ? formatRelatif(inc.maj_le) : inc.maj_le) : '--'}
        </td>
        <td class="py-3 px-4 text-right whitespace-nowrap">
          ${actionBtn}
        </td>
      `;

      tableBody.appendChild(tr);
    });
  }

  // Fonctions globales déclenchées par les boutons de lignes
  window.dispatchAssignIncident = (id) => {
    const inc = rawIncidents.find(i => i.id === id);
    if (!inc) return;
    incidentToAssign = inc;

    if (affectPanel) {
      affectPanel.classList.remove("hidden");
      if (affectRef) affectRef.textContent = inc.reference_publique || (`#SIG-INC-${inc.id}`);
      if (affectType) affectType.textContent = formatType ? formatType(inc.type) : inc.type;
      if (affectScore) affectScore.textContent = inc.score_priorite;
      if (affectStatut) affectStatut.textContent = inc.statut;

      // Rendu des options enquêteurs sous forme de radios
      if (affectRadios) {
        affectRadios.innerHTML = "";
        if (!enqueteurs.length) {
          affectRadios.innerHTML = '<div class="text-xs text-tertiary">Aucun enquêteur disponible. Rendez-vous dans Administration pour en créer un.</div>';
        } else {
          enqueteurs.forEach((eq, idx) => {
            const quota = 6;
            const charge = Math.round(((eq.dossiers_actifs || 0) / quota) * 100);
            const isLibre = (eq.dossiers_actifs || 0) < quota;

            const label = document.createElement("label");
            label.className = `cursor-pointer relative p-3 rounded-xl border transition-all flex items-center justify-between ${idx === 0 && isLibre ? 'border-primary bg-primary-fixed/10' : 'border-surface-container bg-surface-container-lowest hover:bg-surface-container-low'}`;
            label.innerHTML = `
              <div class="flex items-center gap-3">
                <input type="radio" name="investigator_selection" value="${eq.id}" ${idx === 0 && isLibre ? 'checked' : ''} ${!isLibre ? 'disabled' : ''} class="w-4 h-4 text-primary focus:ring-primary">
                <div class="flex flex-col">
                  <span class="font-label-md text-label-md font-bold text-on-surface">${escapeHtml(eq.nom)}</span>
                  <span class="text-xs text-outline">${escapeHtml(eq.email)}</span>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex flex-col text-right">
                  <span class="font-label-sm text-label-sm font-bold text-primary">${eq.dossiers_actifs || 0} dossier(s)</span>
                  <span class="text-[11px] text-outline">Charge : ${charge}%</span>
                </div>
                <span class="px-2 py-0.5 rounded-md ${isLibre ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary text-on-tertiary'} font-label-sm text-label-sm font-bold whitespace-nowrap">
                  ${isLibre ? 'DISPONIBLE' : 'PLEIN'}
                </span>
              </div>
            `;
            affectRadios.appendChild(label);
          });
        }
      }

      affectPanel.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (affectCancel) {
    affectCancel.onclick = () => {
      if (affectPanel) affectPanel.classList.add("hidden");
      incidentToAssign = null;
    };
  }

  if (affectConfirm) {
    affectConfirm.onclick = async () => {
      if (!incidentToAssign) return;
      const selected = document.querySelector('input[name="investigator_selection"]:checked');
      if (!selected) {
        showToast("Veuillez sélectionner un enquêteur actif.", "warning");
        return;
      }

      const eqId = parseInt(selected.value, 10);
      affectConfirm.disabled = true;
      try {
        await api(`/coordination/incidents/${incidentToAssign.id}/affecter`, {
          method: "POST",
          body: JSON.stringify({ enqueteur_id: eqId })
        });
        showToast(`Incident #${incidentToAssign.id} affecté avec succès.`, "success");
        if (affectPanel) affectPanel.classList.add("hidden");
        incidentToAssign = null;
        await loadDashboard();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        affectConfirm.disabled = false;
      }
    };
  }

  window.dispatchCloturerIncident = async (id) => {
    const ok = await showConfirmModal({
      title: "Clôture d'intervention",
      message: `Confirmez-vous la clôture définitive de l'incident #${id} ?`,
      confirmText: "Clôturer le dossier",
    });
    if (!ok) return;

    try {
      await api(`/coordination/incidents/${id}/cloturer`, { method: "POST" });
      showToast(`Incident #${id} clôturé avec succès.`, "success");
      await loadDashboard();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  window.dispatchRouvrirIncident = async (id) => {
    const motif = await showPromptModal({
      title: "Réouverture de dossier",
      message: "Précisez le motif obligatoire de réouverture (ex: montée d'eau résiduelle, nouveau risque) :",
      confirmText: "Rouvrir le dossier",
      required: true,
    });
    if (!motif) return;

    try {
      await api(`/coordination/incidents/${id}/rouvrir`, {
        method: "POST",
        body: JSON.stringify({ motif })
      });
      showToast(`Incident #${id} rouvert.`, "warning");
      await loadDashboard();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Chargement global du tableau de bord
  async function loadDashboard() {
    try {
      const [stats, incs, enqs, carteGeo] = await Promise.all([
        api("/coordination/stats"),
        api("/coordination/incidents"),
        api("/coordination/enqueteurs"),
        api("/coordination/carte"),
      ]);

      rawIncidents = incs;
      enqueteurs = enqs;
      rawGeoJSON = carteGeo;

      // 1. KPI Cards
      const elRecus = document.getElementById("kpi-recus");
      const elOuverts = document.getElementById("kpi-ouverts");
      const elAffectes = document.getElementById("kpi-affectes");
      const elEvalues = document.getElementById("kpi-evalues");
      const elClotures = document.getElementById("kpi-clotures");
      const elRetards = document.getElementById("kpi-retards");

      const affectesCount = incs.filter(i => i.statut === "affecte").length;
      const cloturesCount = incs.filter(i => i.statut === "cloture").length;

      if (elRecus) elRecus.textContent = stats.incidents;
      if (elOuverts) elOuverts.textContent = stats.ouverts;
      if (elAffectes) elAffectes.textContent = affectesCount;
      if (elEvalues) elEvalues.textContent = stats.evalues;
      if (elClotures) elClotures.textContent = cloturesCount;
      if (elRetards) elRetards.textContent = stats.retards_total;

      // Pourcentages
      const tauxAff = stats.incidents > 0 ? Math.round((affectesCount / stats.incidents) * 100) : 0;
      const tauxEval = stats.incidents > 0 ? Math.round((stats.evalues / stats.incidents) * 100) : 0;
      const elTauxAff = document.getElementById("kpi-taux-affectes");
      const elTauxEval = document.getElementById("kpi-taux-evalues");
      if (elTauxAff) elTauxAff.textContent = `${tauxAff}%`;
      if (elTauxEval) elTauxEval.textContent = `${tauxEval}%`;

      // Badge en-tête et table
      const badgeIncidents = document.getElementById("badge-nb-incidents");
      const tablePrioCount = document.getElementById("table-priorite-count");
      const prioCount = incs.filter(i => i.score_priorite >= 70).length;
      if (badgeIncidents) badgeIncidents.textContent = stats.ouverts;
      if (tablePrioCount) tablePrioCount.textContent = `${prioCount} prioritaires`;

      // 2. Sendai Bilan Humain
      const pAffectees = document.getElementById("stat-personnes");
      const mTouches = document.getElementById("stat-menages");
      const victimes = document.getElementById("stat-victimes");
      const deplaces = document.getElementById("stat-deplaces");
      if (pAffectees) pAffectees.textContent = stats.personnes_affectees || 0;
      if (mTouches) mTouches.textContent = stats.menages_touches || 0;
      if (victimes) victimes.textContent = `${stats.blesses || 0} / ${stats.deces || 0}`;
      if (deplaces) deplaces.textContent = stats.deplaces || 0;

      // 3. Répartition Opérationnelle (Barres)
      const distStatuts = document.getElementById("distribution-statuts-container");
      const couvBadge = document.getElementById("stat-couverture-badge");
      if (couvBadge) couvBadge.textContent = `Couverture : ${stats.couverture}`;
      if (distStatuts && stats.par_statut) {
        distStatuts.innerHTML = "";
        const statuts = [
          { key: "ouvert", label: "À faire / Ouvert", color: "bg-tertiary" },
          { key: "affecte", label: "Affecté / Terrain", color: "bg-primary" },
          { key: "evalue", label: "Évalué certifié", color: "bg-purple-600" },
          { key: "cloture", label: "Clôturé", color: "bg-emerald-600" },
        ];
        statuts.forEach(stItem => {
          const count = stats.par_statut[stItem.key] || 0;
          const pct = stats.incidents > 0 ? Math.round((count / stats.incidents) * 100) : 0;
          const barDiv = document.createElement("div");
          barDiv.className = "flex flex-col gap-1";
          barDiv.innerHTML = `
            <div class="flex justify-between items-center text-xs">
              <span class="font-semibold text-on-surface">${stItem.label}</span>
              <span class="text-outline font-bold">${count} (${pct}%)</span>
            </div>
            <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <div class="h-full ${stItem.color} rounded-full" style="width: ${pct}%;"></div>
            </div>
          `;
          distStatuts.appendChild(barDiv);
        });
      }

      // 4. Typologie des Sinistres
      const distTypes = document.getElementById("distribution-types-container");
      if (distTypes && stats.par_type) {
        distTypes.innerHTML = "";
        const typesEntries = Object.entries(stats.par_type);
        if (!typesEntries.length) {
          distTypes.innerHTML = '<div class="text-xs text-outline text-center py-2">Aucun incident enregistré.</div>';
        } else {
          typesEntries.forEach(([tKey, tCount]) => {
            const pct = stats.incidents > 0 ? Math.round((tCount / stats.incidents) * 100) : 0;
            const barDiv = document.createElement("div");
            barDiv.className = "flex flex-col gap-1";
            barDiv.innerHTML = `
              <div class="flex justify-between items-center text-xs">
                <span class="font-semibold text-on-surface">${formatType ? formatType(tKey) : tKey}</span>
                <span class="text-outline font-bold">${tCount} (${pct}%)</span>
              </div>
              <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div class="h-full bg-secondary rounded-full" style="width: ${pct}%;"></div>
              </div>
            `;
            distTypes.appendChild(barDiv);
          });
        }
      }

      renderEnqueteursWorkload();
      renderIncidentsTable();
      renderMapMarkers();
    } catch (e) {
      if (typeof showToast === "function") showToast(e.message, "error");
    }
  }

  // Écouteurs de filtres
  if (statusFilter) statusFilter.onchange = renderIncidentsTable;
  if (searchInput) searchInput.oninput = renderIncidentsTable;
  if (refreshBtn) refreshBtn.onclick = loadDashboard;

  initMap();
  await loadDashboard();
})();
