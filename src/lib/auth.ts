import { getUserByDeviceId, getCoupleSpaceById, resolveDeviceIdToCoupleSpaceId } from './db';

export interface AuthContext {
  deviceId: string;
  coupleSpaceId: number | null;
  userId: number | null;
}

/**
 * Resolve deviceId to coupleSpaceId
 * Priority:
 * 1. Look up user by deviceId, return couple_space_id if found
 * 2. Return null if not found (for backward compatibility)
 */
export async function resolveDeviceToCoupleSpace(deviceId: string): Promise<AuthContext> {
  const coupleSpaceId = await resolveDeviceIdToCoupleSpaceId(deviceId);
  const user = await getUserByDeviceId(deviceId);

  return {
    deviceId,
    coupleSpaceId,
    userId: user?.id || null,
  };
}

/**
 * Check if device belongs to a couple space
 */
export async function isInCoupleSpace(deviceId: string): Promise<boolean> {
  const coupleSpaceId = await resolveDeviceIdToCoupleSpaceId(deviceId);
  return coupleSpaceId !== null;
}
