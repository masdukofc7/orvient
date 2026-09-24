import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_KEY = 'platformAdmin';

/** Restrict route to platform admins (SUPPORT or OWNER). */
export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
