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
} from '@nestjs/common';

import { AdminService } from './admin.service';
import { JwtGuard } from '../auth/jwt.guard';

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
}
