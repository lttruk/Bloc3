import { SanteController } from './sante.controller';

describe('SanteController', () => {
  it("indique que l'API répond", () => {
    const reponse = new SanteController().verifier();
    expect(reponse.statut).toBe('ok');
    expect(Number.isNaN(Date.parse(reponse.horodatage))).toBe(false);
  });
});
