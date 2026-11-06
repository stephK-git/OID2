"""Fixtures pytest partagées pour tous les tests O.I.D."""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Utiliser une DB de test si définie, sinon SQLite en mémoire
TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "sqlite:///:memory:",
)

IS_SQLITE = TEST_DB_URL.startswith("sqlite")


@pytest.fixture(scope="session")
def engine():
    """Crée le moteur SQLAlchemy pour les tests."""
    kwargs = {}
    if IS_SQLITE:
        kwargs["connect_args"] = {"check_same_thread": False}
    eng = create_engine(TEST_DB_URL, **kwargs)

    # Activer les FK sur SQLite
    # Activer les FK et fonctions spatiales factices sur SQLite
    if IS_SQLITE:
        @event.listens_for(eng, "connect")
        def set_sqlite_spatial(dbapi_conn, _):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
            for fn_name in [
                "RecoverGeometryColumn",
                "DiscardGeometryColumn",
                "InitSpatialMetaData",
                "CreateSpatialIndex",
                "DisableSpatialIndex",
            ]:
                dbapi_conn.create_function(fn_name, -1, lambda *a: 1)

            # Mocks spatiaux GeoAlchemy2 sur SQLite (conversion WKT/EWKT <-> WKB via Shapely)
            def _sqlite_geom_from_text(*args):
                if not args or args[0] is None:
                    return None
                raw = str(args[0])
                if ";" in raw and raw.upper().startswith("SRID="):
                    raw = raw.split(";", 1)[1]
                try:
                    from shapely import wkb as sh_wkb  # noqa: PLC0415
                    from shapely import wkt as sh_wkt

                    g = sh_wkt.loads(raw)
                    return sh_wkb.dumps(g, hex=True)
                except Exception:
                    return None

            def _sqlite_as_ewkb(val):
                if val is None:
                    return None
                if isinstance(val, (bytes, bytearray)):
                    return bytes(val)
                if isinstance(val, str):
                    try:
                        return bytes.fromhex(val)
                    except ValueError:
                        return None
                return None

            dbapi_conn.create_function("AsEWKB", -1, _sqlite_as_ewkb)
            dbapi_conn.create_function("ST_AsEWKB", -1, _sqlite_as_ewkb)
            dbapi_conn.create_function("GeomFromEWKT", -1, _sqlite_geom_from_text)
            dbapi_conn.create_function("ST_GeomFromEWKT", -1, _sqlite_geom_from_text)
            dbapi_conn.create_function("GeomFromText", -1, _sqlite_geom_from_text)
            dbapi_conn.create_function("ST_GeomFromText", -1, _sqlite_geom_from_text)
            dbapi_conn.create_function("ST_DWithin", -1, lambda *a: 0)
            dbapi_conn.create_function("ST_Point", -1, lambda *a: None)
            dbapi_conn.create_function("ST_Intersects", -1, lambda *a: 0)


    import app.models  # noqa: F401, PLC0415
    from app.db.base import Base  # noqa: PLC0415

    Base.metadata.create_all(bind=eng)


    yield eng

    if not IS_SQLITE:
        Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture(scope="function")
def db_session(engine):
    """Session DB isolée par test (rollback après chaque test)."""
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()



@pytest.fixture(scope="function")
def client(db_session):
    """TestClient FastAPI avec override de la dépendance DB."""
    from app.db.session import get_db  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def utilisateur_verificateur(db_session):
    """Crée un utilisateur verificateur pour les tests."""
    from app.core.security import hash_password  # noqa: PLC0415
    from app.models.utilisateur import Utilisateur  # noqa: PLC0415

    u = Utilisateur(
        nom="Vérificateur Test",
        email="verificateur@test.local",
        mot_de_passe_hash=hash_password("test1234"),
        role="verificateur",
        actif=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def utilisateur_enqueteur(db_session):
    """Crée un utilisateur enqueteur pour les tests."""
    from app.core.security import hash_password  # noqa: PLC0415
    from app.models.utilisateur import Utilisateur  # noqa: PLC0415

    u = Utilisateur(
        nom="Enquêteur Test",
        email="enqueteur@test.local",
        mot_de_passe_hash=hash_password("test1234"),
        role="enqueteur",
        actif=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def utilisateur_coordinateur(db_session):
    """Crée un utilisateur coordinateur pour les tests."""
    from app.core.security import hash_password  # noqa: PLC0415
    from app.models.utilisateur import Utilisateur  # noqa: PLC0415

    u = Utilisateur(
        nom="Coordinateur Test",
        email="coordinateur@test.local",
        mot_de_passe_hash=hash_password("test1234"),
        role="coordinateur",
        actif=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def make_token(user_id: int, role: str) -> str:
    """Génère un token JWT de test."""
    from app.core.security import create_access_token  # noqa: PLC0415
    return create_access_token(str(user_id), role)


@pytest.fixture
def auth_verificateur(utilisateur_verificateur):
    return {"Authorization": f"Bearer {make_token(utilisateur_verificateur.id, 'verificateur')}"}


@pytest.fixture
def auth_enqueteur(utilisateur_enqueteur):
    return {"Authorization": f"Bearer {make_token(utilisateur_enqueteur.id, 'enqueteur')}"}


@pytest.fixture
def auth_coordinateur(utilisateur_coordinateur):
    return {"Authorization": f"Bearer {make_token(utilisateur_coordinateur.id, 'coordinateur')}"}
