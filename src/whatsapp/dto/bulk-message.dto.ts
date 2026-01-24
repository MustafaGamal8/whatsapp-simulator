import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class BulkMessageDto {
  @IsString()
  @IsNotEmpty()
  numbers: string; // Comma-separated phone numbers

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsNumber()
  @Min(500)
  delayMs?: number; // Delay between messages in milliseconds (minimum 500ms)
}

export class BulkMessageWithImageDto {
  @IsString()
  @IsNotEmpty()
  numbers: string; // Comma-separated phone numbers

  @IsString()
  @IsNotEmpty()
  message: string; // This will be used as caption for the image

  @IsOptional()
  @IsNumber()
  @Min(500)
  delayMs?: number; // Delay between messages in milliseconds (minimum 500ms)
}