import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { WhatsappService } from '../whatsapp.service';

@Injectable()
export class WhatsappAuthMiddleware implements NestMiddleware {
  constructor(private whatsappService: WhatsappService) { }

  async use(req: Request, res: Response, next: NextFunction) {

    try {
      const userId = req.params.userId;
      if (!userId) {
        throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
      }

      const user = await this.whatsappService.validateUser(userId);
      if (!user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      try {
        const client = await this.whatsappService.ensureClientInitialized(userId);
        req['client'] = client;
        req['userId'] = userId; // Store userId in request for easy access
        next();
      } catch (error) {
        if (error.status === HttpStatus.REQUEST_TIMEOUT) {
          throw new HttpException('Client initialization timeout', HttpStatus.REQUEST_TIMEOUT);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof HttpException) {
        return res.status(error.getStatus()).json({
          statusCode: error.getStatus(),
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  }
}

