import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const options = {
    apply: false,
    limit: 20,
    deviceId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--limit') {
      options.limit = Math.max(1, Math.min(Number.parseInt(argv[index + 1] || '20', 10) || 20, 200));
      index += 1;
      continue;
    }

    if (arg === '--deviceId') {
      options.deviceId = argv[index + 1] || null;
      index += 1;
    }
  }

  return options;
}

function parseImageUrls(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  return [];
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }

  return util.inspect(error, { depth: 5, breakLength: 120 });
}

function isBase64Image(url) {
  return typeof url === 'string' && url.startsWith('data:image');
}

function parseBase64Image(url) {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

function extensionForMimeType(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };

  return map[mimeType] || 'bin';
}

async function uploadBase64Image(url) {
  const parsed = parseBase64Image(url);
  if (!parsed) {
    throw new Error('Invalid base64 image payload');
  }

  const pathname = `images/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionForMimeType(parsed.mimeType)}`;
  const blob = await put(pathname, new Blob([Buffer.from(parsed.data, 'base64')], { type: parsed.mimeType }), {
    access: 'public',
    contentType: parsed.mimeType,
  });

  return blob.url;
}

async function normalizeInlineImage(url) {
  if (!isBase64Image(url)) {
    return url;
  }

  return uploadBase64Image(url);
}

async function fetchCandidates(client, deviceId, limit) {
  const result = await client.query(
    `
      SELECT id, device_id, image_url, image_urls, created_at
      FROM records
      WHERE ($1::text IS NULL OR device_id = $1)
        AND (
          image_url LIKE 'data:image%'
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(image_urls, '[]'::jsonb)) AS inline_url
            WHERE inline_url LIKE 'data:image%'
          )
        )
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [deviceId, limit]
  );

  return result.rows;
}

async function recordsTableExists(client) {
  const result = await client.query(
    `SELECT to_regclass('public.records') AS records_table`
  );

  return Boolean(result.rows[0]?.records_table);
}

async function migrateRow(client, row) {
  const currentImageUrls = parseImageUrls(row.image_urls);
  const normalizedImageUrls = await Promise.all(
    currentImageUrls.map((url) => normalizeInlineImage(url))
  );
  const normalizedImageUrl = row.image_url
    ? await normalizeInlineImage(row.image_url)
    : normalizedImageUrls[0] || null;

  await client.query(
    `
      UPDATE records
      SET image_url = $1,
          image_urls = $2::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `,
    [normalizedImageUrl, JSON.stringify(normalizedImageUrls), row.id]
  );

  return {
    id: row.id,
    deviceId: row.device_id,
    imageCount: normalizedImageUrls.length,
  };
}

async function main() {
  loadEnvFile();

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is required to inspect records');
  }

  const options = parseArgs(process.argv.slice(2));
  const client = new Client({
    connectionString: process.env.POSTGRES_URL,
  });

  await client.connect();

  try {
    const tableExists = await recordsTableExists(client);
    if (!tableExists) {
      console.log(JSON.stringify({
        mode: options.apply ? 'apply' : 'dry-run',
        limit: options.limit,
        deviceId: options.deviceId,
        status: 'missing-table',
        message: 'records table was not found in the configured database',
      }, null, 2));
      return;
    }

    const candidates = await fetchCandidates(client, options.deviceId, options.limit);

    console.log(JSON.stringify({
      mode: options.apply ? 'apply' : 'dry-run',
      limit: options.limit,
      deviceId: options.deviceId,
      count: candidates.length,
      records: candidates.map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        createdAt: row.created_at,
        inlineImageUrl: isBase64Image(row.image_url || ''),
        inlineImageCount: parseImageUrls(row.image_urls).filter((url) => isBase64Image(url)).length,
      })),
    }, null, 2));

    if (!options.apply || candidates.length === 0) {
      return;
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required when using --apply');
    }

    const migrated = [];
    const failures = [];

    for (const row of candidates) {
      try {
        const result = await migrateRow(client, row);
        migrated.push(result);
      } catch (error) {
        failures.push({
          id: row.id,
          error: formatError(error),
        });
      }
    }

    console.log(JSON.stringify({ migrated, failures }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
