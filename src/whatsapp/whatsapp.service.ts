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
  private readonly TIMEOUT_SECONDS = 10;
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

  async initialize(userId: string) {
    if (!await this.validateUser(userId)) {
      throw new HttpException('Invalid user ID', HttpStatus.BAD_REQUEST);
    }

    if (this.clients.has(userId)) {
      return;
    }

    try {
      this.clientStates.set(userId, this.STATES.INITIALIZING);
      const client = this.createClient(userId);
      await this.setupClient(client, userId);
      return  this.qrCodes.get(userId);
    } catch (error) {
      this.clientStates.delete(userId);
      this.logger.error(`Failed to initialize client ${userId}: ${error.message}`);
      throw new HttpException('Failed to initialize WhatsApp client', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private createClient(userId: string): Client {
    return new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: this.SESSION_DIR
      }),
      puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
      }
    });
  }

  private async setupClient(client: Client, userId: string) {
    client.on('qr', async (qr) => {
      this.logger.log(`QR Code received for client ${userId}`);
      try {
        const url = await qrcode.toDataURL(qr);
        this.qrCodes.set(userId, url);
        this.clientStates.set(userId, this.STATES.PENDING);
      } catch (error) {
        this.logger.error(`Failed to generate QR code: ${error.message}`);
      }
    });

    client.on('ready', () => {
      this.logger.log(`Client ${userId} is ready`);
      this.qrCodes.set(userId, null);
      this.clientStates.set(userId, this.STATES.CONNECTED);
    });

    client.on('auth_failure', (msg) => {
      this.logger.error(`Authentication failed for client ${userId}: ${msg}`);
      this.cleanup(userId);
    });

    client.on('disconnected', (reason) => {
      this.logger.warn(`Client ${userId} disconnected. Reason: ${reason}`);
      this.clientStates.set(userId, this.STATES.DISCONNECTED);
    });

    try {
      this.logger.log(`Initializing client ${userId}...`);
      await client.initialize();
      this.logger.log(`Client ${userId} initialization completed`);
      this.clients.set(userId, client);
    } catch (error) {
      this.logger.error(`Failed to initialize client ${userId}: ${error.message}`);
      throw error;
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



  async getClientStatus(client: Client) {
    try {
      const state = await client.getState();
      return { status: state };
    } catch (error) {
      this.logger.error(`Failed to get client status: ${error.message}`);
      throw new HttpException('Failed to get client status', HttpStatus.INTERNAL_SERVER_ERROR);
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

  private cleanup(userId: string) {
    this.clients.delete(userId);
    this.qrCodes.delete(userId);
    this.clientStates.delete(userId);
  }

  async validateUser(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(Number(userId));
    return !!user;
  }

  async ensureClientInitialized(userId: string): Promise<Client> {
    console.log("🚀 ~ WhatsappService ~ ensureClientInitialized ~ userId:", userId)
    console.log("🚀 ~ WhatsappService ~ ensureClientInitialized ~ this.clients.has(userId):", this.clients.has(userId))
    if (!this.clients.has(userId)) {
      await this.initialize(userId);
    }

    return this.waitForClientReady(userId);
  }


  private waitForClientReady(userId: string): Promise<Client> {
    console.log("🚀 ~ WhatsappService ~ waitForClientReady ~ userId:", userId)
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        const client = this.clients.get(userId);
        const elapsed = (Date.now() - startTime) / 1000;

        if (elapsed > this.TIMEOUT_SECONDS) {
          reject(new HttpException('Client initialization timeout', HttpStatus.REQUEST_TIMEOUT));
          return;
        }

        
        console.log("🚀 ~ WhatsappService ~ check ~ clientStates.get(userId):", this.clientStates.get(userId))
        if (client &&( this.clientStates.get(userId) == this.STATES.CONNECTED || this.clientStates.get(userId) == this.STATES.PENDING)) {
          resolve(client);
        } else {
          setTimeout(check, 200);
        }
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

