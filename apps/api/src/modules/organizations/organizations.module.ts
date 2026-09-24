import { Module } from '@nestjs/common';
import { OrganizationsService } from './application/organizations.service';
import { OrganizationsController } from './presentation/organizations.controller';
import { UsersService } from './application/users.service';
import { UsersController } from './presentation/users.controller';

@Module({
  controllers: [OrganizationsController, UsersController],
  providers: [OrganizationsService, UsersService],
})
export class OrganizationsModule {}
