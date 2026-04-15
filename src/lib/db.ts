import { sql } from '@vercel/postgres';

// 声音克隆记录
export interface ClonedVoice {
  id: number;
  device_id: string;
  voice_type: string;  // 'his' or 'her'
  voice_id: string;   // MiniMax返回的voice_id
  created_at: string;
  updated_at: string;
}

// 情侣空间
export interface CoupleSpace {
  id: number;
  invite_code: string;
  name: string | null;
  partner_a_name: string | null;
  partner_a_avatar_url: string | null;
  partner_a_avatar_pathname: string | null;
  partner_b_name: string | null;
  partner_b_avatar_url: string | null;
  partner_b_avatar_pathname: string | null;
  created_at: string;
  updated_at: string;
}

export type CoupleProfileSlot = 'partnerA' | 'partnerB';

export interface CoupleSpaceProfile {
  name: string | null;
  avatarUrl: string | null;
}

export interface CoupleSpaceProfiles {
  partnerA: CoupleSpaceProfile;
  partnerB: CoupleSpaceProfile;
}

export type SpaceAccessStatus =
  | 'pending'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'revoked'
  | 'expired';

export interface SpaceAccessRequest {
  id: number;
  target_couple_space_id: number;
  requester_device_id: string;
  requester_name: string;
  invite_code_snapshot: string;
  status: SpaceAccessStatus;
  approved_by_device_id: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  revoked_at: string | null;
  first_access_at: string | null;
  access_expires_at: string | null;
}

// 用户
export interface User {
  id: number;
  couple_space_id: number;
  device_id: string;
  nickname: string | null;
  created_at: string;
}

// Extended MemoryRecord with couple_space_id
export interface MemoryRecord {
  id: number;
  device_id: string;
  couple_space_id?: number;
  type: string;
  content: string;
  polished_content?: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: string;
  is_completed?: boolean;
  deadline?: string | null;
  created_at: string;
  updated_at: string;
}

export type MemoryRecordSelectField =
  | 'id'
  | 'device_id'
  | 'couple_space_id'
  | 'type'
  | 'content'
  | 'polished_content'
  | 'image_url'
  | 'image_urls'
  | 'tags'
  | 'author'
  | 'is_completed'
  | 'deadline'
  | 'created_at'
  | 'updated_at';

export interface MemoryRecordQueryOptions {
  fields?: MemoryRecordSelectField[];
  limit?: number;
  offset?: number;
  recentDays?: number;
  timezone?: string;
  includeTotal?: boolean;
}

export interface MemoryRecordQueryResult {
  records: MemoryRecord[];
  total: number | null;
  hasMore: boolean;
}

export interface CalendarDaySummary {
  date: string;
  count: number;
}

const DEFAULT_MEMORY_RECORD_FIELDS: MemoryRecordSelectField[] = [
  'id',
  'device_id',
  'couple_space_id',
  'type',
  'content',
  'polished_content',
  'image_url',
  'image_urls',
  'tags',
  'author',
  'is_completed',
  'deadline',
  'created_at',
  'updated_at',
];

const MEMORY_RECORD_COLUMN_MAP: Record<MemoryRecordSelectField, string> = {
  id: 'id',
  device_id: 'device_id',
  couple_space_id: 'couple_space_id',
  type: 'type',
  content: 'content',
  polished_content: 'polished_content',
  image_url: 'image_url',
  image_urls: 'image_urls',
  tags: 'tags',
  author: 'author',
  is_completed: 'is_completed',
  deadline: 'deadline',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

const COUPLE_SPACE_SELECT_CLAUSE = `
  id,
  invite_code,
  name,
  partner_a_name,
  partner_a_avatar_url,
  partner_a_avatar_pathname,
  partner_b_name,
  partner_b_avatar_url,
  partner_b_avatar_pathname,
  created_at,
  updated_at
`;

const SPACE_ACCESS_REQUEST_SELECT_CLAUSE = `
  id,
  target_couple_space_id,
  requester_device_id,
  requester_name,
  invite_code_snapshot,
  status,
  approved_by_device_id,
  created_at,
  updated_at,
  approved_at,
  rejected_at,
  revoked_at,
  first_access_at,
  access_expires_at
`;

const COUPLE_SPACE_RECORD_SCOPE_CLAUSE =
  '(couple_space_id = $1 OR (couple_space_id IS NULL AND device_id IN (SELECT device_id FROM users WHERE couple_space_id = $1)))';

const ACCESS_WINDOW_MINUTES = 30;

function parseJsonArrayField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeMemoryRecordRow(row: Record<string, unknown>): MemoryRecord {
  const normalized: Record<string, unknown> = { ...row };

  if ('image_urls' in row || 'image_url' in row) {
    const parsedImageUrls = parseJsonArrayField(row.image_urls);
    const fallbackImageUrls = typeof row.image_url === 'string' && row.image_url ? [row.image_url] : [];
    normalized.image_urls = parsedImageUrls.length > 0 ? parsedImageUrls : fallbackImageUrls;
  }

  if ('tags' in row) {
    normalized.tags = parseJsonArrayField(row.tags);
  }

  return normalized as unknown as MemoryRecord;
}

function normalizeCoupleSpaceRow(row: Record<string, unknown>): CoupleSpace {
  return row as unknown as CoupleSpace;
}

function normalizeSpaceAccessRequestRow(row: Record<string, unknown>): SpaceAccessRequest {
  return row as unknown as SpaceAccessRequest;
}

function shiftSqlPlaceholders(input: string, offset: number): string {
  return input.replace(/\$(\d+)/g, (_, value: string) => `$${Number(value) + offset}`);
}

function getCoupleSpaceRecordScope(coupleSpaceId: number): {
  clause: string;
  values: Array<string | number>;
} {
  return {
    clause: COUPLE_SPACE_RECORD_SCOPE_CLAUSE,
    values: [coupleSpaceId],
  };
}

function sanitizeSelectedFields(fields?: MemoryRecordSelectField[]): MemoryRecordSelectField[] {
  if (!fields || fields.length === 0) {
    return DEFAULT_MEMORY_RECORD_FIELDS;
  }

  const seen = new Set<MemoryRecordSelectField>();
  const sanitized: MemoryRecordSelectField[] = [];

  for (const field of fields) {
    if (!(field in MEMORY_RECORD_COLUMN_MAP) || seen.has(field)) {
      continue;
    }

    seen.add(field);
    sanitized.push(field);
  }

  return sanitized.length > 0 ? sanitized : DEFAULT_MEMORY_RECORD_FIELDS;
}

function buildSelectClause(fields?: MemoryRecordSelectField[]): string {
  return sanitizeSelectedFields(fields)
    .map((field) => MEMORY_RECORD_COLUMN_MAP[field])
    .join(', ');
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return 100;
  }

  return Math.max(1, Math.min(limit, 500));
}

