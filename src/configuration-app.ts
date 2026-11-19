import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export const LECTEURS_VIDEO = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'];

/** Configuration commune à l'application et aux tests de bout en bout. */
export function configurerApplication(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Seuls lecteurs vidéo autorisés à s'afficher dans la fiche film (bande-annonce, US-1.2)
          'frame-src': ["'self'", ...LECTEURS_VIDEO],
        },
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
