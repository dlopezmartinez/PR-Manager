import crypto from 'crypto';

if (!process.env.DOWNLOAD_SECRET) {
  throw new Error(
    'DOWNLOAD_SECRET environment variable is required for signed download URLs. ' +
    'Configure it in your .env file with a strong random value (min 32 characters).'
  );
}

const DOWNLOAD_SECRET = process.env.DOWNLOAD_SECRET;

export interface SignedUrlParams {
  userId: string;
  platform: 'mac' | 'windows' | 'linux-deb' | 'linux-rpm';
  version: string;
}

export function generateSignedDownloadUrl(
  params: SignedUrlParams,
  baseUrl: string,
  expiresInMs: number = 30 * 60 * 1000
): string {
  const { userId, platform, version } = params;
  const expires = Date.now() + expiresInMs;

  const data = `${userId}:${platform}:${version}:${expires}`;
  const signature = crypto
    .createHmac('sha256', DOWNLOAD_SECRET)
    .update(data)
    .digest('hex');

  const url = new URL(`${baseUrl}/download/${platform}/${version}`);
  url.searchParams.set('signature', signature);
  url.searchParams.set('expires', expires.toString());
  url.searchParams.set('user', userId);

  return url.toString();
}

export function verifySignedDownload(
  userId: string,
  platform: string,
  version: string,
  signature: string,
  expires: string
): { valid: boolean; error?: string } {
  const expiresNum = parseInt(expires, 10);

  if (isNaN(expiresNum)) {
    return { valid: false, error: 'Invalid expiration timestamp' };
  }

  if (Date.now() > expiresNum) {
    return { valid: false, error: 'Download link has expired' };
  }

  const data = `${userId}:${platform}:${version}:${expires}`;
  const expectedSignature = crypto
    .createHmac('sha256', DOWNLOAD_SECRET)
    .update(data)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Invalid signature' };
  }

  const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

export function getGitHubReleaseUrl(platform: string, version: string): string {
  const baseUrl = process.env.GITHUB_RELEASES_BASE_URL ||
    'https://github.com/dlopezmartinez/pr-manager/releases/download';

  const fileNames: Record<string, string> = {
    'mac': `PR-Manager-${version}.dmg`,
    'windows': `PRManager-${version}-Setup.exe`,
    'linux-deb': `pr-manager_${version}_amd64.deb`,
    'linux-rpm': `pr-manager-${version}.x86_64.rpm`,
  };

  const fileName = fileNames[platform];
  if (!fileName) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  return `${baseUrl}/v${version}/${fileName}`;
}

export function generateAllSignedUrls(
  userId: string,
  version: string,
  baseUrl: string
): {
  mac: string;
  windows: string;
  linuxDeb: string;
  linuxRpm: string;
} {
  return {
    mac: generateSignedDownloadUrl({ userId, platform: 'mac', version }, baseUrl),
    windows: generateSignedDownloadUrl({ userId, platform: 'windows', version }, baseUrl),
    linuxDeb: generateSignedDownloadUrl({ userId, platform: 'linux-deb', version }, baseUrl),
    linuxRpm: generateSignedDownloadUrl({ userId, platform: 'linux-rpm', version }, baseUrl),
  };
}