function clampOffset(offset: number | undefined): number {
  if (typeof offset !== 'number' || Number.isNaN(offset)) {
    return 0;
  }

  return Math.max(0, offset);
}

async function queryMemoryRecordsByScope(
  scope: { clause: string; values: Array<string | number> },
  options: MemoryRecordQueryOptions & { date?: string } = {}
): Promise<MemoryRecordQueryResult> {
  const { localDateToUTC } = await import('./datetime');

  const { clause: scopeClause, values: scopeValues } = scope;
  const whereParts: string[] = [scopeClause];
  const whereValues: Array<string | number> = [...scopeValues];
  let nextParamIndex = whereValues.length + 1;

  if (options.date) {
    const { start, end } = localDateToUTC(options.date, options.timezone || 'Asia/Shanghai');
    whereParts.push(`created_at >= $${nextParamIndex++}`);
    whereValues.push(start.toISOString());
    whereParts.push(`created_at <= $${nextParamIndex++}`);
    whereValues.push(end.toISOString());
  }

  if (typeof options.recentDays === 'number' && options.recentDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - options.recentDays);
    whereParts.push(`created_at >= $${nextParamIndex++}`);
    whereValues.push(cutoff.toISOString());
  }

  const selectClause = buildSelectClause(options.fields);
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const pageSize = options.includeTotal ? limit : limit + 1;
  const whereClause = whereParts.join(' AND ');

  const dataQuery = `
    SELECT ${selectClause}
    FROM records
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
  `;
  const dataResultPromise = sql.query(dataQuery, [...whereValues, pageSize, offset]);
  const countResultPromise = options.includeTotal
    ? sql.query(
        `
          SELECT COUNT(*)::int AS total
          FROM records
          WHERE ${whereClause}
        `,
        whereValues
      )
    : null;

  const dataResult = await dataResultPromise;
  const hasMore = dataResult.rows.length > limit;
  const visibleRows = hasMore ? dataResult.rows.slice(0, limit) : dataResult.rows;
  const countResult = countResultPromise ? await countResultPromise : null;

  return {
    records: visibleRows.map((row) => normalizeMemoryRecordRow(row as Record<string, unknown>)),
    total: countResult ? Number(countResult.rows[0]?.total || 0) : null,
    hasMore,
  };
}

async function queryMemoryRecords(
  deviceId: string,
  options: MemoryRecordQueryOptions & { date?: string } = {}
): Promise<MemoryRecordQueryResult> {
  const scope = await getRecordScope(deviceId);
  return queryMemoryRecordsByScope(scope, options);
}

