import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/configuration-app';

describe('GET /sante (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configurerApplication(app);
    await app.init();
  });

  afterAll(() => app.close());

  it("répond 200 avec le statut de l'API", async () => {
    const reponse = await request(app.getHttpServer()).get('/sante').expect(200);
    expect(reponse.body.statut).toBe('ok');
  });
});
