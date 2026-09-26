import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
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
import { MAX_LOGO_BYTES } from '../../../infrastructure/r2/r2';

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

  @Post('current/logo')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_BYTES },
    }),
  )
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.organizations.uploadLogo(user.organizationId, file?.buffer ?? Buffer.alloc(0));
  }

  @Delete('current/logo')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  clearLogo(@CurrentUser() user: AuthUser) {
    return this.organizations.clearLogo(user.organizationId);
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