export async function initializeDatabase() {
  console.log('Initializing database...');
  // Wrap entire function in try-catch to ensure no errors propagate
  try {
    // Create records table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS records (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        polished_content TEXT,
        image_url TEXT,
        image_urls JSONB DEFAULT '[]',
        tags JSONB DEFAULT '[]',
        author VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Records table created or already exists');
  } catch (e) {
    console.log('Records table creation skipped (may already exist)');
  }

  try {
    // Create cloned_voices table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS cloned_voices (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        voice_type VARCHAR(10) NOT NULL,
        voice_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(device_id, voice_type)
      )
    `;
    console.log('Cloned voices table created or already exists');
  } catch (e) {
    console.log('Cloned voices table creation skipped (may already exist)');
  }

  // Add indexes - silently catch errors
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_records_device_id ON records(device_id)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_records_device_created ON records(device_id, created_at DESC)`;
  } catch (e) { /* index may exist */ }

  // Add columns - silently catch errors (columns may already exist)
  try {
    await sql`ALTER TABLE records ADD COLUMN image_urls JSONB DEFAULT '[]'`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE records ADD COLUMN tags JSONB DEFAULT '[]'`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE records ADD COLUMN is_completed BOOLEAN DEFAULT FALSE`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE records ADD COLUMN deadline TIMESTAMP NULL`;
  } catch (e) { /* column may exist */ }

  // Create couple_spaces table
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS couple_spaces (
        id SERIAL PRIMARY KEY,
        invite_code VARCHAR(8) UNIQUE NOT NULL,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Couple spaces table created or already exists');
  } catch (e) {
    console.log('Couple spaces table creation skipped (may already exist)');
  }

  // Create users table
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        couple_space_id INTEGER REFERENCES couple_spaces(id),
        device_id VARCHAR(255) UNIQUE NOT NULL,
        nickname VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Users table created or already exists');
  } catch (e) {
    console.log('Users table creation skipped (may already exist)');
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS space_access_requests (
        id SERIAL PRIMARY KEY,
        target_couple_space_id INTEGER NOT NULL REFERENCES couple_spaces(id),
        requester_device_id VARCHAR(255) NOT NULL,
        requester_name VARCHAR(100) NOT NULL,
        invite_code_snapshot VARCHAR(8) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        approved_by_device_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP NULL,
        rejected_at TIMESTAMP NULL,
        revoked_at TIMESTAMP NULL,
        first_access_at TIMESTAMP NULL,
        access_expires_at TIMESTAMP NULL
      )
    `;
    console.log('Space access requests table created or already exists');
  } catch (e) {
    console.log('Space access requests table creation skipped (may already exist)');
  }

  // Add couple_space_id to records
  try {
    await sql`ALTER TABLE records ADD COLUMN couple_space_id INTEGER REFERENCES couple_spaces(id)`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE couple_spaces ADD COLUMN partner_a_name VARCHAR(100)`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE couple_spaces ADD COLUMN partner_a_avatar_url TEXT`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE couple_spaces ADD COLUMN partner_a_avatar_pathname TEXT`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE couple_spaces ADD COLUMN partner_b_name VARCHAR(100)`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE couple_spaces ADD COLUMN partner_b_avatar_url TEXT`;
  } catch (e) { /* column may exist */ }

  try {
    await sql`ALTER TABLE couple_spaces ADD COLUMN partner_b_avatar_pathname TEXT`;
  } catch (e) { /* column may exist */ }

  // Create indexes for new tables
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_couple_spaces_invite_code ON couple_spaces(invite_code)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_users_couple_space ON users(couple_space_id)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_records_couple_space ON records(couple_space_id)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_space_access_requests_target ON space_access_requests(target_couple_space_id)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_space_access_requests_requester ON space_access_requests(requester_device_id)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_space_access_requests_status ON space_access_requests(status)`;
  } catch (e) { /* index may exist */ }

  try {
    await sql.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_space_access_requests_open_unique
        ON space_access_requests(target_couple_space_id, requester_device_id)
        WHERE status IN ('pending', 'approved', 'active')
      `,
      []
    );
  } catch (e) { /* index may exist */ }

  console.log('Database initialization complete');
}

export async function createMemoryRecord(
  deviceId: string,
  type: string,
  content: string,
  imageUrls?: string[] | string,
  author?: string,
  tags?: string[],
  isCompleted?: boolean,
  deadline?: string | null
): Promise<MemoryRecord> {
  // Handle both single image and multiple images
  const imageUrl = Array.isArray(imageUrls) ? imageUrls[0] : (imageUrls || null);
  const imageUrlsJson = Array.isArray(imageUrls) && imageUrls.length > 0
    ? JSON.stringify(imageUrls)
    : '[]';
  const coupleSpaceId = await resolveDeviceIdToCoupleSpaceId(deviceId);

  const result = await sql`
    INSERT INTO records (device_id, couple_space_id, type, content, image_url, image_urls, author, tags, is_completed, deadline)
    VALUES (${deviceId}, ${coupleSpaceId || null}, ${type}, ${content}, ${imageUrl}, ${imageUrlsJson}, ${author || null}, ${tags ? JSON.stringify(tags) : '[]'}, ${isCompleted || false}, ${deadline || null})
    RETURNING id, device_id, couple_space_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
  `;

  const row = result.rows[0];
  // Parse JSON fields properly, also handle backwards compatibility with old image_url field
  const imageUrlsParsed = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
  const finalImageUrls = Array.isArray(imageUrlsParsed) && imageUrlsParsed.length > 0
    ? imageUrlsParsed
    : (row.image_url ? [row.image_url] : []);

  return {
    ...row,
    image_urls: finalImageUrls,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
  } as unknown as MemoryRecord;
}

export async function getMemoryRecordsByDevice(
  deviceId: string,
  options: MemoryRecordQueryOptions = {}
): Promise<MemoryRecordQueryResult> {
  return queryMemoryRecords(deviceId, options);
}

export async function getMemoryRecordsByDate(
  deviceId: string,
  date: string,
  options: MemoryRecordQueryOptions = {}
): Promise<MemoryRecordQueryResult> {
  return queryMemoryRecords(deviceId, { ...options, date });
}

export async function getMemoryRecordById(
  id: number,
  options: Pick<MemoryRecordQueryOptions, 'fields'> & {
    scope?: { clause: string; values: Array<string | number> };
  } = {}
): Promise<MemoryRecord | null> {
  const selectClause = buildSelectClause(options.fields);
  const result = options.scope
    ? await sql.query(
        `
          SELECT ${selectClause}
          FROM records
          WHERE id = $1
            AND ${shiftSqlPlaceholders(options.scope.clause, 1)}
          LIMIT 1
        `,
        [id, ...options.scope.values]
      )
    : await sql.query(
        `
          SELECT ${selectClause}
          FROM records
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );

  if (result.rows.length === 0) {
    return null;
  }

  return normalizeMemoryRecordRow(result.rows[0] as Record<string, unknown>);
}

