import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.query.apiKey;
    const configuredApiKey = process.env.API_KEY;

    // If API_KEY is not configured, allow access
    if (!configuredApiKey) {
      return true;
    }

    // If API_KEY is configured but no key was provided or the key doesn't match
    if (!apiKey || apiKey !== configuredApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
} 