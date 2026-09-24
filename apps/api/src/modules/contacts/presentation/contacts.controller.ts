import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createContactSchema,
  updateContactSchema,
  contactListQuerySchema,
  type CreateContactInput,
  type UpdateContactInput,
  type ContactListQuery,
} from '@inventory/shared';
import { ContactsService } from '../application/contacts.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(contactListQuerySchema)) query: ContactListQuery,
  ) {
    return this.contacts.list(user.organizationId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contacts.findOne(user.organizationId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactInput,
  ) {
    return this.contacts.create(user.organizationId, user.userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactInput,
  ) {
    return this.contacts.update(user.organizationId, user.userId, id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contacts.softDelete(user.organizationId, user.userId, id);
  }
}
