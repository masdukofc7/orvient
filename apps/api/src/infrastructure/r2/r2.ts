import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export function r2Configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL,
  );
}

/** Validate size + magic bytes (not client MIME). */
export function sniffImageUpload(
  body: Buffer,
): { ok: true; ext: string; contentType: string } | { ok: false; error: string } {
  if (body.length <= 0 || body.length > MAX_LOGO_BYTES) {
    return { ok: false, error: 'Image must be under 5MB' };
  }
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return { ok: true, ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) {
    return { ok: true, ext: 'png', contentType: 'image/png' };
  }
  if (body[0] === 0x47 && body[1] === 0x49 && body[2] === 0x46 && body[3] === 0x38) {
    return { ok: true, ext: 'gif', contentType: 'image/gif' };
  }
  if (
    body.length >= 12 &&
    body[0] === 0x52 &&
    body[1] === 0x49 &&
    body[2] === 0x46 &&
    body[3] === 0x46 &&
    body[8] === 0x57 &&
    body[9] === 0x45 &&
    body[10] === 0x42 &&
    body[11] === 0x50
  ) {
    return { ok: true, ext: 'webp', contentType: 'image/webp' };
  }
  return { ok: false, error: 'Only JPEG, PNG, WebP, or GIF allowed' };
}

function client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error('R2_ACCOUNT_ID missing');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function bucketAndPublicUrl() {
  if (!r2Configured()) {
    throw new Error('R2 is not configured (set R2_* env vars)');
  }
  return {
    bucket: process.env.R2_BUCKET!,
    publicUrl: process.env.R2_PUBLIC_URL!.replace(/\/$/, ''),
  };
}

export function buildLogoKey(orgId: string, ext: string) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `orgs/${orgId}/logo-${id}.${ext}`;
}

/** Object key if `url` is under R2_PUBLIC_URL; otherwise null. */
export function r2KeyFromPublicUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (!base || !url) return null;
  const trimmed = url.trim();
  const prefix = `${base}/`;
  if (!trimmed.startsWith(prefix)) return null;
  const key = trimmed.slice(prefix.length).split('?')[0] ?? '';
  return key && !key.includes('..') ? key : null;
}

export async function uploadToR2(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const { bucket, publicUrl } = bucketAndPublicUrl();
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return `${publicUrl}/${params.key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  const { bucket } = bucketAndPublicUrl();
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
