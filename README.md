# 🛒 Courses Famille

Liste de courses familiale collaborative, budget en **Dirhams (DH)**, synchronisée en temps réel entre plusieurs téléphones.
100 % autonome : aucun service cloud, les données restent dans `data/store.json` sur votre machine.

## Démarrage

```bash
npm install
npm run dev
```

Le serveur affiche ses adresses :

```
🛒 Courses Famille (développement)
   Local   : http://localhost:3000
   Réseau  : http://192.168.1.20:3000   ← à ouvrir sur les téléphones
```

Ouvrez l'adresse **Réseau** sur chaque téléphone connecté au même Wi-Fi, avec le même **code famille** (ex : `FAMILLE-KASM`) : tout ajout ou achat apparaît instantanément sur les autres appareils.
Astuce : « Ajouter à l'écran d'accueil » dans le navigateur pour l'utiliser comme une app.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | API + SSE + front (Vite, rechargement à chaud) sur le port 3000 |
| `npm run typecheck` | Vérification TypeScript stricte (front + serveur) |
| `npm run build` | Typecheck puis build de production dans `dist/` |
| `npm start` | Sert le build de production (après `npm run build`) |

Variables optionnelles : `PORT` (3000), `HOST` (0.0.0.0), `DATA_DIR` (`data`).

## Fonctionnalités

- **Accueil** : les magasins en galerie (photo ou couleur), avec pour chacun les articles à acheter, dépensé / budgété, et les boutons « Liste » et « En rayon ». Raccourcis : Nouvel article, Importer Excel, Réglages.
- **Réglages** (roue dentée) : toutes les données modifiables au même endroit — magasins, budget, mois archivés, code famille, thème, import/export CSV, sauvegarde Google Sheets, remise à zéro.
- **Tableau des articles** (Réglages → Articles) : une ligne par article, une colonne par champ (photo, nom, magasin, prix, quantité, unité, total, statut, mois, mois référence, récurrent, notes). Chaque case se modifie sur place (Entrée valide, Échap annule), toucher la photo la remplace. Filtres : recherche, magasin, statut, mois, référence, avec/sans photo ; tri par colonne ; sélection multiple (acheté, à acheter, changer de magasin, supprimer) ; ligne d’ajout rapide.
- **Photos adaptées aux icônes** : la photo entière est toujours visible, centrée, jamais rognée ni déformée (bouteilles, logos larges).
- **Sauvegarde Google Sheets** (Réglages → Données, version artefact Claude) : une feuille « Courses Famille – Sauvegarde » avec les onglets Infos, Articles, Référence, Magasins, Historique, réécrite à chaque sauvegarde. Les photos restent dans l’appli.

