import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendFileMessageDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  filePath: string;

  @IsString()
  @IsOptional()
  caption: string;
}

export class FileUploadDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsOptional()
  caption: string;
} 