import {
	Controller,
	Get,
	Post,
	Param,
	Body,
	Req,
	UseGuards,
	ForbiddenException,
	BadRequestException,
	Put,
	Delete,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceType } from '@prisma/client';

type JwtPayload = {
	sub: string;
	role: string;
	companyId: string;
	iat?: number;
	exp?: number;
};

@Controller('attendance')
export class AttendanceController {
	constructor(private prisma: PrismaService) {}

	@UseGuards(JwtGuard)
	@Post('moedt')
	async moedt(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (!jwtUser?.sub) {
			throw new ForbiddenException('Mangler bruger i token');
		}

		await this.prisma.attendance.create({
			data: {
				userId: jwtUser.sub,
				type: 'MOEDT',
			},
		});

		return { ok: true };
	}

	@UseGuards(JwtGuard)
	@Post('gaaet')
	async gaaet(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (!jwtUser?.sub) {
			throw new ForbiddenException('Mangler bruger i token');
		}

		await this.prisma.attendance.create({
			data: {
				userId: jwtUser.sub,
				type: 'GAAET',
			},
		});

		return { ok: true };
	}

	@UseGuards(JwtGuard)
	@Get('company')
	async company(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException('Kun COMPANY_ADMIN kan se virksomhed');
		}

		const company = await this.prisma.company.findUnique({
			where: { id: jwtUser.companyId },
			select: { id: true, name: true },
		});

		return { company };
	}

	@UseGuards(JwtGuard)
	@Get('today')
	async todayJwt(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan se today-overblik',
			);
		}

		const companyId = jwtUser.companyId;

		const rows = await this.prisma.$queryRaw<
			{
				userId: string;
				email: string;
				name: string | null;
				type: AttendanceType | null;
				at: Date | null;
				eventsToday: number;
			}[]
		>`
			with bounds as (
				select
					(date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as start_ts,
					((date_trunc('day', now() at time zone 'Europe/Copenhagen') + interval '1 day') at time zone 'Europe/Copenhagen') as end_ts
			)
			select
				u."id" as "userId",
				u."email" as "email",
				u."name" as "name",
				last."type" as "type",
				last."at" as "at",
				coalesce(cnt."eventsToday", 0)::int as "eventsToday"
			from "User" u
			join bounds b on true
			left join lateral (
				select a."type", a."at"
				from "Attendance" a
				where
					a."userId" = u."id"
					and a."at" >= b.start_ts
					and a."at" < b.end_ts
				order by a."at" desc
				limit 1
			) last on true
			left join lateral (
				select count(*)::int as "eventsToday"
				from "Attendance" a
				where
					a."userId" = u."id"
					and a."at" >= b.start_ts
					and a."at" < b.end_ts
			) cnt on true
			where
				u."companyId" = ${companyId}
				and u."role" = 'EMPLOYEE'
			order by u."email" asc;
		`;

		const users = rows;

		const totalUsers = users.length;
		let moedt = 0;
		let gaaet = 0;
		let noRegistration = 0;
		let missingCheckout = 0;

		for (const u of users) {
			if (!u.type) {
				noRegistration++;
				continue;
			}

			if (u.type === 'MOEDT') {
				moedt++;
				missingCheckout++;
			} else if (u.type === 'GAAET') {
				gaaet++;
			}
		}

		return {
			companyId,
			totalUsers,
			moedt,
			gaaet,
			noRegistration,
			missingCheckout,
			users,
		};
	}

	@UseGuards(JwtGuard)
	@Get('today/user/:userId')
	async todayUserEvents(
		@Param('userId') userId: string,
		@Req() req: Request,
	) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan se dagens events',
			);
		}

		const companyId = jwtUser.companyId;

		const user = await this.prisma.user.findFirst({
			where: {
				id: userId,
				companyId,
				role: 'EMPLOYEE',
			},
			select: { id: true },
		});

		if (!user) {
			throw new ForbiddenException('Bruger findes ikke i din virksomhed');
		}

		const rows = await this.prisma.$queryRaw<
			{
				id: string;
				type: AttendanceType;
				at: Date;
			}[]
		>`
			with bounds as (
				select
					(date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as start_ts,
					((date_trunc('day', now() at time zone 'Europe/Copenhagen') + interval '1 day') at time zone 'Europe/Copenhagen') as end_ts
			)
			select
				a."id" as "id",
				a."type" as "type",
				a."at" as "at"
			from "Attendance" a
			join bounds b on true
			where
				a."userId" = ${userId}
				and a."at" >= b.start_ts
				and a."at" < b.end_ts
			order by a."at" asc;
		`;

		return { userId, events: rows };
	}

	@UseGuards(JwtGuard)
	@Get('leaders')
	async leaders(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException('Kun COMPANY_ADMIN kan se ledere');
		}

		const companyId = jwtUser.companyId;

		const leaders = await this.prisma.user.findMany({
			where: {
				companyId,
				role: 'EMPLOYEE',
				isDepartmentLeader: true,
			},
			select: {
				id: true,
				name: true,
				email: true,
			},
			orderBy: { email: 'asc' },
		});

		return { leaders };
	}

	@UseGuards(JwtGuard)
	@Put('admin/users/:id')
	async updateUser(
		@Param('id') id: string,
		@Req() req: Request,
		@Body()
		body: {
			name?: string | null;
			isDepartmentLeader?: boolean;
		},
	) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan redigere brugere',
			);
		}

		const companyId = jwtUser.companyId;

		const existing = await this.prisma.user.findFirst({
			where: { id, companyId },
			select: { id: true },
		});

		if (!existing) {
			throw new BadRequestException('Ugyldig bruger');
		}

		await this.prisma.user.update({
			where: { id },
			data: {
				name: body.name ?? null,
				isDepartmentLeader: body.isDepartmentLeader ?? false,
			},
		});

		return { ok: true };
	}

	@UseGuards(JwtGuard)
	@Delete('admin/users/:id')
	async deleteUser(@Param('id') id: string, @Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan slette brugere',
			);
		}

		const companyId = jwtUser.companyId;

		const target = await this.prisma.user.findFirst({
			where: { id, companyId },
			select: { id: true, isDepartmentLeader: true },
		});

		if (!target) {
			throw new BadRequestException('Ugyldig bruger');
		}

		if (target.isDepartmentLeader) {
			throw new BadRequestException('Kan ikke slette afdelingsleder');
		}

		await this.prisma.user.delete({ where: { id } });

		return { ok: true };
	}
}
