import {
	Controller,
	Get,
	Post,
	Param,
	Body,
	UseGuards,
	Req,
	ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceType } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import type { Request } from 'express';

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

	@Get('db-check')
	async dbCheck() {
		const dbRows = await this.prisma.$queryRaw<{ db: string }[]>`
			select current_database() as db
		`;

		const schemaRows = await this.prisma.$queryRaw<{ schema: string }[]>`
			select current_schema() as schema
		`;

		const userCount = await this.prisma.$queryRaw<{ count: number }[]>`
			select count(*)::int as count from "User"
		`;

		const companyCount = await this.prisma.$queryRaw<{ count: number }[]>`
			select count(*)::int as count from "Company"
		`;

		const attendanceCount = await this.prisma.$queryRaw<
			{ count: number }[]
		>`
			select count(*)::int as count from "Attendance"
		`;

		return {
			db: dbRows[0]?.db ?? null,
			schema: schemaRows[0]?.schema ?? null,
			counts: {
				user: userCount[0]?.count ?? null,
				company: companyCount[0]?.count ?? null,
				attendance: attendanceCount[0]?.count ?? null,
			},
		};
	}

	@Get('ping')
	ping() {
		return 'pong';
	}

	// JWT-baseret today (vores "rigtige" route)
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
				type: AttendanceType;
				at: Date;
			}[]
		>`
			with bounds as (
				select
					(date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as start_ts,
					((date_trunc('day', now() at time zone 'Europe/Copenhagen') + interval '1 day') at time zone 'Europe/Copenhagen') as end_ts
			)
			select distinct on (a."userId")
				a."userId" as "userId",
				u."email" as "email",
				u."name" as "name",
				a."type" as "type",
				a."at" as "at"
			from "Attendance" a
			join "User" u on u."id" = a."userId"
			join bounds b on true
			where
				u."companyId" = ${companyId}
				and a."at" >= b.start_ts
				and a."at" < b.end_ts
			order by a."userId", a."at" desc;
		`;

		const met = rows.filter((r) => r.type === AttendanceType.MOEDT).length;
		const gaaet = rows.filter(
			(r) => r.type === AttendanceType.GAAET,
		).length;

		return {
			companyId,
			counts: {
				totalUsersWithEventsToday: rows.length,
				met,
				gaaet,
			},
			users: rows,
		};
	}

	@UseGuards(JwtGuard)
	@Get('leaders')
	async leaders(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		// Kun virksomhedens admin må hente lederliste
		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException('Kun COMPANY_ADMIN kan se lederliste');
		}

		const companyId = jwtUser.companyId;

		const leaders = await this.prisma.user.findMany({
			where: {
				companyId,
				isDepartmentLeader: true,
			},
			select: {
				id: true,
				name: true,
				email: true,
			},
			orderBy: [{ name: 'asc' }, { email: 'asc' }],
		});

		return {
			companyId,
			leaders,
		};
	}

	// Legacy-route: nu sikret med JWT så man ikke kan kigge i andre virksomheder
	@UseGuards(JwtGuard)
	@Get('today/:companyId')
	async today(@Param('companyId') companyId: string, @Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		// SUPERADMIN må gerne (praktisk til support/debug)
		if (jwtUser.role !== 'SUPERADMIN') {
			// COMPANY_ADMIN må kun slå op i egen virksomhed
			if (
				jwtUser.role !== 'COMPANY_ADMIN' ||
				jwtUser.companyId !== companyId
			) {
				throw new ForbiddenException(
					'Du har ikke adgang til denne virksomhed',
				);
			}
		}

		const rows = await this.prisma.$queryRaw<
			{
				userId: string;
				email: string;
				name: string | null;
				type: AttendanceType;
				at: Date;
			}[]
		>`
			with bounds as (
				select
					(date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as start_ts,
					((date_trunc('day', now() at time zone 'Europe/Copenhagen') + interval '1 day') at time zone 'Europe/Copenhagen') as end_ts
			)
			select distinct on (a."userId")
				a."userId" as "userId",
				u."email" as "email",
				u."name" as "name",
				a."type" as "type",
				a."at" as "at"
			from "Attendance" a
			join "User" u on u."id" = a."userId"
			join bounds b on true
			where
				u."companyId" = ${companyId}
				and a."at" >= b.start_ts
				and a."at" < b.end_ts
			order by a."userId", a."at" desc;
		`;

		const met = rows.filter((r) => r.type === AttendanceType.MOEDT).length;
		const gaaet = rows.filter(
			(r) => r.type === AttendanceType.GAAET,
		).length;

		return {
			companyId,
			counts: {
				totalUsersWithEventsToday: rows.length,
				met,
				gaaet,
			},
			users: rows,
		};
	}

	@UseGuards(JwtGuard)
	@Post('moedt')
	async moedt(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		const userId = jwtUser.sub;

		const last = await this.prisma.attendance.findFirst({
			where: { userId },
			orderBy: { at: 'desc' },
			select: { type: true, at: true },
		});

		if (last?.type === AttendanceType.MOEDT) {
			return {
				ok: false,
				error: 'Du er allerede mødt',
				last,
			};
		}

		return await this.prisma.attendance.create({
			data: {
				userId,
				type: AttendanceType.MOEDT,
			},
		});
	}

	@UseGuards(JwtGuard)
	@Post('gaaet')
	async gaaet(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		const userId = jwtUser.sub;

		const last = await this.prisma.attendance.findFirst({
			where: { userId },
			orderBy: { at: 'desc' },
			select: { type: true, at: true },
		});

		if (!last) {
			return {
				ok: false,
				error: 'Du kan ikke gået før du har mødt',
			};
		}

		if (
			last.type !== AttendanceType.MOEDT &&
			last.type !== AttendanceType.PAUSE_END
		) {
			return {
				ok: false,
				error: 'Du kan ikke gået, fordi du ikke er mødt (sidste status er ikke MOEDT/PAUSE_END)',
				last,
			};
		}

		return await this.prisma.attendance.create({
			data: {
				userId,
				type: AttendanceType.GAAET,
			},
		});
	}

	@UseGuards(JwtGuard)
	@Post('pause/start')
	async pauseStart(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		const userId = jwtUser.sub;

		const last = await this.prisma.attendance.findFirst({
			where: { userId },
			orderBy: { at: 'desc' },
			select: { type: true, at: true },
		});

		if (!last) {
			return {
				ok: false,
				error: 'Du kan ikke starte pause før du har mødt',
			};
		}

		if (last.type === AttendanceType.GAAET) {
			return {
				ok: false,
				error: 'Du kan ikke starte pause, fordi du ikke er mødt (sidste status er GAAET)',
				last,
			};
		}

		if (last.type === AttendanceType.PAUSE_START) {
			return {
				ok: false,
				error: 'Du er allerede på pause',
				last,
			};
		}

		// Tillad pause hvis man er mødt, eller lige er kommet tilbage fra pause
		if (
			last.type !== AttendanceType.MOEDT &&
			last.type !== AttendanceType.PAUSE_END
		) {
			return {
				ok: false,
				error: 'Du kan ikke starte pause i din nuværende status',
				last,
			};
		}

		return await this.prisma.attendance.create({
			data: {
				userId,
				type: 'PAUSE_START' as AttendanceType,
			},
		});
	}

	@UseGuards(JwtGuard)
	@Post('pause/end')
	async pauseEnd(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		const userId = jwtUser.sub;

		const last = await this.prisma.attendance.findFirst({
			where: { userId },
			orderBy: { at: 'desc' },
			select: { type: true, at: true },
		});

		if (!last) {
			return {
				ok: false,
				error: 'Du kan ikke slutte pause før du har mødt',
			};
		}

		if (last.type === AttendanceType.GAAET) {
			return {
				ok: false,
				error: 'Du kan ikke slutte pause, fordi du ikke er mødt (sidste status er GAAET)',
				last,
			};
		}

		if (last.type !== AttendanceType.PAUSE_START) {
			return {
				ok: false,
				error: 'Du kan ikke slutte pause, fordi du ikke er på pause',
				last,
			};
		}

		return await this.prisma.attendance.create({
			data: {
				userId,
				type: 'PAUSE_END' as AttendanceType,
			},
		});
	}

	@UseGuards(JwtGuard)
	@Get('status/:userId')
	async status(@Param('userId') userId: string, @Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (!jwtUser?.sub || jwtUser.sub !== userId) {
			throw new ForbiddenException('Du må kun se din egen status');
		}

		const last = await this.prisma.attendance.findFirst({
			where: { userId },
			orderBy: { at: 'desc' },
			select: { type: true, at: true },
		});

		return {
			userId,
			status: last?.type ?? null,
			at: last?.at ?? null,
		};
	}

	@UseGuards(JwtGuard)
	@Get('employees')
	async getEmployees(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException('Kun COMPANY_ADMIN kan se employees');
		}

		return this.prisma.user.findMany({
			where: { companyId: jwtUser.companyId },
			select: {
				id: true,
				email: true,
				name: true,
				role: true,
				isDepartmentLeader: true,
				managerId: true,
				manager: {
					select: {
						id: true,
						email: true,
						name: true,
					},
				},
			},
			orderBy: { email: 'asc' },
		});
	}

	@UseGuards(JwtGuard)
	@Post('employees/:userId/manager')
	async setEmployeeManager(
		@Param('userId') userId: string,
		@Body() body: { managerId: string | null },
		@Req() req: Request,
	) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan sætte afdelingsleder',
			);
		}

		const companyId = jwtUser.companyId;
		const managerId = body?.managerId ?? null;

		const employee = await this.prisma.user.findFirst({
			where: { id: userId, companyId },
			select: { id: true },
		});

		if (!employee) {
			throw new ForbiddenException('Bruger findes ikke i din virksomhed');
		}

		if (managerId) {
			const manager = await this.prisma.user.findFirst({
				where: { id: managerId, companyId, isDepartmentLeader: true },
				select: { id: true },
			});

			if (!manager) {
				throw new ForbiddenException(
					'Ugyldig afdelingsleder (ikke i din virksomhed)',
				);
			}
		}

		const updated = await this.prisma.user.update({
			where: { id: userId },
			data: { managerId },
			select: {
				id: true,
				email: true,
				name: true,
				managerId: true,
			},
		});

		return { ok: true, user: updated };
	}
}
