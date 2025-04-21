import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  const apiKeyConfigured = !!process.env.API_KEY;
  
  await app.listen(port).then(() => {
    console.log(`Server running on port http://localhost:${port}`);
    console.log(`API Key protection: ${apiKeyConfigured ? 'Enabled' : 'Disabled'}`);
  });
}
bootstrap();
