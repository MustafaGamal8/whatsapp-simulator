import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAuthMiddleware } from './middleware/whatsapp-auth.middleware';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, ConfigModule],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    }
  ],
})
export class WhatsappModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WhatsappAuthMiddleware)
      .exclude(
        { path: 'whatsapp/:userId/init', method: RequestMethod.POST },
        { path: 'whatsapp/:userId/qr', method: RequestMethod.GET },
      )
      .forRoutes('whatsapp/:userId/*');
  }
}