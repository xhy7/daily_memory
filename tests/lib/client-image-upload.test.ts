import { describe, expect, it } from '@jest/globals';
import {
  type DecodedImage,
  type ImageCompressionAdapter,
  prepareImageForUpload,
  uploadImageFile,
} from '@/lib/client-image-upload';
import {
  IMAGE_UPLOAD_TARGET_BYTES,
  IMAGE_UPLOAD_TARGET_MB,
} from '@/lib/upload-limits';

type EncodeCall = {
  width: number;
  height: number;
  mimeType: string;
  quality: number;
};

function makeFile(size: number, name = 'image.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(size)], name, { type, lastModified: 123 });
}

function makeBlob(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

function createAdapter(options: {
  blobSizes?: number[];
  supportsOutputType?: (mimeType: string) => boolean;
  decode?: () => Promise<DecodedImage>;
}): { adapter: ImageCompressionAdapter; encodeCalls: EncodeCall[]; decodeCalls: number } {
  let decodeCalls = 0;
  let encodeIndex = 0;
  const encodeCalls: EncodeCall[] = [];

  const adapter: ImageCompressionAdapter = {
    decode: async () => {
      decodeCalls += 1;
      if (options.decode) {
        return options.decode();
      }

      return {
        source: {} as CanvasImageSource,
        width: 4000,
        height: 3000,
      };
    },
    encode: async (_image, encodeOptions) => {
      encodeCalls.push(encodeOptions);
      const blobSizes = options.blobSizes || [IMAGE_UPLOAD_TARGET_BYTES - 1];
      const size = blobSizes[Math.min(encodeIndex, blobSizes.length - 1)];
      encodeIndex += 1;
      return makeBlob(size, encodeOptions.mimeType);
    },
    supportsOutputType: options.supportsOutputType || (() => true),
  };

  return {
    adapter,
    encodeCalls,
    get decodeCalls() {
      return decodeCalls;
    },
  };
}

describe('prepareImageForUpload', () => {
  it('returns small files without compression', async () => {
    const file = makeFile(IMAGE_UPLOAD_TARGET_BYTES, 'small.jpg', 'image/jpeg');
    const fake = createAdapter({});

    const prepared = await prepareImageForUpload(file, { adapter: fake.adapter });

    expect(prepared.file).toBe(file);
    expect(prepared.compressed).toBe(false);
    expect(prepared.finalSize).toBe(file.size);
    expect(fake.decodeCalls).toBe(0);
    expect(fake.encodeCalls).toHaveLength(0);
  });

  it('compresses oversized JPEG files under the target size', async () => {
    const file = makeFile(IMAGE_UPLOAD_TARGET_BYTES + 1024, 'photo.jpg', 'image/jpeg');
    const fake = createAdapter({
      blobSizes: [IMAGE_UPLOAD_TARGET_BYTES + 1, IMAGE_UPLOAD_TARGET_BYTES - 1],
    });

    const prepared = await prepareImageForUpload(file, { adapter: fake.adapter });

    expect(prepared.compressed).toBe(true);
    expect(prepared.file.size).toBeLessThanOrEqual(IMAGE_UPLOAD_TARGET_BYTES);
    expect(prepared.file.name).toBe('photo-compressed.jpg');
    expect(prepared.finalType).toBe('image/jpeg');
    expect(fake.decodeCalls).toBe(1);
    expect(fake.encodeCalls).toHaveLength(2);
    expect(fake.encodeCalls[0]).toMatchObject({ width: 4000, height: 3000, mimeType: 'image/jpeg' });
  });

  it('prefers WebP output for oversized PNG files when supported', async () => {
    const file = makeFile(IMAGE_UPLOAD_TARGET_BYTES + 1024, 'diagram.png', 'image/png');
    const fake = createAdapter({
      supportsOutputType: (mimeType) => mimeType === 'image/webp' || mimeType === 'image/jpeg',
    });

    const prepared = await prepareImageForUpload(file, { adapter: fake.adapter });

    expect(prepared.compressed).toBe(true);
    expect(prepared.file.name).toBe('diagram-compressed.webp');
    expect(prepared.finalType).toBe('image/webp');
    expect(fake.encodeCalls[0].mimeType).toBe('image/webp');
  });

  it('reports images the browser cannot decode', async () => {
    const file = makeFile(IMAGE_UPLOAD_TARGET_BYTES + 1024, 'camera.heic', 'image/heic');
    const fake = createAdapter({
      decode: async () => {
        throw new Error('decode failed');
      },
    });

    await expect(prepareImageForUpload(file, { adapter: fake.adapter })).rejects.toThrow('JPG');
  });

  it('reports images that remain too large after compression attempts', async () => {
    const file = makeFile(IMAGE_UPLOAD_TARGET_BYTES + 1024, 'huge.jpg', 'image/jpeg');
    const fake = createAdapter({
      blobSizes: [IMAGE_UPLOAD_TARGET_BYTES + 1],
    });

    await expect(prepareImageForUpload(file, { adapter: fake.adapter })).rejects.toThrow(
      `${IMAGE_UPLOAD_TARGET_MB}MB`
    );
  });

  it('reports non-JSON 413 upload responses clearly', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => new Response('payload too large', { status: 413 })) as typeof fetch;

    try {
      await expect(uploadImageFile(makeFile(1024, 'small.jpg', 'image/jpeg'))).rejects.toThrow(
        '\u8bf7\u6c42\u8fc7\u5927'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reports upload phase for small files', async () => {
    const originalFetch = global.fetch;
    const phases: string[] = [];
    global.fetch = (async () =>
      Response.json({ url: 'https://example.com/image.jpg', pathname: 'images/image.jpg' })) as typeof fetch;

    try {
      await uploadImageFile(makeFile(1024, 'small.jpg', 'image/jpeg'), {
        onPhaseChange: (phase) => phases.push(phase),
      });
    } finally {
      global.fetch = originalFetch;
    }

    expect(phases).toEqual(['uploading']);
  });

  it('reports compression phase before decoding oversized files', async () => {
    const phases: string[] = [];

    await expect(
      uploadImageFile(makeFile(IMAGE_UPLOAD_TARGET_BYTES + 1024, 'large.jpg', 'image/jpeg'), {
        onPhaseChange: (phase) => phases.push(phase),
      })
    ).rejects.toThrow('JPG');

    expect(phases).toEqual(['compressing']);
  });
});
