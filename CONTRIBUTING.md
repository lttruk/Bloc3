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

## 2. Convention de nommage des branches

### Format

```
<type>/<identifiant>-<description-courte>
```

| Élément | Règle |
|---|---|
| `type` | Un des préfixes autorisés : `feature`, `fix`, `hotfix`, `release`, `docs`, `test` |
| `identifiant` | Identifiant de la user story ou du ticket (`US03`, `BUG12`…). Facultatif pour `docs/*` et `test/*`. Pour `release/*`, le numéro de version (`v1.0.0`). |
| `description-courte` | 2 à 5 mots en **kebab-case**, décrivant l'intention |

### Règles

- Minuscules uniquement (sauf l'identifiant : `US03`), sans espace, sans accent, sans caractère spécial autre que `-` et `/`.
- Le nom décrit **ce que fait la branche**, jamais la personne qui la développe.
- Une branche = un objectif. Si le périmètre change, on crée une nouvelle branche.

### Exemples

| ✅ Valide | ❌ Invalide | Pourquoi |
|---|---|---|
| `feature/US01-consultation-seances` | `feature/Consultation Séances` | Espaces, majuscules, accents |
| `feature/US03-reservation-places` | `jdupont-dev` | Nom de personne, pas de type |
| `fix/BUG04-double-reservation` | `fix/bug` | Pas d'identifiant ni d'intention |
| `hotfix/BUG07-billet-qr-invalide` | `feature/US03_reservation` | Underscore au lieu de tiret |
| `release/v1.0.0` | `release/version-finale` | Pas de numéro de version |
| `docs/documentation-api` | `docs/US02/plan/salle` | Plusieurs niveaux de `/` |
| `test/reservation-concurrence` | `tests/reservation` | Préfixe non autorisé |

### Branches prévues pour le premier incrément

| User story | Branche |
|---|---|
| US01 – Consulter les films et les séances | `feature/US01-consultation-seances` |
| US02 – Visualiser les places disponibles | `feature/US02-visualisation-places` |
| US03 – Réserver des places | `feature/US03-reservation-places` |
| US04 – Accéder au billet dématérialisé | `feature/US04-billet-dematerialise` |
| US05 – Gérer la programmation | `feature/US05-administration-programmation` |
| US06 – Suivre les réservations | `feature/US06-suivi-reservations` |
| US07 – Analyser le remplissage et anticiper les pics | `feature/US07-analyse-remplissage` |

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
git switch -c feature/US01-consultation-seances

# 3. Développer, tester, committer
git add .
git commit -m "feat(seances): afficher les séances à venir"

# 4. Pousser et ouvrir une merge request vers develop
git push -u origin feature/US01-consultation-seances
```

## 5. Merge request et revue

Une merge request vers `develop` ne peut être fusionnée que si :

- [ ] La branche respecte la convention de nommage.
- [ ] Les critères d'acceptation de la story sont couverts.
- [ ] Les tests passent et la CI est verte.
- [ ] Le code respecte PSR-12 (Laravel Pint) et l'analyse statique (PHPStan).
- [ ] Les contrôles d'accès et la validation des entrées ont été vérifiés.
- [ ] Aucun secret (`.env`, mot de passe, jeton) n'est committé.
- [ ] La documentation (README, API) est à jour si nécessaire.
- [ ] Au moins une relecture a été effectuée.

## 6. Sécurité du dépôt

- Ne jamais committer le fichier `.env`, des identifiants, des jetons ou des données réelles de clients.
- Utiliser `.env.example` avec des valeurs fictives.
- Les secrets de la CI sont stockés dans les *secrets* GitHub Actions.
