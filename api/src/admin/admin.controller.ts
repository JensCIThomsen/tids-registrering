import {
  Body,
  Controller,
  Post,
  BadRequestException,
  Get,
  Param,
} from '@nestjs/common';
import { AdminService } from './admin.service';

type CreateCompanyBody = {
  companyName?: string;
  adminEmail?: string;
  adminPassword?: string;
};

type CreateEmployeeBody = {
  companyId?: string;
  email?: string;
  password?: string;
};

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('create-company')
  async createCompany(@Body() body: CreateCompanyBody) {
    const companyName = (body.companyName ?? '').trim();
    const adminEmail = (body.adminEmail ?? '').trim().toLowerCase();
    const adminPassword = body.adminPassword ?? '';

    if (!companyName) throw new BadRequestException('companyName mangler');
    if (!adminEmail) throw new BadRequestException('adminEmail mangler');
    if (!adminPassword) throw new BadRequestException('adminPassword mangler');

    return await this.adminService.createCompany(
      companyName,
      adminEmail,
      adminPassword,
    );
  }

  @Post('create-employee')
  async createEmployee(@Body() body: CreateEmployeeBody) {
    const companyId = (body.companyId ?? '').trim();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!companyId) throw new BadRequestException('companyId mangler');
    if (!email) throw new BadRequestException('email mangler');
    if (!password) throw new BadRequestException('password mangler');

    return await this.adminService.createEmployee(companyId, email, password);
  }

  @Get('employees/:companyId')
  async getEmployees(@Param('companyId') companyId: string) {
    const id = (companyId ?? '').trim();
    if (!id) throw new BadRequestException('companyId mangler');

    return await this.adminService.getEmployees(id);
  }
}
