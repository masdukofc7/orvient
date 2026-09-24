import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  paginationQuerySchema,
  platformOrgListQuerySchema,
  platformUpdateOrgSchema,
  platformUpdateUserSchema,
  platformUserListQuerySchema,
  type PaginationQuery,
  type PlatformOrgListQuery,
  type PlatformUpdateOrgInput,
  type PlatformUpdateUserInput,
  type PlatformUserListQuery,
} from '@inventory/shared';
import { PlatformService } from '../application/platform.service';
import { PlatformAdmin } from '../../../common/decorators/platform-admin.decorator';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('platform')
@ApiBearerAuth()
@PlatformAdmin()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('organizations/export')
  exportOrganizations(
    @Query(new ZodValidationPipe(platformOrgListQuerySchema)) query: PlatformOrgListQuery,
  ) {
    return this.platform.exportOrganizations(query);
  }

  @Get('organizations')
  listOrganizations(
    @Query(new ZodValidationPipe(platformOrgListQuerySchema)) query: PlatformOrgListQuery,
  ) {
    return this.platform.listOrganizations(query);
  }

  @Get('organizations/:id')
  getOrganization(@Param('id') id: string) {
    return this.platform.getOrganization(id);
  }

  @Patch('organizations/:id')
  updateOrganization(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(platformUpdateOrgSchema)) body: PlatformUpdateOrgInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.updateOrganization(id, body, user.userId);
  }

  @Get('users/export')
  exportUsers(
    @Query(new ZodValidationPipe(platformUserListQuerySchema)) query: PlatformUserListQuery,
  ) {
    return this.platform.exportUsers(query);
  }

  @Get('users')
  listUsers(@Query(new ZodValidationPipe(platformUserListQuerySchema)) query: PlatformUserListQuery) {
    return this.platform.listUsers(query);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(platformUpdateUserSchema)) body: PlatformUpdateUserInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.updateUser(id, body, user.userId, user.platformRole);
  }

  @Get('audit')
  listAudit(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.platform.listAudit(query);
  }
}
