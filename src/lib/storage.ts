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
};

function buildImagePath(extension: string): string {
  return `images/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${Date.now()}-${sanitizedName}`;

  const blob = await put(`images/${filename}`, file, {
    access: 'public',
    contentType: file.type,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

export async function uploadImages(files: File[]): Promise<UploadResult[]> {
  return Promise.all(files.map(file => uploadImage(file)));
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
  const result = await put(buildImagePath(extension), blob, {
    access: 'public',
    contentType: parsed.mimeType,
  });

  return {
    url: result.url,
    pathname: result.pathname,
  };
}
