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

	/* ----------------------- UGE (man-søn) ----------------------- */

	@UseGuards(JwtGuard)
	@Get('week')
	async weekSummary(@Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan se uge-overblik',
			);
		}

		const companyId = jwtUser.companyId;

		const employees = await this.prisma.user.findMany({
			where: {
				companyId,
				role: 'EMPLOYEE',
			},
			select: {
				id: true,
				email: true,
				name: true,
				weeklyHours: true,
				breakMinutesPerDay: true,
				breakIsPaid: true,
			},
			orderBy: { email: 'asc' },
		});

		const ids = employees.map((e) => e.id);
		if (ids.length === 0) {
			return {
				companyId,
				weekStart: null,
				weekEnd: null,
				users: [],
			};
		}

		const events = await this.prisma.$queryRaw<
			{
				userId: string;
				type: AttendanceType;
				at: Date;
			}[]
		>`
			with bounds as (
				select
					(date_trunc('week', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as start_ts,
					((date_trunc('week', now() at time zone 'Europe/Copenhagen') + interval '7 days') at time zone 'Europe/Copenhagen') as end_ts
			)
			select
				a."userId" as "userId",
				a."type" as "type",
				a."at" as "at"
			from "Attendance" a
			join bounds b on true
			where
				a."userId" = any(${ids})
				and a."at" >= b.start_ts
				and a."at" < b.end_ts
			order by a."userId" asc, a."at" asc;
		`;

		const bounds = await this.prisma.$queryRaw<
			{ start_ts: Date; end_ts: Date }[]
		>`
			select
				(date_trunc('week', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as start_ts,
				((date_trunc('week', now() at time zone 'Europe/Copenhagen') + interval '7 days') at time zone 'Europe/Copenhagen') as end_ts
		`;

		const weekStart = bounds?.[0]?.start_ts ?? null;
		const weekEnd = bounds?.[0]?.end_ts ?? null;

		const byUser = new Map<string, { type: AttendanceType; at: Date }[]>();
		for (const e of events) {
			const arr = byUser.get(e.userId) ?? [];
			arr.push({ type: e.type, at: e.at });
			byUser.set(e.userId, arr);
		}

		const tz = 'Europe/Copenhagen';
		const dayKey = (d: Date) =>
			new Date(d).toLocaleDateString('sv-SE', { timeZone: tz }); // YYYY-MM-DD

		const users = employees.map((u) => {
			const ev = byUser.get(u.id) ?? [];

			let openStart: number | null = null;
			let workedMsGross = 0;
			const workedDays = new Set<string>();

			for (const e of ev) {
				if (e.type === 'MOEDT') {
					openStart = new Date(e.at).getTime();
					workedDays.add(dayKey(e.at));
				} else if (e.type === 'GAAET') {
					if (openStart !== null) {
						const end = new Date(e.at).getTime();
						if (end > openStart) {
							workedMsGross += end - openStart;
							workedDays.add(dayKey(e.at));
						}
						openStart = null;
					}
				}
			}

			const workedMinutesGross = Math.floor(workedMsGross / 60000);
			const expectedMinutes = Math.trunc((u.weeklyHours ?? 37) * 60);

			const breakMinutesPerDay = Math.trunc(u.breakMinutesPerDay ?? 30);
			const breakMinutesDeducted = u.breakIsPaid
				? 0
				: workedDays.size * breakMinutesPerDay;

			const workedMinutesNet = Math.max(
				0,
				workedMinutesGross - breakMinutesDeducted,
			);

			const deltaMinutes = workedMinutesNet - expectedMinutes;

			const byDay = new Map<
				string,
				{ type: AttendanceType; at: Date }[]
			>();
			for (const e of ev) {
				const k = dayKey(e.at);
				const arr = byDay.get(k) ?? [];
				arr.push(e);
				byDay.set(k, arr);
			}

			let hasWarnings = false;

			for (const [, dayEvents] of byDay) {
				let open: number | null = null;

				for (const e of dayEvents) {
					if (e.type === 'MOEDT') {
						if (open !== null) {
							hasWarnings = true;
							break;
						}
						open = new Date(e.at).getTime();
					} else if (e.type === 'GAAET') {
						if (open === null) {
							hasWarnings = true;
							break;
						}
						open = null;
					}
				}

				if (!hasWarnings && open !== null) {
					hasWarnings = true;
				}

				if (hasWarnings) break;
			}

			return {
				userId: u.id,
				email: u.email,
				name: u.name,
				weeklyHours: u.weeklyHours,
				breakMinutesPerDay: u.breakMinutesPerDay,
				breakIsPaid: u.breakIsPaid,

				expectedMinutes,
				workedMinutesGross,
				breakMinutesDeducted,
				workedMinutesNet,
				deltaMinutes,

				hasWarnings,
			};
		});

		return {
			companyId,
			weekStart,
			weekEnd,
			users,
		};
	}

	@UseGuards(JwtGuard)
	@Get('week/user/:userId')
	async weekUserDetails(
		@Param('userId') userId: string,
		@Req() req: Request,
	) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;

		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan se uge-detaljer',
			);
		}

		const companyId = jwtUser.companyId;

		const user = await this.prisma.user.findFirst({
			where: {
				id: userId,
				companyId,
				role: 'EMPLOYEE',
			},
			select: {
				id: true,
				email: true,
				name: true,
				weeklyHours: true,
				breakMinutesPerDay: true,
				breakIsPaid: true,
			},
		});

		if (!user) {
			throw new BadRequestException('Ugyldig bruger');
		}

		const bounds = await this.prisma.$queryRaw<
			{ start_ts: Date; end_ts: Date }[]
		>`
			select
				(date_trunc('week', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as start_ts,
				((date_trunc('week', now() at time zone 'Europe/Copenhagen') + interval '7 days') at time zone 'Europe/Copenhagen') as end_ts
		`;

		const weekStart = bounds?.[0]?.start_ts ?? null;
		const weekEnd = bounds?.[0]?.end_ts ?? null;

		if (!weekStart || !weekEnd) {
			return {
				user,
				weekStart: null,
				weekEnd: null,
				days: [],
				totals: null,
			};
		}

		const events = await this.prisma.attendance.findMany({
			where: {
				userId,
				at: {
					gte: weekStart,
					lt: weekEnd,
				},
			},
			select: {
				id: true,
				type: true,
				at: true,
			},
			orderBy: { at: 'asc' },
		});

		const tz = 'Europe/Copenhagen';
		const dayKey = (d: Date) =>
			new Date(d).toLocaleDateString('sv-SE', { timeZone: tz }); // YYYY-MM-DD

		const byDay = new Map<string, { type: AttendanceType; at: Date }[]>();
		for (const e of events) {
			const k = dayKey(e.at);
			const arr = byDay.get(k) ?? [];
			arr.push({ type: e.type, at: e.at });
			byDay.set(k, arr);
		}

		const breakMinutesPerDay = Math.trunc(user.breakMinutesPerDay ?? 30);

		let totalGross = 0;
		let totalBreak = 0;
		let totalNet = 0;

		const days = [...byDay.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([date, ev]) => {
				let openStart: number | null = null;
				let workedMsGross = 0;
				const intervals: { start: Date; end: Date }[] = [];

				for (const e of ev) {
					if (e.type === 'MOEDT') {
						openStart = new Date(e.at).getTime();
					} else if (e.type === 'GAAET') {
						if (openStart !== null) {
							const endMs = new Date(e.at).getTime();
							if (endMs > openStart) {
								workedMsGross += endMs - openStart;
								intervals.push({
									start: new Date(openStart),
									end: new Date(endMs),
								});
							}
							openStart = null;
						}
					}
				}

				const grossMin = Math.floor(workedMsGross / 60000);
				const breakMin = user.breakIsPaid
					? 0
					: grossMin > 0
						? breakMinutesPerDay
						: 0;
				const netMin = Math.max(0, grossMin - breakMin);

				totalGross += grossMin;
				totalBreak += breakMin;
				totalNet += netMin;

				return {
					date,
					workedMinutesGross: grossMin,
					breakMinutesDeducted: breakMin,
					workedMinutesNet: netMin,
					intervals,
					eventsCount: ev.length,
				};
			});

		return {
			user,
			weekStart,
			weekEnd,
			days,
			totals: {
				workedMinutesGross: totalGross,
				breakMinutesDeducted: totalBreak,
				workedMinutesNet: totalNet,
				expectedMinutes: Math.trunc((user.weeklyHours ?? 37) * 60),
				deltaMinutes:
					totalNet - Math.trunc((user.weeklyHours ?? 37) * 60),
			},
		};
	}

	/* ----------------------- NYT: Ret registreringer ----------------------- */

	private ensureCompanyAdmin(jwtUser: JwtPayload, msg: string) {
		if (jwtUser.role !== 'COMPANY_ADMIN') {
			throw new ForbiddenException(msg);
		}
	}

	private parseAtOrThrow(at: string) {
		const d = new Date(at);
		if (Number.isNaN(d.getTime())) {
			throw new BadRequestException('Ugyldigt tidspunkt (at)');
		}
		return d;
	}

	private ensureTypeOrThrow(type: string): AttendanceType {
		if (
			type === 'MOEDT' ||
			type === 'GAAET' ||
			type === 'PAUSE_START' ||
			type === 'PAUSE_END'
		) {
			return type;
		}
		throw new BadRequestException('Ugyldig type');
	}

	@UseGuards(JwtGuard)
	@Get('user/:userId/day/:date')
	async eventsForUserDay(
		@Param('userId') userId: string,
		@Param('date') date: string,
		@Req() req: Request,
	) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		this.ensureCompanyAdmin(
			jwtUser,
			'Kun COMPANY_ADMIN kan se events for en dag',
		);

		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			throw new BadRequestException('Ugyldig dato (YYYY-MM-DD)');
		}

		const companyId = jwtUser.companyId;

		const user = await this.prisma.user.findFirst({
			where: { id: userId, companyId, role: 'EMPLOYEE' },
			select: { id: true },
		});

		if (!user) {
			throw new BadRequestException('Ugyldig bruger');
		}

		const rows = await this.prisma.$queryRaw<
			{ id: string; type: AttendanceType; at: Date }[]
		>`
			with bounds as (
				select
					((${date}::date)::timestamp at time zone 'Europe/Copenhagen') as start_ts,
					(((${date}::date + interval '1 day')::timestamp) at time zone 'Europe/Copenhagen') as end_ts
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

		return { userId, date, events: rows };
	}

	@UseGuards(JwtGuard)
	@Post('user/:userId/event')
	async createEventForUser(
		@Param('userId') userId: string,
		@Req() req: Request,
		@Body() body: { type: string; at: string },
	) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		this.ensureCompanyAdmin(
			jwtUser,
			'Kun COMPANY_ADMIN kan oprette events',
		);

		const companyId = jwtUser.companyId;

		const user = await this.prisma.user.findFirst({
			where: { id: userId, companyId, role: 'EMPLOYEE' },
			select: { id: true },
		});

		if (!user) {
			throw new BadRequestException('Ugyldig bruger');
		}

		const type = this.ensureTypeOrThrow(body?.type);
		const at = this.parseAtOrThrow(body?.at);

		const created = await this.prisma.attendance.create({
			data: { userId, type, at },
			select: { id: true, type: true, at: true, userId: true },
		});

		return { ok: true, event: created };
	}

	@UseGuards(JwtGuard)
	@Put('event/:id')
	async updateEvent(
		@Param('id') id: string,
		@Req() req: Request,
		@Body() body: { type?: string; at?: string },
	) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		this.ensureCompanyAdmin(jwtUser, 'Kun COMPANY_ADMIN kan rette events');

		const found = await this.prisma.attendance.findUnique({
			where: { id },
			select: {
				id: true,
				userId: true,
				user: { select: { companyId: true } },
			},
		});

		if (!found || found.user.companyId !== jwtUser.companyId) {
			throw new BadRequestException('Ugyldig event');
		}

		const data: { type?: AttendanceType; at?: Date } = {};

		if (typeof body.type === 'string') {
			data.type = this.ensureTypeOrThrow(body.type);
		}

		if (typeof body.at === 'string') {
			data.at = this.parseAtOrThrow(body.at);
		}

		if (!Object.keys(data).length) {
			throw new BadRequestException('Ingen ændringer angivet');
		}

		const updated = await this.prisma.attendance.update({
			where: { id },
			data,
			select: { id: true, type: true, at: true, userId: true },
		});

		return { ok: true, event: updated };
	}

	@UseGuards(JwtGuard)
	@Delete('event/:id')
	async deleteEvent(@Param('id') id: string, @Req() req: Request) {
		const jwtUser = (req as Request & { user: JwtPayload }).user;
		this.ensureCompanyAdmin(jwtUser, 'Kun COMPANY_ADMIN kan slette events');

		const found = await this.prisma.attendance.findUnique({
			where: { id },
			select: { id: true, user: { select: { companyId: true } } },
		});

		if (!found || found.user.companyId !== jwtUser.companyId) {
			throw new BadRequestException('Ugyldig event');
		}

		await this.prisma.attendance.delete({ where: { id } });

		return { ok: true };
	}

	/* -------------------------------------------------------------------- */
}
