import { Controller, Get, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) { }

  /**
   * Serve temporary media files
   */
  @Get(':type/:filename')
  async serveMedia(
    @Param('type') type: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ) {
    try {
      const result = await this.mediaService.serveMediaFile(type, filename);

      if (!result) {
        return res.status(HttpStatus.NOT_FOUND).json({
          message: 'File not found or expired'
        });
      }

      // Set headers
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Stream the file
      result.fileStream.pipe(res);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: `Failed to serve media: ${error.message}`,
        error: error.message
      });
    }
  }
}
