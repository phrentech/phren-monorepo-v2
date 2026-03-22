import { AwsClient } from 'aws4fetch';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createR2Client(config: R2Config) {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });

  const baseUrl = `https://${config.accountId}.r2.cloudflarestorage.com`;

  return {
    async getPresignedUrl(bucket: string, key: string, expiresInSeconds: number = 3600): Promise<string> {
      if (expiresInSeconds > 3600) throw new Error('Max presigned URL expiry is 1 hour (HIPAA)');
      const url = new URL(`/${bucket}/${key}`, baseUrl);
      url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
      const signed = await client.sign(url.toString(), { method: 'GET', aws: { signQuery: true } });
      return signed.url;
    },

    async getUploadUrl(bucket: string, key: string, contentType: string, expiresInSeconds: number = 3600): Promise<string> {
      if (expiresInSeconds > 3600) throw new Error('Max presigned URL expiry is 1 hour (HIPAA)');
      const url = new URL(`/${bucket}/${key}`, baseUrl);
      url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
      const signed = await client.sign(url.toString(), {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        aws: { signQuery: true },
      });
      return signed.url;
    },
  };
}
