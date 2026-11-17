// Données de démonstration : comptes admin et spectateur, une salle, un film, une séance, des tarifs.
// Les identifiants des comptes sont lus dans les variables d'environnement (voir .env.example).
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

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

async function main() {
  await creerCompte(variable('SEED_ADMIN_EMAIL'), variable('SEED_ADMIN_PASSWORD'), Role.ADMIN, 'Admin');
  await creerCompte(variable('SEED_USER_EMAIL'), variable('SEED_USER_PASSWORD'), Role.CLIENT, 'Spectateur');

  const salle = await prisma.salle.upsert({
    where: { nom: 'Salle 1' },
    update: {},
    create: { nom: 'Salle 1', capacite: 120 },
  });
  const rangees = 'ABCDEFGHIJ'.split('');
  await prisma.place.createMany({
    data: rangees.flatMap((rangee) =>
      Array.from({ length: 12 }, (_, i) => ({
        salleId: salle.id,
        rangee,
        numero: i + 1,
        type: rangee === 'A' && i < 2 ? ('PMR' as const) : ('STANDARD' as const),
      })),
    ),
    skipDuplicates: true,
  });

  const tarifs = [
    { libelle: 'Plein', prix: 11.5, justificatifRequis: false },
    { libelle: 'Réduit', prix: 9, justificatifRequis: true },
    { libelle: 'Moins de 14 ans', prix: 6.5, justificatifRequis: true },
    { libelle: 'Groupe', prix: 8, justificatifRequis: false },
  ];
  for (const t of tarifs) {
    await prisma.tarif.upsert({ where: { libelle: t.libelle }, update: {}, create: t });
  }

  const film =
    (await prisma.film.findFirst({ where: { titre: 'Film de démonstration' } })) ??
    (await prisma.film.create({
      data: { titre: 'Film de démonstration', dureeMinutes: 110, genre: 'Musical', statut: 'PUBLIE' },
    }));

  const debut = new Date(Date.now() + 24 * 3600 * 1000);
  debut.setUTCHours(19, 0, 0, 0);
  const existe = await prisma.seance.findFirst({ where: { filmId: film.id, salleId: salle.id, debut } });
  if (!existe) {
    await prisma.seance.create({
      data: {
        filmId: film.id,
        salleId: salle.id,
        debut,
        fin: new Date(debut.getTime() + (film.dureeMinutes + 15) * 60 * 1000),
        statut: 'PUBLIEE',
        festival: true,
      },
    });
  }
  console.log('Données de démonstration créées.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
