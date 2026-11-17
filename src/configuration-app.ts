import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

/** Configuration commune à l'application et aux tests de bout en bout. */
export function configurerApplication(app: INestApplication): void {
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
