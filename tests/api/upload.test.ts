import { describe, expect, it, jest } from '@jest/globals';
import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/upload/route';
import { VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES } from '@/lib/upload-limits';

jest.mock('@vercel/blob', () => ({
  del: jest.fn(),
  put: jest.fn(),
}));

function makeFile(size: number, name = 'large.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('Upload API', () => {
  it('rejects files over the Vercel Function payload limit', async () => {
    const formData = new FormData();
    formData.append('file', makeFile(VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES + 1));

    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request as unknown as NextRequest);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('4.5MB');
  });
});
