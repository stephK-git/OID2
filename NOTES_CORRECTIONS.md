# O.I.D — Notes de correction

Cette archive est une première passe de correction sur le projet fourni, sans refonte de l'interface.

## Corrections appliquées
- Alembic utilise maintenant `DATABASE_URL` de `.env`/de l'environnement, comme l'application. Auparavant, l'URL codée dans `alembic.ini` pouvait envoyer les migrations vers la mauvaise base.
- Les identifiants des boutons de démonstration de la page de connexion correspondent aux comptes créés par `scripts/seed_demo.py`.
- Le message « identifiants incorrects » est masqué au chargement et doit apparaître après un échec de connexion.
- Le modèle SQLAlchemy `Utilisateur.zone_id` déclare la même clé étrangère que la migration.
- La fusion manuelle d'un signalement comme doublon est refusée si l'incident cible ne satisfait pas les règles de suggestion (type, rayon de 50 m, délai de 24 h et statut actif).
- Page de signalement : les sélections hauteur d'eau / gravité, le type de danger et la photo sont reliés à `POST /signalements`. L'API accepte le type `route` et le champ `danger_type` (migration `a1b2c3d4e5f6`), et le score de priorité applique le bonus « personnes piégées / danger électrique » prévu au cahier des charges.
- Page de confirmation : les liens « Suivre mon signalement » et « Nouveau signalement » pointent désormais vers la page de suivi avec la référence et vers le formulaire.

## Démarrage local
1. Installer Docker Desktop et démarrer Docker.
2. Dans le dossier du projet : `docker compose up -d`.
3. Créer un environnement Python : `python -m venv .venv`.
4. L'activer sous Windows : `.venv\\Scripts\\activate`.
5. Installer : `pip install -r requirements.txt -r requirements-dev.txt`.
6. Copier `.env.example` vers `.env` et vérifier `DATABASE_URL` et `JWT_SECRET`.
7. Appliquer les migrations : `alembic upgrade head`.
8. Créer les comptes démo : `python -m scripts.seed_demo`.
9. Lancer : `uvicorn app.main:app --reload`.
10. Ouvrir `http://127.0.0.1:8000`.

Comptes de démonstration : `coordinateur@oid.demo`, `enqueteur@oid.demo`, `verificateur@oid.demo` ; mot de passe `demo1234`.

## Limites de vérification
La compilation Python a réussi. Les tests pytest et le démarrage réel n'ont pas pu être exécutés ici : l'environnement de contrôle ne dispose pas des dépendances Python du projet et ne peut pas les télécharger, et aucune base PostgreSQL/PostGIS de test n'est connectée. Il faut donc encore valider les migrations et le parcours complet sur ta machine avec Docker/PostGIS.

## Fonctionnalités restant à finaliser par rapport au cahier des charges
- Stockage objet des photos : le parcours d'upload est raccordé (JPEG/PNG/WEBP, 10 Mo) mais les fichiers sont écrits dans `app/static/uploads`, un stockage local de démonstration non persistant sur Render. À basculer vers Supabase Storage ou Cloudflare R2 en production.
- Corroboration indépendante des témoins et mise à jour automatique du niveau de fiabilité.
- Filtrage cartographique et affichage de toutes les couches attendues.
- Vérification complète de l'interface sur téléphone et sur connexion lente.
- Tests d'intégration avec une vraie base PostGIS.
