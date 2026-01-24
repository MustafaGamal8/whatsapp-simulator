import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { Buttons, Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly SESSION_DIR = './data/.wwebjs_auth';
  private readonly TIMEOUT_SECONDS = 300; // Increase timeout to 5 minutes for QR scanning
  private readonly STATES = {
    CONNECTED: 'CONNECTED',
    PENDING: 'PENDING',
    DISCONNECTED: 'DISCONNECTED',
    INITIALIZING: 'INITIALIZING'
  };

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService
  ) { }

  private qrCodes = new Map<string, string | null>();
  private clients = new Map<string, Client>();
  private clientStates = new Map<string, string>();

  private validateUserId(userId: any): string {
    if (!userId) {
      throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }

    // Handle object case
    if (typeof userId === 'object') {
      const possibleId = userId.id || userId.userId || userId.user_id;
      if (possibleId) {
        return String(possibleId);
      }
      if (userId.params?.id) {
        return String(userId.params.id);
      }
      if (userId.body?.id) {
        return String(userId.body.id);
      }
      throw new HttpException('Invalid user ID format', HttpStatus.BAD_REQUEST);
    }

    // Handle string/number case
    if (typeof userId === 'string' || typeof userId === 'number') {
      return String(userId);
    }

    throw new HttpException('Invalid user ID type', HttpStatus.BAD_REQUEST);
  }

  async onModuleInit() {
    try {
      if (!fs.existsSync(this.SESSION_DIR)) {
        fs.mkdirSync(this.SESSION_DIR, { recursive: true });
      }
    } catch (error) {
      this.logger.error(`Failed to create session directory: ${error.message}`);
      throw new HttpException('Service initialization failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async initialize(userId: any) {
    const validUserId = this.validateUserId(userId);

    if (!await this.validateUser(validUserId)) {
      throw new HttpException('Invalid user ID', HttpStatus.BAD_REQUEST);
    }



    // If client exists and is in a valid state, return current QR code
    if (this.clients.has(validUserId)) {
      const state = this.clientStates.get(validUserId);
      if (state === this.STATES.PENDING) {
        return this.qrCodes.get(validUserId);
      }
      if (state === this.STATES.CONNECTED) {
        return null;
      }
    }

    try {
      this.clientStates.set(validUserId, this.STATES.INITIALIZING);
      const client = this.createClient(validUserId);
      this.clients.set(validUserId, client);
      await this.setupClient(client, validUserId);
      return this.qrCodes.get(validUserId);
    } catch (error) {
      this.cleanup(validUserId);
      throw new HttpException(
        `Failed to initialize WhatsApp client: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private createClient(userId: string): Client {
    return new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: this.SESSION_DIR
      }),
      puppeteer: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        headless: true,
        timeout: 60000
      }
    });
  }

  private async setupClient(client: Client, userId: string) {
    let initializationTimeout: NodeJS.Timeout;

    const timeoutPromise = new Promise((_, reject) => {
      initializationTimeout = setTimeout(() => {
        reject(new Error('Client initialization timeout'));
      }, 60000);
    });

    try {
      client.on('qr', async (qr) => {
        try {
          const url = await qrcode.toDataURL(qr);
          this.qrCodes.set(userId, url);
          this.clientStates.set(userId, this.STATES.PENDING);
        } catch (error) {
          this.logger.error(`Failed to generate QR code: ${error.message}`);
        }
      });

      client.on('ready', () => {
        this.qrCodes.set(userId, null);
        this.clientStates.set(userId, this.STATES.CONNECTED);
        clearTimeout(initializationTimeout);
      });

      client.on('auth_failure', (msg) => {
        this.logger.error(`Authentication failed: ${msg}`);
        this.cleanup(userId);
        clearTimeout(initializationTimeout);
      });

      client.on('disconnected', (reason) => {
        this.clientStates.set(userId, this.STATES.DISCONNECTED);
        clearTimeout(initializationTimeout);
      });

      await Promise.race([
        client.initialize(),
        timeoutPromise
      ]);

      this.clients.set(userId, client);
    } catch (error) {
      this.cleanup(userId);
      throw error;
    } finally {
      clearTimeout(initializationTimeout);
    }
  }

  async stopSession(userId: string) {
    const client = this.clients.get(userId);
    if (!client) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    // Disconnect the client instead of logging out (keeps session data)
    await client.destroy();
    this.clientStates.set(userId, this.STATES.DISCONNECTED);

  }



  async restartSession(userId: string) {
    await this.stopSession(userId);
    return this.initialize(userId);
  }

  async deleteSession(userId: string) {
    this.stopSession(userId);
    const sessionPath = path.join(this.SESSION_DIR, `session-${userId}`);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      this.logger.log(`Deleted session files for user ${userId}`);
    }
  }

  /**
   * Validates and formats a phone number for WhatsApp
   * @param to The phone number to validate/format
   * @returns Properly formatted WhatsApp ID
   */
  private formatWhatsAppId(to: string): string {
    // Check if phone number is undefined or null
    if (!to) {
      throw new Error('Phone number is required and cannot be null or undefined');
    }

    // Make sure 'to' is a string
    const toStr = String(to);

    // If it already has the @c.us suffix, make sure there are no spaces or special characters in the number
    if (toStr.includes('@c.us')) {
      const cleanNumber = toStr.split('@')[0].replace(/\D/g, '');
      return `${cleanNumber}@c.us`;
    }

    // Otherwise, clean up the number and add the suffix
    const cleanNumber = toStr.replace(/\D/g, '');

    if (!cleanNumber || cleanNumber.length < 10) {
      throw new Error('Invalid phone number format. Phone number must have at least 10 digits.');
    }

    return `${cleanNumber}@c.us`;
  }

  /**
   * Validates and formats a group ID for WhatsApp
   * @param groupId The group ID to validate/format
   * @returns Properly formatted group ID
   */
  private formatGroupId(groupId: string): string {
    // Check if group ID is undefined or null
    if (!groupId) {
      throw new Error('Group ID is required and cannot be null or undefined');
    }

    // Make sure groupId is a string
    const groupIdStr = String(groupId);

    // If it already has the @g.us suffix, make sure there are no spaces or special characters
    if (groupIdStr.includes('@g.us')) {
      const cleanId = groupIdStr.split('@')[0].replace(/\D/g, '');
      return `${cleanId}@g.us`;
    }

    // Otherwise, clean up the ID and add the suffix
    const cleanId = groupIdStr.replace(/\D/g, '');

    if (!cleanId || cleanId.length < 10) {
      throw new Error('Invalid group ID format. Group ID must have at least 10 digits.');
    }

    return `${cleanId}@g.us`;
  }

  async sendMessage(client: Client, to: string, message: string) {
    try {
      // Determine if this is a group or individual contact
      let formattedTo;
      let isGroup = false;

      if (to.includes('@g.us')) {
        // This is a group
        formattedTo = this.formatGroupId(to);
        isGroup = true;
      } else {
        // This is an individual contact
        formattedTo = this.formatWhatsAppId(to);
      }

      // Validate that the number exists before sending
      if (!isGroup) {
        try {
          const numberId = await client.getNumberId(formattedTo.replace('@c.us', ''));
          if (!numberId) {
            throw new Error(`The number ${formattedTo} is not registered on WhatsApp`);
          }
          // Use the validated number ID
          formattedTo = numberId._serialized;
        } catch (validationError) {
          // If getNumberId fails, try to send anyway but with better error message
          this.logger.warn(`Number validation failed for ${formattedTo}: ${validationError.message}`);
        }
      }

      const response = await client.sendMessage(formattedTo, message);

      if (isGroup) {
        // For groups, try to get group info for better response
        try {
          const chat = await client.getChatById(formattedTo);
          return {
            success: true,
            messageId: response.id.id,
            groupName: chat.name,
            groupId: formattedTo
          };
        } catch (chatError) {
          // If we can't get group info, still return success
          return {
            success: true,
            messageId: response.id.id,
            groupId: formattedTo
          };
        }
      } else {
        return { success: true, messageId: response.id.id };
      }
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`, error.stack);
      throw new HttpException(`Failed to send message: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async sendBulkMessages(
    client: Client,
    phoneNumbers: string[],
    message: string,
    delayMs: number = 1000
  ): Promise<Array<{
    number: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>> {
    const results = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        // Add delay between messages to avoid rate limiting
        if (results.length > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        const result = await this.sendMessage(client, phoneNumber, message);

        results.push({
          number: phoneNumber,
          success: true,
          messageId: result.messageId
        });

      } catch (error) {
        results.push({
          number: phoneNumber,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async sendBulkMessagesWithImage(
    client: Client,
    phoneNumbers: string[],
    imagePath: string,
    caption: string,
    delayMs: number = 1000
  ): Promise<Array<{
    number: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>> {
    const results = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        // Add delay between messages to avoid rate limiting
        if (results.length > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        const result = await this.sendFile(client, phoneNumber, imagePath, caption);

        results.push({
          number: phoneNumber,
          success: true,
          messageId: result.messageId
        });

      } catch (error) {
        results.push({
          number: phoneNumber,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async sendFile(client: Client, to: string, filePath: string, caption?: string) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Determine if this is a group or individual contact
      let formattedTo;
      let isGroup = false;

      if (to.includes('@g.us')) {
        // This is a group
        formattedTo = this.formatGroupId(to);
        isGroup = true;
      } else {
        // This is an individual contact
        formattedTo = this.formatWhatsAppId(to);
      }

      // Validate that the number exists before sending (only for individual contacts)
      if (!isGroup) {
        try {
          const numberId = await client.getNumberId(formattedTo.replace('@c.us', ''));
          if (!numberId) {
            throw new Error(`The number ${formattedTo} is not registered on WhatsApp`);
          }
          // Use the validated number ID
          formattedTo = numberId._serialized;
        } catch (validationError) {
          // If getNumberId fails, try to send anyway but with better error message
          this.logger.warn(`Number validation failed for ${formattedTo}: ${validationError.message}`);
        }
      }

      // Create message media from file
      const media = MessageMedia.fromFilePath(filePath);

      // Send media
      const response = await client.sendMessage(formattedTo, media, { caption });

      if (isGroup) {
        // For groups, try to get group info for better response
        try {
          const chat = await client.getChatById(formattedTo);
          return {
            success: true,
            messageId: response.id.id,
            groupName: chat.name,
            groupId: formattedTo
          };
        } catch (chatError) {
          // If we can't get group info, still return success
          return {
            success: true,
            messageId: response.id.id,
            groupId: formattedTo
          };
        }
      } else {
        return { success: true, messageId: response.id.id };
      }
    } catch (error) {
      this.logger.error(`Failed to send file: ${error.message}`, error.stack);
      throw new HttpException(`Failed to send file: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }



  async getClientStatus(userId: any) {
    try {
      const validUserId = this.validateUserId(userId);
      const client = this.clients.get(validUserId);
      const state = this.clientStates.get(validUserId);

      if (!client) {
        return { status: 'NOT_FOUND' };
      }

      if (!state) {
        return { status: 'UNKNOWN' };
      }

      if (state === this.STATES.PENDING) {
        const qrCode = this.qrCodes.get(validUserId);
        return {
          status: state,
          isConnected: false,
          message: 'Waiting for QR code scan'
        };
      }

      if (state === this.STATES.CONNECTED) {
        try {
          const whatsappState = await client.getState();
          return {
            status: state,
            whatsappState: whatsappState,
            isConnected: true
          };
        } catch (error) {
          return {
            status: 'ERROR',
            error: error.message
          };
        }
      }

      return {
        status: state,
        isConnected: state === this.STATES.CONNECTED
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get client status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getQrCode(userId: string): Promise<string | null> {
    if (this.qrCodes.has(userId)) {
      return this.qrCodes.get(userId);
    }
    return null;
  }
  async reinitialize(userId: string): Promise<string | null> {
    if (this.qrCodes.has(userId)) {
      const client = this.clients.get(userId);
      if (client) {
        await client.logout();
      }
      this.cleanup(userId);
    }
    if (this.clientStates.get(userId) === this.STATES.CONNECTED) {
      return null;
    }
    if (this.clients.has(userId)) {
      await this.stopSession(userId);
    }
    return await this.initialize(userId);
  }

  private cleanup(userId: string | number) {
    const validUserId = this.validateUserId(userId);
    const client = this.clients.get(validUserId);

    if (client) {
      try {
        client.destroy();
      } catch (error) {
        this.logger.error(`Error destroying client: ${error.message}`);
      }
    }

    this.clients.delete(validUserId);
    this.qrCodes.delete(validUserId);
    this.clientStates.delete(validUserId);
  }

  async validateUser(userId: string): Promise<boolean> {
    try {
      const user = await this.usersService.findOne(Number(userId));
      return !!user;
    } catch (error) {
      this.logger.error(`Error validating user ${userId}: ${error.message}`);
      return false;
    }
  }

  async ensureClientInitialized(userId: string): Promise<Client> {
    if (!this.clients.has(userId)) {
      await this.initialize(userId);
    }

    const client = this.clients.get(userId);
    const state = this.clientStates.get(userId);

    if (state === this.STATES.PENDING) {
      return client;
    }

    if (state === this.STATES.DISCONNECTED) {
      await this.cleanup(userId);
      await this.initialize(userId);
    }

    return this.waitForClientReady(userId);
  }


  private waitForClientReady(userId: string): Promise<Client> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        const client = this.clients.get(userId);
        const state = this.clientStates.get(userId);
        const elapsed = (Date.now() - startTime) / 1000;

        if (elapsed > this.TIMEOUT_SECONDS) {
          if (state !== this.STATES.PENDING) {
            this.cleanup(userId);
          }
          reject(new HttpException('Client initialization timeout', HttpStatus.REQUEST_TIMEOUT));
          return;
        }

        if (!client) {
          reject(new HttpException('Client not found', HttpStatus.NOT_FOUND));
          return;
        }

        if (state === this.STATES.DISCONNECTED) {
          this.cleanup(userId);
          reject(new HttpException('Client is disconnected', HttpStatus.SERVICE_UNAVAILABLE));
          return;
        }

        if (state === this.STATES.CONNECTED) {
          resolve(client);
          return;
        }

        if (state === this.STATES.PENDING) {
          setTimeout(check, 1000);
          return;
        }

        setTimeout(check, 1000);
      };

      check();
    });
  }

  /**
   * Sends a file and automatically deletes it after sending
   */
  async sendTemporaryFile(client: Client, to: string, filePath: string, caption?: string) {
    try {
      // Send the file
      const result = await this.sendFile(client, to, filePath, caption);

      // Delete the file after sending
      this.deleteFileAsync(filePath);

      return result;
    } catch (error) {
      // Clean up the file even if sending fails
      this.deleteFileAsync(filePath);
      throw error;
    }
  }



  /**
   * Deletes a file asynchronously
   */
  private deleteFileAsync(filePath: string): void {
    fs.unlink(filePath, (err) => {
      if (err) {
        this.logger.error(`Failed to delete temporary file ${filePath}: ${err.message}`);
      } else {
        this.logger.log(`Successfully deleted temporary file ${filePath}`);
      }
    });
  }

  /**
   * Check if media should be included based on type and options
   */
  private shouldIncludeMedia(messageType: string, mediaOptions: {
    includeMedia?: boolean;
    includeImages?: boolean;
    includeVideos?: boolean;
    includeAudio?: boolean;
  }): boolean {
    if (mediaOptions.includeMedia) return true;

    switch (messageType) {
      case 'image':
        return mediaOptions.includeImages || false;
      case 'video':
        return mediaOptions.includeVideos || false;
      case 'audio':
      case 'ptt': // Push to talk (voice message)
        return mediaOptions.includeAudio || false;
      default:
        return false;
    }
  }

  /**
   * Create temporary URL for media content
   */
  private async createTemporaryMediaUrl(media: any, messageType: string): Promise<string> {
    try {
      // Determine file extension based on message type and mimetype
      let extension = '.bin';
      if (media.mimetype) {
        const mimeExtensions = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
          'video/mp4': '.mp4',
          'video/webm': '.webm',
          'audio/mpeg': '.mp3',
          'audio/ogg': '.ogg',
          'audio/wav': '.wav',
          'audio/aac': '.aac'
        };
        extension = mimeExtensions[media.mimetype] || extension;
      }

      // Create unique filename
      const filename = `${uuidv4()}${extension}`;
      const dir = messageType === 'image' ? './uploads/temp/images' : './uploads/temp/files';
      const filePath = path.join(dir, filename);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write media data to file
      fs.writeFileSync(filePath, media.data, 'base64');



      // Get app URL from config and create full URL
      const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
      const mediaType = messageType === 'image' ? 'images' : 'files';
      const fullUrl = `${appUrl}/media/temp/${mediaType}/${filename}`;

      return fullUrl;
    } catch (error) {
      this.logger.error(`Failed to create temporary media URL: ${error.message}`);
      throw error;
    }
  }

  /**
 * Get all groups for a user
 */
  async getGroups(client: Client) {
    try {
      // Check if client is ready
      const state = await client.getState();
      if (state !== 'CONNECTED') {
        throw new Error('WhatsApp client is not connected');
      }

      const chats = await client.getChats();
      const groups = chats.filter(chat => chat.isGroup);

      return groups.map(group => ({
        id: group.id._serialized,
        name: group.name,
        isGroup: group.isGroup,
        isReadOnly: group.isReadOnly || false
      }));
    } catch (error) {
      this.logger.error(`Failed to get groups: ${error.message}`, error.stack);
      throw new HttpException(`Failed to get groups: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Search groups by name
   */
  async searchGroups(client: Client, query: string) {
    try {
      // Check if client is ready
      const state = await client.getState();
      if (state !== 'CONNECTED') {
        throw new Error('WhatsApp client is not connected');
      }

      const chats = await client.getChats();
      const groups = chats.filter(chat => chat.isGroup);

      const filteredGroups = groups.filter(group =>
        group.name.toLowerCase().includes(query.toLowerCase())
      );

      return filteredGroups.map(group => ({
        id: group.id._serialized,
        name: group.name,
        isGroup: group.isGroup,
        isReadOnly: group.isReadOnly || false
      }));
    } catch (error) {
      this.logger.error(`Failed to search groups: ${error.message}`, error.stack);
      throw new HttpException(`Failed to search groups: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  /**
     * Get last N messages from a group, optionally filter by sender
     * @param client WhatsApp client
     * @param groupId Group ID (serialized)
     * @param limit Number of messages to fetch (default 10)
     * @param mediaOptions Options for including media content
     * @returns Array of messages
     */
  async getGroupMessages(client: Client, groupId: string, limit: number = 10, mediaOptions?: {
    includeMedia?: boolean;
    includeImages?: boolean;
    includeVideos?: boolean;
    includeAudio?: boolean;
  }) {
    try {
      const formattedGroupId = this.formatGroupId(groupId);
      const chat = await client.getChatById(formattedGroupId);
      if (!chat.isGroup) {
        throw new Error('Provided chat is not a group');
      }
      // Fetch messages
      const messages = await chat.fetchMessages({ limit });

      // Map to useful info
      const mappedMessages = await Promise.all(messages.reverse().map(async (msg) => {
        const baseMessage = {
          id: msg.id._serialized,
          body: msg.body,
          sender: msg.author || msg.from,
          timestamp: msg.timestamp,
          type: msg.type,
          media: null
        };

        // Check if media options are enabled and message has media
        if (mediaOptions && (mediaOptions.includeMedia || mediaOptions.includeImages || mediaOptions.includeVideos || mediaOptions.includeAudio)) {
          if (msg.hasMedia) {
            try {
              const media = await msg.downloadMedia();
              const shouldInclude = this.shouldIncludeMedia(msg.type, mediaOptions);

              if (shouldInclude && media) {
                // Create temporary file
                const tempUrl = await this.createTemporaryMediaUrl(media, msg.type);
                return {
                  ...baseMessage,
                  media: {
                    hasMedia: true,
                    type: msg.type,
                    url: tempUrl,
                    mimeType: media.mimetype,

                    filename: media.filename || null
                  }
                };
              }
            } catch (mediaError) {
              this.logger.warn(`Failed to download media for message ${msg.id._serialized}: ${mediaError.message}`);
            }
          }
        }

        return baseMessage;
      }));

      return mappedMessages;
    } catch (error) {
      this.logger.error(`Failed to get group messages: ${error.message}`);
      throw new HttpException(`Failed to get group messages: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


}

