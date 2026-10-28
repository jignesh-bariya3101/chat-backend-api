import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PositiveIntPipe } from '../common/pipes/positive-int.pipe';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { LastSeenDto } from './dto/last-seen.dto';
import { ListMessagesQuery } from './dto/list-messages.query';
import { MarkReadDto } from './dto/mark-read.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageService } from './message.service';

@Controller('chat')
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':chatId/message/send')
  send(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(chatId, dto.senderId, dto.text);
  }

  @Get(':chatId/messages')
  list(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Query() query: ListMessagesQuery,
  ) {
    return this.messages.list(chatId, query.limit ?? 50);
  }

  @Post(':chatId/message/:messageId/read')
  @HttpCode(200)
  markRead(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Param('messageId') messageId: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.messages.markRead(chatId, messageId, dto.userId);
  }

  @Post(':chatId/lastseen')
  @HttpCode(200)
  lastSeen(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Body() dto: LastSeenDto,
  ) {
    return this.messages.updateLastSeen(chatId, dto.userId, dto.messageId);
  }

  @Patch(':chatId/message/:messageId')
  edit(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messages.edit(chatId, messageId, dto.senderId, dto.text);
  }

  @Delete(':chatId/message/:messageId')
  remove(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Param('messageId') messageId: string,
    @Body() dto: DeleteMessageDto,
  ) {
    return this.messages.remove(chatId, messageId, dto.senderId);
  }
}
