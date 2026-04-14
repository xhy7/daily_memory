import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { initializeDatabase, updateMemoryRecord } from '@/lib/db';
import { isBase64Image, uploadBase64Image } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let dbInitialized = false;

interface MigrationCandidateRow {
  id: number;
  device_id: string;
  image_url: string | null;
  image_urls: unknown;
}

function parseLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.max(1, Math.min(Math.trunc(parsed), 100));
}

function parseImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function ensureDatabase() {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

async function normalizeInlineImage(url: string): Promise<string> {
  if (!isBase64Image(url)) {
    return url;
  }

  const uploaded = await uploadBase64Image(url);
  return uploaded.url;
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json().catch(() => ({}));
    const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim() : null;
    const limit = parseLimit(body.limit);
    const dryRun = body.dryRun === true;

    const result = await sql.query(
      `
        SELECT id, device_id, image_url, image_urls
        FROM records
        WHERE ($1::text IS NULL OR device_id = $1)
          AND (
            image_url LIKE 'data:image%'
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(image_urls, '[]'::jsonb)) AS inline_url
              WHERE inline_url LIKE 'data:image%'
            )
          )
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [deviceId, limit]
    );

    const candidates = result.rows as unknown as MigrationCandidateRow[];
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        count: candidates.length,
        records: candidates.map((row) => ({ id: row.id, deviceId: row.device_id })),
      });
    }

    let migrated = 0;
    const failures: Array<{ id: number; error: string }> = [];

    for (const row of candidates) {
      try {
        const currentImageUrls = parseImageUrls(row.image_urls);
        const normalizedImageUrls = await Promise.all(
          currentImageUrls.map((url) => normalizeInlineImage(url))
        );
        const normalizedImageUrl = row.image_url
          ? await normalizeInlineImage(row.image_url)
          : normalizedImageUrls[0] || null;

        await updateMemoryRecord(row.id, {
          image_url: normalizedImageUrl,
          image_urls: normalizedImageUrls,
        });
        migrated += 1;
      } catch (error) {
        failures.push({
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      scanned: candidates.length,
      migrated,
      failures,
      remainingEstimate: Math.max(candidates.length - migrated - failures.length, 0),
    });
  } catch (error) {
    console.error('Failed to migrate inline images:', error);
    return NextResponse.json(
      { error: 'Failed to migrate inline images', details: String(error) },
      { status: 500 }
    );
  }
}
