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
  async getQrCode(@UserId() userId: string, @Res() res: Response, @Req() req) {
    const qrCode = await this.whatsappService.reinitialize(userId);
    if (!qrCode) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'QR code not found' });
    }
    if (req.query.type === 'preview') {
      const img = Buffer.from(qrCode.split(',')[1], 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.send(img);
    } else {
      res.send(qrCode);
    }
  }

  @Get('status')
  async getStatus(@UserId() userId: string, @Res() res: Response, @Req() req) {
    try {
      const status = await this.whatsappService.getClientStatus(userId);
      res.status(HttpStatus.OK).json(status);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
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
          example: '1234567890@c.us or just 1234567890 for individual, 1234567890@g.us for group'
        });
      }

      if (!messageDto.message) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: 'Message content is required'
        });
      }

      const client = req['client'];
      if (!client) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          message: 'WhatsApp client is not available',
          status: 'NOT_READY'
        });
      }

      let result = await this.whatsappService.sendMessage(client, messageDto.to, messageDto.message);

      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: `Failed to send message: ${error.message}`,
        hint: error.message.includes('wid error') ? 'Make sure the recipient is in the correct format: countrycode+number (e.g., 1234567890) or countrycode+number@c.us (e.g., 1234567890@c.us) for individual, or group ID with @g.us suffix for groups' : undefined,
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
          example: '1234567890@c.us or just 1234567890 for individual, 1234567890@g.us for group'
        });
      }

      const client = req['client'];
      if (!client) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          message: 'WhatsApp client is not available',
          status: 'NOT_READY'
        });
      }

      const caption = fileUploadDto.caption || '';
      const filePath = path.join(process.cwd(), file.path);

      const result = await this.whatsappService.sendTemporaryFile(
        client,
        fileUploadDto.to.trim(),
        filePath,
        caption
      );

      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: `Failed to send file: ${error.message}`,
        hint: error.message.includes('wid error') ? 'Make sure the recipient is in the correct format: countrycode+number (e.g., 1234567890) or countrycode+number@c.us (e.g., 1234567890@c.us) for individual, or group ID with @g.us suffix for groups' : undefined,
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

  // **Group Routes**

  @Get('groups')
  async getGroups(@UserId() userId: string, @Res() res: Response, @Req() req) {
    try {
      const { query } = req.query;
      const client = req['client'];

      if (!client) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          message: 'WhatsApp client is not available',
          status: 'NOT_READY'
        });
      }

      let groups;
      if (query && typeof query === 'string') {
        // Search groups by query
        groups = await this.whatsappService.searchGroups(client, query);
      } else {
        // Get all groups
        groups = await this.whatsappService.getGroups(client);
      }

      res.status(HttpStatus.OK).json(groups);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: `Failed to get groups: ${error.message}`,
        error: error.message
      });
    }
  }

  /**
   * Get messages from a group
   * Params:
   *   - groupId: string (required)
   *   - sen: string (optional, sender id)
   *   - limit: number (optional, default 10)
   *   - includeMedia: boolean (optional, include all media types)
   *   - includeImages: boolean (optional, include image URLs)
   *   - includeVideos: boolean (optional, include video URLs)
   *   - includeAudio: boolean (optional, include audio/voice URLs)
   * Note: Media files are temporary and will be deleted after 1 hour
   */
  @Get('groups/:groupId/messages')
  async getGroupMessages(
    @UserId() userId: string,
    @Param('groupId') groupId: string,
    @Req() req,
    @Res() res: Response
  ) {
    try {
      const client = req['client'];
      if (!client) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          message: 'WhatsApp client is not available',
          status: 'NOT_READY'
        });
      }

      const sender = req.query.sen as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const includeMedia = req.query.includeMedia === 'true' || false;
      const includeImages = req.query.includeImages === 'true' || false;
      const includeVideos = req.query.includeVideos === 'true' || false;
      const includeAudio = req.query.includeAudio === 'true' || false;

      // Fetch messages from service
      let messages = await this.whatsappService.getGroupMessages(client, groupId, limit, {
        includeMedia,
        includeImages,
        includeVideos,
        includeAudio
      });

      if (sender) {
        messages = messages.filter(m => m.sender === sender);
      }

      res.status(HttpStatus.OK).json(messages);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: `Failed to get group messages: ${error.message}`,
        error: error.message
      });
    }
  }


}
