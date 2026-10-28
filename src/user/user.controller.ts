import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PositiveIntPipe } from '../common/pipes/positive-int.pipe';
import { CreateUserDto } from './dto/create-user.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get(':userId')
  get(@Param('userId', PositiveIntPipe) userId: number) {
    return this.users.getById(userId);
  }
}
