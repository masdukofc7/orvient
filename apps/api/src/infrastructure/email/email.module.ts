import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('RESEND_API_KEY') ?? process.env.RESEND_API_KEY;
    this.from =
      config.get<string>('EMAIL_FROM') ??
      process.env.EMAIL_FROM ??
      'Orvient <onboarding@resend.dev>';
    this.appUrl = (
      config.get<string>('APP_URL') ??
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    this.resend = key ? new Resend(key) : null;
    if (!this.resend) {
      this.log.warn('RESEND_API_KEY unset — emails will be logged only');
    }
  }

  getAppUrl() {
    return this.appUrl;
  }

  async send(opts: { to: string; subject: string; html: string; text?: string }) {
    if (!this.resend) {
      this.log.log(`[email:dry-run] to=${opts.to} subject=${opts.subject}`);
      return { id: 'dry-run' };
    }
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      this.log.error(`Resend failed: ${error.message}`);
      throw new Error(error.message);
    }
    return data;
  }

  async sendPasswordReset(to: string, token: string) {
    const url = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return this.send({
      to,
      subject: 'Reset your Orvient password',
      text: `Reset your password: ${url}\nThis link expires in 1 hour.`,
      html: `<p>Reset your password:</p><p><a href="${url}">${url}</a></p><p>This link expires in 1 hour.</p>`,
    });
  }

  async sendInvite(to: string, orgName: string, token: string) {
    const url = `${this.appUrl}/accept-invite?token=${encodeURIComponent(token)}`;
    return this.send({
      to,
      subject: `You're invited to ${orgName} on Orvient`,
      text: `Join ${orgName}: ${url}\nThis link expires in 7 days.`,
      html: `<p>You've been invited to <strong>${orgName}</strong> on Orvient.</p><p><a href="${url}">Accept invite</a></p><p>Expires in 7 days.</p>`,
    });
  }

  async sendLowStock(to: string, orgName: string, rows: Array<{ name: string; sku: string; stock: number; lowStockAt: number }>) {
    const lines = rows
      .map((r) => `• ${r.name} (${r.sku}): ${r.stock} left (threshold ${r.lowStockAt})`)
      .join('\n');
    const htmlRows = rows
      .map(
        (r) =>
          `<li><strong>${r.name}</strong> (${r.sku}): ${r.stock} left (threshold ${r.lowStockAt})</li>`,
      )
      .join('');
    return this.send({
      to,
      subject: `Low stock alert — ${orgName}`,
      text: `Low stock in ${orgName}:\n${lines}\n\n${this.appUrl}/inventory`,
      html: `<p>Low stock in <strong>${orgName}</strong>:</p><ul>${htmlRows}</ul><p><a href="${this.appUrl}/inventory">Open inventory</a></p>`,
    });
  }
}

@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
