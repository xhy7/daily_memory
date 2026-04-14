import { put, del, list } from '@vercel/blob';

export interface UploadResult {
  url: string;
  pathname: string;
}

export interface DeleteResult {
  success: boolean;
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

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
