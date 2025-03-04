import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [WhatsappModule,  UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
