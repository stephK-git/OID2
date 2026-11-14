"""Tests du flux public de signalement."""

from datetime import UTC, datetime, timedelta


def test_creer_signalement(client) -> None:
    payload = {
        "type": "rue",
        "lat": 5.35,
        "lon": -3.98,
        "hauteur_eau_cm": 40,
        "gravite": "moyenne",
        "danger_immediat": False,
        "description": "test",
    }
    r = client.post("/signalements", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["reference_suivi"]


def test_suivi_endpoints_supprimes(client) -> None:
    r_get = client.get("/signalements/INEXISTANT")
    assert r_get.status_code == 404

    r_agg = client.post("/signalements/INEXISTANT/aggraver")
    assert r_agg.status_code == 404


def test_carte_publique_anonymisee(client, db_session) -> None:
    """Vérifie que /signalements/carte-publique expose uniquement les incidents non clôturés sans données sensibles."""
    from app.models.incident import Incident
    from app.models.zone import Zone
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point

    zone = Zone(nom="Cocody")
    db_session.add(zone)
    db_session.flush()

    inc_crit = Incident(
        reference_publique="INC-PUB-CRIT-01",
        type="habitation",
        geom=from_shape(Point(-3.98, 5.36), srid=4326),
        zone_id=zone.id,
        statut="ouvert",
        niveau_fiabilite="confirme",
        score_priorite=85.0,
        danger_immediat=True,
    )
    inc_route = Incident(
        reference_publique="INC-PUB-ROUTE-02",
        type="route",
        geom=from_shape(Point(-4.01, 5.34), srid=4326),
        zone_id=zone.id,
        statut="affecte",
        niveau_fiabilite="declare",
        score_priorite=50.0,
        danger_immediat=False,
    )
    inc_cloture = Incident(
        reference_publique="INC-PUB-CLOSE-03",
        type="rue",
        geom=from_shape(Point(-4.02, 5.33), srid=4326),
        zone_id=zone.id,
        statut="cloture",
        niveau_fiabilite="verifie",
        score_priorite=20.0,
        danger_immediat=False,
    )
    db_session.add_all([inc_crit, inc_route, inc_cloture])
    db_session.commit()

    resp = client.get("/signalements/carte-publique")
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "FeatureCollection"
    assert data["counts"]["total"] == 2
    assert data["counts"]["critique"] == 1
    assert data["counts"]["route_coupee"] == 1
    assert data["counts"]["vigilance"] == 0
    assert len(data["features"]) == 2

    for feat in data["features"]:
        props = feat["properties"]
        assert "reference_publique" not in props
        assert "enqueteur_id" not in props
        assert props["commune"] == "Cocody"


def test_recents_incidents_anonymises(client, db_session) -> None:
    """Vérifie que /signalements/recents expose détails terrain + photos mais masque le bilan humain."""
    from app.models.evaluation import Evaluation
    from app.models.incident import Incident
    from app.models.photo import Photo
    from app.models.signalement import Signalement
    from app.models.utilisateur import Utilisateur
    from app.models.zone import Zone
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point

    zone_yop = Zone(nom="Yopougon")
    zone_coc = Zone(nom="Cocody")
    enqueteur = Utilisateur(
        nom="Enquêteur Public Test",
        email="enq-pub@test.local",
        mot_de_passe_hash="hash",
        role="enqueteur",
        actif=True,
    )
    db_session.add_all([zone_yop, zone_coc, enqueteur])
    db_session.flush()

    now = datetime.now(UTC)
    inc_old_yesterday = Incident(
        reference_publique="INC-PRIV-001",
        type="route",
        geom=from_shape(Point(-4.08, 5.34), srid=4326),
        zone_id=zone_coc.id,
        statut="ouvert",
        niveau_fiabilite="verifie",
        score_priorite=55.0,
        danger_immediat=False,
        cree_le=now - timedelta(days=1, hours=2),
    )
    inc_new = Incident(
        reference_publique="INC-PRIV-002",
        type="habitation",
        geom=from_shape(Point(-4.07, 5.35), srid=4326),
        zone_id=zone_yop.id,
        statut="affecte",
        niveau_fiabilite="confirme",
        score_priorite=88.0,
        danger_immediat=True,
        cree_le=now - timedelta(minutes=5),
    )
    inc_closed = Incident(
        reference_publique="INC-PRIV-003",
        type="rue",
        geom=from_shape(Point(-4.06, 5.33), srid=4326),
        zone_id=zone_yop.id,
        statut="cloture",
        niveau_fiabilite="confirme",
        score_priorite=30.0,
        danger_immediat=False,
        cree_le=now,
    )
    db_session.add_all([inc_old_yesterday, inc_new, inc_closed])
    db_session.flush()

    sig_linked = Signalement(
        incident_id=inc_new.id,
        type="habitation",
        geom=from_shape(Point(-4.07, 5.35), srid=4326),
        hauteur_eau_cm=90,
        gravite="critique",
        danger_immediat=True,
        statut="valide",
    )
    ev_linked = Evaluation(
        incident_id=inc_new.id,
        enqueteur_id=enqueteur.id,
        menages_touches=14,
        personnes_affectees=52,
        blesses=3,
        deces=1,
        disparus=0,
        degats="Murs fissurés et voirie dégradée",
        routes_coupees="Carrefour Sable bloqué",
        risques_sanitaires="Eau stagnante",
        statut="soumise",
        soumise_le=now,
    )
    db_session.add_all([sig_linked, ev_linked])
    db_session.flush()

    db_session.add_all(
        [
            Photo(signalement_id=sig_linked.id, url="/uploads/sig1.jpg"),
            Photo(evaluation_id=ev_linked.id, url="/uploads/eval1.jpg"),
        ]
    )
    db_session.commit()

    resp = client.get("/signalements/recents?limit=3")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2

    first = body["items"][0]
    assert first["type"] == "habitation"
    assert first["statut"] == "affecte"
    assert first["categorie"] == "critique"
    assert first["danger_immediat"] is True
    assert first["commune"] == "Yopougon"
    assert first["nb_signalements"] == 1
    assert first["hauteur_eau_max_cm"] == 90
    assert first["routes_coupees"] == "Carrefour Sable bloqué"
    assert first["degats"] == "Murs fissurés et voirie dégradée"
    assert first["photos"] == ["/uploads/sig1.jpg", "/uploads/eval1.jpg"]

    for forbidden in (
        "reference_publique",
        "enqueteur_id",
        "blesses",
        "deces",
        "disparus",
        "menages_touches",
        "personnes_affectees",
        "deplaces",
    ):
        assert forbidden not in first

    resp_communes = client.get("/signalements/communes-actives")
    assert resp_communes.status_code == 200
    communes = {c["nom"]: c for c in resp_communes.json()["communes"]}
    assert communes["Yopougon"]["incidents_jour"] == 1
    assert communes["Cocody"]["incidents_jour"] == 0

    resp_yop_today = client.get(
        f"/signalements/recents?zone_id={zone_yop.id}&today_only=true&limit=20"
    )
    assert resp_yop_today.status_code == 200
    yop_data = resp_yop_today.json()
    assert yop_data["total"] == 1
    assert yop_data["items"][0]["id"] == inc_new.id






def _png_data_url(n: int = 0) -> str:
    import base64

    raw = b"\x89PNG\r\n\x1a\n" + bytes([n]) * 16
    return "data:image/png;base64," + base64.b64encode(raw).decode()


def test_creer_signalement_avec_trois_photos(client, db_session, tmp_path, monkeypatch) -> None:
    from app.models.photo import Photo
    from app.routers import public

    monkeypatch.setattr(public, "PHOTO_UPLOAD_DIR", tmp_path)
    payload = {
        "type": "rue",
        "lat": 5.35,
        "lon": -3.98,
        "photos_data_urls": [_png_data_url(i) for i in range(3)],
    }
    r = client.post("/signalements", json=payload)
    assert r.status_code == 201
    assert db_session.query(Photo).count() == 3
    assert len(list(tmp_path.iterdir())) == 3


def test_creer_signalement_refuse_quatre_photos(client) -> None:
    payload = {
        "type": "rue",
        "lat": 5.35,
        "lon": -3.98,
        "photos_data_urls": [_png_data_url(i) for i in range(4)],
    }
    r = client.post("/signalements", json=payload)
    assert r.status_code == 422