async function getMemoryRecordCalendarSummaryByScope(
  scope: { clause: string; values: Array<string | number> },
  month: string,
  timezone: string = 'Asia/Shanghai'
): Promise<CalendarDaySummary[]> {
  const { localMonthToUTC } = await import('./datetime');
  const { start, end } = localMonthToUTC(month, timezone);
  const { clause: scopeClause, values: scopeValues } = scope;

  const result = await sql.query(
    `
      SELECT
        TO_CHAR((created_at AT TIME ZONE 'UTC' AT TIME ZONE $${scopeValues.length + 3}), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM records
      WHERE ${scopeClause}
        AND created_at >= $${scopeValues.length + 1}
        AND created_at <= $${scopeValues.length + 2}
      GROUP BY 1
      ORDER BY 1 DESC
    `,
    [...scopeValues, start.toISOString(), end.toISOString(), timezone]
  );

  return result.rows.map((row) => ({
    date: String(row.date),
    count: Number(row.count),
  }));
}

export async function getMemoryRecordCalendarSummary(
  deviceId: string,
  month: string,
  timezone: string = 'Asia/Shanghai'
): Promise<CalendarDaySummary[]> {
  const scope = await getRecordScope(deviceId);
  return getMemoryRecordCalendarSummaryByScope(scope, month, timezone);
}

export async function updateMemoryRecordPolishedContent(
  id: number,
  polishedContent: string
): Promise<MemoryRecord> {
  const result = await sql`
    UPDATE records
    SET polished_content = ${polishedContent}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
  `;
  const row = result.rows[0];
  const imageUrlsParsed = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
  const finalImageUrls = Array.isArray(imageUrlsParsed) && imageUrlsParsed.length > 0
    ? imageUrlsParsed
    : (row.image_url ? [row.image_url] : []);

  return {
    ...row,
    image_urls: finalImageUrls,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
  } as unknown as MemoryRecord;
}

export async function updateMemoryRecordTags(
  id: number,
  tags: string[]
): Promise<MemoryRecord> {
  const result = await sql`
    UPDATE records
    SET tags = ${JSON.stringify(tags)}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
  `;
  const row = result.rows[0];
  const imageUrlsParsed = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
  const finalImageUrls = Array.isArray(imageUrlsParsed) && imageUrlsParsed.length > 0
    ? imageUrlsParsed
    : (row.image_url ? [row.image_url] : []);

  return {
    ...row,
    image_urls: finalImageUrls,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
  } as unknown as MemoryRecord;
}

// 更新待办的完成状态和截止时间
export async function updateMemoryRecordTodo(
  id: number,
  isCompleted?: boolean,
  deadline?: string | null
): Promise<MemoryRecord> {
  const result = await sql`
    UPDATE records
    SET is_completed = ${isCompleted !== undefined ? isCompleted : false},
        deadline = ${deadline !== undefined ? deadline : null},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
  `;
  const row = result.rows[0];
  const imageUrlsParsed = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
  const finalImageUrls = Array.isArray(imageUrlsParsed) && imageUrlsParsed.length > 0
    ? imageUrlsParsed
    : (row.image_url ? [row.image_url] : []);

  return {
    ...row,
    image_urls: finalImageUrls,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
  } as unknown as MemoryRecord;
}

export async function deleteMemoryRecord(id: number): Promise<void> {
  await sql`DELETE FROM records WHERE id = ${id}`;
}

