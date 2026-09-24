import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validateProductionEnv } from './config/validate-env';

async function bootstrap() {
  validateProductionEnv();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  // Behind Caddy/Nginx TLS terminator
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');

  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigin?.length ? corsOrigin : ['http://localhost:3000'],
    credentials: true,
  });

  const enableSwagger =
    process.env.ENABLE_SWAGGER === 'true' || process.env.NODE_ENV !== 'production';
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('Orvient API')
      .setDescription('Orvient — Inventory, Invoice & POS API — Distrofy Enterprises (distrofyent.com)')
      .setVersion('1.0')
      .setContact('Distrofy Enterprises', 'https://distrofyent.com', 'hello@distrofyent.com')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0');
}

bootstrap();
