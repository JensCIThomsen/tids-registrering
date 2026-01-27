import {
	BadRequestException,
	Controller,
	Delete,
	ForbiddenException,
	Param,
	Post,
	Req,
	UseGuards,
	Body,
	Get,
	Put,
	NotFoundException,
} from '@nestjs/common';

import { AdminService } from './admin.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Role } from '@prisma/client';

type JwtUser = {
	sub: string;
	role: 'COMPANY_ADMIN' | 'EMPLOYEE' | 'SUPERADMIN';
	companyId?: string | null;
};

type CreateEmployeeBody = {
	companyId?: string;
	email?: string;
	password?: string;
};

type CreateUserBody = {
	companyId?: string;
	email?: string;
	password?: string;
	name?: string;
	role?: 'EMPLOYEE' | 'COMPANY_ADMIN';

	// leder / afdelingsleder
	isDepartmentLeader?: boolean;
	managerId?: string | null;

	// arbejdsregler
	weeklyHours?: number | string;
	breakMinutesPerDay?: number | string;
	breakIsPaid?: boolean;
};

@Controller('admin')
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Post('create-employee')
	async createEmployee(@Body() body: CreateEmployeeBody) {
		const companyId = (body.companyId ?? '').trim();
		const email = (body.email ?? '').trim().toLowerCase();
		const password = body.password ?? '';

		if (!companyId) throw new BadRequestException('companyId mangler');
		if (!email) throw new BadRequestException('email mangler');
		if (!password) throw new BadRequestException('password mangler');

		return await this.adminService.createEmployee(
			companyId,
			email,
			password,
		);
	}

	@UseGuards(JwtGuard)
	@Post('create-user')
	async createUser(
		@Req() req: { user?: JwtUser },
		@Body() body: CreateUserBody,
	) {
		const jwtUser = req.user;

		if (!jwtUser) {
			throw new ForbiddenException('Ikke logget ind');
		}

		const email = (body.email ?? '').trim().toLowerCase();
		const password = body.password ?? '';
		const name = (body.name ?? '').trim();
		const role = (body.role ?? '').trim() as CreateUserBody['role'];
		const companyId = (body.companyId ?? '').trim();

		if (!email) throw new BadRequestException('email mangler');
		if (!password) throw new BadRequestException('password mangler');
		if (!role) throw new BadRequestException('role mangler');
		if (!companyId) throw new BadRequestException('companyId mangler');

		// COMPANY_ADMIN: låst til egen virksomhed + kun EMPLOYEE
		if (jwtUser.role === 'COMPANY_ADMIN') {
			if (!jwtUser.companyId) {
				throw new ForbiddenException('COMPANY_ADMIN mangler companyId');
			}
			if (companyId !== jwtUser.companyId) {
				throw new ForbiddenException(
					'Du kan kun oprette brugere i egen virksomhed',
				);
			}
			if (role !== 'EMPLOYEE') {
				throw new ForbiddenException(
					'COMPANY_ADMIN kan kun oprette EMPLOYEE',
				);
			}
		}

		// SUPERADMIN: må oprette EMPLOYEE eller COMPANY_ADMIN (ikke SUPERADMIN via dette endpoint)
		if (jwtUser.role === 'SUPERADMIN') {
			if (role !== 'EMPLOYEE' && role !== 'COMPANY_ADMIN') {
				throw new ForbiddenException(
					'SUPERADMIN kan kun oprette EMPLOYEE eller COMPANY_ADMIN',
				);
			}
		}

		// EMPLOYEE må ikke
		if (jwtUser.role === 'EMPLOYEE') {
			throw new ForbiddenException('Ingen adgang');
		}

		const toIntOrUndefined = (v: unknown) => {
			if (v === undefined || v === null) return undefined;
			if (typeof v === 'number')
				return Number.isFinite(v) ? Math.trunc(v) : undefined;
			if (typeof v === 'string') {
				const t = v.trim();
				if (!t) return undefined;
				const n = Number(t);
				return Number.isFinite(n) ? Math.trunc(n) : undefined;
			}
			return undefined;
		};

		const isDepartmentLeader = !!body.isDepartmentLeader;
		const managerId = body.managerId ?? null;

		if (isDepartmentLeader && managerId) {
			throw new BadRequestException(
				'Afdelingsleder kan ikke have en leder',
			);
		}

		const weeklyHours = toIntOrUndefined(body.weeklyHours);
		const breakMinutesPerDay = toIntOrUndefined(body.breakMinutesPerDay);
		const breakIsPaid = body.breakIsPaid;

		if (weeklyHours !== undefined && weeklyHours < 0) {
			throw new BadRequestException('weeklyHours skal være >= 0');
		}
		if (breakMinutesPerDay !== undefined && breakMinutesPerDay < 0) {
			throw new BadRequestException('breakMinutesPerDay skal være >= 0');
		}

		return await this.adminService.createUser(
			companyId,
			email,
			password,
			name || null,
			role === 'COMPANY_ADMIN' ? Role.COMPANY_ADMIN : Role.EMPLOYEE,
			isDepartmentLeader,
			managerId,
			weeklyHours,
			breakMinutesPerDay,
			breakIsPaid,
		);
	}

	@UseGuards(JwtGuard)
	@Delete('users/:userId')
	async deleteUser(
		@Req() req: { user?: JwtUser },
		@Param('userId') userId: string,
	) {
		const jwtUser = req.user;

		if (
			!jwtUser ||
			jwtUser.role !== 'COMPANY_ADMIN' ||
			!jwtUser.companyId
		) {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan slette brugere',
			);
		}

		return await this.adminService.deleteUser(jwtUser.companyId, userId);
	}

	@UseGuards(JwtGuard)
	@Get('users/:id')
	async getUser(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
		const jwtUser = req.user;

		if (!jwtUser?.role) {
			throw new ForbiddenException('Ingen adgang');
		}

		if (jwtUser.role !== 'COMPANY_ADMIN' || !jwtUser.companyId) {
			throw new ForbiddenException('Kun COMPANY_ADMIN kan hente brugere');
		}

		const user = await this.adminService.getUser(jwtUser.companyId, id);

		if (!user) {
			throw new NotFoundException('Bruger ikke fundet');
		}

		return user;
	}

	@UseGuards(JwtGuard)
	@Put('users/:id')
	async updateUser(
		@Req() req: { user?: JwtUser },
		@Param('id') id: string,
		@Body()
		body: {
			name?: string;
			isDepartmentLeader?: boolean;
			managerId?: string | null;

			weeklyHours?: number | string;
			breakMinutesPerDay?: number | string;
			breakIsPaid?: boolean;
		},
	) {
		const jwtUser = req.user;

		if (
			!jwtUser ||
			jwtUser.role !== 'COMPANY_ADMIN' ||
			!jwtUser.companyId
		) {
			throw new ForbiddenException(
				'Kun COMPANY_ADMIN kan opdatere brugere',
			);
		}

		const toIntOrUndefined = (v: unknown) => {
			if (v === undefined || v === null) return undefined;
			if (typeof v === 'number')
				return Number.isFinite(v) ? Math.trunc(v) : undefined;
			if (typeof v === 'string') {
				const t = v.trim();
				if (!t) return undefined;
				const n = Number(t);
				return Number.isFinite(n) ? Math.trunc(n) : undefined;
			}
			return undefined;
		};

		const weeklyHours = toIntOrUndefined(body.weeklyHours);
		const breakMinutesPerDay = toIntOrUndefined(body.breakMinutesPerDay);
		const breakIsPaid = body.breakIsPaid;

		if (weeklyHours !== undefined && weeklyHours < 0) {
			throw new BadRequestException('weeklyHours skal være >= 0');
		}
		if (breakMinutesPerDay !== undefined && breakMinutesPerDay < 0) {
			throw new BadRequestException('breakMinutesPerDay skal være >= 0');
		}

		const result = await this.adminService.updateUser(
			jwtUser.companyId,
			id,
			(body.name ?? '').trim() || null,
			!!body.isDepartmentLeader,
			body.managerId ?? null,
			weeklyHours,
			breakMinutesPerDay,
			breakIsPaid,
		);

		if (result.count === 0) {
			throw new NotFoundException('Bruger ikke fundet');
		}

		return { ok: true };
	}
}