// True partial update - only updates provided fields
export async function updateMemoryRecord(
  id: number,
  updates: Partial<{
    content: string;
    polished_content: string;
    image_url: string | null;
    image_urls: string[];
    tags: string[];
    author: string;
    is_completed: boolean;
    deadline: string | null;
  }>
): Promise<MemoryRecord | null> {
  // Whitelist of allowed column names (prevents SQL injection)
  const allowedColumns = ['content', 'polished_content', 'image_url', 'image_urls', 'tags', 'author', 'is_completed', 'deadline'] as const;

  // Build dynamic SET clause
  const setParts: string[] = [];
  const queryValues: (string | boolean | null | number)[] = [];
  let paramIndex = 1;

  if (updates.content !== undefined && allowedColumns.includes('content')) {
    setParts.push(`content = $${paramIndex++}`);
    queryValues.push(updates.content);
  }

  if (updates.polished_content !== undefined && allowedColumns.includes('polished_content')) {
    setParts.push(`polished_content = $${paramIndex++}`);
    queryValues.push(updates.polished_content);
  }

  if (updates.image_url !== undefined && allowedColumns.includes('image_url')) {
    setParts.push(`image_url = $${paramIndex++}`);
    queryValues.push(updates.image_url);
  }

  if (updates.image_urls !== undefined && allowedColumns.includes('image_urls')) {
    setParts.push(`image_urls = $${paramIndex++}`);
    queryValues.push(JSON.stringify(updates.image_urls));
  }

  if (updates.tags !== undefined && allowedColumns.includes('tags')) {
    setParts.push(`tags = $${paramIndex++}`);
    queryValues.push(JSON.stringify(updates.tags));
  }

  if (updates.author !== undefined && allowedColumns.includes('author')) {
    setParts.push(`author = $${paramIndex++}`);
    queryValues.push(updates.author);
  }

  if (updates.is_completed !== undefined && allowedColumns.includes('is_completed')) {
    setParts.push(`is_completed = $${paramIndex++}`);
    queryValues.push(updates.is_completed);
  }

  if (updates.deadline !== undefined && allowedColumns.includes('deadline')) {
    setParts.push(`deadline = $${paramIndex++}`);
    queryValues.push(updates.deadline);
  }

  // Always update timestamp
  setParts.push('updated_at = CURRENT_TIMESTAMP');

  queryValues.push(id);

  // Build and execute query using raw SQL with proper escaping
  const setClause = setParts.join(', ');
  const result = await sql.query(
    `UPDATE records SET ${setClause} WHERE id = $${paramIndex} RETURNING id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at`,
    queryValues
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const imageUrlsParsed = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
  const finalImageUrls = Array.isArray(imageUrlsParsed) && imageUrlsParsed.length > 0
    ? imageUrlsParsed
    : (row.image_url ? [row.image_url] : []);

  return {
    ...row,
    image_urls: finalImageUrls,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
  } as unknown as MemoryRecord;
}

// 保存或更新克隆的声音
export async function saveClonedVoice(
  deviceId: string,
  voiceType: string,
  voiceId: string
): Promise<ClonedVoice> {
  const result = await sql`
    INSERT INTO cloned_voices (device_id, voice_type, voice_id, updated_at)
    VALUES (${deviceId}, ${voiceType}, ${voiceId}, CURRENT_TIMESTAMP)
    ON CONFLICT (device_id, voice_type)
    DO UPDATE SET voice_id = ${voiceId}, updated_at = CURRENT_TIMESTAMP
    RETURNING id, device_id, voice_type, voice_id, created_at, updated_at
  `;
  return result.rows[0] as unknown as ClonedVoice;
}

// 获取设备的所有克隆声音
export async function getClonedVoices(deviceId: string): Promise<ClonedVoice[]> {
  const result = await sql`
    SELECT id, device_id, voice_type, voice_id, created_at, updated_at
    FROM cloned_voices
    WHERE device_id = ${deviceId}
  `;
  return result.rows as unknown as ClonedVoice[];
}

// 获取特定类型的克隆声音
export async function getClonedVoice(deviceId: string, voiceType: string): Promise<ClonedVoice | null> {
  const result = await sql`
    SELECT id, device_id, voice_type, voice_id, created_at, updated_at
    FROM cloned_voices
    WHERE device_id = ${deviceId} AND voice_type = ${voiceType}
  `;
  return result.rows[0] as unknown as ClonedVoice || null;
}

// ==================== Couple Space Functions ====================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getCoupleSpaceProfileColumns(slot: CoupleProfileSlot) {
  if (slot === 'partnerA') {
    return {
      name: 'partner_a_name',
      avatarUrl: 'partner_a_avatar_url',
      avatarPathname: 'partner_a_avatar_pathname',
    } as const;
  }

  return {
    name: 'partner_b_name',
    avatarUrl: 'partner_b_avatar_url',
    avatarPathname: 'partner_b_avatar_pathname',
  } as const;
}

export function getCoupleSpaceProfiles(coupleSpace: CoupleSpace): CoupleSpaceProfiles {
  return {
    partnerA: {
      name: coupleSpace.partner_a_name || null,
      avatarUrl: coupleSpace.partner_a_avatar_url || null,
    },
    partnerB: {
      name: coupleSpace.partner_b_name || null,
      avatarUrl: coupleSpace.partner_b_avatar_url || null,
    },
  };
}

async function getRecordScope(deviceId: string): Promise<{ clause: string; values: Array<string | number> }> {
  const coupleSpaceId = await resolveDeviceIdToCoupleSpaceId(deviceId);

  if (coupleSpaceId) {
    return getCoupleSpaceRecordScope(coupleSpaceId);
  }

  return {
    clause: 'device_id = $1',
    values: [deviceId],
  };
}

async function assignRecordsToCoupleSpace(
  deviceId: string,
  coupleSpaceId: number,
  previousCoupleSpaceId?: number | null
): Promise<void> {
  const values: Array<string | number> = [coupleSpaceId, deviceId];
  let query = `
    UPDATE records
    SET couple_space_id = $1
    WHERE device_id = $2
      AND (couple_space_id IS NULL
  `;

  if (typeof previousCoupleSpaceId === 'number') {
    values.push(previousCoupleSpaceId);
    query += ` OR couple_space_id = $3`;
  }

  query += ')';

  await sql.query(query, values);
}

async function getCoupleSpaceMemberCount(coupleSpaceId: number): Promise<number> {
  const result = await sql`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE couple_space_id = ${coupleSpaceId}
  `;

  return Number(result.rows[0]?.count || 0);
}

