import { Prisma } from '@prisma/client';

/**
 * Places d'une séance (US-7.2) : celles qui faisaient partie de la configuration de la salle
 * au moment où la séance a été créée. Une salle reconfigurée ensuite ne change rien aux
 * séances déjà programmées : seules les nouvelles séances prennent le nouveau plan.
 */
export function placesDeLaSeance(salleId: number, seanceCreeeLe: Date): Prisma.PlaceWhereInput {
  return {
    salleId,
    ajouteeLe: { lte: seanceCreeeLe },
    OR: [{ retireeLe: null }, { retireeLe: { gt: seanceCreeeLe } }],
  };
}
