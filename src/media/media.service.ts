import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  async serveMediaFile(type: string, filename: string) {
    try {
      const allowedTypes = ['images', 'files'];
      if (!allowedTypes.includes(type)) {
        throw new Error('Invalid media type');
      }

      const filePath = path.join(process.cwd(), 'uploads/temp', type, filename);

      if (!fs.existsSync(filePath)) {
        return null; // File not found
      }

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.aac': 'audio/aac'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      const fileStream = fs.createReadStream(filePath);

      return {
        contentType,
        fileStream
      };
    } catch (error) {
      this.logger.error(`Failed to serve media file: ${error.message}`);
      throw error;
    }
  }
}
