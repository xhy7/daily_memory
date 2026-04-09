import { sql } from '@vercel/postgres';

export interface Record {
  id: number;
  device_id: string;
  type: string;
  content: string;
  polished_content?: string;
  image_url?: string;
  author?: string;
  created_at: string;
  updated_at: string;
}

export async function initializeDatabase() {
  console.log('Initializing database...');
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS records (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        polished_content TEXT,
        image_url TEXT,
        author VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Table created or already exists');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

export async function createRecord(
  deviceId: string,
  type: string,
  content: string,
  imageUrl?: string,
  author?: string
): Promise<Record> {
  const result = await sql`
    INSERT INTO records (device_id, type, content, image_url, author)
    VALUES (${deviceId}, ${type}, ${content}, ${imageUrl || null}, ${author || null})
    RETURNING id, device_id, type, content, polished_content, image_url, author, created_at, updated_at
  `;
  return result.rows[0];
}

export async function getRecordsByDevice(deviceId: string): Promise<Record[]> {
  const result = await sql`
    SELECT id, device_id, type, content, polished_content, image_url, author, created_at, updated_at
    FROM records
    WHERE device_id = ${deviceId}
    ORDER BY created_at DESC
  `;
  return result.rows;
}

export async function getRecordsByDate(deviceId: string, date: string): Promise<Record[]> {
  const result = await sql`
    SELECT id, device_id, type, content, polished_content, image_url, author, created_at, updated_at
    FROM records
    WHERE device_id = ${deviceId} AND DATE(created_at) = ${date}
    ORDER BY created_at DESC
  `;
  return result.rows;
}

export async function updateRecordPolishedContent(
  id: number,
  polishedContent: string
): Promise<Record> {
  const result = await sql`
    UPDATE records
    SET polished_content = ${polishedContent}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, device_id, type, content, polished_content, image_url, author, created_at, updated_at
  `;
  return result.rows[0];
}

export async function deleteRecord(id: number): Promise<void> {
  await sql`DELETE FROM records WHERE id = ${id}`;
}