import { NextRequest, NextResponse } from 'next/server';
import {
  createSpaceAccessRequest,
  getCoupleSpaceById,
  getCoupleSpaceProfiles,
  initializeDatabase,
  listIncomingSpaceAccessRequests,
  listOutgoingSpaceAccessRequests,
  updateSpaceAccessRequestStatus,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let dbInitialized = false;

async function ensureDatabase() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
    } finally {
      dbInitialized = true;
    }
  }
}

async function attachTargetCoupleSpace<
  T extends {
    target_couple_space_id: number;
  },
>(requests: T[]) {
  return Promise.all(
    requests.map(async (request) => {
      const targetCoupleSpace = await getCoupleSpaceById(request.target_couple_space_id);

      return {
        ...request,
        targetCoupleSpace: targetCoupleSpace
          ? {
              id: targetCoupleSpace.id,
              name: targetCoupleSpace.name,
              profiles: getCoupleSpaceProfiles(targetCoupleSpace),
            }
          : null,
      };
    })
  );
}

function mapCreateError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  switch (error.message) {
    case 'REQUESTER_NAME_REQUIRED':
      return NextResponse.json({ error: 'requesterName is required' }, { status: 400 });
    case 'INVALID_INVITE_CODE':
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
    case 'CANNOT_REQUEST_OWN_SPACE':
      return NextResponse.json({ error: 'Cannot request access to your own space' }, { status: 409 });
    case 'REQUEST_ALREADY_EXISTS':
      return NextResponse.json({ error: 'An open access request already exists' }, { status: 409 });
    default:
      return null;
  }
}

function mapUpdateError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  switch (error.message) {
    case 'ACCESS_REQUEST_NOT_FOUND':
      return NextResponse.json({ error: 'Access request not found' }, { status: 404 });
    case 'ACCESS_REQUEST_FORBIDDEN':
      return NextResponse.json({ error: 'You do not have permission to change this request' }, { status: 403 });
    case 'ACCESS_REQUEST_INVALID_STATUS':
      return NextResponse.json({ error: 'This access request cannot be changed in its current state' }, { status: 409 });
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json();
    const { deviceId, inviteCode, requesterName } = body as {
      deviceId?: string;
      inviteCode?: string;
      requesterName?: string;
    };

    if (!deviceId || !inviteCode) {
      return NextResponse.json({ error: 'deviceId and inviteCode are required' }, { status: 400 });
    }

    try {
      const accessRequest = await createSpaceAccessRequest(deviceId, inviteCode, requesterName || '');
      const [requestWithTarget] = await attachTargetCoupleSpace([accessRequest]);
      return NextResponse.json({ request: requestWithTarget, action: 'created' });
    } catch (error) {
      const mapped = mapCreateError(error);
      if (mapped) {
        return mapped;
      }

      throw error;
    }
  } catch (error) {
    console.error('Failed to create access request:', error);
    return NextResponse.json(
      { error: 'Failed to create access request', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const scope = searchParams.get('scope');

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    if (scope !== 'incoming' && scope !== 'outgoing') {
      return NextResponse.json({ error: 'scope must be incoming or outgoing' }, { status: 400 });
    }

    const requests = scope === 'incoming'
      ? await listIncomingSpaceAccessRequests(deviceId)
      : await listOutgoingSpaceAccessRequests(deviceId);

    return NextResponse.json({
      scope,
      requests: await attachTargetCoupleSpace(requests),
    });
  } catch (error) {
    console.error('Failed to fetch access requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch access requests', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabase();

    const body = await request.json();
    const { deviceId, requestId, action } = body as {
      deviceId?: string;
      requestId?: number;
      action?: 'approve' | 'reject' | 'revoke';
    };

    if (!deviceId || !requestId || !action) {
      return NextResponse.json({ error: 'deviceId, requestId and action are required' }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject' && action !== 'revoke') {
      return NextResponse.json({ error: 'action must be approve, reject or revoke' }, { status: 400 });
    }

    try {
      const updatedRequest = await updateSpaceAccessRequestStatus(deviceId, Number(requestId), action);
      const [requestWithTarget] = await attachTargetCoupleSpace([updatedRequest]);
      return NextResponse.json({ request: requestWithTarget, action });
    } catch (error) {
      const mapped = mapUpdateError(error);
      if (mapped) {
        return mapped;
      }

      throw error;
    }
  } catch (error) {
    console.error('Failed to update access request:', error);
    return NextResponse.json(
      { error: 'Failed to update access request', details: String(error) },
      { status: 500 }
    );
  }
}
