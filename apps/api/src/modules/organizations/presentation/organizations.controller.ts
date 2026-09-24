import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createBranchSchema,
  updateBranchSchema,
  updateOrganizationSchema,
  type CreateBranchInput,
  type UpdateBranchInput,
  type UpdateOrganizationInput,
} from '@inventory/shared';
import { OrganizationsService } from '../application/organizations.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.organizations.get(user.organizationId);
  }

  @Patch('current')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
  ) {
    return this.organizations.update(user.organizationId, body);
  }

  @Get('branches')
  listBranches(@CurrentUser() user: AuthUser) {
    return this.organizations.listBranches(user.organizationId);
  }

  @Post('branches')
  @Roles('OWNER', 'ADMIN')
  createBranch(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchInput,
  ) {
    return this.organizations.createBranch(user.organizationId, body);
  }

  @Patch('branches/:id')
  @Roles('OWNER', 'ADMIN')
  updateBranch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchInput,
  ) {
    return this.organizations.updateBranch(user.organizationId, id, body);
  }
}
