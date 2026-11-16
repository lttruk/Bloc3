# La Grande Cinéma – Application web de réservation

Application web de réservation de places pour le cinéma **La Grande Cinéma**, développée dans le cadre du Bachelor Développeur d'application (Studi) – Bloc 3 « Développer une solution digitale ».

## Contexte

Le cinéma fonctionne aujourd'hui uniquement au guichet. Pendant les périodes de forte affluence (notamment le festival de Jazz), les files d'attente dépassent 30 minutes et une partie des spectateurs renonce à acheter un billet.

L'objectif est d'**augmenter la fréquentation de 30 % sur 12 mois** grâce à une solution digitale permettant de consulter et de réserver en ligne.

## Fonctionnalités visées

**Utilisateurs**
- Consulter les films et les horaires des séances
- Visualiser les places disponibles en temps réel
- Réserver des places en ligne
- Accéder à un billet dématérialisé

**Administration**
- Gérer la programmation (films, séances)
- Suivre les réservations
- Analyser les taux de remplissage
- Anticiper les pics d'affluence (festival)

## Stack technique (prévisionnelle)

| Couche | Choix |
|---|---|
| Backend | PHP 8.3 – Laravel |
| Base de données | MySQL 8 |
| Frontend | Interface web responsive |
| Qualité | Laravel Pint (PSR-12), PHPStan, PHPUnit, SonarCloud |
| CI | GitHub Actions |

## Organisation du dépôt

Le projet suit un **GitFlow simplifié** :

| Branche | Rôle |
|---|---|
| `main` | Version stable, prête à être livrée. Protégée. |
| `develop` | Branche d'intégration des fonctionnalités. |
| `feature/*`, `fix/*`, `hotfix/*`, `release/*`, `docs/*`, `test/*` | Branches de travail temporaires. |

La convention de nommage des branches, des commits et le processus de merge request sont documentés dans **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Statut

🚧 Projet en cours de développement.
