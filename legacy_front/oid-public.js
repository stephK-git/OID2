(() => {
  const $ = (id) => document.getElementById(id);
  const lat = $("report-lat");
  const lon = $("report-lon");
  const feedback = $("report-feedback");
  const submit = $("submit-report-btn");
  const gps = $("use-gps-btn");
  const photoInput = $("photo-input");
  const photoPick = $("photo-pick-btn");
  const photoPreview = $("photo-preview");
  const photoPreviewImg = $("photo-preview-img");
  const photoName = $("photo-name");
  const photoStatus = $("photo-status");
  const photoRemove = $("photo-remove-btn");
  const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
  let waterHeight = 35;
  let severity = "moyenne";
  let photoDataUrl = null;
  let map = null;
  let marker = null;

  function setPoint(latitude, longitude, zoom = 16) {
    lat.value = Number(latitude).toFixed(6);
    lon.value = Number(longitude).toFixed(6);
    if (map && window.L) {
      const point = [Number(latitude), Number(longitude)];
      if (!marker) marker = L.marker(point, { draggable: true }).addTo(map);
      else marker.setLatLng(point);
      map.setView(point, zoom);
    }
  }

  function initMap() {
    if (!window.L || !$("oid-report-map")) return;
    const initial = [5.35, -3.98];
    map = L.map("oid-report-map").setView(initial, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    marker = L.marker(initial, { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      lat.value = p.lat.toFixed(6); lon.value = p.lng.toFixed(6);
    });
    map.on("click", (event) => setPoint(event.latlng.lat, event.latlng.lng));
    // La carte est centrée sur Abidjan, mais l'utilisateur doit choisir le point ou utiliser le GPS.
    lat.value = "";
    lon.value = "";
  }
  window.addEventListener("load", initMap);

  function message(text, ok = false) {
    feedback.textContent = text;
    feedback.classList.remove("hidden", "bg-red-50", "text-red-800", "bg-green-50", "text-green-800");
    feedback.classList.add(ok ? "bg-green-50" : "bg-red-50", ok ? "text-green-800" : "text-red-800");
  }

  document.querySelectorAll("#water-level-grid .water-opt").forEach((button) => {
    button.addEventListener("click", () => { waterHeight = Number(button.dataset.height || 0); });
  });
  document.querySelectorAll(".severity-btn").forEach((button) => {
    button.addEventListener("click", () => { severity = button.dataset.severity || "moyenne"; });
  });

  function clearPhoto() {
    photoDataUrl = null;
    if (photoInput) photoInput.value = "";
    if (photoPreviewImg) photoPreviewImg.removeAttribute("src");
    if (photoPreview) photoPreview.classList.add("hidden");
    if (photoStatus) photoStatus.textContent = "Aucune photo";
    if (photoName) photoName.textContent = "";
  }

  if (photoPick && photoInput) {
    photoPick.addEventListener("click", () => photoInput.click());
  }

  if (photoInput) photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return clearPhoto();
    if (!PHOTO_TYPES.includes(file.type)) {
      photoInput.value = "";
      return message("Format photo non pris en charge (JPG, PNG ou WEBP).");
    }
    if (file.size > PHOTO_MAX_BYTES) {
      photoInput.value = "";
      return message("La photo dépasse la limite de 10 Mo.");
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoDataUrl = String(reader.result || "");
      if (photoPreviewImg) photoPreviewImg.src = photoDataUrl;
      if (photoName) photoName.textContent = file.name;
      if (photoPreview) photoPreview.classList.remove("hidden");
      if (photoStatus) photoStatus.textContent = "1 photo jointe";
    };
    reader.onerror = () => {
      clearPhoto();
      message("Impossible de lire cette photo. Réessaie avec un autre fichier.");
    };
    reader.readAsDataURL(file);
  });

  if (photoRemove) photoRemove.addEventListener("click", clearPhoto);

  if (gps) gps.addEventListener("click", () => {
    if (!navigator.geolocation) return message("La géolocalisation n'est pas disponible sur cet appareil.");
    gps.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPoint(position.coords.latitude, position.coords.longitude, 17);
        gps.disabled = false;
        message("Position GPS récupérée.", true);
      },
      () => {
        gps.disabled = false;
        message("Position indisponible. Autorise la géolocalisation ou saisis les coordonnées manuellement.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });

  if (submit) submit.addEventListener("click", async () => {
    const latitude = Number(lat.value);
    const longitude = Number(lon.value);
    if (!lat.value || !lon.value || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return message("Récupère ta position GPS ou saisis les coordonnées avant l'envoi.");
    }
    const type = $("report-type").value;
    const danger = $("emergency-toggle").getAttribute("aria-checked") === "true";
    const payload = {
      type,
      lat: latitude,
      lon: longitude,
      hauteur_eau_cm: waterHeight,
      gravite: severity,
      danger_immediat: danger,
      description: $("desc-textarea").value.trim() || null
    };
    if (danger) payload.danger_type = $("danger-type-select").value;
    if (photoDataUrl) payload.photo_data_url = photoDataUrl;
    submit.disabled = true;
    const original = submit.innerHTML;
    submit.textContent = "Envoi en cours…";
    try {
      const response = await fetch("/signalements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Le signalement n'a pas pu être envoyé.");
      window.location.href = `/confirmation.html?ref=${encodeURIComponent(data.reference_suivi)}`;
    } catch (error) {
      message(error.message || "Erreur de connexion. Réessaie.");
      submit.disabled = false;
      submit.innerHTML = original;
    }
  });
})();
