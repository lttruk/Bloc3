import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = { getOrThrow: () => 'secret-de-test' } as unknown as ConfigService;

  it("transforme le contenu du jeton en utilisateur courant", () => {
    const strategie = new JwtStrategy(config);
    expect(strategie.validate({ sub: 7, role: 'CLIENT' })).toEqual({ id: 7, role: 'CLIENT' });
  });
});
