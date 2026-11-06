"""Décodage et stockage local des photos de signalement (démonstration).

Les photos sont conservées hors base de données : la table `photo` ne stocke
que l'URL publique du fichier. En production, remplacer ce stockage local par
un stockage objet (Supabase Storage ou Cloudflare R2).
"""

import base64
import binascii
import re
import uuid
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
