import { NextRequest, NextResponse } from 'next/server';
import {
  createMemoryRecord,
  deleteMemoryRecord,
  getMemoryRecordCalendarSummary,
  getMemoryRecordById,
  getMemoryRecordsByDate,
  getMemoryRecordsByDevice,
  initializeDatabase,
  updateMemoryRecord,
  type MemoryRecordSelectField,
} from '@/lib/db';
import { isBase64Image, uploadBase64Image } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

let dbInitialized = false;

const MEMORY_RECORD_FIELD_ALLOWLIST = new Set<MemoryRecordSelectField>([
  'id',
  'device_id',
  'couple_space_id',
  'type',
  'content',
  'polished_content',
  'image_url',
  'image_urls',
  'tags',
  'author',
  'is_completed',
  'deadline',
  'created_at',
  'updated_at',
]);

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = value ? parseInt(value, 10) : fallback;
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clampLimit(value: number): number {
  return Math.max(1, Math.min(value, 500));
}

function clampOffset(value: number): number {
  return Math.max(0, value);
}

function parseRequestedFields(fieldsParam: string | null): MemoryRecordSelectField[] | undefined {
  if (!fieldsParam) {
    return undefined;
  }

  const requested = fieldsParam
    .split(',')
    .map((field) => field.trim())
    .filter((field): field is MemoryRecordSelectField => MEMORY_RECORD_FIELD_ALLOWLIST.has(field as MemoryRecordSelectField));

  return requested.length > 0 ? requested : undefined;
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }

  return value === '1' || value === 'true';
}

async function ensureDatabase() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
    } catch (error) {
      console.error('Database initialization error (continuing anyway):', error);
      dbInitialized = true;
    }
  }
}

async function normalizeImageUrl(url: string | null | undefined): Promise<string | null | undefined> {
  if (!url) {
    return url;
  }

  if (!isBase64Image(url)) {
    return url;
  }

  const uploaded = await uploadBase64Image(url);
  return uploaded.url;
}

async function normalizeImageUrls(urls: string[] | undefined): Promise<string[] | undefined> {
  if (!urls) {
    return urls;
  }

  const normalized = await Promise.all(urls.map((url) => normalizeImageUrl(url)));
  return normalized.filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const summary = searchParams.get('summary');
    const month = searchParams.get('month');
    const date = searchParams.get('date');
    const id = searchParams.get('id');
    const timezone = searchParams.get('timezone') || 'Asia/Shanghai';
    const limit = clampLimit(parsePositiveInt(searchParams.get('limit'), 100));
    const offset = clampOffset(parsePositiveInt(searchParams.get('offset'), 0));
    const recent = clampOffset(parsePositiveInt(searchParams.get('recent'), 0));
    const recentDays = clampOffset(parsePositiveInt(searchParams.get('recentDays'), 0));
    const includeTotal = parseBoolean(searchParams.get('includeTotal'), false);
    const requestedFields = parseRequestedFields(searchParams.get('fields'));

    if (id) {
      const recordId = Number.parseInt(id, 10);
      if (Number.isNaN(recordId)) {
        return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
      }

      const record = await getMemoryRecordById(recordId, {
        fields: requestedFields,
      });

      if (!record) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }

      const response = NextResponse.json({ record });
      response.headers.set('Cache-Control', CACHE_CONTROL);
      return response;
    }

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required when id is not provided' }, { status: 400 });
    }

    if (summary === 'calendar') {
      if (!month) {
        return NextResponse.json({ error: 'month is required when summary=calendar' }, { status: 400 });
      }

      const days = await getMemoryRecordCalendarSummary(deviceId, month, timezone);
      const response = NextResponse.json({ days, month, timezone });
      response.headers.set('Cache-Control', CACHE_CONTROL);
      return response;
    }

    const effectiveLimit = recent > 0 ? clampLimit(recent) : limit;
    const effectiveOffset = recent > 0 ? 0 : offset;

    const result = date
      ? await getMemoryRecordsByDate(deviceId, date, {
          fields: requestedFields,
          limit: effectiveLimit,
          offset: effectiveOffset,
          timezone,
          includeTotal,
        })
      : await getMemoryRecordsByDevice(deviceId, {
          fields: requestedFields,
          limit: effectiveLimit,
          offset: effectiveOffset,
          recentDays: recentDays > 0 ? recentDays : undefined,
          timezone,
          includeTotal,
        });

    const response = NextResponse.json({
      records: result.records,
      pagination: {
        total: result.total,
        limit: effectiveLimit,
        offset: effectiveOffset,
        hasMore: result.hasMore,
      },
    });

    response.headers.set('Cache-Control', CACHE_CONTROL);
    return response;
  } catch (error) {
    console.error('Failed to fetch records:', error);
    return NextResponse.json({ error: 'Failed to fetch records', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json();
    const { deviceId, type, content, imageUrl, imageUrls, author, isCompleted, deadline } = body;

    if (!deviceId || !type || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const finalImageUrls = imageUrls || (imageUrl ? [imageUrl] : undefined);
    const normalizedImageUrls = await normalizeImageUrls(finalImageUrls);

    const record = await createMemoryRecord(
      deviceId,
      type,
      content,
      normalizedImageUrls,
      author,
      undefined,
      isCompleted,
      deadline
    );
    return NextResponse.json(record);
  } catch (error) {
    console.error('Failed to create record:', error);
    return NextResponse.json({ error: 'Failed to create record', details: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json();
    const { id, polishedContent, tags, content, imageUrls, isCompleted, deadline, imageUrl } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Parameters<typeof updateMemoryRecord>[1] = {};

    if (polishedContent !== undefined) {
      updates.polished_content = polishedContent;
    }
    if (tags !== undefined) {
      updates.tags = tags;
    }
    if (content !== undefined) {
      updates.content = content;
    }
    if (imageUrls !== undefined) {
      const normalizedImageUrls = await normalizeImageUrls(imageUrls);
      updates.image_urls = normalizedImageUrls;
      updates.image_url = normalizedImageUrls && normalizedImageUrls.length > 0 ? normalizedImageUrls[0] : null;
    }
    if (imageUrl !== undefined) {
      const normalizedImageUrl = await normalizeImageUrl(imageUrl);
      updates.image_url = normalizedImageUrl;
      if (imageUrls === undefined) {
        updates.image_urls = normalizedImageUrl ? [normalizedImageUrl] : [];
      }
    }
    if (isCompleted !== undefined) {
      updates.is_completed = isCompleted;
    }
    if (deadline !== undefined) {
      updates.deadline = deadline;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'At least one field must be provided' }, { status: 400 });
    }

    const record = await updateMemoryRecord(id, updates);

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error('Failed to update record:', error);
    return NextResponse.json({ error: 'Failed to update record', details: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureDatabase();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const recordId = parseInt(id, 10);
    if (Number.isNaN(recordId)) {
      return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
    }

    await deleteMemoryRecord(recordId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete record:', error);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}
