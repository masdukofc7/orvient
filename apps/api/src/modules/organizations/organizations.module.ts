import { Module } from '@nestjs/common';
import { OrganizationsService } from './application/organizations.service';
import { OrganizationsController } from './presentation/organizations.controller';
import { UsersService } from './application/users.service';
import { UsersController } from './presentation/users.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [OrganizationsController, UsersController],
  providers: [OrganizationsService, UsersService],
})
export class OrganizationsModule {}
