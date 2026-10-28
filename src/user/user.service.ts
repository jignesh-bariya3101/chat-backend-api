import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isDuplicateKey } from '../common/db-error';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly db: PrismaService) {}

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();

    const taken = await this.db.user.findUnique({ where: { email } });
    if (taken) throw new ConflictException('Email already in use');

    try {
      return await this.db.user.create({ data: { fullName, email } });
    } catch (err) {
      if (isDuplicateKey(err)) throw new ConflictException('Email already in use');
      throw err;
    }
  }

  async list() {
    return this.db.user.findMany({
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: { id: true, fullName: true, email: true },
    });
  }

  async getById(id: number) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
