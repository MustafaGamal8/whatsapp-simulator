import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  const apiKeyConfigured = !!process.env.API_KEY;

  // Enable CORS for frontend requests
  app.enableCors();

  // Get the underlying HTTP server and increase timeout for bulk operations
  const server = app.getHttpServer();
  server.timeout = 10 * 60 * 1000; // 10 minutes timeout
  server.keepAliveTimeout = 5 * 60 * 1000; // 5 minutes keep-alive
  server.headersTimeout = 5 * 60 * 1000 + 1000; // Slightly more than keep-alive

  await app.listen(port).then(() => {
    console.log(`Server running on port http://localhost:${port}`);
    console.log(`API Key protection: ${apiKeyConfigured ? 'Enabled' : 'Disabled'}`);
    console.log(`Server timeout: ${server.timeout / 1000} seconds`);
  });
}
bootstrap();
