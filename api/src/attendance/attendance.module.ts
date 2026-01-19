import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceController } from './attendance.controller';
import { JwtGuard } from '../auth/jwt.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: 'dev-secret-change-later',
    }),
  ],
  controllers: [AttendanceController],
  providers: [PrismaService, JwtGuard],
})
export class AttendanceModule {}
