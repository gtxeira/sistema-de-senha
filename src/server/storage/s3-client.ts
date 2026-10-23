import 'server-only';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

function getEnv(): NodeJS.ProcessEnv {
  return process.env;
}

let client: S3Client | null = null;

function getS3Client(): S3Client {
  if (client) return client;

  const env = getEnv();
  const endpoint = env.S3_ENDPOINT;
  const accessKeyId = env.S3_ACCESS_KEY;
  const secretAccessKey = env.S3_SECRET_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3 não configurado. Defina S3_ENDPOINT, S3_ACCESS_KEY e S3_SECRET_KEY.',
    );
  }

  client = new S3Client({
    endpoint,
    region: env.S3_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  return client;
}

function getS3Bucket(): string {
  return getEnv().S3_BUCKET || 'news-images';
}

function getS3PublicUrl(): string | undefined {
  return getEnv().S3_PUBLIC_URL?.replace(/\/+$/, '');
}

/**
 * Duck-type do erro do SDK: o `HeadObject` sinaliza ausência tanto em
 * `$metadata.httpStatusCode === 404` quanto em `name === "NotFound"`, e
 * dependendo da versão do SDK só um dos dois vem preenchido.
 */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as {
    readonly $metadata?: { readonly httpStatusCode?: number } | null;
    readonly name?: string;
  };
  return e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound';
}

/**
 * Upload a file to S3
 * @param key - Object key (e.g. "filename.jpg")
 * @param buffer - File content
 * @param contentType - MIME type
 */
export async function uploadToS3(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

/**
 * Delete a file from S3 (best effort)
 * @param key - Object key
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (!key) return;
  try {
    const s3 = getS3Client();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
      }),
    );
  } catch {
    // Best effort — ignore errors on delete
  }
}

/**
 * Build the public URL for an object
 * @param key - Object key
 */
export function getPublicUrl(key: string): string {
  const publicUrl = getS3PublicUrl();
  if (!publicUrl) {
    throw new Error('S3_PUBLIC_URL não configurado.');
  }
  return `${publicUrl}/${key}`;
}

/**
 * Extract the object key from a stored image URL
 * @param imageUrl - The URL stored in the database
 * @returns The object key, or null if not an S3 URL
 */
export function extractKeyFromUrl(
  imageUrl?: string | null | undefined,
): string | null {
  const publicUrl = getS3PublicUrl();
  if (!imageUrl || !publicUrl) return null;
  const prefix = publicUrl + '/';
  if (!imageUrl.startsWith(prefix)) return null;
  return imageUrl.slice(prefix.length);
}

/**
 * Checa se um objeto existe no bucket.
 * @param key - Chave do objeto
 */
export async function objectExistsInS3(key: string): Promise<boolean> {
  if (!key) return false;

  try {
    const s3 = getS3Client();
    await s3.send(
      new HeadObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
      }),
    );
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error; // Lança novamente se for erro de conexão/credencial
  }
}
