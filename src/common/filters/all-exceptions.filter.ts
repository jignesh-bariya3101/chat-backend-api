import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiFailure } from '../api-response';
import { isDuplicateKey } from '../db-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = readMessage(exception.getResponse(), exception.message);
    } else if (isDuplicateKey(exception)) {
      status = HttpStatus.CONFLICT;
      message = 'Duplicate value';
    } else {
      const code = exception && typeof exception === 'object' ? (exception as { code?: string }).code : undefined;
      if (typeof code === 'string' && code.startsWith('P')) message = 'Database error';
      const detail = exception instanceof Error ? exception.stack : exception;
      this.logger.error(detail);
    }

    const body: ApiFailure = { success: false, message, statusCode: status };
    response.status(status).json(body);
  }
}

function readMessage(body: string | object, fallback: string): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message?: string | string[] }).message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}
