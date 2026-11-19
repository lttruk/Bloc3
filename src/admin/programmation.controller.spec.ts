import { ProgrammationController } from './programmation.controller';
import { ProgrammationService } from './programmation.service';

describe('ProgrammationController', () => {
  const programmeur = { id: 3, role: 'PROGRAMMATION' as const };
  const methodes = [
    'listerFilms',
    'creerFilm',
    'modifierFilm',
    'changerStatutFilm',
    'supprimerFilm',
    'listerSalles',
    'listerSeances',
    'creerSeance',
    'modifierSeance',
    'changerStatutSeance',
    'annulerSeance',
    'supprimerSeance',
    'journal',
  ] as const;
  const service = Object.fromEntries(
    methodes.map((m) => [m, jest.fn().mockResolvedValue('resultat')]),
  ) as Record<(typeof methodes)[number], jest.Mock>;
  const controleur = new ProgrammationController(service as unknown as ProgrammationService);

  beforeEach(() => jest.clearAllMocks());

  it('délègue les lectures au service', async () => {
    await expect(controleur.listerFilms()).resolves.toBe('resultat');
    await controleur.listerSalles();
    await controleur.listerSeances({ salleId: 1 });
    await controleur.journal();
    expect(service.listerSeances).toHaveBeenCalledWith({ salleId: 1 });
    expect(service.listerSalles).toHaveBeenCalled();
    expect(service.journal).toHaveBeenCalled();
  });

  it('transmet l’auteur de chaque modification de film', async () => {
    const film = { titre: 'Swing Night', dureeMinutes: 98 };
    await controleur.creerFilm(programmeur, film);
    await controleur.modifierFilm(programmeur, 4, { genre: 'Musical' });
    await controleur.changerStatutFilm(programmeur, 4, { statut: 'PUBLIE' });
    await controleur.supprimerFilm(programmeur, 4);
    expect(service.creerFilm).toHaveBeenCalledWith(3, film);
    expect(service.modifierFilm).toHaveBeenCalledWith(3, 4, { genre: 'Musical' });
    expect(service.changerStatutFilm).toHaveBeenCalledWith(3, 4, { statut: 'PUBLIE' });
    expect(service.supprimerFilm).toHaveBeenCalledWith(3, 4);
  });

  it('transmet l’auteur de chaque modification de séance', async () => {
    const seance = { filmId: 1, salleId: 2, debut: '2027-03-28T19:00:00Z' };
    await controleur.creerSeance(programmeur, seance);
    await controleur.modifierSeance(programmeur, 7, { version: 'VO' });
    await controleur.changerStatutSeance(programmeur, 7, { statut: 'PUBLIEE' });
    await controleur.annulerSeance(programmeur, 7);
    await controleur.supprimerSeance(programmeur, 7);
    expect(service.creerSeance).toHaveBeenCalledWith(3, seance);
    expect(service.modifierSeance).toHaveBeenCalledWith(3, 7, { version: 'VO' });
    expect(service.changerStatutSeance).toHaveBeenCalledWith(3, 7, { statut: 'PUBLIEE' });
    expect(service.annulerSeance).toHaveBeenCalledWith(3, 7);
    expect(service.supprimerSeance).toHaveBeenCalledWith(3, 7);
  });
});
