import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PositiveIntPipe } from '../common/pipes/positive-int.pipe';
import { ChatService } from './chat.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { CreateGroupDto } from './dto/create-group.dto';

@Controller()
export class ChatController {
  constructor(private readonly chats: ChatService) {}

  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('chat/create')
  @HttpCode(200)
  create(@Body() dto: CreateChatDto) {
    return this.chats.createDirect(dto.userAId, dto.userBId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('chat/group')
  createGroup(@Body() dto: CreateGroupDto) {
    return this.chats.createGroup(dto);
  }

  @Post('chat/:chatId/members')
  addMember(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Body() dto: AddMemberDto,
  ) {
    return this.chats.addMember(chatId, dto.userId);
  }

  @Delete('chat/:chatId/members/:userId')
  removeMember(
    @Param('chatId', PositiveIntPipe) chatId: number,
    @Param('userId', PositiveIntPipe) userId: number,
  ) {
    return this.chats.removeMember(chatId, userId);
  }

  @Get('chat/:chatId')
  getOne(@Param('chatId', PositiveIntPipe) chatId: number) {
    return this.chats.getOne(chatId);
  }

  @Get('user/:userId/chats')
  list(@Param('userId', PositiveIntPipe) userId: number) {
    return this.chats.listForUser(userId);
  }
}
