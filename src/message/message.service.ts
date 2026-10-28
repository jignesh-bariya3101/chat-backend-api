import { BadRequestException, Injectable } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { ChatMessage, FirestoreService } from '../firebase/firestore.service';

type Person = { userId: number; fullName: string };

@Injectable()
export class MessageService {
  constructor(
    private readonly chats: ChatService,
    private readonly firestore: FirestoreService,
  ) {}

  async send(chatId: number, senderId: number, text: string) {
    await this.chats.assertMember(chatId, senderId);
    const saved = await this.firestore.addMessage(chatId, senderId, text);
    return this.withNames(chatId, saved);
  }

  async list(chatId: number, limit: number) {
    await this.chats.assertChat(chatId);
    const rows = await this.firestore.listMessages(chatId, limit);
    const members = await this.chats.memberViews(chatId);
    return rows.map((row) => attachNames(row, members));
  }

  async markRead(chatId: number, messageId: string, userId: number) {
    this.checkMessageId(messageId);
    await this.chats.assertMember(chatId, userId);
    const saved = await this.firestore.markRead(chatId, messageId, userId);
    const shown = await this.withNames(chatId, saved);
    const mine = shown.readBy.find((row) => row.userId === userId);
    return {
      chatId,
      messageId,
      userId,
      fullName: mine?.fullName ?? '',
      readAt: mine?.readAt ?? '',
      readBy: shown.readBy,
      readCount: shown.readCount,
      readerCount: shown.readerCount,
      readByAll: shown.readByAll,
    };
  }

  async updateLastSeen(chatId: number, userId: number, messageId: string) {
    this.checkMessageId(messageId);
    await this.chats.assertMember(chatId, userId);
    const saved = await this.firestore.updateLastSeen(chatId, userId, messageId);
    const members = await this.chats.memberViews(chatId);
    const person = members.find((row) => row.userId === userId);
    return { ...saved, fullName: person?.fullName ?? '' };
  }

  async edit(chatId: number, messageId: string, senderId: number, text: string) {
    this.checkMessageId(messageId);
    await this.chats.assertMember(chatId, senderId);
    const saved = await this.firestore.editMessage(chatId, messageId, senderId, text);
    return this.withNames(chatId, saved);
  }

  async remove(chatId: number, messageId: string, senderId: number) {
    this.checkMessageId(messageId);
    await this.chats.assertMember(chatId, senderId);
    const saved = await this.firestore.deleteMessage(chatId, messageId, senderId);
    return this.withNames(chatId, saved);
  }

  private async withNames(chatId: number, message: ChatMessage) {
    const members = await this.chats.memberViews(chatId);
    return attachNames(message, members);
  }

  private checkMessageId(messageId: string) {
    if (!messageId || messageId.includes('/') || messageId === '.' || messageId === '..') {
      throw new BadRequestException('Invalid message id');
    }
  }
}

function attachNames(message: ChatMessage, members: Person[]) {
  const names = new Map(members.map((row) => [row.userId, row.fullName]));
  const readBy = message.readBy.map((row) => ({
    userId: row.userId,
    fullName: names.get(row.userId) ?? '',
    readAt: row.readAt,
  }));
  const readers = members.filter((row) => row.userId !== message.senderId);
  const readIds = new Set(readBy.map((row) => row.userId));
  const readCount = readers.filter((row) => readIds.has(row.userId)).length;

  return {
    ...message,
    senderName: names.get(message.senderId) ?? '',
    readBy,
    readCount,
    readerCount: readers.length,
    readByAll: readers.length > 0 && readCount === readers.length,
  };
}
