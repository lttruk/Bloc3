import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurerApplication } from './configuration-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurerApplication(app);
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

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
