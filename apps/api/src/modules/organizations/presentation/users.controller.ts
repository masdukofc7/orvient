import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createOrgUserSchema,
  inviteOrgUserSchema,
  updateOrgUserSchema,
  type CreateOrgUserInput,
  type InviteOrgUserInput,
  type UpdateOrgUserInput,
} from '@inventory/shared';
import { UsersService } from '../application/users.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('users')
@ApiBearerAuth()
@RequirePermission('team.manage')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user.organizationId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrgUserSchema)) body: CreateOrgUserInput,
  ) {
    return this.users.create(user.organizationId, user.userId, body);
  }

  @Post('invite')
  invite(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(inviteOrgUserSchema)) body: InviteOrgUserInput,
  ) {
    return this.users.invite(user.organizationId, user.userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrgUserSchema)) body: UpdateOrgUserInput,
  ) {
    return this.users.update(
      user.organizationId,
      user.userId,
      user.membershipRole,
      id,
      body,
    );
  }
}