- **Articles** : nom, prix unitaire (DH), quantité, unité (pcs, kg, L, pack), magasin, acheté/en attente, photo (appareil photo ou galerie), notes/marques, récurrent. Ajout rapide en une ligne (`Tomates 2kg 8,5`, `Lait x6 7.5dh`, `Huile 5 L @ 95`), modification complète, suppression (avec « Annuler »), boutons + / −.
- **Photos** : uniquement celles de l'utilisateur, compressées côté téléphone puis stockées dans `data/uploads/`. Jamais remplacées automatiquement ; une photo n'est modifiée que si vous la changez.
- **Magasins** : badges couleur (BIM, Marjane, Carrefour, Marché, Épicerie par défaut), ajout, renommage, couleur, suppression (les articles passent dans « Sans magasin »). Filtre par enseigne avec dépensé / budgété par magasin.
- **Mode courses** (« En rayon ») : galerie de tuiles (photo ou initiales), on touche les articles mis dans le chariot puis on appuie sur **Valider** (rien n'est validé avant). Pour un article de plusieurs unités, on choisit combien on en prend : le reste reste à acheter (« 2/6 pris »). Bouton **+ Article** pour ajouter sur place, **Ignorer** pour sortir un article du mois, sections « Achetés » et « Ignorés ce mois ». Écran maintenu allumé quand le navigateur le permet.
- **Mois référence** : la liste type du mois (prix et quantités habituels). Chaque nouveau mois en est une copie. Modifier le prix ou la quantité d'un article met aussi la référence à jour (option désactivable), et le changement s'applique aux mois suivants. Bouton « Ajouter à {mois} » pour remettre les articles manquants.
- **Listes « À acheter / Déjà acheté »** : un article validé disparaît de « À acheter » et passe dans « Déjà acheté », dans la liste comme en rayon (« Remettre » pour annuler).
- **Récap du mois** : référence vs prévu vs dépensé, comparatif des mois (repère de la référence), tableau par magasin, prix et quantités modifiés par rapport à la référence, articles hors référence et articles de la référence absents.
- **Supprimer un mois** (Réglages → Budget & mois) : efface la liste du mois sans l'archiver et repart du mois suivant depuis la référence ; les mois archivés se suppriment aussi un par un.
- **Ignorer ce mois** : un article dont on n'a pas besoin ce mois-ci sort de la liste et du budget, et revient automatiquement le mois suivant (s'il est récurrent).
- **Budget & historique** : estimé vs acheté vs reste, budget mensuel optionnel, sélecteur de mois, comparatif des 6 derniers mois, clôture mensuelle (archive dans `store.json`, articles récurrents décochés, achats ponctuels retirés).
- **Mois prochain** : onglet « Novembre · à préparer » pour faire les courses du mois suivant en avance (fin octobre par exemple). Ses achats comptent pour ce mois-là. Copier/déplacer des articles entre les deux mois (bouton Sélection → Mois). À la clôture, la liste préparée devient la liste du mois, sans doublon.
- **Import Excel** : bouton tableur → fichier .xlsx ou .csv (colonnes Nom, Prix, Quantité, Unité, Magasin, Notes, Acheté, dans n'importe quel ordre). Aperçu avant import, mise à jour des articles existants, magasins inconnus créés, g/cl convertis en kg/L. Lecture 100 % locale, sans dépendance.
- **Modifier / supprimer** : boutons crayon et corbeille sur chaque article (suppression annulable).
- **Photos de magasin** : logo ou photo de chaque enseigne (Magasins → toucher la pastille), affichés dans les filtres et les titres de groupe.
- **Actions groupées** : sélection multiple, tout sélectionner, marquer acheté / en attente, changer de magasin, supprimer.
- **Temps réel** : code famille partagé (lien d'invitation `/?code=…`), SSE `GET /api/sync/events?code=…`, nombre d'appareils connectés.
- **Hors-ligne** : cache localStorage + file d'attente des modifications, renvoyées automatiquement au retour du réseau (idempotent : jamais appliquées deux fois).
- Mode clair / sombre, recherche instantanée (insensible aux accents).

## Architecture

```
server.ts                  Express : API, SSE, persistance data/store.json, photos, Vite middleware
src/
  types.ts                 Types partagés front/serveur (Product, Store, Action…)
  shared/                  Code commun front + serveur
    reducer.ts             Réducteur pur : seule logique métier, rejouée côté client (optimiste) et serveur (vérité)
    totals.ts              Calculs de totaux (par article, par enseigne)
    month.ts, defaults.ts  Mois "YYYY-MM", magasins par défaut, codes famille
  context/
    FamilyContext.tsx      Synchro : cache, file d'attente, SSE, rebase optimiste
    ThemeContext.tsx       Clair / sombre
  components/              Header, BudgetSummary, StoreFilter, ProductList, ProductCard, ProductModal,
                           QuickAdd, BulkActionBar, ShoppingMode, StoreManager, ArchiveView, FamilyCodeModal, ui/
  lib/                     API, formatage DH, parsing ajout rapide, compression photo, ids
data/
  store.json               Toutes les familles (créé au premier lancement, écriture atomique)
  uploads/                 Photos
```

### Synchronisation

Chaque modification est une **action** (`product/add`, `product/setChecked`, `bulk/move`, `month/close`…) avec un identifiant unique :

1. le téléphone l'applique immédiatement avec le réducteur partagé (affichage instantané) ;
2. il l'envoie à `POST /api/family/:code/actions` (file persistée si hors-ligne) ;
3. le serveur l'applique avec le **même réducteur**, enregistre `store.json` et diffuse le nouvel état à tous les téléphones via SSE ;
4. les ids déjà appliqués (`lastActionIds`) rendent les renvois sans effet et évitent tout double comptage.

### API

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/family/:code` | État complet de la famille (créée si besoin) |
| POST | `/api/family/:code/actions` | `{ actions: ActionEnvelope[] }` → `{ data, processed, rejected }` |
| GET | `/api/sync/events?code=…` | Flux SSE : événements `state` et `presence` |
| GET | `/uploads/:fichier` | Photos |
| GET | `/api/health` | Santé du serveur |

## Sauvegarde

Copiez simplement le dossier `data/`. En cas de fichier corrompu, le serveur le renomme en `store.json.corrompu-<date>` au lieu de l'écraser.

## En ligne : Cloudflare (Worker + D1) et GitHub

La même application tourne aussi sur Cloudflare, avec un lien public à partager (comme Tingis) :

- `worker/index.ts` : l'API (mêmes routes que `server.ts`), le temps réel (SSE) et les photos ;
- base **D1** `courses-famille-db` (tables `families`, `photos`, `presence` — voir `schema.sql`) ;
- `dist/` : l'application déjà construite, publiée telle quelle (`wrangler.jsonc` → `assets`).

Déploiement automatique à chaque `git push` sur `main`, au choix :

1. **Workers Builds** (tableau de bord Cloudflare → Workers & Pages → Créer → Importer un dépôt GitHub) : commande de build vide, commande de déploiement `npx wrangler deploy` ;
2. **GitHub Actions** (`.github/workflows/deploy.yml`) : ajouter les secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` au dépôt.

L'adresse est ensuite `https://courses-famille.<votre-sous-domaine>.workers.dev`. Chaque famille a son code (`/?code=FAMILLE-XXXX`) : partagez le lien avec le code pour donner accès à la même liste.

**Transférer les données** : dans l'ancienne version, Réglages → Données → « Sauvegarde complète (.json) », puis dans la nouvelle, « Restaurer une sauvegarde (.json) » (photos comprises).

## 📐 PLT Viewer — visionneuse HPGL (PC et Android)

Application indépendante dans `public/plt/` (copiée dans `dist/plt/`), publiée avec le site à l’adresse **`/plt/`**.
HTML/JS pur, aucune dépendance, fonctionne **hors ligne** et s’installe comme une application.

**Formats** : `.plt`, `.hpgl`, `.hpg`, `.hgl`, `.plo`, `.spl` — HP-GL et HP-GL/2, y compris les fichiers enveloppés dans du PCL/PJL (traceurs AutoCAD, découpeuses, patronages).
Commandes prises en charge : `IN DF PU PD PA PR SP LT PW WU PC CR IP SC RO CI AA AR AT RT EA ER RA RR EW WG PM EP FP LB DT SI SR DI DR CP PE SM CO`.

**Fonctions**
- Ouvrir un ou plusieurs fichiers (bouton, glisser-déposer, Ctrl+O), fichiers récents mémorisés sur l’appareil.
- Zoom molette / pincement, déplacement à la souris ou au doigt, double-tap = zoom, ajuster, **taille réelle 1:1**, rotation 90°.
- Couleurs par stylo (modifiables), masquer un stylo, épaisseurs réelles (PW), déplacements plume levée, fond sombre, grille 10 mm.
- Infos : dimensions en mm, longueur tracée, déplacements, longueur par stylo.
- **Mesure** de distances (aimantation sur les sommets), **simulation du tracé** avec vitesse réglable.
- Export **SVG** (à l’échelle, en mm) et **PNG** ; impression ajustée à la page ou **en taille réelle sur plusieurs A4** (mosaïque avec trait de contrôle de 50 mm).

**Installation**
- **PC (Chrome / Edge)** : ouvrir `https://<votre-site>/plt/` → icône « Installer » dans la barre d’adresse (ou menu ⋮ → Installer l’application). Une fois installée, les fichiers `.plt` peuvent être ouverts directement avec « Ouvrir avec → PLT Viewer ».
- **Android (Chrome)** : ouvrir la même adresse → menu ⋮ → « Installer l’application » / « Ajouter à l’écran d’accueil ». Depuis le gestionnaire de fichiers ou une messagerie, **Partager → PLT Viewer** ouvre le fichier.
- **APK / Play Store ou MSIX Windows** (facultatif) : saisir l’adresse `/plt/` sur [pwabuilder.com](https://www.pwabuilder.com) pour générer le paquet.
- Test local : `cd public/plt && python3 -m http.server 8080` puis `http://localhost:8080`.
