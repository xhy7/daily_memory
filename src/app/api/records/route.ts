import { NextRequest, NextResponse } from 'next/server';
import { createMemoryRecord, getMemoryRecordsByDevice, getMemoryRecordsByDate, deleteMemoryRecord, updateMemoryRecord, initializeDatabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 缓存头
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

// 数据库初始化
let dbInitialized = false;

async function ensureDatabase() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
    } catch (error) {
      // 静默处理初始化错误，避免阻断 API
      // 即使初始化失败，数据库表和列可能已经存在
      console.error('Database initialization error (continuing anyway):', error);
      dbInitialized = true; // 标记为已初始化，避免重复尝试
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const date = searchParams.get('date');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const fields = searchParams.get('fields');
    const recent = searchParams.get('recent'); // 新增：只获取最近N条记录
    const recentDays = searchParams.get('recentDays'); // 新增：获取最近N天的记录

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    let records;
    if (date) {
      records = await getMemoryRecordsByDate(deviceId, date);
    } else if (recent) {
      // 只获取最近的记录数量
      const allRecords = await getMemoryRecordsByDevice(deviceId);
      records = allRecords.slice(0, parseInt(recent));
    } else if (recentDays) {
      // 只获取最近N天的记录
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(recentDays));
      const allRecords = await getMemoryRecordsByDevice(deviceId);
      records = allRecords.filter(r => new Date(r.created_at) >= cutoff);
    } else {
      records = await getMemoryRecordsByDevice(deviceId);
    }

    const total = records.length;
    const paginatedRecords = records.slice(offset, offset + limit);

    // 字段过滤
    const filteredRecords = fields
      ? paginatedRecords.map(record => {
          const fieldList = fields.split(',').map(f => f.trim());
          const filtered: Record<string, unknown> = {};
          fieldList.forEach(field => {
            const recordAny = record as unknown as Record<string, unknown>;
            if (field in recordAny) {
              filtered[field] = recordAny[field];
            }
          });
          return filtered;
        })
      : paginatedRecords;

    const response = NextResponse.json({
      records: filteredRecords,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
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

    const record = await createMemoryRecord(deviceId, type, content, finalImageUrls, author, undefined, isCompleted, deadline);
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

    // Build partial update object - only include fields that were provided
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
      updates.image_urls = imageUrls;
    }
    if (imageUrl !== undefined) {
      updates.image_url = imageUrl;
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
    if (isNaN(recordId)) {
      return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
    }

    await deleteMemoryRecord(recordId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete record:', error);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}