import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  loginSchema,
  signupSchema,
  switchOrgSchema,
  switchBranchSchema,
  type LoginInput,
  type SignupInput,
  type SwitchOrgInput,
  type SwitchBranchInput,
} from '@inventory/shared';
import { AuthService } from '../application/auth.service';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { cookieSecure } from '../../../config/validate-env';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieOpts(maxAge: number) {
    return {
      httpOnly: true as const,
      secure: cookieSecure(),
      sameSite: 'lax' as const,
      maxAge,
    };
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('accessToken', accessToken, {
      ...this.cookieOpts(15 * 60 * 1000),
      path: '/',
    });
    res.cookie('refreshToken', refreshToken, {
      ...this.cookieOpts(7 * 24 * 60 * 60 * 1000),
      path: '/api/v1/auth',
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.signup(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if ('requiresOrgChoice' in result) {
      return result;
    }
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token =
      (req.cookies?.refreshToken as string | undefined) ??
      (req.body?.refreshToken as string | undefined);
    const organizationId =
      typeof req.body?.organizationId === 'string' ? req.body.organizationId : undefined;
    const result = await this.auth.refresh(token ?? '', organizationId);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @ApiBearerAuth()
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser,
  ) {
    const token = req.cookies?.refreshToken as string | undefined;
    await this.auth.logout(token, user.userId);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId, user.organizationId, user.branchId);
  }

  @ApiBearerAuth()
  @Get('memberships')
  async memberships(@CurrentUser() user: AuthUser) {
    return this.auth.listMemberships(user.userId);
  }

  @ApiBearerAuth()
  @Post('switch-org')
  async switchOrg(
    @Body(new ZodValidationPipe(switchOrgSchema)) body: SwitchOrgInput,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.switchOrg(user.userId, body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @ApiBearerAuth()
  @Post('switch-branch')
  async switchBranch(
    @Body(new ZodValidationPipe(switchBranchSchema)) body: SwitchBranchInput,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.switchBranch(user.userId, user.organizationId, body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }
}
