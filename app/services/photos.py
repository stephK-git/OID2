"""Décodage et stockage des photos de signalement (local en dev, Supabase Storage en prod)."""

import base64
import binascii
import hashlib
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("oid.photos")

PHOTO_MAX_BYTES = 10 * 1024 * 1024
_EXTENSIONS = {"jpeg": "jpg", "png": "png", "webp": "webp"}
_MIME_BY_EXT = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
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


def _upload_to_supabase_storage(raw: bytes, extension: str, filename: str) -> str:
    """Envoie le binaire vers Supabase Storage et retourne l'URL publique permanente."""
    base_url = settings.supabase_url.strip().rstrip("/")
    bucket = urllib.parse.quote(settings.supabase_storage_bucket.strip(), safe="")
    key = settings.supabase_service_role_key.strip()
    object_name = urllib.parse.quote(filename, safe="")
    upload_endpoint = f"{base_url}/storage/v1/object/{bucket}/{object_name}"
    content_type = _MIME_BY_EXT.get(extension, "application/octet-stream")

    req = urllib.request.Request(
        upload_endpoint,
        data=raw,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status >= 400:
                raise PhotoError(f"Échec d'envoi vers Supabase Storage (HTTP {resp.status}).")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        logger.error("Supabase Storage HTTP %s: %s", exc.code, body)
        raise PhotoError(f"Erreur Supabase Storage ({exc.code}) : vérifiez que le bucket '{settings.supabase_storage_bucket}' existe et est public.") from exc
    except urllib.error.URLError as exc:
        logger.error("Supabase Storage unreachable: %s", exc.reason)
        raise PhotoError("Impossible de joindre Supabase Storage pour enregistrer la photo.") from exc

    return f"{base_url}/storage/v1/object/public/{bucket}/{object_name}"


def delete_stored_photo(photo_url: str, upload_dir: Path) -> None:
    """Supprime une photo sur Supabase Storage ou en local (best-effort)."""
    if not photo_url:
        return
    if photo_url.startswith("/uploads/"):
        filename = photo_url.rsplit("/", 1)[-1]
        target = upload_dir / filename
        if target.is_file():
            target.unlink(missing_ok=True)
        return

    if not settings.supabase_storage_enabled:
        return

    base_url = settings.supabase_url.strip().rstrip("/")
    bucket = settings.supabase_storage_bucket.strip()
    prefix = f"{base_url}/storage/v1/object/public/{urllib.parse.quote(bucket, safe='')}/"
    if not photo_url.startswith(prefix):
        return

    object_name = photo_url[len(prefix) :]
    key = settings.supabase_service_role_key.strip()
    delete_endpoint = f"{base_url}/storage/v1/object/{urllib.parse.quote(bucket, safe='')}/{object_name}"
    req = urllib.request.Request(
        delete_endpoint,
        method="DELETE",
        headers={"Authorization": f"Bearer {key}", "apikey": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as exc:
        logger.warning("Suppression distante Supabase Storage ignorée (%s): %s", photo_url, exc)


def save_photo_data_url(data_url: str, upload_dir: Path) -> str:
    """Enregistre la photo (Supabase Storage si configuré, sinon disque local) et renvoie son URL."""
    raw, extension = decode_photo_data_url(data_url)
    filename = f"{uuid.uuid4().hex}.{extension}"

    if settings.supabase_storage_enabled:
        return _upload_to_supabase_storage(raw, extension, filename)

    upload_dir.mkdir(parents=True, exist_ok=True)
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

