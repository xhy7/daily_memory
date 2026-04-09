import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db';

export async function GET() {
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    console.log('Database initialized successfully');
    return NextResponse.json({ success: true, message: 'Database initialized' });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    return NextResponse.json({ error: 'Failed to initialize database', details: String(error) }, { status: 500 });
  }
}