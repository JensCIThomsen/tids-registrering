import {
	Injectable,
	BadRequestException,
	ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

@Injectable()
export class AdminService {
	constructor(private readonly prisma: PrismaService) {}

	async createCompany(
		companyName: string,
		adminEmail: string,
		adminPassword: string,
	) {
		if (!adminPassword) {
			throw new BadRequestException(
				'adminPassword mangler (rammer service)',
			);
		}

		const existing = await this.prisma.user.findUnique({
			where: { email: adminEmail },
			select: { id: true },
		});

		if (existing) {
			throw new ConflictException('Email findes allerede');
		}

		const passwordHash = await bcrypt.hash(adminPassword, 10);

		const company = await this.prisma.company.create({
			data: { name: companyName },
			select: { id: true },
		});

		const adminUser = await this.prisma.user.create({
			data: {
				email: adminEmail,
				passwordHash,
				role: Role.COMPANY_ADMIN,
				companyId: company.id,
			},
			select: { id: true },
		});

		return { companyId: company.id, adminUserId: adminUser.id };
	}

	async createEmployee(companyId: string, email: string, password: string) {
		const company = await this.prisma.company.findUnique({
			where: { id: companyId },
			select: { id: true },
		});

		if (!company) {
			throw new BadRequestException('companyId findes ikke');
		}

		const existing = await this.prisma.user.findUnique({
			where: { email },
			select: { id: true },
		});

		if (existing) {
			throw new ConflictException('Email findes allerede');
		}

		const passwordHash = await bcrypt.hash(password, 10);

		const user = await this.prisma.user.create({
			data: {
				email,
				passwordHash,
				role: Role.EMPLOYEE,
				companyId: company.id,
			},
			select: { id: true },
		});

		return { userId: user.id };
	}

	async getEmployees(companyId: string) {
		const company = await this.prisma.company.findUnique({
			where: { id: companyId },
			select: { id: true },
		});

		if (!company) {
			throw new BadRequestException('companyId findes ikke');
		}

		const users = await this.prisma.user.findMany({
			where: { companyId },
			select: {
				id: true,
				email: true,
				role: true,
			},
			orderBy: { email: 'asc' },
		});

		return { users };
	}

	async deleteUser(companyId: string, userId: string) {
		const u = await this.prisma.user.findFirst({
			where: {
				id: userId,
				companyId,
			},
			select: {
				id: true,
				isDepartmentLeader: true,
			},
		});

		if (!u) {
			throw new BadRequestException('Bruger ikke fundet');
		}

		if (u.isDepartmentLeader) {
			throw new BadRequestException(
				'Brugeren kan ikke slettes, fordi den er afdelingsleder. Fjern afdelingsleder først.',
			);
		}

		const dependentsCount = await this.prisma.user.count({
			where: {
				companyId,
				managerId: userId,
			},
		});

		if (dependentsCount > 0) {
			throw new BadRequestException(
				`Brugeren kan ikke slettes, fordi den er leder for ${dependentsCount} bruger(e). Fjern lederrollen/tilknytninger først.`,
			);
		}

		const target = await this.prisma.user.findFirst({
			where: { id: userId, companyId },
			select: { id: true, role: true },
		});

		if (!target) {
			throw new NotFoundException('Bruger findes ikke i din virksomhed');
		}

		if (target.role === 'COMPANY_ADMIN' || target.role === 'SUPERADMIN') {
			throw new ForbiddenException('Kan ikke slette admin-brugere');
		}

		await this.prisma.user.delete({ where: { id: userId } });

		return { ok: true };
	}

	async createUser(
		companyId: string,
		email: string,
		password: string,
		name: string | null,
		role: Role,
		isDepartmentLeader: boolean,
		managerId: string | null,
		weeklyHours?: number,
		breakMinutesPerDay?: number,
		breakIsPaid?: boolean,
	) {
		const company = await this.prisma.company.findUnique({
			where: { id: companyId },
			select: { id: true },
		});

		if (!company) {
			throw new BadRequestException('companyId findes ikke');
		}

		const existing = await this.prisma.user.findUnique({
			where: { email },
			select: { id: true },
		});

		if (existing) {
			throw new ConflictException('Email findes allerede');
		}

		// ekstra sikkerhed (så ingen kan oprette SUPERADMIN her)
		if (role === Role.SUPERADMIN) {
			throw new ForbiddenException('Kan ikke oprette SUPERADMIN her');
		}

		if (isDepartmentLeader && managerId) {
			throw new BadRequestException(
				'Afdelingsleder kan ikke have en leder',
			);
		}

		// hvis managerId er sat: skal være en EMPLOYEE i samme virksomhed og være afdelingsleder
		if (managerId) {
			const manager = await this.prisma.user.findFirst({
				where: {
					id: managerId,
					companyId,
					role: Role.EMPLOYEE,
					isDepartmentLeader: true,
				},
				select: { id: true },
			});

			if (!manager) {
				throw new BadRequestException('Ugyldig leder');
			}
		}

		const passwordHash = await bcrypt.hash(password, 10);

		const user = await this.prisma.user.create({
			data: {
				email,
				name,
				passwordHash,
				role,
				companyId: company.id,

				isDepartmentLeader,
				managerId,

				...(weeklyHours !== undefined ? { weeklyHours } : {}),
				...(breakMinutesPerDay !== undefined
					? { breakMinutesPerDay }
					: {}),
				...(breakIsPaid !== undefined ? { breakIsPaid } : {}),
			},
			select: {
				id: true,
				email: true,
				name: true,
				role: true,
				companyId: true,
			},
		});

		return { ok: true, user };
	}

	async getUser(companyId: string, userId: string) {
		return await this.prisma.user.findFirst({
			where: {
				id: userId,
				companyId,
			},
			select: {
				id: true,
				email: true,
				name: true,
				isDepartmentLeader: true,
				managerId: true,

				weeklyHours: true,
				breakMinutesPerDay: true,
				breakIsPaid: true,
			},
		});
	}

	async updateUser(
		companyId: string,
		userId: string,
		name: string | null,
		isDepartmentLeader: boolean,
		managerId: string | null,
		weeklyHours?: number,
		breakMinutesPerDay?: number,
		breakIsPaid?: boolean,
	) {
		return await this.prisma.user.updateMany({
			where: {
				id: userId,
				companyId,
			},
			data: {
				name,
				isDepartmentLeader,
				managerId,
				...(weeklyHours !== undefined ? { weeklyHours } : {}),
				...(breakMinutesPerDay !== undefined
					? { breakMinutesPerDay }
					: {}),
				...(breakIsPaid !== undefined ? { breakIsPaid } : {}),
			},
		});
	}
}
