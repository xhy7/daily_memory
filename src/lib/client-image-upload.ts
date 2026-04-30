import { IMAGE_UPLOAD_TARGET_BYTES, IMAGE_UPLOAD_TARGET_MB } from './upload-limits';

const QUALITY_STEPS = [0.92, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.32, 0.24];
const SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.3, 0.25];

const OUTPUT_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};

export interface PreparedImageUpload {
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
  originalType: string;
  finalType: string;
}

export interface ImageUploadResult {
  url: string;
  pathname: string | null;
  prepared: PreparedImageUpload;
}

export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

export interface ImageCompressionAdapter {
  decode(file: File): Promise<DecodedImage>;
  encode(
    image: DecodedImage,
    options: {
      width: number;
      height: number;
      mimeType: string;
      quality: number;
    }
  ): Promise<Blob>;
  supportsOutputType?: (mimeType: string) => boolean;
}

export interface PrepareImageOptions {
  targetBytes?: number;
  adapter?: ImageCompressionAdapter;
}

function normalizeImageType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') {
    return 'image/jpeg';
  }

  if (normalized === 'image/x-png') {
    return 'image/png';
  }

  return normalized;
}

function getFileExtension(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const extension = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.') + 1) : '';
  return extension.replace(/[^a-z0-9]/g, '');
}

function inferImageType(file: File): string {
  const normalizedType = normalizeImageType(file.type || '');
  if (normalizedType) {
    return normalizedType;
  }

  return EXTENSION_MIME_MAP[getFileExtension(file.name)] || '';
}

function buildCompressedFilename(filename: string, mimeType: string): string {
  const extension = OUTPUT_EXTENSION_MAP[mimeType] || 'jpg';
  const baseName = filename.replace(/\.[^.]+$/, '') || 'image';
  return `${baseName}-compressed.${extension}`;
}

