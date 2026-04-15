import { NextRequest, NextResponse } from 'next/server';
import { chatWithAI } from '@/lib/ai';

function sanitizeText(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/"/g, '\\"')
    .trim();
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length >= 1 && item.length <= 16),
    ),
  ).slice(0, 8);
}

function parseTags(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = [trimmed];
  const jsonBlock = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonBlock) {
    candidates.push(jsonBlock[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        const tags = normalizeTags(parsed);
        if (tags.length > 0) {
          return tags;
        }
      }

      if (parsed && typeof parsed === 'object' && 'tags' in parsed) {
        const tags = normalizeTags((parsed as { tags: unknown }).tags);
        if (tags.length > 0) {
          return tags;
        }
      }
    } catch {
      continue;
    }
  }

  return normalizeTags(trimmed.split(/[,，、\n]/).map((item) => item.trim()));
}

function fallbackTags(content: string, existingTags: string[], hasImage: boolean): string[] {
  const result = new Set<string>();
  const cjk = content.match(/[\u4E00-\u9FFF]{2,8}/g) || [];
  const words = content.toLowerCase().match(/[a-z][a-z-]{2,15}/g) || [];

  if (hasImage) {
    result.add('照片');
    result.add('瞬间');
  }

  for (const item of existingTags) {
    if (content.includes(item)) {
      result.add(item);
    }
  }

  for (const item of cjk) {
    result.add(item);
    if (result.size >= 6) {
      break;
    }
  }

  for (const item of words) {
    result.add(item);
    if (result.size >= 6) {
      break;
    }
  }

  return Array.from(result).slice(0, 8);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const content = typeof body.content === 'string' ? body.content : '';
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : '';
    const existingTags = normalizeTags(body.existingTags);

    if (!content.trim() && !imageUrl) {
      return NextResponse.json({ error: 'Content or image is required' }, { status: 400 });
    }

    const prompt = [
      'You extract semantic tags for a shared diary.',
      'Return strict JSON only.',
      'Format: {"tags":["tag1","tag2","tag3"]}',
      'Rules:',
      '- return 3 to 8 tags',
      '- prefer reusable semantic tags over literal fragments',
      '- keep tags concise',
      '- if the original content is Chinese, return Chinese tags',
      `Existing tags: ${JSON.stringify(existingTags)}`,
      `Content: "${sanitizeText(content)}"`,
      `Image URL: "${sanitizeText(imageUrl)}"`,
      `Has image: ${imageUrl ? 'yes' : 'no'}`,
    ].join('\n');

    let rawResponse = '';
    try {
      const result = await chatWithAI([{ role: 'user', content: prompt }]);
      rawResponse = result.content;
    } catch (error) {
      console.error('AI tag extraction failed, using fallback:', error);
    }

    let tags = parseTags(rawResponse);
    if (tags.length < 3) {
      tags = fallbackTags(content, existingTags, Boolean(imageUrl));
    }

    if (tags.length === 0) {
      tags = imageUrl ? ['照片', '瞬间', '回忆'] : ['记录', '日常', '回忆'];
    }

    return NextResponse.json({
      tags: tags.slice(0, 8),
      debug: {
        rawResponse,
        parsedCount: tags.length,
      },
    });
  } catch (error) {
    console.error('Failed to extract tags:', error);
    return NextResponse.json(
      { error: 'Failed to extract tags', details: String(error) },
      { status: 500 },
    );
  }
}
