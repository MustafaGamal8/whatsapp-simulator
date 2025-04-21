import { Controller, Get, Post, Delete, Body, Res, HttpStatus, Req, Param, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { WhatsappService } from './whatsapp.service';
import { SendMessageDto } from './dto/message.dto';
import { SendFileMessageDto, FileUploadDto } from './dto/file-message.dto';
import { UserId } from './decorators/user-id.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Helper function to handle file uploads with unique names
const storage = {
  file: diskStorage({
    destination: './uploads/files',
    filename: (req, file, cb) => {
      const filename = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, filename);
    },
  }),
  image: diskStorage({
    destination: './uploads/images',
    filename: (req, file, cb) => {
      const filename = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, filename);
    },
  }),
};

@Controller('whatsapp/:userId')
@UseGuards(ApiKeyGuard)
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
    try {
      if (!messageDto.to) {
        return res.status(HttpStatus.BAD_REQUEST).json({ 
          message: 'Recipient (to) is required',
          example: '1234567890@c.us or just 1234567890'
        });
      }

      if (!messageDto.message) {
        return res.status(HttpStatus.BAD_REQUEST).json({ 
          message: 'Message content is required'
        });
      }

      const result = await this.whatsappService.sendMessage(req['client'], messageDto.to, messageDto.message);
      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
        message: `Failed to send message: ${error.message}`,
        hint: error.message.includes('wid error') ? 'Make sure the phone number is in the format: countrycode+number (e.g., 1234567890) or countrycode+number@c.us (e.g., 1234567890@c.us)' : undefined,
        error: error.message
      });
    }
  }

  @Post('send-file')
  @UseInterceptors(
    FileInterceptor('file', { storage: storage.file })
  )
  async uploadAndSendFile(
    @UserId() userId: string,
    @UploadedFile() file,
    @Body() fileUploadDto: FileUploadDto,
    @Res() res: Response,
    @Req() req
  ) {
    try {
      if (!file) {
        return res.status(HttpStatus.BAD_REQUEST).json({ message: 'No file uploaded' });
      }

      if (!fileUploadDto.to || fileUploadDto.to.trim() === '') {
        return res.status(HttpStatus.BAD_REQUEST).json({ 
          message: 'Recipient (to) is required',
          example: '1234567890@c.us or just 1234567890'
        });
      }

      const caption = fileUploadDto.caption || '';
      const filePath = path.join(process.cwd(), file.path);
      
      // Use the service method that handles sending and cleanup
      const result = await this.whatsappService.sendTemporaryFile(
        req['client'],
        fileUploadDto.to.trim(),
        filePath,
        caption
      );

      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
        message: `Failed to send file: ${error.message}`,
        hint: error.message.includes('wid error') ? 'Make sure the phone number is in the format: countrycode+number (e.g., 1234567890) or countrycode+number@c.us (e.g., 1234567890@c.us)' : undefined,
        error: error.message 
      });
    }
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