function supportsCanvasOutputType(mimeType: string): boolean {
  if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`);
}

export function getCompressionOutputTypes(
  file: File,
  supportsOutputType: (mimeType: string) => boolean = supportsCanvasOutputType
): string[] {
  const inputType = inferImageType(file);
  const candidates: string[] = [];

  const addCandidate = (mimeType: string) => {
    if (!candidates.includes(mimeType) && supportsOutputType(mimeType)) {
      candidates.push(mimeType);
    }
  };

  if (inputType === 'image/jpeg') {
    addCandidate('image/jpeg');
  } else if (inputType === 'image/webp') {
    addCandidate('image/webp');
    addCandidate('image/jpeg');
  } else if (inputType === 'image/png') {
    addCandidate('image/webp');
    addCandidate('image/jpeg');
  } else if (inputType.startsWith('image/')) {
    addCandidate('image/webp');
    addCandidate('image/jpeg');
  }

  return candidates;
}

async function decodeBrowserImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Image decoding is unavailable');
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        close: () => URL.revokeObjectURL(objectUrl),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image decoding failed'));
    };

    image.src = objectUrl;
  });
}

async function encodeWithCanvas(
  image: DecodedImage,
  options: {
    width: number;
    height: number;
    mimeType: string;
    quality: number;
  }
): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas is unavailable');
  }

  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context is unavailable');
  }

  if (options.mimeType === 'image/jpeg') {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, options.mimeType, options.quality);
  });

  if (!blob) {
    throw new Error('Canvas encoding failed');
  }

  return blob;
}

const browserCompressionAdapter: ImageCompressionAdapter = {
  decode: decodeBrowserImage,
  encode: encodeWithCanvas,
  supportsOutputType: supportsCanvasOutputType,
};

function createPreparedResult(file: File, originalFile: File, compressed: boolean): PreparedImageUpload {
  return {
    file,
    compressed,
    originalSize: originalFile.size,
    finalSize: file.size,
    originalType: inferImageType(originalFile),
    finalType: inferImageType(file),
  };
}

function createCompressedFile(blob: Blob, originalFile: File, mimeType: string): File {
  return new File([blob], buildCompressedFilename(originalFile.name, mimeType), {
    type: mimeType,
    lastModified: originalFile.lastModified,
  });
}

function getDecodeError(): Error {
  return new Error(
    '\u6d4f\u89c8\u5668\u65e0\u6cd5\u89e3\u6790\u8fd9\u5f20\u56fe\u7247\uff0c\u8bf7\u6362\u7528 JPG\u3001PNG \u6216 WebP \u683c\u5f0f\u540e\u518d\u8bd5\u3002'
  );
}

function getStillTooLargeError(targetMb: number): Error {
  return new Error(
    `\u56fe\u7247\u538b\u7f29\u540e\u4ecd\u8d85\u8fc7 ${targetMb}MB\uff0c\u8bf7\u9009\u62e9\u66f4\u5c0f\u7684\u56fe\u7247\u6216\u622a\u56fe\u540e\u518d\u8bd5\u3002`
  );
}

export async function prepareImageForUpload(
  file: File,
  options: PrepareImageOptions = {}
): Promise<PreparedImageUpload> {
  const targetBytes = options.targetBytes ?? IMAGE_UPLOAD_TARGET_BYTES;
  if (file.size <= targetBytes) {
    return createPreparedResult(file, file, false);
  }

  const adapter = options.adapter ?? browserCompressionAdapter;
  const outputTypes = getCompressionOutputTypes(
    file,
    adapter.supportsOutputType ?? supportsCanvasOutputType
  );

  if (outputTypes.length === 0) {
    throw getDecodeError();
  }

  let decoded: DecodedImage;
  try {
    decoded = await adapter.decode(file);
  } catch {
    throw getDecodeError();
  }

  try {
    const sourceWidth = Math.max(1, decoded.width);
    const sourceHeight = Math.max(1, decoded.height);

    for (const mimeType of outputTypes) {
      for (const scale of SCALE_STEPS) {
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));

        for (const quality of QUALITY_STEPS) {
          let blob: Blob;
          try {
            blob = await adapter.encode(decoded, { width, height, mimeType, quality });
          } catch {
            continue;
          }

          if (blob.size <= targetBytes) {
            return createPreparedResult(createCompressedFile(blob, file, mimeType), file, true);
          }
        }
      }
    }
  } finally {
    decoded.close?.();
  }

  throw getStillTooLargeError(options.targetBytes ? targetBytes / 1024 / 1024 : IMAGE_UPLOAD_TARGET_MB);
}

export async function uploadImageFile(file: File): Promise<ImageUploadResult> {
  const prepared = await prepareImageForUpload(file);
  const formData = new FormData();
  formData.append('file', prepared.file);

  const response = await fetch('/api/upload', { method: 'POST', body: formData });
  let data: {
    error?: string;
    url?: string | null;
    pathname?: string | null;
    uploads?: Array<{ url?: string | null; pathname?: string | null }>;
  } = {};

  try {
    data = (await response.json()) as typeof data;
  } catch {
    data = {};
  }

  const firstUpload = Array.isArray(data.uploads)
    ? data.uploads.find((item) => typeof item.url === 'string' && item.url.length > 0)
    : undefined;
  const url = firstUpload?.url || data.url;
  const pathname = firstUpload?.pathname || data.pathname || null;

  if (!response.ok || !url) {
    const fallbackError =
      response.status === 413
        ? '\u56fe\u7247\u4e0a\u4f20\u8bf7\u6c42\u8fc7\u5927\uff0c\u8bf7\u9009\u62e9\u66f4\u5c0f\u7684\u56fe\u7247\u6216\u622a\u56fe\u540e\u518d\u8bd5\u3002'
        : '\u56fe\u7247\u4e0a\u4f20\u5931\u8d25';
    throw new Error(data.error || fallbackError);
  }

  return {
    url,
    pathname,
    prepared,
  };
}
