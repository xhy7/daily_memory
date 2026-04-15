import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateCoupleSpace, getCoupleSpaceByInviteCode, joinCoupleSpace, getUserByDeviceId, initializeDatabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let dbInitialized = false;

async function ensureDatabase() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
    } catch (error) {
      console.error('Database initialization error:', error);
      dbInitialized = true;
    }
  }
}

// POST /api/couple-space - Get or create couple space for device
export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json();
    const { deviceId, inviteCode } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    // If inviteCode is provided, try to join existing space
    if (inviteCode) {
      const result = await joinCoupleSpace(deviceId, inviteCode);
      if (!result) {
        return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
      }
      return NextResponse.json({
        inviteCode: result.coupleSpace.invite_code,
        coupleSpace: result.coupleSpace,
        user: result.user,
        action: 'joined',
      });
    }

    // Otherwise, get or create couple space
    const result = await getOrCreateCoupleSpace(deviceId);
    return NextResponse.json({
      inviteCode: result.coupleSpace.invite_code,
      coupleSpace: result.coupleSpace,
      user: result.user,
      action: result.user.created_at === result.coupleSpace.created_at ? 'created' : 'existing',
    });
  } catch (error) {
    console.error('Failed to process couple space:', error);
    return NextResponse.json({ error: 'Failed to process couple space', details: String(error) }, { status: 500 });
  }
}

// GET /api/couple-space - Get couple space info by deviceId or inviteCode
export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const inviteCode = searchParams.get('inviteCode');

    // If inviteCode is provided, look up by invite code
    if (inviteCode) {
      const coupleSpace = await getCoupleSpaceByInviteCode(inviteCode);
      if (!coupleSpace) {
        return NextResponse.json({ error: 'Couple space not found' }, { status: 404 });
      }

      // If deviceId provided, verify they are in the same space
      if (deviceId) {
        const user = await getUserByDeviceId(deviceId);
        if (!user || user.couple_space_id !== coupleSpace.id) {
          return NextResponse.json({ error: 'Device not in this couple space' }, { status: 403 });
        }
      }

      return NextResponse.json({
        inviteCode: coupleSpace.invite_code,
        coupleSpace,
      });
    }

    // If deviceId is provided, get or create couple space and return invite code
    if (deviceId) {
      const result = await getOrCreateCoupleSpace(deviceId);
      return NextResponse.json({
        inviteCode: result.coupleSpace.invite_code,
        coupleSpace: result.coupleSpace,
        user: result.user,
        action: result.user.created_at === result.coupleSpace.created_at ? 'created' : 'existing',
      });
    }

    return NextResponse.json({ error: 'deviceId or inviteCode is required' }, { status: 400 });
  } catch (error) {
    console.error('Failed to get couple space:', error);
    return NextResponse.json({ error: 'Failed to get couple space', details: String(error) }, { status: 500 });
  }
}
