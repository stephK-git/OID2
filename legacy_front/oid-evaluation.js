// OID Evaluation Terrain Logic
document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("enqueteur");
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const incidentId = params.get("incident_id");

  if (!incidentId) {
    showNotification("Identifiant d'incident manquant.", "error");
    setTimeout(() => { window.location.href = "/enqueteur.html"; }, 1500);
    return;
  }

  // Coherence validation
  function checkCoherence() {
    const affectees = parseInt(document.getElementById("input-affectees")?.value || 0, 10);
    const blesses = parseInt(document.getElementById("input-blesses")?.value || 0, 10);
    const deces = parseInt(document.getElementById("input-decedes")?.value || 0, 10);
    const disparus = parseInt(document.getElementById("input-disparus")?.value || 0, 10);

    const alertEl = document.getElementById("coherence-alert");
    const isCoherent = (blesses <= affectees && deces <= affectees && disparus <= affectees);

    if (alertEl) {
      if (!isCoherent) {
        alertEl.classList.remove("hidden");
        const msg = `Incohérence : Blessés (${blesses}), décédés (${deces}) et disparus (${disparus}) ne peuvent pas dépasser le total des personnes affectées (${affectees}).`;
        const p = alertEl.querySelector("p");
        if (p) p.textContent = msg;
      } else {
        alertEl.classList.add("hidden");
      }
    }
    return isCoherent;
  }

  // Hook input events for Sendai numbers
  ["input-menages", "input-affectees", "input-blesses", "input-deplaces", "input-decedes", "input-disparus"].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", checkCoherence);
    }
  });

  // Global stepCount wrapper to also trigger checkCoherence
  const origStepCount = window.stepCount;
  window.stepCount = function(inputId, delta) {
    if (origStepCount) origStepCount(inputId, delta);
    checkCoherence();
  };

  // Load Incident Details
  let incident = null;
  try {
    incident = await api(`/enquete/${incidentId}`);
    const refEl = document.getElementById("eval-ref-pub");
    const scoreEl = document.getElementById("eval-score-text");
    const titleEl = document.getElementById("eval-title");
    const locEl = document.getElementById("eval-location");

    if (refEl) refEl.textContent = incident.reference_publique;
    if (scoreEl) scoreEl.textContent = `Score : ${incident.score_priorite}`;
    if (titleEl) titleEl.textContent = `Dossier #${incident.id} · ${incident.type || "Inondation"}`;
    if (locEl && incident.coords) {
      locEl.textContent = `GPS : ${incident.coords.lat.toFixed(4)} N, ${incident.coords.lon.toFixed(4)} W`;
    }
  } catch (err) {
    showNotification("Erreur lors du chargement de l'incident: " + err.message, "error");
    return;
  }

  // Load Existing Evaluation
  let evaluation = null;
  try {
    evaluation = await api(`/enquete/${incidentId}/evaluation`);
    if (evaluation && evaluation.statut !== "aucune") {
      if (document.getElementById("input-menages")) document.getElementById("input-menages").value = evaluation.menages_touches || 0;
      if (document.getElementById("input-affectees")) document.getElementById("input-affectees").value = evaluation.personnes_affectees || 0;
      if (document.getElementById("input-blesses")) document.getElementById("input-blesses").value = evaluation.blesses || 0;
      if (document.getElementById("input-deplaces")) document.getElementById("input-deplaces").value = evaluation.deplaces || 0;
      if (document.getElementById("input-decedes")) document.getElementById("input-decedes").value = evaluation.deces || 0;
      if (document.getElementById("input-disparus")) document.getElementById("input-disparus").value = evaluation.disparus || 0;

      if (document.getElementById("text-degats") && evaluation.degats) document.getElementById("text-degats").value = evaluation.degats;
      if (document.getElementById("text-routes") && evaluation.routes_coupees) document.getElementById("text-routes").value = evaluation.routes_coupees;
      if (document.getElementById("text-sanitaire") && evaluation.risques_sanitaires) document.getElementById("text-sanitaire").value = evaluation.risques_sanitaires;
      if (document.getElementById("text-precision-besoins") && evaluation.besoins) document.getElementById("text-precision-besoins").value = evaluation.besoins;
      if (document.getElementById("text-recommandations") && evaluation.recommandations) document.getElementById("text-recommandations").value = evaluation.recommandations;

      checkCoherence();

      if (evaluation.statut === "soumise") {
        // Lock inputs
        document.querySelectorAll("input, textarea").forEach(el => el.setAttribute("disabled", "true"));
        document.querySelectorAll("button[onclick^='stepCount']").forEach(b => b.classList.add("hidden"));
        const btnDraft = document.getElementById("btn-save-draft");
        if (btnDraft) btnDraft.classList.add("hidden");
        const btnSubmit = document.getElementById("btn-submit-eval");
        if (btnSubmit) {
          btnSubmit.setAttribute("disabled", "true");
          btnSubmit.innerHTML = `<span class="material-symbols-outlined text-[18px] mr-1">verified</span>Évaluation déjà soumise`;
          btnSubmit.classList.add("opacity-60", "cursor-not-allowed");
        }
      }
    }
  } catch (err) {
    console.log("Aucune évaluation préalable:", err.message);
  }

  function getFormData() {
    return {
      menages_touches: parseInt(document.getElementById("input-menages")?.value || 0, 10),
      personnes_affectees: parseInt(document.getElementById("input-affectees")?.value || 0, 10),
      blesses: parseInt(document.getElementById("input-blesses")?.value || 0, 10),
      deplaces: parseInt(document.getElementById("input-deplaces")?.value || 0, 10),
      deces: parseInt(document.getElementById("input-decedes")?.value || 0, 10),
      disparus: parseInt(document.getElementById("input-disparus")?.value || 0, 10),
      degats: document.getElementById("text-degats")?.value?.trim() || null,
      routes_coupees: document.getElementById("text-routes")?.value?.trim() || null,
      risques_sanitaires: document.getElementById("text-sanitaire")?.value?.trim() || null,
      besoins: document.getElementById("text-precision-besoins")?.value?.trim() || null,
      recommandations: document.getElementById("text-recommandations")?.value?.trim() || null,
    };
  }

  // Save Draft
  const btnSaveDraft = document.getElementById("btn-save-draft");
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener("click", async () => {
      if (!checkCoherence()) {
        showNotification("Veuillez corriger les incohérences du bilan humain avant d'enregistrer.", "error");
        return;
      }
      try {
        const payload = getFormData();
        await api(`/enquete/${incidentId}/evaluation`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showNotification("Brouillon d'évaluation enregistré.", "success");
      } catch (err) {
        showNotification(err.message || "Erreur lors de la sauvegarde du brouillon.", "error");
      }
    });
  }

  // Submit Evaluation
  const btnSubmit = document.getElementById("btn-submit-eval");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      if (!checkCoherence()) {
        showNotification("Impossible de soumettre : le bilan humain comporte des incohérences.", "error");
        return;
      }

      const payload = getFormData();
      if (!payload.degats) {
        showNotification("Veuillez renseigner le constat sur les structures et biens (obligatoire).", "error");
        document.getElementById("text-degats")?.focus();
        return;
      }
      if (!payload.routes_coupees) {
        showNotification("Veuillez renseigner l'état des routes et de l'accessibilité (obligatoire).", "error");
        document.getElementById("text-routes")?.focus();
        return;
      }

      showConfirmModal("Confirmez-vous la transmission définitive de cette évaluation de terrain au poste de commandement ?", async () => {
        try {
          await api(`/enquete/${incidentId}/soumettre`, {
            method: "POST",
            body: JSON.stringify(payload)
          });
          showNotification("Évaluation transmise avec succès au poste de commandement !", "success");
          setTimeout(() => {
            window.location.href = "/enqueteur.html";
          }, 1500);
        } catch (err) {
          showNotification(err.message || "Erreur lors de la soumission de l'évaluation.", "error");
        }
      });
    });
  }
});
