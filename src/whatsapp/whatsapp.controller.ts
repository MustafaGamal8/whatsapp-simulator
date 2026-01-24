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
import { BulkMessageDto, BulkMessageWithImageDto } from './dto/bulk-message.dto';
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

  @Post('send-bulk')
  async sendBulkMessage(
    @UserId() userId: string,
    @Body() bulkMessageDto: BulkMessageDto,
    @Res() res: Response,
    @Req() req
  ) {
    try {
      if (!bulkMessageDto.numbers || bulkMessageDto.numbers.trim() === '') {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: 'Phone numbers are required',
          example: '+961 3 578 883, +961 3 878 532, +961 3 655 593'
        });
      }

      if (!bulkMessageDto.message || bulkMessageDto.message.trim() === '') {
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

      // Process and clean phone numbers
      const phoneNumbers = this.processPhoneNumbers(bulkMessageDto.numbers);

      if (phoneNumbers.length === 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: 'No valid phone numbers found',
          hint: 'Please provide phone numbers in format: +country_code number (e.g., +961 3 578 883)'
        });
      }

      // Calculate estimated time
      const estimatedTimeSeconds = Math.ceil((phoneNumbers.length * (bulkMessageDto.delayMs || 1000)) / 1000);

      // If operation will take longer than 5 minutes, warn the user
      if (estimatedTimeSeconds > 300) {
        // Set a longer timeout for this specific request
        req.setTimeout(estimatedTimeSeconds * 1000 + 60000); // Add 1 minute buffer
        res.setTimeout(estimatedTimeSeconds * 1000 + 60000);
      }

      // Send immediate response for large bulk operations
      if (phoneNumbers.length > 20) {
        res.status(HttpStatus.ACCEPTED).json({
          message: 'Bulk message operation started',
          totalNumbers: phoneNumbers.length,
          estimatedTimeSeconds,
          note: 'This operation is running in the background. Check server logs for progress.'
        });

        // Process in background
        this.processBulkMessagesAsync(client, phoneNumbers, bulkMessageDto.message, bulkMessageDto.delayMs || 1000);
        return;
      }

      // Send messages to all unique numbers (for smaller batches)
      const results = await this.whatsappService.sendBulkMessages(
        client,
        phoneNumbers,
        bulkMessageDto.message,
        bulkMessageDto.delayMs || 1000 // Default 1 second delay between messages
      ); const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      res.status(HttpStatus.OK).json({
        message: 'Bulk message sending completed',
        totalNumbers: phoneNumbers.length,
        uniqueNumbers: phoneNumbers.length,
        successCount,
        failureCount,
        results: results.map(r => ({
          number: r.number,
          success: r.success,
          messageId: r.messageId,
          error: r.error
        }))
      });

    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: `Failed to send bulk messages: ${error.message}`,
        error: error.message
      });
    }
  }

  @Post('send-bulk-image')
  @UseInterceptors(
    FileInterceptor('image', { storage: storage.image })
  )
  async sendBulkMessageWithImage(
    @UserId() userId: string,
    @UploadedFile() image,
    @Body() bulkMessageDto: BulkMessageWithImageDto,
    @Res() res: Response,
    @Req() req
  ) {
    try {
      if (!bulkMessageDto.numbers || bulkMessageDto.numbers.trim() === '') {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: 'Phone numbers are required',
          example: '+961 3 578 883, +961 3 878 532, +961 3 655 593'
        });
      }

      if (!bulkMessageDto.message || bulkMessageDto.message.trim() === '') {
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

      // Process and clean phone numbers
      const phoneNumbers = this.processPhoneNumbers(bulkMessageDto.numbers);

      if (phoneNumbers.length === 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: 'No valid phone numbers found',
          hint: 'Please provide phone numbers in format: +country_code number (e.g., +961 3 578 883)'
        });
      }

      // Calculate estimated time
      const estimatedTimeSeconds = Math.ceil((phoneNumbers.length * (bulkMessageDto.delayMs || 1000)) / 1000);

      // If operation will take longer than 5 minutes, set longer timeout
      if (estimatedTimeSeconds > 300) {
        req.setTimeout(estimatedTimeSeconds * 1000 + 60000); // Add 1 minute buffer
        res.setTimeout(estimatedTimeSeconds * 1000 + 60000);
      }

      // Send immediate response for large bulk operations with images
      if (phoneNumbers.length > 15) { // Lower threshold for images as they take longer
        res.status(HttpStatus.ACCEPTED).json({
          message: image ? 'Bulk image message operation started' : 'Bulk message operation started',
          totalNumbers: phoneNumbers.length,
          estimatedTimeSeconds,
          hasImage: !!image,
          note: 'This operation is running in the background. Check server logs for progress.'
        });

        // Process in background
        if (image) {
          const imagePath = path.join(process.cwd(), image.path);
          this.processBulkMessagesWithImageAsync(client, phoneNumbers, imagePath, bulkMessageDto.message, bulkMessageDto.delayMs || 1000);
        } else {
          this.processBulkMessagesAsync(client, phoneNumbers, bulkMessageDto.message, bulkMessageDto.delayMs || 1000);
        }
        return;
      }

      let results;

      if (image) {
        // Send image with caption to all numbers
        const imagePath = path.join(process.cwd(), image.path);
        results = await this.whatsappService.sendBulkMessagesWithImage(
          client,
          phoneNumbers,
          imagePath,
          bulkMessageDto.message, // This will be used as caption
          bulkMessageDto.delayMs || 1000
        );
      } else {
        // Send text message only
        results = await this.whatsappService.sendBulkMessages(
          client,
          phoneNumbers,
          bulkMessageDto.message,
          bulkMessageDto.delayMs || 1000
        );
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      res.status(HttpStatus.OK).json({
        message: image ? 'Bulk image message sending completed' : 'Bulk message sending completed',
        totalNumbers: phoneNumbers.length,
        uniqueNumbers: phoneNumbers.length,
        successCount,
        failureCount,
        hasImage: !!image,
        results: results.map(r => ({
          number: r.number,
          success: r.success,
          messageId: r.messageId,
          error: r.error
        }))
      });

    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: `Failed to send bulk messages: ${error.message}`,
        error: error.message
      });
    }
  }

  /**
   * Process bulk messages asynchronously for large batches
   */
  private async processBulkMessagesAsync(
    client: any,
    phoneNumbers: string[],
    message: string,
    delayMs: number
  ) {
    try {
      console.log(`Starting background bulk message processing for ${phoneNumbers.length} numbers`);
      const results = await this.whatsappService.sendBulkMessages(client, phoneNumbers, message, delayMs);

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      console.log(`Bulk message processing completed: ${successCount} successful, ${failureCount} failed`);
    } catch (error) {
      console.error(`Background bulk message processing failed: ${error.message}`);
    }
  }

  /**
   * Process bulk messages with images asynchronously for large batches
   */
  private async processBulkMessagesWithImageAsync(
    client: any,
    phoneNumbers: string[],
    imagePath: string,
    caption: string,
    delayMs: number
  ) {
    try {
      console.log(`Starting background bulk image message processing for ${phoneNumbers.length} numbers`);
      const results = await this.whatsappService.sendBulkMessagesWithImage(client, phoneNumbers, imagePath, caption, delayMs);

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      console.log(`Bulk image message processing completed: ${successCount} successful, ${failureCount} failed`);
    } catch (error) {
      console.error(`Background bulk image message processing failed: ${error.message}`);
    }
  }

  /**
   * Helper function to process phone numbers string
   * Removes duplicates, cleans formatting, and validates numbers
   * Supports international numbers with different country codes
   */
  private processPhoneNumbers(numbersString: string): string[] {
    // Split by comma and clean each number
    const numbers = numbersString
      .split(',')
      .map(num => num.trim())
      .filter(num => num.length > 0)
      .map(num => {
        // Remove all spaces, dashes, parentheses, but keep the + initially for country code detection
        let cleaned = num.replace(/[\s\-\(\)]/g, '');

        // If it starts with +, remove the + and keep the country code
        if (cleaned.startsWith('+')) {
          cleaned = cleaned.substring(1);
        }

        // If it's a Lebanese number without country code, add 961
        // Lebanese mobile numbers typically start with 3, 70, 71, 76, 78, 79, 81
        if (!this.hasCountryCode(cleaned)) {
          // Check if it looks like a Lebanese mobile number
          if (/^[37]/.test(cleaned)) {
            cleaned = '961' + cleaned;
          }
          // If it doesn't look like Lebanese, assume it needs a country code
          // In this case, we'll keep it as is and let validation handle it
        }

        return cleaned;
      })
      .filter(num => {
        // Basic validation: should be 9-15 digits and have a valid country code
        return /^\d{9,15}$/.test(num) && this.hasCountryCode(num);
      });

    // Remove duplicates using Set
    const uniqueNumbers = [...new Set(numbers)];

    // Convert to WhatsApp format (add @c.us suffix)
    return uniqueNumbers.map(num => `${num}@c.us`);
  }

  /**
   * Helper function to check if a number already has a country code
   */
  private hasCountryCode(number: string): boolean {
    // Common country codes (not exhaustive, but covers major ones)
    const countryCodes = [
      '1',    // US/Canada
      '20',   // Egypt
      '33',   // France
      '39',   // Italy
      '44',   // UK
      '49',   // Germany
      '52',   // Mexico
      '55',   // Brazil
      '60',   // Malaysia
      '61',   // Australia
      '62',   // Indonesia
      '63',   // Philippines
      '65',   // Singapore
      '66',   // Thailand
      '81',   // Japan
      '82',   // South Korea
      '84',   // Vietnam
      '86',   // China
      '90',   // Turkey
      '91',   // India
      '92',   // Pakistan
      '93',   // Afghanistan
      '94',   // Sri Lanka
      '95',   // Myanmar
      '98',   // Iran
      '212',  // Morocco
      '213',  // Algeria
      '216',  // Tunisia
      '218',  // Libya
      '220',  // Gambia
      '221',  // Senegal
      '222',  // Mauritania
      '223',  // Mali
      '224',  // Guinea
      '225',  // Ivory Coast
      '226',  // Burkina Faso
      '227',  // Niger
      '228',  // Togo
      '229',  // Benin
      '230',  // Mauritius
      '231',  // Liberia
      '232',  // Sierra Leone
      '233',  // Ghana
      '234',  // Nigeria
      '235',  // Chad
      '236',  // Central African Republic
      '237',  // Cameroon
      '238',  // Cape Verde
      '239',  // Sao Tome and Principe
      '240',  // Equatorial Guinea
      '241',  // Gabon
      '242',  // Republic of the Congo
      '243',  // Democratic Republic of the Congo
      '244',  // Angola
      '245',  // Guinea-Bissau
      '246',  // British Indian Ocean Territory
      '248',  // Seychelles
      '249',  // Sudan
      '250',  // Rwanda
      '251',  // Ethiopia
      '252',  // Somalia
      '253',  // Djibouti
      '254',  // Kenya
      '255',  // Tanzania
      '256',  // Uganda
      '257',  // Burundi
      '258',  // Mozambique
      '260',  // Zambia
      '261',  // Madagascar
      '262',  // Reunion/Mayotte
      '263',  // Zimbabwe
      '264',  // Namibia
      '265',  // Malawi
      '266',  // Lesotho
      '267',  // Botswana
      '268',  // Swaziland
      '269',  // Comoros
      '290',  // Saint Helena
      '291',  // Eritrea
      '297',  // Aruba
      '298',  // Faroe Islands
      '299',  // Greenland
      '350',  // Gibraltar
      '351',  // Portugal
      '352',  // Luxembourg
      '353',  // Ireland
      '354',  // Iceland
      '355',  // Albania
      '356',  // Malta
      '357',  // Cyprus
      '358',  // Finland
      '359',  // Bulgaria
      '370',  // Lithuania
      '371',  // Latvia
      '372',  // Estonia
      '373',  // Moldova
      '374',  // Armenia
      '375',  // Belarus
      '376',  // Andorra
      '377',  // Monaco
      '378',  // San Marino
      '380',  // Ukraine
      '381',  // Serbia
      '382',  // Montenegro
      '383',  // Kosovo
      '385',  // Croatia
      '386',  // Slovenia
      '387',  // Bosnia and Herzegovina
      '389',  // Macedonia
      '420',  // Czech Republic
      '421',  // Slovakia
      '423',  // Liechtenstein
      '500',  // Falkland Islands
      '501',  // Belize
      '502',  // Guatemala
      '503',  // El Salvador
      '504',  // Honduras
      '505',  // Nicaragua
      '506',  // Costa Rica
      '507',  // Panama
      '508',  // Saint Pierre and Miquelon
      '509',  // Haiti
      '590',  // Guadeloupe
      '591',  // Bolivia
      '592',  // Guyana
      '593',  // Ecuador
      '594',  // French Guiana
      '595',  // Paraguay
      '596',  // Martinique
      '597',  // Suriname
      '598',  // Uruguay
      '599',  // Netherlands Antilles
      '670',  // East Timor
      '672',  // Australian Antarctic Territory
      '673',  // Brunei
      '674',  // Nauru
      '675',  // Papua New Guinea
      '676',  // Tonga
      '677',  // Solomon Islands
      '678',  // Vanuatu
      '679',  // Fiji
      '680',  // Palau
      '681',  // Wallis and Futuna
      '682',  // Cook Islands
      '683',  // Niue
      '684',  // American Samoa
      '685',  // Samoa
      '686',  // Kiribati
      '687',  // New Caledonia
      '688',  // Tuvalu
      '689',  // French Polynesia
      '690',  // Tokelau
      '691',  // Micronesia
      '692',  // Marshall Islands
      '850',  // North Korea
      '852',  // Hong Kong
      '853',  // Macau
      '855',  // Cambodia
      '856',  // Laos
      '880',  // Bangladesh
      '886',  // Taiwan
      '960',  // Maldives
      '961',  // Lebanon
      '962',  // Jordan
      '963',  // Syria
      '964',  // Iraq
      '965',  // Kuwait
      '966',  // Saudi Arabia
      '967',  // Yemen
      '968',  // Oman
      '970',  // Palestine
      '971',  // United Arab Emirates
      '972',  // Israel
      '973',  // Bahrain
      '974',  // Qatar
      '975',  // Bhutan
      '976',  // Mongolia
      '977',  // Nepal
      '992',  // Tajikistan
      '993',  // Turkmenistan
      '994',  // Azerbaijan
      '995',  // Georgia
      '996',  // Kyrgyzstan
      '998'   // Uzbekistan
    ];

    // Check if the number starts with any of these country codes
    return countryCodes.some(code => number.startsWith(code));
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
