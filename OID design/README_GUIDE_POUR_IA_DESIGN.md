# Guide de Refonte UI/UX pour l'Assistant IA de Design (Google Stitch, v0, Claude)
## Projet : O.I.D — Observatoire Inondations & Dommages (District Autonome d'Abidjan)

> **Message pour l'assistant IA de design :**  
> Ce dossier `OID design` regroupe l'intégralité des fichiers de code qui pilotent l'apparence et l'ergonomie de l'application **O.I.D**.  
> Vous pouvez analyser ces fichiers, proposer une nouvelle charte graphique, moderniser les composants, réorganiser les grilles et nous fournir des versions améliorées de ces fichiers pour les intégrer directement dans le projet.

---

## 1. Contexte & Identité d'O.I.D

* **Mission :** Plateforme de gestion de crise hydrologique et de secours en cas d'inondation majeure dans le District Autonome d'Abidjan (13 communes, 5,3 millions d'habitants, lagune Ébrié).
* **Utilisateurs cibles :**
  1. **Grand public / Citoyens (Usage mobile prioritaire) :** Signaler une montée des eaux en urgence, joindre une photo, pointer leur géolocalisation GPS, ou suivre l'état de leur dossier.
  2. **Enquêteurs de terrain (Usage tablette / mobile) :** Recenser les sinistrés, relogements, blessés et dégâts matériels sur le lieu de l'inondation.
  3. **Cellule de crise / Coordinateurs (Usage écran large / Desktop) :** Piloter les secours via des indicateurs d'impact consolidés, visualiser la carte SIG décisionnelle, prioriser les clusters d'inondation (`ST_ClusterDBSCAN`), surveiller la vulnérabilité communale (`UNDRR`) et identifier les zones silencieuses coupées du réseau.
* **Tonalité visuelle souhaitée :**
  * Moderne, institutionnelle, sobre et hyper-lisible (style salle de commandement / *GovTech* / sécurité civile).
  * Codes couleurs stricts pour l'urgence : Bleu nuit (`#0b1f3a`), Bleu alerte (`#0284c7`), Rouge péril vital (`#dc2626`), Orange vigilance (`#d97706`), Vert confirmation (`#16a34a`).
  * Forte hiérarchie typographique pour une prise de décision rapide sous stress.

---

## 2. Organisation du Dossier `OID design`

Tous les fichiers sont organisés de manière thématique pour vous repérer instantanément :

```
OID design/
│
├── README_GUIDE_POUR_IA_DESIGN.md       <-- Ce guide d'orientation
├── DESIGN_TOKENS.json                   <-- Tokens visuels standardisés (couleurs, polices, ombres)
│
├── 00_styles_globaux/
│   ├── index.css                        <-- FEUILLE DE STYLE MAÎTRESSE (:root, boutons, cartes, grilles, tables)
│   └── index.html                       <-- En-tête HTML, polices Google Fonts, titre de l'application
│
├── 01_structure_et_navigation/
│   ├── App.tsx                          <-- Squelette racine de l'application et pied de page (Footer)
│   ├── Navbar.tsx                       <-- Barre de navigation supérieure (Logo O.I.D, liens, profil connecté)
│   └── EmergencyBanner.tsx              <-- Bandeau rouge d'urgence clignotant (Numéros 180 / 111)
│
├── 02_pages_citoyens/
│   ├── PublicReportPage.tsx             <-- Formulaire public de signalement d'inondation (Mobile & Web)
│   ├── TrackingPage.tsx                 <-- Écran citoyen de suivi d'avancement par code de référence
│   └── LoginPage.tsx                    <-- Écran d'authentification des agents et coordinateurs
│
├── 03_pages_operationnelles/
│   ├── CoordinationPage.tsx             <-- Dashboard principal de crise (KPIs humains, analyses SIG, RETEX)
│   ├── VerificationPage.tsx             <-- File d'attente de triage et comparaison des signalements doublons
│   └── EnquetePage.tsx                  <-- Fiche d'évaluation d'impact terrain soumise par les enquêteurs
│
└── 04_composants_cartographiques/
    ├── SigAnalysisMap.tsx               <-- Carte SIG avancée (Leaflet Canvas, hexagones 300 m, légendes Jenks/Gi*)
    ├── IncidentsMap.tsx                 <-- Carte interactive des incidents signalés et validés
    └── LocationPickerMap.tsx            <-- Mini-carte interactive pour pointer sa position géographique
```

---

## 3. Règles d'Or pour l'Assistant IA de Design

1. **Préserver les attributs de formulaire et la logique fonctionnelle :**
   * Ne supprimez pas les gestionnaires d'événements (`onChange`, `onSubmit`, `onClick`), ni les états React (`useState`).
   * Conservez les clés de données (ex. `score_priorite`, `danger_immediat`, `statut`, `zone_id`, `hauteur_eau_cm`).
2. **Pour les cartes Leaflet :**
   * Le conteneur `div` référencé par `ref={mapContainerRef}` doit impérativement avoir une hauteur explicite (`height: 560px` ou similaire) pour que Leaflet puisse calculer la vue.
   * Vous pouvez entièrement redessiner les contrôles de surimpression (barre de fond de plan, sélecteur communal, coordonnées curseur, panneau de légende).
3. **Approche recommandée de modification :**
   * **Niveau 1 (Recommandé en premier) :** Modifier `00_styles_globaux/index.css` (redéfinir `:root`, espacements, cartes `.kpi-card`, boutons `.btn`, tables `.data-table`, typographies). Cela modernise instantanément 100 % du site sans toucher au code React.
   * **Niveau 2 :** Restructurer les composants JSX dans `01_`, `02_` ou `03_` pour offrir de meilleures dispositions en cartes (bento grid, modales épurées, progression par étapes).

---

## 4. Tableau de Réintégration dans le Projet O.I.D

Dès que vous avez retouché un fichier dans ce dossier, il correspond exactement à son emplacement d'origine dans le code source de l'application :

| Fichier dans `OID design/` | Fichier source de destination dans `frontend/` |
| :--- | :--- |
| `00_styles_globaux/index.css` | `frontend/src/index.css` |
| `00_styles_globaux/index.html` | `frontend/index.html` |
| `01_structure_et_navigation/App.tsx` | `frontend/src/App.tsx` |
| `01_structure_et_navigation/Navbar.tsx` | `frontend/src/components/Navbar.tsx` |
| `01_structure_et_navigation/EmergencyBanner.tsx` | `frontend/src/components/EmergencyBanner.tsx` |
| `02_pages_citoyens/PublicReportPage.tsx` | `frontend/src/pages/PublicReportPage.tsx` |
| `02_pages_citoyens/TrackingPage.tsx` | `frontend/src/pages/TrackingPage.tsx` |
| `02_pages_citoyens/LoginPage.tsx` | `frontend/src/pages/LoginPage.tsx` |
| `03_pages_operationnelles/CoordinationPage.tsx` | `frontend/src/pages/CoordinationPage.tsx` |
| `03_pages_operationnelles/VerificationPage.tsx` | `frontend/src/pages/VerificationPage.tsx` |
| `03_pages_operationnelles/EnquetePage.tsx` | `frontend/src/pages/EnquetePage.tsx` |
| `04_composants_cartographiques/SigAnalysisMap.tsx` | `frontend/src/components/SigAnalysisMap.tsx` |
| `04_composants_cartographiques/IncidentsMap.tsx` | `frontend/src/components/IncidentsMap.tsx` |
| `04_composants_cartographiques/LocationPickerMap.tsx` | `frontend/src/components/LocationPickerMap.tsx` |

