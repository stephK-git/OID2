# O.I.D — Guide d'élaboration et cahier des charges

*Observatoire Inondations & Dommages · Version 1.0 opérationnelle · novembre 2026*

O.I.D transforme les signalements de la population en bilan fiable et en décisions opérationnelles : localisation précise du sinistre, dénombrement rigoureux des personnes touchées, priorisation des secours et allocation ciblée des moyens d'intervention.

Ce document comprend trois parties :
- **Partie 1** : Cahier des charges fonctionnel et technique (spécifications du système).
- **Partie 2** : Guide d'ingénierie et méthodologie de déploiement.
- **Partie 3** : Annexes techniques et glossaire métier.

---

## Partie 1 — Cahier des charges

### 1. Présentation du projet

**Nom :** O.I.D (Observatoire Inondations & Dommages)

**Nature :** Plateforme applicative web et mobile (PWA) de signalement citoyen, de vérification d'urgence, d'évaluation des dommages sur le terrain et de pilotage cartographique de crise.

**Objectif principal :** Fournir aux services de secours, aux municipalités et aux cellules de crise un système d'information géographique (SIG) et décisionnel en temps réel pour coordonner la réponse face aux inondations urbaines et périurbaines.

**Périmètre géographique :** Déploiement initial sur l'agglomération d'Abidjan, découpée en zones opérationnelles d'intervention (Cocody, Yopougon, Attécoubé, Plateau, Koumassi, Port-Bouët, etc.), extensible à l'échelle nationale.

**Articulation opérationnelle :** O.I.D centralise les alertes citoyennes, élimine les doublons, objective la gravité sur le terrain via des enquêtes standardisées et produit les synthèses décisionnelles pour le commandement.

---

### 2. Objectifs opérationnels et mesurables

- **Accessibilité universelle :** Application citoyenne accessible immédiatement sans installation obligatoire, utilisable sur tout smartphone même avec une connectivité réseau dégradée.
- **Cycle complet d'intervention :** Traitement fluide de bout en bout : signalement citoyen → qualification / triage → affectation d'enquêteurs → évaluation d'impact sur le terrain → cartographie décisionnelle → génération automatique des rapports de situation (SITREP).
- **Intégrité de la donnée :** Consolidation des bilans humains et matériels par incident unique pour éliminer tout risque de double comptage.
- **Traçabilité totale :** Journalisation d'audit de chaque changement d'état (qui, quand, ancien statut, nouveau statut, motif).
- **Performance :** Prise en compte et enregistrement d'un signalement citoyen en moins de 3 secondes.

---

### 3. Périmètre fonctionnel

#### 3.1 Inclus dans la version opérationnelle (Socle Coeur)

- **Portail public citoyen :** Signalement géolocalisé sans création de compte préalable, attribution d'une référence sécurisée unique de suivi, téléversement de photographies géoréférencées, consultation en direct du statut de traitement et déclaration d'aggravation urgente.
- **Module de Triage et Vérification :** File d'attente priorisée par algorithme de criticité et respect des SLA d'urgence, validation, rejet motivé, détection géospatiale de doublons et fusion assistée.
- **Module d'Enquête de Terrain :** Espace dédié pour les agents déployés, consultation des dossiers attribués, formulaire d'évaluation des impacts humains et matériels avec contrôles de cohérence stricts, mode brouillon et soumission définitive.
- **Tableau de Bord de Coordination :** Supervision cartographique interactive multi-niveaux (Leaflet / PostGIS), indicateurs d'impacts consolidés (victimes, déplacés, sinistrés), gestion des affectations, clôture / réouverture motivée, et gestion centralisée des comptes agents.
- **Génération de Rapports et Exports :** Édition automatisée de synthèses de situation normalisées (SITREP en PDF officiel) et exports de données ouvertes (GeoJSON pour SIG, CSV tabulaire).
- **Sécurité et Habilitations :** Authentification sécurisée JWT, contrôle d'accès strict par rôle (RBAC), hachage cryptographique des mots de passe, limitation de débit anti-déni de service.

#### 3.2 Évolutions planifiées (Feuille de route Phase 2 & 3)

- Suivi logistique et gestion d'inventaire des ressources d'intervention (motopompes, canots, vivres).
- Passerelle d'alerte SMS / WhatsApp pour les notifications de masse aux populations sinistrées.
- Intégration de capteurs limnimétriques IoT et d'imagerie radar satellitaire pour la détection précoce des crues.
- Module d'analyse spatiale prédictive et identification des zones vulnérables récurrentes.

---

### 4. Acteurs et habilitations

