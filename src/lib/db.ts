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

export async function getMemoryRecordsByDevice(deviceId: string): Promise<MemoryRecord[]> {
  const result = await sql`
    SELECT id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
    FROM records
    WHERE device_id = ${deviceId}
    ORDER BY created_at DESC
  `;
  // Parse JSON fields properly, handle backwards compatibility
  return result.rows.map(row => {
    const imageUrlsParsed = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
    const finalImageUrls = Array.isArray(imageUrlsParsed) && imageUrlsParsed.length > 0
      ? imageUrlsParsed
      : (row.image_url ? [row.image_url] : []);

    return {
      ...row,
      image_urls: finalImageUrls,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
    };
  }) as unknown as MemoryRecord[];
}

export async function getMemoryRecordsByDate(deviceId: string, date: string): Promise<MemoryRecord[]> {
  const { localDateToUTC } = await import('./datetime');
  const { start, end } = localDateToUTC(date);

  const result = await sql`
    SELECT id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
    FROM records
    WHERE device_id = ${deviceId} AND created_at >= ${start.toISOString()} AND created_at <= ${end.toISOString()}
    ORDER BY created_at DESC
  `;
  return result.rows.map(row => {
    const imageUrlsParsed = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
    const finalImageUrls = Array.isArray(imageUrlsParsed) && imageUrlsParsed.length > 0
      ? imageUrlsParsed
      : (row.image_url ? [row.image_url] : []);

    return {
      ...row,
      image_urls: finalImageUrls,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || [])
    };
  }) as unknown as MemoryRecord[];
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
  const allowedColumns = new Set([
    'content', 'polished_content', 'image_url', 'image_urls',
    'tags', 'author', 'is_completed', 'deadline'
  ]);

  // Build dynamic SET clause using parameterized queries
  const setClauses: string[] = [];
  const values: (string | boolean | null)[] = [];
  let paramIndex = 1;

  if (updates.content !== undefined && allowedColumns.has('content')) {
    setClauses.push(`content = $${paramIndex++}`);
    values.push(updates.content);
  }

  if (updates.polished_content !== undefined && allowedColumns.has('polished_content')) {
    setClauses.push(`polished_content = $${paramIndex++}`);
    values.push(updates.polished_content);
  }

  if (updates.image_url !== undefined && allowedColumns.has('image_url')) {
    setClauses.push(`image_url = $${paramIndex++}`);
    values.push(updates.image_url);
  }

  if (updates.image_urls !== undefined && allowedColumns.has('image_urls')) {
    setClauses.push(`image_urls = $${paramIndex++}`);
    values.push(JSON.stringify(updates.image_urls));
  }

  if (updates.tags !== undefined && allowedColumns.has('tags')) {
    setClauses.push(`tags = $${paramIndex++}`);
    values.push(JSON.stringify(updates.tags));
  }

  if (updates.author !== undefined && allowedColumns.has('author')) {
    setClauses.push(`author = $${paramIndex++}`);
    values.push(updates.author);
  }

  if (updates.is_completed !== undefined && allowedColumns.has('is_completed')) {
    setClauses.push(`is_completed = $${paramIndex++}`);
    values.push(updates.is_completed);
  }

  if (updates.deadline !== undefined && allowedColumns.has('deadline')) {
    setClauses.push(`deadline = $${paramIndex++}`);
    values.push(updates.deadline);
  }

  // Always update timestamp
  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

  values.push(id);

  const result = await sql`
    UPDATE records
    SET ${sql.join(setClauses.map(clause => sql`${sql.raw(clause)}`), sql`, `)}
    WHERE id = $${paramIndex}
    RETURNING id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
  `;

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