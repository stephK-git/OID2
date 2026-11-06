/**
 * oid-verifier.js — Qualification et vérification des signalements (Design Stitch)
 */
(() => {
  if (!requireAuth("verificateur", "coordinateur")) return;

  const queueContainer = document.getElementById("queue-container");
  const queueCount = document.getElementById("queue-count");
  const refreshBtn = document.getElementById("btn-refresh-queue");
  const searchInput = document.getElementById("queue-search-input");
  const filterBtns = document.querySelectorAll(".queue-filter-btn");

  const countAll = document.getElementById("count-all");
  const countUrgent = document.getElementById("count-urgent");
  const countLate = document.getElementById("count-late");

  // Détail droit
  const detailRef = document.querySelector(".lg\\:col-span-8 .font-headline-lg");
  const detailDangerBadge = document.querySelector(".lg\\:col-span-8 span.bg-tertiary");
  const detailZoneBadge = document.querySelector(".lg\\:col-span-8 span.bg-surface-container");
  const detailDesc = document.querySelector(".lg\\:col-span-8 p.italic");
  const detailCoords = document.querySelector(".lg\\:col-span-8 span.font-mono");
  const detailPhoto = document.querySelector(".lg\\:col-span-8 img.object-cover");
  const detailScore = document.querySelector(".lg\\:col-span-8 .font-data-metric");

  const validateBtn = document.getElementById("btn-validate-signalement");
  const rejectModal = document.getElementById("rejectModal");
  const openRejectBtn = document.getElementById("openRejectModalBtn");
  const cancelRejectBtn = document.getElementById("cancelRejectBtn");
  const confirmRejectBtn = document.getElementById("confirmRejectBtn");
  const rejectNotes = document.getElementById("rejectNotes");

  let rawQueue = [];
  let currentFilter = "all";
  let activeSignalement = null;

  // ── Chargement de la file ────────────────────────────────────────────────
  async function loadQueue() {
    try {
      if (queueContainer) {
        queueContainer.innerHTML = '<div class="p-6 text-center text-outline text-sm">Chargement de la file d\'attente...</div>';
      }
      const data = await apiFetch("/verification/file");
      rawQueue = data || [];
      updateCounters();
      renderQueue();
      if (rawQueue.length > 0 && !activeSignalement) {
        selectSignalement(rawQueue[0]);
      } else if (rawQueue.length === 0) {
        clearDetail();
      }
    } catch (err) {
      if (queueContainer) {
        queueContainer.innerHTML = `<div class="p-6 text-center text-tertiary text-sm">Erreur: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function updateCounters() {
    const total = rawQueue.length;
    const urgents = rawQueue.filter(i => i.danger_immediat).length;
    const lates = rawQueue.filter(i => i.en_retard).length;

    if (queueCount) queueCount.textContent = `${total} actifs`;
    if (countAll) countAll.textContent = total;
    if (countUrgent) countUrgent.textContent = urgents;
    if (countLate) countLate.textContent = lates;
  }

  // ── Rendu de la file (gauche) ───────────────────────────────────────────
  function renderQueue() {
    if (!queueContainer) return;
    queueContainer.innerHTML = "";

    const query = (searchInput?.value || "").toLowerCase().trim();
    const filtered = rawQueue.filter(item => {
      if (currentFilter === "urgent" && !item.danger_immediat) return false;
      if (currentFilter === "late" && !item.en_retard) return false;
      if (currentFilter === "corroborated" && (!item.doublons_suggeres || !item.doublons_suggeres.length)) return false;

      if (query) {
        const str = `${item.reference_suivi} ${item.type} ${item.description || ""}`.toLowerCase();
        if (!str.includes(query)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      queueContainer.innerHTML = '<div class="p-8 text-center bg-surface-container-low rounded-xl text-outline text-sm">Aucun signalement dans cette vue.</div>';
      return;
    }

    filtered.forEach(item => {
      const isSelected = activeSignalement && activeSignalement.id === item.id;
      const article = document.createElement("article");
      article.className = `relative p-3.5 rounded-xl cursor-pointer transition-all shadow-sm ${
        isSelected ? "bg-primary-fixed/30 ring-2 ring-primary" : "bg-surface-container-lowest hover:bg-surface-container-low"
      }`;

      const pScore = Math.round(item.score_priorite || 0);
      const scoreBg = pScore >= 70 ? "bg-tertiary" : pScore >= 40 ? "bg-primary" : "bg-secondary";
      const timeAgo = formatRelatif ? formatRelatif(item.cree_le) : "Récemment";
      const typeLabel = formatType ? formatType(item.type) : item.type;

      article.innerHTML = `
        <div class="absolute left-0 top-3 bottom-3 w-1.5 ${isSelected ? 'bg-primary' : 'bg-transparent'} rounded-r"></div>
        <div class="flex items-start justify-between gap-space-sm pl-1">
          <div class="flex flex-col gap-1 min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              ${item.danger_immediat ? `
                <span class="bg-tertiary text-on-tertiary font-label-sm text-[11px] px-2 py-0.5 rounded flex items-center gap-1">
                  <span class="material-symbols-outlined text-[13px]">e911_emergency</span>
                  Danger immédiat
                </span>
              ` : ''}
              <span class="bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-[11px] px-2 py-0.5 rounded uppercase font-semibold">
                ${escapeHtml(item.gravite || 'Moyenne')}
              </span>
              ${item.en_retard ? `
                <span class="bg-secondary-container text-on-secondary-container font-label-sm text-[11px] px-2 py-0.5 rounded flex items-center gap-1">
                  <span class="material-symbols-outlined text-[13px]">timer</span>
                  ⏱️ En retard
                </span>
              ` : ''}
            </div>
            <h2 class="font-label-lg text-label-lg text-on-surface truncate mt-0.5 font-bold">
              ${escapeHtml(typeLabel)}
            </h2>
            <p class="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1 truncate">
              <span class="material-symbols-outlined text-[15px] text-outline shrink-0">location_on</span>
              ${item.coords ? `${item.coords.lat.toFixed(4)}° N, ${item.coords.lon.toFixed(4)}° W` : 'Abidjan'}
            </p>
            <div class="flex items-center gap-2 mt-0.5 text-outline font-label-sm text-[11px]">
              <span class="font-mono font-semibold">#${escapeHtml(item.reference_suivi || item.id)}</span>
              <span>•</span>
              <span class="text-tertiary font-semibold">${escapeHtml(timeAgo)}</span>
            </div>
          </div>
          <div class="flex flex-col items-center justify-center shrink-0">
            <div class="w-11 h-11 rounded-full ${scoreBg} text-white flex flex-col items-center justify-center shadow">
              <span class="font-headline-md text-headline-md leading-none text-sm font-black">${pScore}</span>
              <span class="font-label-sm text-[8px] leading-tight opacity-90 uppercase">Score</span>
            </div>
          </div>
        </div>
      `;

      article.addEventListener("click", () => {
        selectSignalement(item);
        renderQueue();
      });

      queueContainer.appendChild(article);
    });
  }

  // ── Sélection et affichage du détail (droite) ────────────────────────────
  function selectSignalement(item) {
    activeSignalement = item;
    if (!item) return;

    if (detailRef) detailRef.textContent = `#${item.reference_suivi || item.id}`;
    if (detailDangerBadge) {
      if (item.danger_immediat) {
        detailDangerBadge.classList.remove("hidden");
      } else {
        detailDangerBadge.classList.add("hidden");
      }
    }
    if (detailDesc) {
      detailDesc.textContent = item.description ? `« ${item.description} »` : "« Aucune description complémentaire. »";
    }
    if (detailCoords && item.coords) {
      detailCoords.textContent = `${item.coords.lat.toFixed(4)}° N, ${item.coords.lon.toFixed(4)}° W`;
    }
    if (detailScore) {
      detailScore.textContent = Math.round(item.score_priorite || 0);
    }

    // Gestion des doublons
    const dupBox = document.querySelector(".lg\\:col-span-5 .mt-space-xs");
    const mergeBtn = document.querySelector("button:has(.material-symbols-outlined:contains('call_merge'))") || document.querySelector("button span.material-symbols-outlined:first-child");
    
    const dups = item.doublons_suggeres || [];
    if (dupBox) {
      if (dups.length > 0) {
        const d = dups[0];
        dupBox.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="font-label-sm text-label-sm font-bold text-on-surface">#${escapeHtml(d.reference_publique || d.id)}</span>
            <span class="bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-[11px] px-2 py-0.5 rounded font-semibold">
              Proximité immédiate (&lt; 50m)
            </span>
          </div>
          <p class="font-body-md text-body-md text-on-surface mt-1">
            <strong>Incident ouvert existant</strong> (Statut: ${escapeHtml(d.statut)})
          </p>
          <div class="pt-2">
            <button id="btn-merge-action" class="w-full py-2 px-3 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">call_merge</span>
              Rattacher à cet incident
            </button>
          </div>
        `;
        const actionBtn = document.getElementById("btn-merge-action");
        if (actionBtn) {
          actionBtn.onclick = () => mergeWithDuplicate(item.id, d.id);
        }
      } else {
        dupBox.innerHTML = `
          <p class="font-body-md text-body-md text-on-surface-variant py-4 text-center">
            ✓ Aucun doublon détecté dans un rayon de 50 mètres.
          </p>
        `;
      }
    }
  }

  function clearDetail() {
    activeSignalement = null;
    if (detailRef) detailRef.textContent = "Aucun signalement en attente";
    if (detailDesc) detailDesc.textContent = "La file de vérification est actuellement vide.";
  }

  // ── Actions métier ───────────────────────────────────────────────────────
  async function validateActive() {
    if (!activeSignalement) return;
    try {
      await apiFetch(`/verification/${activeSignalement.id}/valider`, { method: "POST" });
      showToast("Signalement validé avec succès !", "success");
      activeSignalement = null;
      await loadQueue();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function mergeWithDuplicate(signalementId, incidentId) {
    try {
      await apiFetch(`/verification/${signalementId}/fusionner?incident_existant_id=${incidentId}`, { method: "POST" });
      showToast("Signalement fusionné avec l'incident existant.", "success");
      activeSignalement = null;
      await loadQueue();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function rejectActive() {
    if (!activeSignalement) return;
    const motif = (rejectNotes?.value || "").trim();
    if (!motif) {
      showToast("Veuillez saisir un motif de rejet circonstancié.", "warning");
      return;
    }
    try {
      await apiFetch(`/verification/${activeSignalement.id}/rejeter`, {
        method: "POST",
        body: JSON.stringify({ motif })
      });
      showToast("Signalement rejeté.", "info");
      if (rejectModal) rejectModal.classList.add("hidden");
      if (rejectNotes) rejectNotes.value = "";
      activeSignalement = null;
      await loadQueue();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ── Événements ───────────────────────────────────────────────────────────
  if (validateBtn) validateBtn.onclick = validateActive;

  if (openRejectBtn && rejectModal) {
    openRejectBtn.onclick = () => {
      if (!activeSignalement) return;
      rejectModal.classList.remove("hidden");
    };
  }
  if (cancelRejectBtn && rejectModal) {
    cancelRejectBtn.onclick = () => rejectModal.classList.add("hidden");
  }
  if (confirmRejectBtn) confirmRejectBtn.onclick = rejectActive;

  if (refreshBtn) refreshBtn.onclick = loadQueue;
  if (searchInput) searchInput.oninput = () => renderQueue();

  filterBtns.forEach(btn => {
    btn.onclick = () => {
      filterBtns.forEach(b => {
        b.className = "queue-filter-btn bg-surface-container text-on-surface-variant hover:bg-surface-container-high px-3 py-1 rounded-full font-label-sm text-label-sm shrink-0 transition-colors cursor-pointer";
      });
      btn.className = "queue-filter-btn bg-primary text-on-primary px-3 py-1 rounded-full font-label-sm text-label-sm shrink-0 shadow-sm cursor-pointer";
      currentFilter = btn.dataset.filter || "all";
      renderQueue();
    };
  });

  // Initialisation
  loadQueue();
})();