export async function createCoupleSpace(deviceId: string, name?: string): Promise<{ coupleSpace: CoupleSpace; user: User }> {
  // Generate unique invite code
  let inviteCode: string | undefined;
  let attempts = 0;
  while (attempts < 10) {
    inviteCode = generateInviteCode();
    try {
      await sql`
        INSERT INTO couple_spaces (invite_code, name)
        VALUES (${inviteCode}, ${name || null})
        RETURNING id
      `;
      break;
    } catch (e) {
      attempts++;
      if (attempts >= 10) throw e;
    }
  }

  if (!inviteCode) {
    throw new Error('Failed to generate unique invite code after 10 attempts');
  }

  const coupleSpaceResult = await sql.query(
    `
      SELECT ${COUPLE_SPACE_SELECT_CLAUSE}
      FROM couple_spaces
      WHERE invite_code = $1
    `,
    [inviteCode]
  );

  if (!coupleSpaceResult.rows[0]) {
    throw new Error('Failed to create couple space');
  }

  const coupleSpace = normalizeCoupleSpaceRow(coupleSpaceResult.rows[0] as Record<string, unknown>);

  const userResult = await sql`
    INSERT INTO users (couple_space_id, device_id)
    VALUES (${coupleSpace.id}, ${deviceId})
    RETURNING id, couple_space_id, device_id, nickname, created_at
  `;

  if (!userResult.rows[0]) {
    throw new Error('Failed to create user');
  }

  const user = userResult.rows[0] as unknown as User;
  await assignRecordsToCoupleSpace(deviceId, coupleSpace.id);

  return { coupleSpace, user };
}