| Acteur | Compte requis | Rôle et responsabilités |
| :--- | :--- | :--- |
| **Citoyen / Témoin** | Non | Signale une inondation constatée, suit le traitement de son alerte via sa référence de suivi, signale les aggravations urgentes. |
| **Vérificateur** | Oui | Assure la permanence opérationnelle : qualifie la véracité des signalements, rejette les fausses alertes, détecte et fusionne les signalements multiples relatifs à un même sinistre. |
| **Enquêteur de terrain** | Oui | Déployé sur site pour évaluer précisément les dommages matériels, le nombre de sinistrés, les besoins immédiats et dresser le constat de situation. |
| **Coordinateur de crise** | Oui | Supervise la cartographie générale, priorise et affecte les dossiers aux équipes d'enquête, valide les bilans, clôture les incidents résolus, génère les SITREP et administre les accès. |

---

### 5. Exigences fonctionnelles détaillées

Priorité : **M** = Exigence Mandataire (Indispensable), **S** = Souhaitable.

#### 5.1 Espace Public et Signalement Citoyen

| ID | Exigence | Priorité |
| :--- | :--- | :--- |
| **F-01** | Saisie d'alerte simplifiée : géolocalisation GPS automatique ou sélection sur carte, type d'inondation, hauteur d'eau constatée, niveau de gravité, danger immédiat et cliché photographique. | **M** |
| **F-02** | Génération d'une référence de suivi unique, robuste et non devinable (code alphanumérique). | **M** |
| **F-03** | Interface de suivi d'avancement consultable par le citoyen au moyen de sa référence. | **M** |
| **F-04** | Présence d'un bandeau réglementaire de rappel des numéros de secours d'urgence vitale (180 / 112). | **M** |
| **F-05** | Possibilité pour le témoin de notifier en temps réel une aggravation soudaine du danger (« l'eau monte », menace vitale). | **M** |

#### 5.2 Espace Triage et Vérification

| ID | Exigence | Priorité |
| :--- | :--- | :--- |
| **F-10** | File d'attente dynamique classée en temps réel selon le score de priorité et les dépassements de SLA. | **M** |
| **F-11** | Action de validation (création d'un incident opérationnel) ou de rejet avec saisie obligatoire du motif de rejet. | **M** |
| **F-12** | Détection automatique des doublons par calcul spatial de proximité (< 50 m) et temporel (< 24 h), avec validation manuelle de fusion. | **M** |
| **F-13** | Qualification graduelle du niveau de fiabilité de l'information : *déclaré* → *corroboré* → *vérifié*. | **M** |

#### 5.3 Espace Enquête et Évaluation Terrain

| ID | Exigence | Priorité |
| :--- | :--- | :--- |
| **F-20** | Visualisation par l'enquêteur des dossiers d'intervention qui lui sont formellement attribués avec repères cartographiques. | **M** |
| **F-21** | Fiche d'évaluation standardisée : ménages touchés, personnes affectées, blessés, déplacés, décès, disparus, voiries coupées, risques sanitaires, besoins urgents, recommandations. | **M** |
| **F-22** | Sauvegarde intermédiaire en mode brouillon avant soumission finale validée. | **M** |
| **F-23** | Contrôles d'intégrité et de cohérence logique (ex. : nombre de blessés, disparus ou décès ne pouvant excéder le total des personnes affectées). | **M** |
| **F-24** | Adjonction de photographies justificatives au dossier d'évaluation de terrain. | **S** |

#### 5.4 Espace Coordination et Commandement

| ID | Exigence | Priorité |
| :--- | :--- | :--- |
| **F-30** | Carte de situation interactive de l'ensemble des incidents géoréférencés avec sémiologie graphique par criticité et statut. | **M** |
| **F-31** | Module d'affectation nominative des dossiers aux enquêteurs avec monitoring de la charge opérationnelle de chacun. | **M** |
| **F-32** | Tableau de bord décisionnel : ventilation des sinistres par zone, suivi des retards SLA critiques/standards, indicateurs humains consolidés. | **M** |
| **F-33** | Clôture formelle des incidents et réouverture exceptionnelle avec saisie obligatoire d'un motif motivé. | **M** |
| **F-34** | Génération et téléchargement à la demande du rapport de situation officiel (SITREP) au format PDF institutionnel. | **M** |
| **F-35** | Exportations des données cartographiques (GeoJSON) et tabulaires (CSV) pour interopérabilité SIG externe. | **M** |
| **F-36** | Administration des utilisateurs : création de comptes, attribution de zones, réinitialisation de mot de passe et activation/désactivation. | **M** |

#### 5.5 Exigences Transversales et Sécurité

| ID | Exigence | Priorité |
| :--- | :--- | :--- |
| **F-40** | Sécurité des échanges via protocole chiffré, tokens JWT signés et contrôle granulaire des droits. | **M** |
| **F-41** | Journal d'audit immuable consignant chaque transition d'état et action critique. | **M** |
| **F-42** | Protection périmétrique contre le déni de service et limitation de débit (rate-limiting) sur les endpoints publics. | **M** |

---

### 6. Règles métier et gouvernance de la donnée

#### 6.1 Cycle de vie des objets

- **Signalement :** Déclaration initiale non qualifiée émise par un citoyen.
  - États : `reçu → validé | rejeté | doublon`
- **Incident :** Réalité opérationnelle constatée regroupant un ou plusieurs signalements.
  - États : `ouvert → affecté → évalué → clôturé` (avec possibilité de passage à l'état `rouvert`).

#### 6.2 Matrice des transitions d'état

| Objet | Transition | Acteur autorisé | Condition de déclenchement |
| :--- | :--- | :--- | :--- |
| Signalement | `reçu → validé` | Vérificateur | Localisation valide et cohérence constatée (crée un incident). |
| Signalement | `reçu → rejeté` | Vérificateur | Motif explicite obligatoire (spam, hors périmètre, incohérent). |
| Signalement | `reçu → doublon` | Vérificateur | Rattachement validé à un incident existant à proximité. |
| Incident | `ouvert → affecté` | Coordinateur | Enquêteur actif désigné. |
| Incident | `affecté → évalué` | Enquêteur | Fiche d'évaluation d'impact dument complétée et cohérente. |
| Incident | `évalué → clôturé` | Coordinateur | Situation stabilisée et bilan validé. |
| Incident | `clôturé → rouvert` | Coordinateur | Saisie obligatoire d'un motif de réouverture (aggravation, récidive). |

Toute modification de statut est tracée dans la table `audit_log` par le composant centralisé `statuts.py`.

#### 6.3 Détection géospatiale des doublons

Un signalement entrant est automatiquement suggéré comme doublon potentiel si :
1. Il se situe à une distance inférieure ou égale à **50 mètres** d'un incident actif (`ST_DWithin`).
2. Il concerne la même typologie d'aléa.
3. Il est émis dans une fenêtre temporelle inférieure à **24 heures**.

La fusion n'est jamais automatique : elle requiert la confirmation explicite de l'agent vérificateur.

#### 6.4 Calcul du score de priorité opérationnelle (0 à 100)

L'algorithme de priorisation hiérarchise les signalements dans la file de triage selon les critères suivants :
- Danger vital immédiat déclaré : **+40 points**
- Gravité intrinsèque de l'événement (faible / moyenne / élevée / critique) : **+5 à +25 points**
- Hauteur d'eau constatée : **jusqu'à +15 points** (paliers progressifs)
- Risque spécifique (personnes piégées, câble électrique immergé, effondrement) : **+20 points**
- Corroborations multiples par témoins indépendants : **+5 points** par signalement rattaché

#### 6.5 Délais cibles de traitement (SLA)

- **Incident avec danger immédiat :** Prise en charge et triage requis sous **15 minutes**.
- **Incident standard :** Prise en charge requise sous **2 heures**.
- Tout dépassement déclenche un indicateur visuel de retard critique et positionne l'alerte en tête de file d'intervention.

---

### 7. Exigences non fonctionnelles

- **Performance :** Affichage cartographique fluide supportant plusieurs milliers de points simultanés, temps de réponse des endpoints d'API inférieur à 200 ms.
- **Sécurité et conformité :** Mots de passe chiffrés avec l'algorithme `bcrypt`, tokens JWT avec expiration paramétrable, validation stricte des schémas de données via Pydantic v2, contrôle et validation MIME/signature des fichiers d'images téléversés.
- **Protection de la vie privée :** Aucune conservation de données personnelles nominatives non requises sur les citoyens déclarants.
- **Ergonomie mobile :** Interface entièrement responsive optimisée pour l'utilisation sur le terrain en extérieur (fort contraste, zones tactiles élargies).

---

### 8. Modèle de données (PostgreSQL + PostGIS)

```
utilisateur  : id, nom, email (unique), mot_de_passe_hash,
               role (verificateur | enqueteur | coordinateur),
               zone_id, actif, derniere_connexion, cree_le

zone         : id, nom, geom (MultiPolygon, EPSG:4326)

incident     : id, reference_publique, type, geom (Point, EPSG:4326), zone_id,
               statut (ouvert | affecte | evalue | cloture | rouvert),
               niveau_fiabilite (declare | corrobore | verifie),
               score_priorite, danger_immediat, enqueteur_id,
               cree_le, maj_le, cloture_le

signalement  : id, reference_suivi, incident_id, type, geom (Point, EPSG:4326),
               hauteur_eau_cm, gravite, danger_immediat, danger_type, description,
               statut (recu | valide | rejete | doublon), motif_rejet,
               verifie_par, verifie_le, empreinte_anonyme, cree_le

photo        : id, signalement_id, evaluation_id, url, cree_le

evaluation   : id, incident_id, enqueteur_id, menages_touches,
               personnes_affectees, blesses, deplaces, deces, disparus,
               degats, routes_coupees, risques_sanitaires, besoins,
               recommandations, statut (brouillon | soumise), soumise_le

intervention : id, incident_id, description,
               statut (planifiee | en_cours | terminee | bloquee), cree_le

audit_log    : id, utilisateur_id, action, objet_type, objet_id,
               ancien_statut, nouveau_statut, motif, cree_le
```

---

### 9. Architecture et socle technologique

| Composant | Technologie retenue | Justification |
| :--- | :--- | :--- |
| **Backend API** | Python 3.12, FastAPI, Pydantic v2 | Hautes performances asynchrones, typage strict, documentation OpenAPI native. |
| **Base de données spatiale** | PostgreSQL 16 + PostGIS 3.4 | Référence industrielle pour le stockage et les requêtes géospatiales avancées. |
| **ORM & Migrations** | SQLAlchemy 2.0, GeoAlchemy2, Alembic | Gestion robuste des transactions et migrations versionnées du schéma. |
| **Frontend Web & Mobile** | React 19, TypeScript, Vite | Interface réactive, typage complet, vitesse d'exécution optimale. |
| **Composants cartographiques** | Leaflet, OpenStreetMap | Cartographie libre, fluide, légère et adaptée au mobile. |
| **Édition de rapports** | ReportLab (moteur PDF) | Génération vectorielle native des rapports de situation SITREP. |
| **Conteneurisation** | Docker, Docker Compose | Déploiement reproductible et isolation complète des services. |

---

## Partie 2 — Guide d'ingénierie et méthodologie

### Étape 1 — Spécification et Cadrage
Validation du périmètre fonctionnel, définition des règles métier et des seuils d'alerte (périmètre de proximité 50 m, fenêtre temporelle 24 h, barème de calcul de priorité).

### Étape 2 — Modélisation et Schéma de Données
Mise en place de la base PostGIS, création des index spatiaux GiST sur les colonnes géométriques (`geom`) et configuration des contraintes d'intégrité référentielle.

### Étape 3 — Développement du Noyau Backend
Implémentation des services métier isolés (`statuts.py`, `doublons.py`, `priorite.py`), configuration des politiques de sécurité JWT et sécurisation des routes par rôles opérationnels.

### Étape 4 — Développement de l'Interface Utilisateur (React + TypeScript)
Développement des interfaces dédiées pour chaque profil d'acteur : portail public citoyen, console de triage vérificateur, application d'évaluation pour enquêteurs de terrain, et poste de commandement pour la coordination.

### Étape 5 — Tests et Contrôle Qualité
Validation automatisée de la suite de tests (couvrant la cohérence des évaluations, les calculs d'impact, la détection des doublons spatiaux et le cloisonnement des habilitations).

### Étape 6 — Déploiement et Exploitation
Conteneurisation via Docker, configuration de la haute disponibilité, mise en place des sauvegardes régulières de la base de données PostGIS et surveillance des services.

---

## Partie 3 — Annexes

### Annexe A — Glossaire métier

- **SITREP (Situation Report) :** Document de synthèse opérationnelle périodique récapitulant les faits marquants, le bilan humain, les zones sinistrées, les moyens engagés et les besoins urgents.
- **Signalement :** Déclaration d'observation transmise par un témoin citoyen.
- **Incident :** Événement opérationnel confirmé et qualifié regroupant un ou plusieurs signalements relatifs au même sinistre.
- **Corroboration :** Confirmation d'un incident par l'apport d'informations concordantes provenant de plusieurs déclarants distincts ou de pièces justificatives (photos).
- **Niveau de fiabilité :** Degré de certitude accordé à une information (*déclaré* à la réception, *corroboré* par recoupement, *vérifié* après constatation par un agent assermenté).

### Annexe B — Liste de contrôle pour mise en production

- [x] Configuration étanche des variables d'environnement (`.env`).
- [x] Clé secrète JWT complexe et robuste configurée en production.
- [x] Migrations de base de données Alembic exécutées et synchronisées (`alembic upgrade head`).
- [x] Bandeau réglementaire d'urgence présent sur les interfaces publiques.
- [x] Suite de tests unitaires et d'intégration validée.
- [x] Procédure de sauvegarde et de restauration de la base PostGIS opérationnelle.
