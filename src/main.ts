import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { configurerApplication } from './configuration-app';

async function bootstrap(): Promise<void> {
  // rawBody : corps brut conservé pour vérifier la signature des notifications Stripe
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configurerApplication(app);
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

  // Site web de réservation (HTML, CSS et JavaScript statiques) servi par l'API elle-même
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const config = new DocumentBuilder()
    .setTitle('La Grande Cinéma – API')
    .setDescription('Consultation des séances, réservation et billetterie')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
