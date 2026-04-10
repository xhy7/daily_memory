import { NextRequest, NextResponse } from 'next/server';
import { createMemoryRecord, getMemoryRecordsByDevice, getMemoryRecordsByDate, updateMemoryRecordPolishedContent, updateMemoryRecordTags, deleteMemoryRecord, initializeDatabase } from '@/lib/db';

// Increase body parser limit for large image uploads
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Initialize database on first request
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

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    let records;
    if (date) {
      records = await getMemoryRecordsByDate(deviceId, date);
    } else {
      records = await getMemoryRecordsByDevice(deviceId);
    }
    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to fetch records:', error);
    return NextResponse.json({ error: 'Failed to fetch records', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json();
    const { deviceId, type, content, imageUrl, author } = body;

    if (!deviceId || !type || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const record = await createMemoryRecord(deviceId, type, content, imageUrl, author);
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