import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatType } from '@prisma/client';
import { isDuplicateKey } from '../common/db-error';
import { PrismaService } from '../database/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class ChatService {
  constructor(private readonly db: PrismaService) {}

  async createDirect(userAId: number, userBId: number) {
    if (userAId === userBId) {
      throw new BadRequestException('userAId and userBId must be different');
    }

    await this.assertUsers([userAId, userBId]);

    const directKey = userAId < userBId ? `${userAId}:${userBId}` : `${userBId}:${userAId}`;
    const existing = await this.db.chat.findUnique({ where: { directKey } });
    if (existing) return this.chatPayload(existing.id, false);

    try {
      const saved = await this.db.chat.create({
        data: {
          chatType: ChatType.direct,
          createdBy: userAId,
          directKey,
          members: {
            create: [{ userId: userAId }, { userId: userBId }],
          },
        },
      });
      return this.chatPayload(saved.id, true);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const again = await this.db.chat.findUnique({ where: { directKey } });
      if (!again) throw err;
      return this.chatPayload(again.id, false);
    }
  }

  async createGroup(dto: CreateGroupDto) {
    const memberIds = [...new Set([dto.creatorId, ...dto.memberIds])];
    if (memberIds.length < 2) {
      throw new BadRequestException('A group needs at least two users');
    }

    await this.assertUsers(memberIds);

    const saved = await this.db.chat.create({
      data: {
        chatType: ChatType.group,
        title: dto.title.trim(),
        createdBy: dto.creatorId,
        members: {
          create: memberIds.map((userId) => ({ userId })),
        },
      },
    });

    return this.chatPayload(saved.id, true);
  }

  async addMember(chatId: number, userId: number) {
    const chat = await this.assertChat(chatId);
    if (chat.chatType !== ChatType.group) {
      throw new BadRequestException('Cannot add members to a direct chat');
    }

    await this.assertUsers([userId]);

    const existing = await this.db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (existing) throw new ConflictException('User is already in this chat');

    try {
      await this.db.chatMember.create({ data: { chatId, userId } });
    } catch (err) {
      if (isDuplicateKey(err)) throw new ConflictException('User is already in this chat');
      throw err;
    }

    const person = await this.db.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    return { chatId, userId, fullName: person?.fullName ?? '' };
  }

  async removeMember(chatId: number, userId: number) {
    const chat = await this.assertChat(chatId);
    if (chat.chatType !== ChatType.group) {
      throw new BadRequestException('Cannot remove members from a direct chat');
    }

    const existing = await this.db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!existing) throw new NotFoundException('User is not in this chat');

    const total = await this.db.chatMember.count({ where: { chatId } });
    if (total <= 2) {
      throw new BadRequestException('A group needs at least two members');
    }

    const person = await this.db.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    await this.db.chatMember.delete({ where: { id: existing.id } });
    return { chatId, userId, fullName: person?.fullName ?? '' };
  }

  async listForUser(userId: number) {
    await this.assertUsers([userId]);

    const chats = await this.db.chat.findMany({
      where: { members: { some: { userId } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: chatWithPeople,
    });

    return chats.map((chat) => this.toChatView(chat));
  }

  async getOne(chatId: number) {
    return this.chatPayload(chatId);
  }

  async memberViews(chatId: number) {
    const chat = await this.chatPayload(chatId);
    return chat.members;
  }

  async assertChat(chatId: number) {
    const chat = await this.db.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }

  async assertMember(chatId: number, userId: number) {
    const chat = await this.assertChat(chatId);
    const member = await this.db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not in this chat');
    return chat;
  }

  private async assertUsers(ids: number[]) {
    const unique = [...new Set(ids)];
    const found = await this.db.user.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length === unique.length) return;

    const foundIds = new Set(found.map((user) => user.id));
    const missing = unique.filter((id) => !foundIds.has(id));
    throw new NotFoundException(`User not found: ${missing.join(', ')}`);
  }

  private async chatPayload(chatId: number, created?: boolean) {
    const chat = await this.db.chat.findUnique({
      where: { id: chatId },
      include: chatWithPeople,
    });
    if (!chat) throw new NotFoundException('Chat not found');
    return {
      ...this.toChatView(chat),
      ...(created === undefined ? {} : { created }),
    };
  }

  private toChatView(chat: ChatRow) {
    const members = chat.members
      .map((row) => ({ userId: row.userId, fullName: row.user.fullName }))
      .sort((a, b) => a.userId - b.userId);

    return {
      chatId: chat.id,
      type: chat.chatType,
      title: chat.title,
      createdBy: chat.createdBy,
      createdByName: chat.creator.fullName,
      memberIds: members.map((row) => row.userId),
      members,
      createdAt: chat.createdAt,
    };
  }
}

const chatWithPeople = {
  creator: { select: { fullName: true } },
  members: { include: { user: { select: { fullName: true } } } },
} as const;

type ChatRow = {
  id: number;
  chatType: ChatType;
  title: string | null;
  createdBy: number;
  createdAt: Date;
  creator: { fullName: string };
  members: { userId: number; user: { fullName: string } }[];
};
