import { Controller, Get, Post, Delete, Body, Res, HttpStatus, Req, Param } from '@nestjs/common';
import { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { SendMessageDto } from './dto/message.dto';
import { UserId } from './decorators/user-id.decorator';

@Controller('whatsapp/:userId')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) { }

  @Post('init')
  async initialize(@UserId() userId: string, @Res() res: Response) {
    await this.whatsappService.initialize(userId);
    const qrCode = await this.whatsappService.getQrCode(userId);
    if (!qrCode) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'QR code not found or client is already initialized' });
    }
    const img = Buffer.from(qrCode.split(',')[1], 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.send(img);
  }

  @Get('reinitialize')
  async getQrCode(@UserId() userId: string, @Res() res: Response) {
    const qrCode = await this.whatsappService.reinitialize(userId);
    if (!qrCode) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'QR code not found' });
    }
    const img = Buffer.from(qrCode.split(',')[1], 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.send(img);
  }

  @Get('status')
  async getStatus(@UserId() userId: string, @Res() res: Response, @Req() req) {
    const status = await this.whatsappService.getClientStatus(req['client']);
    res.status(HttpStatus.OK).json(status);
  }

  @Post('send')
  async sendMessage(
    @UserId() userId: string,
    @Body() messageDto: SendMessageDto,
    @Res() res: Response,
    @Req() req
  ) {
    const result = await this.whatsappService.sendMessage(req['client'], messageDto.to, messageDto.message);
    res.status(HttpStatus.OK).json(result);
  }

  // **New Routes**

  @Post('stop')
  async stopSession(@UserId() userId: string, @Res() res: Response) {
    await this.whatsappService.stopSession(userId);
    res.status(HttpStatus.OK).json({ message: 'Session stopped successfully' });
  }

  @Post('restart')
  async restartSession(@UserId() userId: string, @Res() res: Response) {
    await this.whatsappService.restartSession(userId);
    res.status(HttpStatus.OK).json({ message: 'Session restarted successfully' });
  }

  @Delete('delete')
  async deleteSession(@UserId() userId: string, @Res() res: Response) {
    await this.whatsappService.deleteSession(userId);
    res.status(HttpStatus.OK).json({ message: 'Session deleted successfully' });
  }
}
