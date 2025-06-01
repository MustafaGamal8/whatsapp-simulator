import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
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

  constructor(private readonly usersService: UsersService) { }

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

  async sendMessage(client: Client, to: string, message: string) {
    try {
      const formattedTo = this.formatWhatsAppId(to);
      const response = await client.sendMessage(formattedTo, message);
      return { success: true, messageId: response.id.id };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      throw new HttpException(`Failed to send message: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async sendFile(client: Client, to: string, filePath: string, caption?: string) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const formattedTo = this.formatWhatsAppId(to);

      // Create message media from file
      const media = MessageMedia.fromFilePath(filePath);

      // Send media
      const response = await client.sendMessage(formattedTo, media, { caption });
      return { success: true, messageId: response.id.id };
    } catch (error) {
      this.logger.error(`Failed to send file: ${error.message}`);
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
}

