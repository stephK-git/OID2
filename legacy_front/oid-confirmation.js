/**
 * oid-confirmation.js — Page de confirmation de signalement
 */
(async () => {
  const ref = new URLSearchParams(location.search).get("ref");
  const node = document.getElementById("refCodeText");
  const follow = document.getElementById("follow-link") || document.getElementById("btn-suivi-link");
  const copyBtn = document.getElementById("copyBtn");
  const copyLabel = document.getElementById("copyLabel");

  if (!ref) {
    if (node) node.textContent = "Aucune référence spécifiée";
    return;
  }

  if (node) node.textContent = ref;
  if (follow) follow.href = `/suivi.html?ref=${encodeURIComponent(ref)}`;

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ref);
        if (copyLabel) copyLabel.textContent = "Copié !";
        setTimeout(() => { if (copyLabel) copyLabel.textContent = "Copier"; }, 2000);
      } catch {
        if (copyLabel) copyLabel.textContent = "Sélectionnez le code";
      }
    });
  }

  // Charger les données réelles du signalement
  try {
    const res = await fetch(`/signalements/${encodeURIComponent(ref)}`);
    if (res.ok) {
      const data = await res.json();
      const dateEl = document.getElementById("detail-date");
      const typeEl = document.getElementById("detail-type");
      const statutEl = document.getElementById("detail-statut");

      if (dateEl && data.cree_le) {
        dateEl.textContent = new Date(data.cree_le).toLocaleString("fr-FR", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
        });
      }
      if (typeEl && typeof formatType === "function") {
        typeEl.textContent = formatType(data.type);
      }
      if (statutEl && typeof formatStatut === "function") {
        const st = formatStatut(data.statut);
        statutEl.textContent = st.label;
        statutEl.className = `px-2 py-0.5 rounded-full text-xs font-bold ${st.class}`;
      }
    }
  } catch (_) {}
})();
