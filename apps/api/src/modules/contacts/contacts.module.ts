import { Module } from '@nestjs/common';
import { ContactsService } from './application/contacts.service';
import { ContactsController } from './presentation/contacts.controller';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
