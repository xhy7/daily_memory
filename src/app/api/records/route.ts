import { NextRequest, NextResponse } from 'next/server';
import { createRecord, getRecordsByDevice, getRecordsByDate, updateRecordPolishedContent, deleteRecord } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const deviceId = searchParams.get('deviceId');
  const date = searchParams.get('date');

  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
  }

  try {
    console.log('Fetching records:', { deviceId, date });
    let records;
    if (date) {
      records = await getRecordsByDate(deviceId, date);
    } else {
      records = await getRecordsByDevice(deviceId);
    }
    console.log('Records found:', records.length);
    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to fetch records:', error);
    return NextResponse.json({ error: 'Failed to fetch records', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, type, content, imageUrl, author } = body;

    if (!deviceId || !type || !content) {
      return NextResponse.json({ error: 'Missing required fields', details: { deviceId, type, content } }, { status: 400 });
    }

    console.log('Creating record:', { deviceId, type, content, imageUrl, author });

    const record = await createRecord(deviceId, type, content, imageUrl, author);
    console.log('Record created:', record);

    return NextResponse.json(record);
  } catch (error) {
    console.error('Failed to create record:', error);
    return NextResponse.json({ error: 'Failed to create record', details: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, polishedContent } = body;

    if (!id || !polishedContent) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const record = await updateRecordPolishedContent(id, polishedContent);
    return NextResponse.json(record);
  } catch (error) {
    console.error('Failed to update record:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await deleteRecord(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete record:', error);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}
