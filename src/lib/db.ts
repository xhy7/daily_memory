import { sql } from '@vercel/postgres';

export interface MemoryRecord {
  id: number;
  device_id: string;
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

// 声音克隆记录
export interface ClonedVoice {
  id: number;
  device_id: string;
  voice_type: string;  // 'his' or 'her'
  voice_id: string;   // MiniMax返回的voice_id
  created_at: string;
  updated_at: string;
}

export async function initializeDatabase() {
  console.log('Initializing database...');
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

    // Add indexes for better query performance
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_records_device_id ON records(device_id)`;
      console.log('Index idx_records_device_id created');
    } catch (e) {
      console.log('Index idx_records_device_id already exists or error:', e);
    }

    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC)`;
      console.log('Index idx_records_created_at created');
    } catch (e) {
      console.log('Index idx_records_created_at already exists or error:', e);
    }

    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_records_device_created ON records(device_id, created_at DESC)`;
      console.log('Index idx_records_device_created created');
    } catch (e) {
      console.log('Index idx_records_device_created already exists or error:', e);
    }

    // Add columns if they don't exist
    try {
      await sql`ALTER TABLE records ADD COLUMN image_urls JSONB DEFAULT '[]'`;
      console.log('image_urls column added');
    } catch (e) {
      console.log('image_urls column already exists or error:', e);
    }

    try {
      await sql`ALTER TABLE records ADD COLUMN tags JSONB DEFAULT '[]'`;
      console.log('Tags column added');
    } catch (e) {
      console.log('Tags column already exists or error:', e);
    }

    try {
      await sql`ALTER TABLE records ADD COLUMN is_completed BOOLEAN DEFAULT FALSE`;
      console.log('is_completed column added');
    } catch (e) {
      console.log('is_completed column already exists or error:', e);
    }

    try {
      await sql`ALTER TABLE records ADD COLUMN deadline TIMESTAMP NULL`;
      console.log('deadline column added');
    } catch (e) {
      console.log('deadline column already exists or error:', e);
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
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
  // 将本地日期转换为 UTC 时间范围进行查询
  // 假设用户时区为 Asia/Shanghai (UTC+8)
  // 将本地日期 00:00:00 转换为 UTC = 本地时间 - 8小时
  // 如果本地日期是 4.11 00:00:00 Shanghai, 则是 4.10 16:00:00 UTC
  // 需要查询 4.10 16:00:00 UTC 到 4.11 16:00:00 UTC 之间的记录
  const [year, month, day] = date.split('-').map(Number);
  const localStart = new Date(year, month - 1, day, 0, 0, 0);
  const localEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

  // 转换为 UTC (减去8小时得到UTC)
  const utcStart = new Date(localStart.getTime() - 8 * 60 * 60 * 1000);
  const utcEnd = new Date(localEnd.getTime() - 8 * 60 * 60 * 1000 + 1000); // 加1秒确保包含整天

  const result = await sql`
    SELECT id, device_id, type, content, polished_content, image_url, image_urls, tags, author, is_completed, deadline, created_at, updated_at
    FROM records
    WHERE device_id = ${deviceId} AND created_at >= ${utcStart.toISOString()} AND created_at <= ${utcEnd.toISOString()}
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

// 更新记录内容（包括图片）
export async function updateMemoryRecord(
  id: number,
  content: string,
  imageUrls?: string[]
): Promise<MemoryRecord> {
  const imageUrl = Array.isArray(imageUrls) && imageUrls.length > 0 ? imageUrls[0] : null;
  const imageUrlsJson = Array.isArray(imageUrls) && imageUrls.length > 0
    ? JSON.stringify(imageUrls)
    : '[]';

  const result = await sql`
    UPDATE records
    SET content = ${content},
        image_url = ${imageUrl},
        image_urls = ${imageUrlsJson},
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