export async function getCoupleSpaceByInviteCode(inviteCode: string): Promise<CoupleSpace | null> {
  const result = await sql.query(
    `
      SELECT ${COUPLE_SPACE_SELECT_CLAUSE}
      FROM couple_spaces
      WHERE invite_code = $1
    `,
    [inviteCode.toUpperCase()]
  );
  return result.rows[0] ? normalizeCoupleSpaceRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function joinCoupleSpace(deviceId: string, inviteCode: string): Promise<{ coupleSpace: CoupleSpace; user: User } | null> {
  const coupleSpace = await getCoupleSpaceByInviteCode(inviteCode);
  if (!coupleSpace) {
    return null;
  }

  // Check if user already exists
  const existingUser = await getUserByDeviceId(deviceId);
  if (existingUser) {
    if (existingUser.couple_space_id === coupleSpace.id) {
      await assignRecordsToCoupleSpace(deviceId, coupleSpace.id);
      return {
        coupleSpace,
        user: existingUser,
      };
    }

    if (existingUser.couple_space_id) {
      const memberCount = await getCoupleSpaceMemberCount(existingUser.couple_space_id);
      if (memberCount > 1) {
        throw new Error('DEVICE_ALREADY_IN_OTHER_SPACE');
      }
    }

    // Update existing user's couple_space_id
    const updatedUser = await sql`
      UPDATE users SET couple_space_id = ${coupleSpace.id}
      WHERE device_id = ${deviceId}
      RETURNING id, couple_space_id, device_id, nickname, created_at
    `;
    if (updatedUser.rows[0]) {
      await assignRecordsToCoupleSpace(deviceId, coupleSpace.id, existingUser.couple_space_id);
      return {
        coupleSpace,
        user: updatedUser.rows[0] as unknown as User,
      };
    }
  }

  const userResult = await sql`
    INSERT INTO users (couple_space_id, device_id)
    VALUES (${coupleSpace.id}, ${deviceId})
    RETURNING id, couple_space_id, device_id, nickname, created_at
  `;
  const user = userResult.rows[0] as unknown as User;
  await assignRecordsToCoupleSpace(deviceId, coupleSpace.id);

  return { coupleSpace, user };
}

export async function getUserByDeviceId(deviceId: string): Promise<User | null> {
  const result = await sql`
    SELECT id, couple_space_id, device_id, nickname, created_at
    FROM users
    WHERE device_id = ${deviceId}
  `;
  return result.rows[0] as unknown as User || null;
}

export async function getCoupleSpaceById(id: number): Promise<CoupleSpace | null> {
  const result = await sql.query(
    `
      SELECT ${COUPLE_SPACE_SELECT_CLAUSE}
      FROM couple_spaces
      WHERE id = $1
    `,
    [id]
  );
  return result.rows[0] ? normalizeCoupleSpaceRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function updateCoupleSpaceProfile(
  coupleSpaceId: number,
  slot: CoupleProfileSlot,
  updates: {
    name?: string | null;
    avatarUrl?: string | null;
    avatarPathname?: string | null;
    clearAvatar?: boolean;
  }
): Promise<CoupleSpace | null> {
  const columns = getCoupleSpaceProfileColumns(slot);
  const setParts: string[] = [];
  const values: Array<string | number | null> = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setParts.push(`${columns.name} = $${paramIndex++}`);
    values.push(updates.name);
  }

  if (updates.clearAvatar) {
    setParts.push(`${columns.avatarUrl} = NULL`);
    setParts.push(`${columns.avatarPathname} = NULL`);
  } else {
    if (updates.avatarUrl !== undefined) {
      setParts.push(`${columns.avatarUrl} = $${paramIndex++}`);
      values.push(updates.avatarUrl);
    }

    if (updates.avatarPathname !== undefined) {
      setParts.push(`${columns.avatarPathname} = $${paramIndex++}`);
      values.push(updates.avatarPathname);
    }
  }

  if (setParts.length === 0) {
    return getCoupleSpaceById(coupleSpaceId);
  }

  setParts.push('updated_at = CURRENT_TIMESTAMP');
  values.push(coupleSpaceId);

  const result = await sql.query(
    `UPDATE couple_spaces
     SET ${setParts.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING ${COUPLE_SPACE_SELECT_CLAUSE}`,
    values
  );

  return result.rows[0] ? normalizeCoupleSpaceRow(result.rows[0] as Record<string, unknown>) : null;
}

async function expireActiveAccessRequests(): Promise<void> {
  await sql`
    UPDATE space_access_requests
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'active'
      AND access_expires_at IS NOT NULL
      AND access_expires_at <= CURRENT_TIMESTAMP
  `;
}

async function getSpaceAccessRequestById(id: number): Promise<SpaceAccessRequest | null> {
  const result = await sql.query(
    `
      SELECT ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      FROM space_access_requests
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0]
    ? normalizeSpaceAccessRequestRow(result.rows[0] as Record<string, unknown>)
    : null;
}

export async function createSpaceAccessRequest(
  deviceId: string,
  inviteCode: string,
  requesterName: string
): Promise<SpaceAccessRequest> {
  const normalizedName = requesterName.trim();
  if (!normalizedName) {
    throw new Error('REQUESTER_NAME_REQUIRED');
  }

  const coupleSpace = await getCoupleSpaceByInviteCode(inviteCode);
  if (!coupleSpace) {
    throw new Error('INVALID_INVITE_CODE');
  }

  const requesterCoupleSpaceId = await resolveDeviceIdToCoupleSpaceId(deviceId);
  if (requesterCoupleSpaceId && requesterCoupleSpaceId === coupleSpace.id) {
    throw new Error('CANNOT_REQUEST_OWN_SPACE');
  }

  await expireActiveAccessRequests();

  const existingOpenRequest = await sql.query(
    `
      SELECT ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      FROM space_access_requests
      WHERE target_couple_space_id = $1
        AND requester_device_id = $2
        AND status IN ('pending', 'approved', 'active')
      LIMIT 1
    `,
    [coupleSpace.id, deviceId]
  );

  if (existingOpenRequest.rows[0]) {
    throw new Error('REQUEST_ALREADY_EXISTS');
  }

  try {
    const result = await sql.query(
      `
        INSERT INTO space_access_requests (
          target_couple_space_id,
          requester_device_id,
          requester_name,
          invite_code_snapshot,
          status
        )
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      `,
      [coupleSpace.id, deviceId, normalizedName, coupleSpace.invite_code]
    );

    return normalizeSpaceAccessRequestRow(result.rows[0] as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && /idx_space_access_requests_open_unique/i.test(error.message)) {
      throw new Error('REQUEST_ALREADY_EXISTS');
    }

    throw error;
  }
}

export async function listIncomingSpaceAccessRequests(deviceId: string): Promise<SpaceAccessRequest[]> {
  await expireActiveAccessRequests();

  const user = await getUserByDeviceId(deviceId);
  if (!user?.couple_space_id) {
    return [];
  }

  const result = await sql.query(
    `
      SELECT ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      FROM space_access_requests
      WHERE target_couple_space_id = $1
        AND status IN ('pending', 'approved', 'active')
      ORDER BY
        CASE status
          WHEN 'pending' THEN 0
          WHEN 'approved' THEN 1
          WHEN 'active' THEN 2
          ELSE 3
        END,
        created_at DESC
    `,
    [user.couple_space_id]
  );

  return result.rows.map((row) => normalizeSpaceAccessRequestRow(row as Record<string, unknown>));
}

export async function listOutgoingSpaceAccessRequests(deviceId: string): Promise<SpaceAccessRequest[]> {
  await expireActiveAccessRequests();

  const result = await sql.query(
    `
      SELECT ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      FROM space_access_requests
      WHERE requester_device_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [deviceId]
  );

  return result.rows.map((row) => normalizeSpaceAccessRequestRow(row as Record<string, unknown>));
}

export async function updateSpaceAccessRequestStatus(
  deviceId: string,
  requestId: number,
  action: 'approve' | 'reject' | 'revoke'
): Promise<SpaceAccessRequest> {
  await expireActiveAccessRequests();

  const user = await getUserByDeviceId(deviceId);
  if (!user?.couple_space_id) {
    throw new Error('ACCESS_REQUEST_FORBIDDEN');
  }

  const request = await getSpaceAccessRequestById(requestId);
  if (!request) {
    throw new Error('ACCESS_REQUEST_NOT_FOUND');
  }

  if (request.target_couple_space_id !== user.couple_space_id) {
    throw new Error('ACCESS_REQUEST_FORBIDDEN');
  }

  if (action === 'approve') {
    if (request.status !== 'pending') {
      throw new Error('ACCESS_REQUEST_INVALID_STATUS');
    }

    const result = await sql.query(
      `
        UPDATE space_access_requests
        SET status = 'approved',
            approved_by_device_id = $2,
            approved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      `,
      [requestId, deviceId]
    );

    return normalizeSpaceAccessRequestRow(result.rows[0] as Record<string, unknown>);
  }

  if (action === 'reject') {
    if (request.status !== 'pending') {
      throw new Error('ACCESS_REQUEST_INVALID_STATUS');
    }

    const result = await sql.query(
      `
        UPDATE space_access_requests
        SET status = 'rejected',
            rejected_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      `,
      [requestId]
    );

    return normalizeSpaceAccessRequestRow(result.rows[0] as Record<string, unknown>);
  }

  if (request.status !== 'approved' && request.status !== 'active') {
    throw new Error('ACCESS_REQUEST_INVALID_STATUS');
  }

  const result = await sql.query(
    `
      UPDATE space_access_requests
      SET status = 'revoked',
          revoked_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
    `,
    [requestId]
  );

  return normalizeSpaceAccessRequestRow(result.rows[0] as Record<string, unknown>);
}

export async function resolveAccessRequestReadableScope(
  deviceId: string,
  requestId: number
): Promise<{
  request: SpaceAccessRequest;
  coupleSpace: CoupleSpace;
  recordScope: { clause: string; values: Array<string | number> };
}> {
  await expireActiveAccessRequests();

  const existingRequest = await getSpaceAccessRequestById(requestId);
  if (!existingRequest) {
    throw new Error('ACCESS_REQUEST_NOT_FOUND');
  }

  if (existingRequest.requester_device_id !== deviceId) {
    throw new Error('ACCESS_REQUEST_FORBIDDEN');
  }

  if (existingRequest.status === 'pending') {
    throw new Error('ACCESS_REQUEST_NOT_APPROVED');
  }

  if (existingRequest.status === 'rejected' || existingRequest.status === 'revoked' || existingRequest.status === 'expired') {
    throw new Error('ACCESS_REQUEST_UNAVAILABLE');
  }

  const coupleSpace = await getCoupleSpaceById(existingRequest.target_couple_space_id);
  if (!coupleSpace) {
    throw new Error('COUPLE_SPACE_NOT_FOUND');
  }

  let request = existingRequest;

  if (request.status === 'approved') {
    const activated = await sql.query(
      `
        UPDATE space_access_requests
        SET status = 'active',
            first_access_at = COALESCE(first_access_at, CURRENT_TIMESTAMP),
            access_expires_at = COALESCE(
              access_expires_at,
              CURRENT_TIMESTAMP + ($2::text || ' minutes')::interval
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING ${SPACE_ACCESS_REQUEST_SELECT_CLAUSE}
      `,
      [request.id, ACCESS_WINDOW_MINUTES]
    );

    request = normalizeSpaceAccessRequestRow(activated.rows[0] as Record<string, unknown>);
  }

  if (
    request.status === 'active' &&
    request.access_expires_at &&
    new Date(request.access_expires_at).getTime() <= Date.now()
  ) {
    await sql`
      UPDATE space_access_requests
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${request.id}
    `;
    throw new Error('ACCESS_REQUEST_UNAVAILABLE');
  }

  return {
    request,
    coupleSpace,
    recordScope: getCoupleSpaceRecordScope(coupleSpace.id),
  };
}

export async function getMemoryRecordsByAccessRequest(
  deviceId: string,
  accessRequestId: number,
  options: MemoryRecordQueryOptions = {}
): Promise<MemoryRecordQueryResult> {
  const resolved = await resolveAccessRequestReadableScope(deviceId, accessRequestId);
  return queryMemoryRecordsByScope(resolved.recordScope, options);
}

export async function getMemoryRecordsByAccessRequestAndDate(
  deviceId: string,
  accessRequestId: number,
  date: string,
  options: MemoryRecordQueryOptions = {}
): Promise<MemoryRecordQueryResult> {
  const resolved = await resolveAccessRequestReadableScope(deviceId, accessRequestId);
  return queryMemoryRecordsByScope(resolved.recordScope, { ...options, date });
}

export async function getMemoryRecordCalendarSummaryByAccessRequest(
  deviceId: string,
  accessRequestId: number,
  month: string,
  timezone: string = 'Asia/Shanghai'
): Promise<CalendarDaySummary[]> {
  const resolved = await resolveAccessRequestReadableScope(deviceId, accessRequestId);
  return getMemoryRecordCalendarSummaryByScope(resolved.recordScope, month, timezone);
}

export async function getMemoryRecordByIdForAccessRequest(
  deviceId: string,
  accessRequestId: number,
  id: number,
  options: Pick<MemoryRecordQueryOptions, 'fields'> = {}
): Promise<MemoryRecord | null> {
  const resolved = await resolveAccessRequestReadableScope(deviceId, accessRequestId);
  return getMemoryRecordById(id, {
    ...options,
    scope: resolved.recordScope,
  });
}

export async function getCoupleSpaceByAccessRequest(
  deviceId: string,
  accessRequestId: number
): Promise<CoupleSpace> {
  const resolved = await resolveAccessRequestReadableScope(deviceId, accessRequestId);
  return resolved.coupleSpace;
}

export async function getOrCreateCoupleSpace(deviceId: string): Promise<{ coupleSpace: CoupleSpace; user: User }> {
  // First check if user exists and has a couple_space
  const existingUser = await getUserByDeviceId(deviceId);
  if (existingUser && existingUser.couple_space_id) {
    const coupleSpace = await getCoupleSpaceById(existingUser.couple_space_id);
    if (coupleSpace) {
      await assignRecordsToCoupleSpace(deviceId, coupleSpace.id);
      return { coupleSpace, user: existingUser };
    }
  }

  // Create new couple space
  return createCoupleSpace(deviceId);
}

export async function resolveDeviceIdToCoupleSpaceId(deviceId: string): Promise<number | null> {
  const user = await getUserByDeviceId(deviceId);
  return user?.couple_space_id || null;
}
