"""Décodage et stockage local des photos de signalement (démonstration).

Les photos sont conservées hors base de données : la table `photo` ne stocke
que l'URL publique du fichier. En production, remplacer ce stockage local par
un stockage objet (Supabase Storage ou Cloudflare R2).
"""

import base64
import binascii
import hashlib
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

PHOTO_MAX_BYTES = 10 * 1024 * 1024
_EXTENSIONS = {"jpeg": "jpg", "png": "png", "webp": "webp"}
_DATA_URL_RE = re.compile(r"^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$")


class PhotoError(ValueError):
    """Photo refusée : format, encodage ou taille invalide."""


def decode_photo_data_url(data_url: str) -> tuple[bytes, str]:
    """Valide une data URL et renvoie (contenu binaire, extension du fichier)."""
    match = _DATA_URL_RE.match(data_url.strip())
    if match is None:
        raise PhotoError("Format de photo non pris en charge (JPEG, PNG ou WEBP attendu).")

    mime, payload = match.groups()
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise PhotoError("Photo illisible : encodage base64 invalide.") from exc

    if not raw:
        raise PhotoError("La photo est vide.")
    if len(raw) > PHOTO_MAX_BYTES:
        raise PhotoError("La photo dépasse la limite de 10 Mo.")
    if not _signature_matches(mime, raw):
        raise PhotoError("Le contenu de la photo ne correspond pas au format annoncé.")

    return raw, _EXTENSIONS[mime]


def save_photo_data_url(data_url: str, upload_dir: Path) -> str:
    """Enregistre la photo et renvoie son URL publique (chemin relatif)."""
    raw, extension = decode_photo_data_url(data_url)
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{extension}"
    (upload_dir / filename).write_bytes(raw)
    return f"/uploads/{filename}"


def _signature_matches(mime: str, raw: bytes) -> bool:
    if mime == "jpeg":
        return raw.startswith(b"\xff\xd8\xff")
    if mime == "png":
        return raw.startswith(b"\x89PNG\r\n\x1a\n")
    if mime == "webp":
        return raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    return False


def _format_bytes(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    if size >= 1024:
        return f"{max(1, round(size / 1024))} KB"
    return f"{size} B"


def _detect_exif_and_gps(raw: bytes) -> tuple[bool, bool]:
    """Détecte la présence d'un segment EXIF APP1 et du tag GPSInfo (0x8825) dans un binaire image."""
    has_exif = b"Exif\x00\x00" in raw
    if not has_exif:
        return False, False
    # Recherche du tag TIFF GPSInfo (0x8825 en big-endian ou little-endian dans le bloc EXIF)
    idx = raw.find(b"Exif\x00\x00")
    exif_slice = raw[idx : idx + 65536]
    has_gps = (b"\x88\x25" in exif_slice) or (b"\x25\x88" in exif_slice)
    return True, has_gps


def inspect_photo_metadata(photo_url: str, upload_dir: Path) -> dict:
    """Extrait les métadonnées réelles (taille, format, SHA-256, présence EXIF/GPS) d'une photo stockée."""
    filename = photo_url.rsplit("/", 1)[-1] if "/" in photo_url else photo_url
    ext = filename.rsplit(".", 1)[-1].upper() if "." in filename else "JPG"
    file_path = upload_dir / filename

    if not file_path.is_file():
        digest_fallback = hashlib.sha256(photo_url.encode("utf-8")).hexdigest()
        return {
            "url": photo_url,
            "filename": filename,
            "format": ext,
            "taille_octets": None,
            "taille_formatee": "DISTANT",
            "exif_present": False,
            "exif_gps": False,
            "sha256": digest_fallback,
            "sha256_short": digest_fallback[:8].upper(),
            "horodatage_utc": None,
        }

    try:
        raw = file_path.read_bytes()
        size = len(raw)
        exif_present, exif_gps = _detect_exif_and_gps(raw)
        digest = hashlib.sha256(raw).hexdigest()
        mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=UTC).strftime("%H:%M:%S UTC")
        return {
            "url": photo_url,
            "filename": filename,
            "format": ext,
            "taille_octets": size,
            "taille_formatee": _format_bytes(size),
            "exif_present": exif_present,
            "exif_gps": exif_gps,
            "sha256": digest,
            "sha256_short": digest[:8].upper(),
            "horodatage_utc": mtime,
        }
    except Exception:
        return {
            "url": photo_url,
            "filename": filename,
            "format": ext,
            "taille_octets": None,
            "taille_formatee": "N/D",
            "exif_present": False,
            "exif_gps": False,
            "sha256": None,
            "sha256_short": None,
            "horodatage_utc": None,
        }

