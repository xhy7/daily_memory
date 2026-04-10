import { NextRequest, NextResponse } from 'next/server';
import { createMemoryRecord, getMemoryRecordsByDevice, getMemoryRecordsByDate, updateMemoryRecordPolishedContent, updateMemoryRecordTags, deleteMemoryRecord, initializeDatabase } from '@/lib/db';

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
      console.error('Failed to initialize database:', error);
      throw error;
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
    let finalRecords = paginatedRecords;
    if (fields) {
      const fieldList = fields.split(',').map(f => f.trim());
      finalRecords = paginatedRecords.map(record => {
        const filtered: Record<string, unknown> = {};
        fieldList.forEach(field => {
          if (field in record) {
            filtered[field] = (record as Record<string, unknown>)[field];
          }
        });
        return filtered;
      });
    }

    const response = NextResponse.json({
      records: finalRecords,
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
    const { deviceId, type, content, imageUrl, imageUrls, author } = body;

    if (!deviceId || !type || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const finalImageUrls = imageUrls || (imageUrl ? [imageUrl] : undefined);

    const record = await createMemoryRecord(deviceId, type, content, finalImageUrls, author);
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
    const { id, polishedContent, tags } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    let record;
    if (tags !== undefined) {
      record = await updateMemoryRecordTags(id, tags);
    } else if (polishedContent) {
      record = await updateMemoryRecordPolishedContent(id, polishedContent);
    } else {
      return NextResponse.json({ error: 'polishedContent or tags is required' }, { status: 400 });
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

    await deleteMemoryRecord(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete record:', error);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}