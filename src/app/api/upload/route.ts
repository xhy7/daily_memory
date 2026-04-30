import { NextRequest, NextResponse } from 'next/server';
import { resolveImageUploadType, uploadImage } from '@/lib/storage';
import {
  VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES,
  VERCEL_FUNCTION_PAYLOAD_LIMIT_MB,
} from '@/lib/upload-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = [
      ...formData.getAll('files'),
      ...formData.getAll('file'),
    ].filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    for (const file of files) {
      if (file.size > VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES) {
        return NextResponse.json(
          {
            error: `${file.name || '\u56fe\u7247'} \u8fc7\u5927\uff0c\u5355\u5f20\u4e0d\u80fd\u8d85\u8fc7 ${VERCEL_FUNCTION_PAYLOAD_LIMIT_MB}MB\uff0c\u8bf7\u5148\u538b\u7f29\u540e\u518d\u4e0a\u4f20\u3002`,
          },
          { status: 400 }
        );
      }

      try {
        resolveImageUploadType(file);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Unsupported image type' },
          { status: 400 }
        );
      }
    }

    const uploads = [];
    const errors: Array<{ fileName: string; message: string }> = [];

    for (const file of files) {
      try {
        uploads.push(await uploadImage(file));
      } catch (error) {
        console.error('Upload failed for file:', file.name, error);
        errors.push({
          fileName: file.name || '\u672a\u547d\u540d\u56fe\u7247',
          message: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    if (uploads.length === 0) {
      return NextResponse.json(
        {
          error: errors[0]?.message || 'Upload failed',
          errors,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uploads,
      url: uploads[0]?.url ?? null,
      pathname: uploads[0]?.pathname ?? null,
      errors,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: String(error) },
      { status: 500 }
    );
  }
}
