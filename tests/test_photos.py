"""Tests du décodage et du stockage local des photos."""

import base64

import pytest
from app.services.photos import PhotoError, decode_photo_data_url, save_photo_data_url

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 16
PNG_DATA_URL = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode()


def test_decode_png_data_url() -> None:
    raw, extension = decode_photo_data_url(PNG_DATA_URL)
    assert extension == "png"
    assert raw == PNG_BYTES


def test_decode_rejects_non_image_data_url() -> None:
    with pytest.raises(PhotoError):
        decode_photo_data_url("data:image/gif;base64," + base64.b64encode(b"GIF89a").decode())


def test_decode_rejects_mismatched_signature() -> None:
    with pytest.raises(PhotoError):
        decode_photo_data_url("data:image/jpeg;base64," + base64.b64encode(PNG_BYTES).decode())


def test_save_photo_data_url(tmp_path) -> None:
    url = save_photo_data_url(PNG_DATA_URL, tmp_path)
    assert url.startswith("/uploads/") and url.endswith(".png")
    assert (tmp_path / url.rsplit("/", 1)[1]).read_bytes() == PNG_BYTES


def test_save_photo_supabase_storage(tmp_path, monkeypatch) -> None:
    from app.core.config import settings

    captured: dict[str, object] = {}

    class _FakeResp:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=0):
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        captured["data"] = req.data
        captured["headers"] = dict(req.header_items())
        return _FakeResp()

    monkeypatch.setattr(settings, "supabase_url", "https://demo.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "secret-key")
    monkeypatch.setattr(settings, "supabase_storage_bucket", "oid-photos")
    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen)

    url = save_photo_data_url(PNG_DATA_URL, tmp_path)
    assert url.startswith("https://demo.supabase.co/storage/v1/object/public/oid-photos/")
    assert url.endswith(".png")
    assert captured["method"] == "POST"
    assert captured["data"] == PNG_BYTES
