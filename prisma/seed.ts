// Données de démonstration : comptes admin et spectateur, deux salles, des films, 30 jours de séances, des tarifs.
// Les identifiants des comptes sont lus dans les variables d'environnement (voir .env.example).
// Le script peut être relancé sans créer de doublons.
import { PrismaClient, Role, Version } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const JOURS_PROGRAMMES = 30;

function variable(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return valeur;
}

async function creerCompte(email: string, motDePasse: string, role: Role, prenom: string) {
  return prisma.utilisateur.upsert({
    where: { email },
    update: { role },
    create: {
      email,
      nom: 'Démo',
      prenom,
      role,
      motDePasseHash: await argon2.hash(motDePasse),
      consentementRgpdLe: new Date(),
    },
  });
}

async function creerSalle(nom: string, rangees: string, placesParRangee: number) {
  const salle = await prisma.salle.upsert({
    where: { nom },
    update: {},
    create: { nom, capacite: rangees.length * placesParRangee },
  });
  await prisma.place.createMany({
    data: rangees.split('').flatMap((rangee) =>
      Array.from({ length: placesParRangee }, (_, i) => ({
        salleId: salle.id,
        rangee,
        numero: i + 1,
        type: rangee === 'A' && i < 2 ? ('PMR' as const) : ('STANDARD' as const),
      })),
    ),
    skipDuplicates: true,
  });
  return salle;
}

const FILMS = [
  {
    titre: 'Hors Ligne',
    genre: 'Thriller',
    dureeMinutes: 112,
    classification: 'Tous publics',
    synopsis: 'Une panne mondiale coupe tous les réseaux pendant 48 heures. Une ingénieure découvre qu’elle n’est pas accidentelle.',
  },
  {
    titre: 'Zone Blanche',
    genre: 'Science-fiction',
    dureeMinutes: 124,
    classification: 'Tous publics',
    synopsis: 'Dans un village sans aucune couverture, des signaux venus de nulle part commencent à s’afficher sur les écrans éteints.',
  },
  {
    titre: 'Face à Face',
    genre: 'Policier',
    dureeMinutes: 108,
    classification: 'Avertissement',
    synopsis: 'Une commissaire et le suspect qu’elle traque depuis dix ans se retrouvent coincés dans la même salle d’interrogatoire.',
  },
  {
    titre: 'Mode Avion',
    genre: 'Comédie',
    dureeMinutes: 95,
    classification: 'Tous publics',
    synopsis: 'Une famille accro aux écrans accepte de passer un week-end entier téléphones éteints. Personne n’était prêt.',
  },
  {
    titre: 'Les Algorithmes Zombies',
    genre: 'Horreur',
    dureeMinutes: 99,
    classification: 'Interdit aux moins de 12 ans',
    synopsis: 'Une mise à jour défectueuse transforme les assistants connectés d’une ville entière en machines affamées de données.',
  },
  {
    titre: 'Dernière Story',
    genre: 'Comédie dramatique',
    dureeMinutes: 104,
    classification: 'Tous publics',
    synopsis: 'Une influenceuse décide de publier sa toute dernière vidéo… et de revenir à la vraie vie.',
  },
];

// Horaires en heure de Paris (UTC+1 en hiver) : [heure, minute, festival]
const CRENEAUX: Array<[number, number, boolean]> = [
  [14, 0, false],
  [17, 30, false],
  [21, 0, true],
];

async function main() {
  await creerCompte(variable('SEED_ADMIN_EMAIL'), variable('SEED_ADMIN_PASSWORD'), Role.ADMIN, 'Admin');
  await creerCompte(variable('SEED_USER_EMAIL'), variable('SEED_USER_PASSWORD'), Role.CLIENT, 'Spectateur');
  // Comptes du personnel, créés seulement si leurs identifiants sont renseignés
  const personnel: Array<[string, string, Role, string]> = [
    ['SEED_PROG_EMAIL', 'SEED_PROG_PASSWORD', Role.PROGRAMMATION, 'Programmation'],
    ['SEED_CONTROLEUR_EMAIL', 'SEED_CONTROLEUR_PASSWORD', Role.CONTROLEUR, 'Contrôleur'],
  ];
  for (const [email, motDePasse, role, prenom] of personnel) {
    if (process.env[email] && process.env[motDePasse]) {
      await creerCompte(variable(email), variable(motDePasse), role, prenom);
    }
  }

  const salles = [await creerSalle('Salle 1', 'ABCDEFGHIJ', 12), await creerSalle('Salle 2', 'ABCDEFGH', 10)];

  const tarifs = [
    { libelle: 'Plein', prix: 11.5, justificatifRequis: false },
    { libelle: 'Réduit', prix: 9, justificatifRequis: true },
    { libelle: 'Moins de 14 ans', prix: 6.5, justificatifRequis: true },
    { libelle: 'Groupe', prix: 8, justificatifRequis: false },
  ];
  for (const t of tarifs) {
    await prisma.tarif.upsert({ where: { libelle: t.libelle }, update: {}, create: t });
  }

  // L'ancien film unique de démonstration n'est plus affiché.
  await prisma.film.updateMany({ where: { titre: 'Film de démonstration' }, data: { statut: 'ARCHIVE' } });

  const films = [];
  for (const f of FILMS) {
    const existant = await prisma.film.findFirst({ where: { titre: f.titre } });
    films.push(existant ?? (await prisma.film.create({ data: { ...f, statut: 'PUBLIE' } })));
  }

  let creees = 0;
  const aujourdhui = new Date();
  for (let jour = 0; jour < JOURS_PROGRAMMES; jour++) {
    for (const [s, salle] of salles.entries()) {
      for (const [c, [heure, minute, festival]] of CRENEAUX.entries()) {
        const film = films[(jour + s * 3 + c) % films.length];
        const debut = new Date(aujourdhui);
        debut.setUTCDate(debut.getUTCDate() + jour);
        debut.setUTCHours(heure - 1 + s, minute + s * 15, 0, 0);
        if (debut <= aujourdhui) continue;
        const existe = await prisma.seance.findFirst({ where: { salleId: salle.id, debut } });
        if (existe) continue;
        await prisma.seance.create({
          data: {
            filmId: film.id,
            salleId: salle.id,
            debut,
            fin: new Date(debut.getTime() + (film.dureeMinutes + 15) * 60 * 1000),
            version: (jour + c) % 2 === 0 ? Version.VF : Version.VO,
            statut: 'PUBLIEE',
            festival,
          },
        });
        creees++;
      }
    }
  }
  console.log(`Données de démonstration à jour (${creees} séance(s) ajoutée(s)).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
