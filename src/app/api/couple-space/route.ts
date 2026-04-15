import { NextRequest, NextResponse } from 'next/server';
import {
  getCoupleSpaceByAccessRequest,
  getCoupleSpaceById,
  getCoupleSpaceByInviteCode,
  getCoupleSpaceProfiles,
  getOrCreateCoupleSpace,
  getUserByDeviceId,
  initializeDatabase,
  joinCoupleSpace,
  updateCoupleSpaceProfile,
  type CoupleSpace,
  type CoupleProfileSlot,
} from '@/lib/db';
import { deleteImage } from '@/lib/storage';

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

function buildCoupleSpaceResponse(coupleSpace: CoupleSpace, options?: { includeInviteCode?: boolean }) {
  const includeInviteCode = options?.includeInviteCode !== false;

  return {
    inviteCode: includeInviteCode ? coupleSpace.invite_code : undefined,
    coupleSpace,
    profiles: getCoupleSpaceProfiles(coupleSpace),
  };
}

function mapAccessRequestError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  switch (error.message) {
    case 'ACCESS_REQUEST_NOT_FOUND':
    case 'COUPLE_SPACE_NOT_FOUND':
      return NextResponse.json({ error: 'Access request not found' }, { status: 404 });
    case 'ACCESS_REQUEST_FORBIDDEN':
      return NextResponse.json({ error: 'Access request is not available for this device' }, { status: 403 });
    case 'ACCESS_REQUEST_NOT_APPROVED':
      return NextResponse.json({ error: 'Access request has not been approved yet' }, { status: 403 });
    case 'ACCESS_REQUEST_UNAVAILABLE':
      return NextResponse.json({ error: 'Access request is no longer available' }, { status: 410 });
    default:
      return null;
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
      let result: Awaited<ReturnType<typeof joinCoupleSpace>>;
      try {
        result = await joinCoupleSpace(deviceId, inviteCode);
      } catch (error) {
        if (error instanceof Error && error.message === 'DEVICE_ALREADY_IN_OTHER_SPACE') {
          return NextResponse.json(
            { error: 'Device already belongs to another couple space' },
            { status: 409 }
          );
        }

        throw error;
      }

      if (!result) {
        return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
      }
      return NextResponse.json({
        ...buildCoupleSpaceResponse(result.coupleSpace),
        user: result.user,
        action: 'joined',
      });
    }

    // Otherwise, get or create couple space
    const result = await getOrCreateCoupleSpace(deviceId);
    return NextResponse.json({
      ...buildCoupleSpaceResponse(result.coupleSpace),
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
    const accessRequestIdParam = searchParams.get('accessRequestId');

    if (accessRequestIdParam) {
      if (!deviceId) {
        return NextResponse.json({ error: 'deviceId is required when accessRequestId is provided' }, { status: 400 });
      }

      const accessRequestId = Number.parseInt(accessRequestIdParam, 10);
      if (Number.isNaN(accessRequestId)) {
        return NextResponse.json({ error: 'Invalid accessRequestId format' }, { status: 400 });
      }

      try {
        const coupleSpace = await getCoupleSpaceByAccessRequest(deviceId, accessRequestId);
        return NextResponse.json(buildCoupleSpaceResponse(coupleSpace, { includeInviteCode: false }));
      } catch (error) {
        const mapped = mapAccessRequestError(error);
        if (mapped) {
          return mapped;
        }

        throw error;
      }
    }

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
        ...buildCoupleSpaceResponse(coupleSpace),
      });
    }

    // If deviceId is provided, get or create couple space and return invite code
    if (deviceId) {
      const result = await getOrCreateCoupleSpace(deviceId);
      return NextResponse.json({
        ...buildCoupleSpaceResponse(result.coupleSpace),
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

export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json();
    const { deviceId, slot, name, avatarUrl, avatarPathname, clearAvatar } = body as {
      deviceId?: string;
      slot?: CoupleProfileSlot;
      name?: string;
      avatarUrl?: string | null;
      avatarPathname?: string | null;
      clearAvatar?: boolean;
    };

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    if (slot !== 'partnerA' && slot !== 'partnerB') {
      return NextResponse.json({ error: 'slot must be partnerA or partnerB' }, { status: 400 });
    }

    if (name === undefined && avatarUrl === undefined && avatarPathname === undefined && !clearAvatar) {
      return NextResponse.json({ error: 'At least one field must be provided' }, { status: 400 });
    }

    const user = await getUserByDeviceId(deviceId);
    if (!user?.couple_space_id) {
      return NextResponse.json({ error: 'Device is not in a couple space' }, { status: 404 });
    }

    const currentCoupleSpace = await getCoupleSpaceById(user.couple_space_id);
    if (!currentCoupleSpace) {
      return NextResponse.json({ error: 'Couple space not found' }, { status: 404 });
    }

    const currentAvatarPathname = slot === 'partnerA'
      ? currentCoupleSpace.partner_a_avatar_pathname
      : currentCoupleSpace.partner_b_avatar_pathname;

    const normalizedName = name !== undefined
      ? (typeof name === 'string' && name.trim() ? name.trim() : null)
      : undefined;
    const normalizedAvatarUrl = avatarUrl !== undefined
      ? (typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : null)
      : undefined;
    const normalizedAvatarPathname = avatarPathname !== undefined
      ? (typeof avatarPathname === 'string' && avatarPathname.trim() ? avatarPathname.trim() : null)
      : undefined;

    const updatedCoupleSpace = await updateCoupleSpaceProfile(user.couple_space_id, slot, {
      name: normalizedName,
      avatarUrl: normalizedAvatarUrl,
      avatarPathname: normalizedAvatarPathname,
      clearAvatar: clearAvatar === true,
    });

    if (!updatedCoupleSpace) {
      return NextResponse.json({ error: 'Couple space not found' }, { status: 404 });
    }

    const nextAvatarPathname = slot === 'partnerA'
      ? updatedCoupleSpace.partner_a_avatar_pathname
      : updatedCoupleSpace.partner_b_avatar_pathname;

    if (currentAvatarPathname && currentAvatarPathname !== nextAvatarPathname) {
      void deleteImage(currentAvatarPathname);
    }

    return NextResponse.json({
      ...buildCoupleSpaceResponse(updatedCoupleSpace),
      action: 'updated',
    });
  } catch (error) {
    console.error('Failed to update couple space profile:', error);
    return NextResponse.json(
      { error: 'Failed to update couple space profile', details: String(error) },
      { status: 500 }
    );
  }
}
