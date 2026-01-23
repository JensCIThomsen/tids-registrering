import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [AttendanceController],
})
export class AttendanceModule {}
