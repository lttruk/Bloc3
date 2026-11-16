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
| Backend | Node.js 22 – TypeScript – NestJS |
| Accès aux données | Prisma (ORM et migrations) |
| Base de données | MySQL 8 |
| Cache et temps réel | Redis, WebSocket (Socket.IO) |
| Frontend | React (Vite), interface responsive |
| Qualité | ESLint, Prettier, Jest, Supertest, Playwright, k6, SonarCloud |
| CI | GitHub Actions |

Le backlog (EPICs et user stories) est issu du Bloc 2 : [tableau Trello](https://trello.com/b/TABpIPj5).

## Organisation du dépôt

Le projet suit un **GitFlow simplifié** :

| Branche | Rôle |
|---|---|
| `main` | Version stable, prête à être livrée. Protégée. |
| `develop` | Branche d'intégration des fonctionnalités. |
| `feature/*`, `fix/*`, `hotfix/*`, `release/*`, `docs/*`, `test/*` | Branches de travail temporaires. |

La convention de nommage des branches, des commits et le processus de merge request sont documentés dans **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Modèle de données

Le script SQL du modèle physique (MySQL 8) se trouve dans [`docs/database/schema.sql`](docs/database/schema.sql).

## Statut

🚧 Projet en cours de développement.
