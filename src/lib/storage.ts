import { del, put } from '@vercel/blob';

export interface UploadResult {
  url: string;
  pathname: string;
}

export interface DeleteResult {
  success: boolean;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const MIME_TYPE_ALIASES: Record<string, keyof typeof MIME_EXTENSION_MAP> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

const EXTENSION_MIME_MAP: Record<string, keyof typeof MIME_EXTENSION_MAP> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getFileExtension(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const extension = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.') + 1) : '';
  return extension.replace(/[^a-z0-9]/g, '');
}

function sanitizeFilenameBase(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  const sanitized = withoutExtension.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 48);
  return sanitized || 'image';
}

function normalizeMimeType(rawType: string): string {
  const normalized = rawType.trim().toLowerCase();
  return MIME_TYPE_ALIASES[normalized] || normalized;
}

function buildImagePath(extension: string, originalName = 'image'): string {
  const baseName = sanitizeFilenameBase(originalName);
  const uniqueId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `images/${Date.now()}-${baseName}-${uniqueId}.${extension}`;
}

export function resolveImageUploadType(file: File): {
  mimeType: keyof typeof MIME_EXTENSION_MAP;
  extension: string;
} {
  const normalizedMimeType = normalizeMimeType(file.type);
  const extensionFromName = getFileExtension(file.name);

  if (normalizedMimeType in MIME_EXTENSION_MAP) {
    return {
      mimeType: normalizedMimeType as keyof typeof MIME_EXTENSION_MAP,
      extension: MIME_EXTENSION_MAP[normalizedMimeType as keyof typeof MIME_EXTENSION_MAP],
    };
  }

  if (extensionFromName in EXTENSION_MIME_MAP) {
    const mimeType = EXTENSION_MIME_MAP[extensionFromName];
    return {
      mimeType,
      extension: MIME_EXTENSION_MAP[mimeType],
    };
  }

  throw new Error(
    `暂不支持该图片格式：${file.name || '未命名图片'}。请使用 JPG、PNG、GIF、WEBP、AVIF、HEIC 或 HEIF。`
  );
}

async function putWithRetry(
  pathname: string,
  blob: Blob,
  contentType: string
): Promise<{ url: string; pathname: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await put(pathname, blob, {
        access: 'public',
        contentType,
      });
    } catch (error) {
      lastError = error;

      if (attempt === 2) {
        break;
      }

      await sleep(300 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Image upload failed');
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const { mimeType, extension } = resolveImageUploadType(file);
  const pathname = buildImagePath(extension, file.name);
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: mimeType });

  const uploaded = await putWithRetry(pathname, blob, mimeType);

  return {
    url: uploaded.url,
    pathname: uploaded.pathname,
  };
}

export async function uploadImages(files: File[]): Promise<UploadResult[]> {
  const uploads: UploadResult[] = [];

  for (const file of files) {
    uploads.push(await uploadImage(file));
  }

  return uploads;
}

export async function deleteImage(pathname: string): Promise<DeleteResult> {
  try {
    await del(pathname);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete image:', error);
    return { success: false };
  }
}

export function isBase64Image(url: string): boolean {
  return url.startsWith('data:image');
}

export function extractBase64Data(url: string): { mimeType: string; data: string } | null {
  if (!isBase64Image(url)) {
    return null;
  }

  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

export async function uploadBase64Image(url: string): Promise<UploadResult> {
  const parsed = extractBase64Data(url);
  if (!parsed) {
    throw new Error('Invalid base64 image payload');
  }

  const extension = MIME_EXTENSION_MAP[parsed.mimeType] || 'bin';
  const blob = new Blob([Buffer.from(parsed.data, 'base64')], { type: parsed.mimeType });
  const result = await putWithRetry(buildImagePath(extension), blob, parsed.mimeType);

  return {
    url: result.url,
    pathname: result.pathname,
  };
}
