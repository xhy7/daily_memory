import { NextRequest, NextResponse } from 'next/server';
import { resolveImageUploadType, uploadImage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
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
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `${file.name || '图片'} 过大，单张不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB` },
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
          fileName: file.name || '未命名图片',
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
