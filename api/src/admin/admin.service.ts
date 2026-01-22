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
}
