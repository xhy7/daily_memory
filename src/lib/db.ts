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
  created_at: string;
  updated_at: string;
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

async function queryMemoryRecords(
  deviceId: string,
  options: MemoryRecordQueryOptions & { date?: string } = {}
): Promise<MemoryRecordQueryResult> {
  const { localDateToUTC } = await import('./datetime');

  const whereParts: string[] = ['device_id = $1'];
  const whereValues: Array<string | number> = [deviceId];
  let nextParamIndex = 2;

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

  // Add couple_space_id to records
  try {
    await sql`ALTER TABLE records ADD COLUMN couple_space_id INTEGER REFERENCES couple_spaces(id)`;
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

  const result = await sql`
    INSERT INTO records (device_id, type, content, image_url, image_urls, author, tags, is_completed, deadline)
    VALUES (${deviceId}, ${type}, ${content}, ${imageUrl}, ${imageUrlsJson}, ${author || null}, ${tags ? JSON.stringify(tags) : '[]'}, ${isCompleted || false}, ${deadline || null})
    RETURNING id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
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
  options: Pick<MemoryRecordQueryOptions, 'fields'> = {}
): Promise<MemoryRecord | null> {
  const selectClause = buildSelectClause(options.fields);
  const result = await sql.query(
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

export async function getMemoryRecordCalendarSummary(
  deviceId: string,
  month: string,
  timezone: string = 'Asia/Shanghai'
): Promise<CalendarDaySummary[]> {
  const { localMonthToUTC } = await import('./datetime');
  const { start, end } = localMonthToUTC(month, timezone);

  const result = await sql.query(
    `
      SELECT
        TO_CHAR((created_at AT TIME ZONE 'UTC' AT TIME ZONE $4), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM records
      WHERE device_id = $1
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY 1
      ORDER BY 1 DESC
    `,
    [deviceId, start.toISOString(), end.toISOString(), timezone]
  );

  return result.rows.map((row) => ({
    date: String(row.date),
    count: Number(row.count),
  }));
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

  const coupleSpaceResult = await sql`
    SELECT id, invite_code, name, created_at, updated_at
    FROM couple_spaces
    WHERE invite_code = ${inviteCode}
  `;

  if (!coupleSpaceResult.rows[0]) {
    throw new Error('Failed to create couple space');
  }

  const coupleSpace = coupleSpaceResult.rows[0] as unknown as CoupleSpace;

  const userResult = await sql`
    INSERT INTO users (couple_space_id, device_id)
    VALUES (${coupleSpace.id}, ${deviceId})
    RETURNING id, couple_space_id, device_id, nickname, created_at
  `;

  if (!userResult.rows[0]) {
    throw new Error('Failed to create user');
  }

  const user = userResult.rows[0] as unknown as User;

  return { coupleSpace, user };
}

export async function getCoupleSpaceByInviteCode(inviteCode: string): Promise<CoupleSpace | null> {
  const result = await sql`
    SELECT id, invite_code, name, created_at, updated_at
    FROM couple_spaces
    WHERE invite_code = ${inviteCode.toUpperCase()}
  `;
  return result.rows[0] as unknown as CoupleSpace || null;
}

export async function joinCoupleSpace(deviceId: string, inviteCode: string): Promise<{ coupleSpace: CoupleSpace; user: User } | null> {
  const coupleSpace = await getCoupleSpaceByInviteCode(inviteCode);
  if (!coupleSpace) {
    return null;
  }

  // Check if user already exists
  const existingUser = await getUserByDeviceId(deviceId);
  if (existingUser) {
    // Update existing user's couple_space_id
    const updatedUser = await sql`
      UPDATE users SET couple_space_id = ${coupleSpace.id}
      WHERE device_id = ${deviceId}
      RETURNING id, couple_space_id, device_id, nickname, created_at
    `;
    if (updatedUser.rows[0]) {
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
  const result = await sql`
    SELECT id, invite_code, name, created_at, updated_at
    FROM couple_spaces
    WHERE id = ${id}
  `;
  return result.rows[0] as unknown as CoupleSpace || null;
}

export async function getOrCreateCoupleSpace(deviceId: string): Promise<{ coupleSpace: CoupleSpace; user: User }> {
  // First check if user exists and has a couple_space
  const existingUser = await getUserByDeviceId(deviceId);
  if (existingUser && existingUser.couple_space_id) {
    const coupleSpace = await getCoupleSpaceById(existingUser.couple_space_id);
    if (coupleSpace) {
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
