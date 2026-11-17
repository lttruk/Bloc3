# Guide de contribution

Ce document définit les règles de travail sur le dépôt **La Grande Cinéma** : modèle de branches, convention de nommage, convention de commits et processus de revue.

## 1. Modèle de branches : GitFlow simplifié

```
main      ●───────────────────────●──────────────●        (versions stables)
           \                     /              /
develop     ●───●───────●───────●──────●───────●          (intégration)
                 \     /         \    /
feature/...       ●───●           ●──●                    (une story = une branche)
```

| Branche | Créée depuis | Fusionnée vers | Rôle | Règles |
|---|---|---|---|---|
| `main` | – | – | Version stable, livrable | Protégée : aucun push direct, fusion par merge request uniquement, CI verte obligatoire. |
| `develop` | `main` | `main` (via `release/*`) | Intégration des fonctionnalités | Protégée : fusion par merge request relue, CI verte obligatoire. |
| `feature/*` | `develop` | `develop` | Développement d'une user story | Une seule story par branche. Supprimée après fusion. |
| `fix/*` | `develop` | `develop` | Correction d'un défaut non urgent | Test de non-régression obligatoire. |
| `hotfix/*` | `main` | `main` **et** `develop` | Correction urgente en production | Procédure accélérée, mais revue et tests conservés. |
| `release/*` | `develop` | `main` **et** `develop` | Préparation d'une version | Stabilisation, corrections finales, changelog. |
| `docs/*` | `develop` | `develop` | Documentation uniquement | Aucun changement de code applicatif. |
| `test/*` | `develop` | `develop` | Ajout ou refonte de tests | Aucun changement de comportement applicatif. |
| `chore/*` | `develop` | `develop` | Outillage, configuration, socle technique | Aucune fonctionnalité métier. |

## 2. Convention de nommage des branches

### Format

```
<type>/<identifiant>-<description-courte>
```

| Élément | Règle |
|---|---|
| `type` | Un des préfixes autorisés : `feature`, `fix`, `hotfix`, `release`, `docs`, `test`, `chore` |
| `identifiant` | Identifiant de la user story tel qu'il figure dans le [backlog Trello](https://trello.com/b/TABpIPj5) (`US3.2`), ou d'un ticket d'anomalie (`BUG12`). Facultatif pour `docs/*`, `test/*` et `chore/*`. Pour `release/*`, le numéro de version (`v1.0.0`). |
| `description-courte` | 2 à 5 mots en **kebab-case**, décrivant l'intention |

### Règles

- Minuscules uniquement (sauf l'identifiant : `US3.2`), sans espace, sans accent, sans caractère spécial autre que `-`, `/` et le point de l'identifiant.
- Le nom décrit **ce que fait la branche**, jamais la personne qui la développe.
- Une branche = un objectif. Si le périmètre change, on crée une nouvelle branche.

### Exemples

| ✅ Valide | ❌ Invalide | Pourquoi |
|---|---|---|
| `feature/US1.1-consultation-seances` | `feature/Consultation Séances` | Espaces, majuscules, accents |
| `feature/US3.2-verrouillage-places` | `jdupont-dev` | Nom de personne, pas de type |
| `fix/BUG4-double-reservation` | `fix/bug` | Pas d'identifiant ni d'intention |
| `hotfix/BUG7-billet-qr-invalide` | `feature/US3.2_verrouillage` | Underscore au lieu de tiret |
| `release/v1.0.0` | `release/version-finale` | Pas de numéro de version |
| `docs/modele-donnees` | `docs/US3.1/plan/salle` | Plusieurs niveaux de `/` |
| `test/reservation-concurrence` | `tests/reservation` | Préfixe non autorisé |
| `chore/socle-technique` | `setup` | Pas de type |

### Branches prévues pour le MVP (17 user stories du Bloc 2)

| User story | Branche |
|---|---|
| US-1.1 Consulter les films et les séances | `feature/US1.1-consultation-seances` |
| US-1.2 Consulter la fiche d'un film | `feature/US1.2-fiche-film` |
| US-2.1 Créer un compte | `feature/US2.1-creation-compte` |
| US-2.2 Se connecter et réinitialiser son mot de passe | `feature/US2.2-authentification` |
| US-3.1 Plan de salle en temps réel | `feature/US3.1-plan-salle-temps-reel` |
| US-3.2 Sélectionner et verrouiller des places | `feature/US3.2-verrouillage-places` |
| US-3.3 Choisir un tarif et valider le récapitulatif | `feature/US3.3-tarifs-recapitulatif` |
| US-4.1 Payer par carte bancaire | `feature/US4.1-paiement-carte` |
| US-5.1 Recevoir le billet avec QR code | `feature/US5.1-billet-qr-code` |
| US-5.2 Historique des réservations | `feature/US5.2-historique-reservations` |
| US-6.1 Scanner un billet à l'entrée | `feature/US6.1-controle-billets` |
| US-7.1 Gérer films et séances | `feature/US7.1-programmation-seances` |
| US-7.2 Paramétrer tarifs, plans et ventes | `feature/US7.2-parametrage-ventes` |
| US-7.3 Vendre au guichet | `feature/US7.3-vente-guichet` |
| US-9.1 Tenir la charge du festival | `feature/US9.1-tenue-charge` |
| US-9.2 RGPD et sécurité des données | `feature/US9.2-rgpd-securite` |
| US-9.3 Supervision et alertes | `feature/US9.3-supervision` |

## 3. Convention de commits

Les messages suivent la convention **Conventional Commits** :

```
<type>(<portée facultative>): <description à l'impératif>
```

| Type | Usage |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `test` | Ajout ou modification de tests |
| `refactor` | Restructuration sans changement de comportement |
| `docs` | Documentation |
| `chore` | Configuration, dépendances, outillage |

Exemples :

```
feat(reservation): réserver une place pour une séance
fix(reservation): empêcher la double réservation d'une place
test(reservation): couvrir le conflit de réservation concurrente
docs(api): documenter l'endpoint de réservation
```

## 4. Workflow d'une user story

```bash
# 1. Partir d'un develop à jour
git switch develop
git pull origin develop

# 2. Créer la branche de la story
git switch -c feature/US1.1-consultation-seances

# 3. Développer, tester, committer
git add .
git commit -m "feat(seances): afficher les séances à venir"

# 4. Pousser et ouvrir une merge request vers develop
git push -u origin feature/US1.1-consultation-seances
```

## 5. Merge request et revue

Une merge request vers `develop` ne peut être fusionnée que si :

- [ ] La branche respecte la convention de nommage.
- [ ] Les critères d'acceptation de la story sont couverts.
- [ ] Les tests passent (`npm run test:cov`, `npm run test:e2e`) et la CI est verte.
- [ ] Le code passe ESLint, Prettier et le contrôle de types TypeScript (`npm run lint`, `npm run typecheck`).
- [ ] Les contrôles d'accès et la validation des entrées ont été vérifiés.
- [ ] Aucun secret (`.env`, mot de passe, jeton) n'est committé.
- [ ] La documentation (README, API) est à jour si nécessaire.
- [ ] Au moins une relecture a été effectuée.

## 6. Sécurité du dépôt

- Ne jamais committer le fichier `.env`, des identifiants, des jetons ou des données réelles de clients.
- Utiliser `.env.example` avec des valeurs fictives.
- Les secrets de la CI sont stockés dans les *secrets* GitHub Actions.
