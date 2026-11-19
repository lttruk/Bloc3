import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { dirname, join } from 'node:path';
import { AppModule } from './app.module';
import { configurerApplication } from './configuration-app';

async function bootstrap(): Promise<void> {
  // rawBody : corps brut conservé pour vérifier la signature des notifications Stripe
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configurerApplication(app);
  // Derrière le proxy de l'hébergeur : l'adresse du client (limitation de débit, journal des
  // connexions) est lue dans l'en-tête X-Forwarded-For posé par ce seul proxy.
  app.set('trust proxy', 1);
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

  // Site web de réservation (HTML, CSS et JavaScript statiques) servi par l'API elle-même
  app.useStaticAssets(join(__dirname, '..', 'public'));
  // Décodeur de QR code utilisé par l'écran de contrôle (US-6.1), servi depuis node_modules
  app.useStaticAssets(dirname(require.resolve('jsqr')), { prefix: '/vendor/jsqr/' });

  const config = new DocumentBuilder()
    .setTitle('Le Grand Cinéma – API')
    .setDescription('Consultation des séances, réservation et billetterie')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
