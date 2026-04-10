import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { content, imageUrl } = body;

    if (!content && !imageUrl) {
      return NextResponse.json({ error: 'Content or image is required' }, { status: 400 });
    }

    // Flexible prompt - let AI decide what tags are relevant
    const textContent = content?.trim() || '';
    const prompt = `请分析以下文字，提取几个能描述这条记录的关键词/标签。

文字内容：${textContent || '无'}

要求：
1. 根据内容自由提取标签，可以是：地点、活动、情感、人物、物品、主题、行动等任何有意义的关键词
2. 标签数量：3-8个
3. 标签格式：2-6个中文字符
4. 只返回标签，不要解释

示例输出格式：
["约会", "晚餐", "浪漫", "周末", "购物中心"]

请直接输出JSON数组：`;

    // Use MiniMax API
    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'abab6.5s-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();

    console.log('MiniMax API response status:', response.status);
    console.log('MiniMax API response data:', JSON.stringify(data));

    if (!response.ok) {
      console.error('MiniMax API error:', response.status, data);
      return NextResponse.json({ error: 'API请求失败', details: data }, { status: 500 });
    }

    const responseText = data.choices?.[0]?.message?.content?.trim() || '';
    console.log('AI response text:', responseText);

    // Extract tags with multiple fallback strategies
    let tags: string[] = [];

    // Strategy 1: Direct JSON parse
    try {
      const parsed = JSON.parse(responseText);
      if (Array.isArray(parsed)) {
        tags = parsed.filter(t => typeof t === 'string' && t.length >= 1 && t.length <= 10);
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 2: Extract from brackets
    if (tags.length === 0) {
      const match = responseText.match(/\[[\s\S]*?\]/);
      if (match) {
        try {
          const extracted = JSON.parse(match[0]);
          if (Array.isArray(extracted)) {
            tags = extracted.filter(t => typeof t === 'string' && t.length >= 1 && t.length <= 10);
          }
        } catch {
          // Continue
        }
      }
    }

    // Strategy 3: Split by common separators
    if (tags.length === 0) {
      // Remove brackets and split
      const cleanText = responseText.replace(/[\[\]【】""]/g, '');
      const parts = cleanText.split(/[,，、\n]+/);
      tags = parts
        .map((p: string) => p.trim())
        .filter((p: string) => p.length >= 1 && p.length <= 10);
    }

    // Strategy 4: Extract any quoted strings
    if (tags.length === 0) {
      const quoted = responseText.match(/"([^"]+)"/g);
      if (quoted) {
        tags = quoted.map(q => q.replace(/"/g, '').trim());
      }
    }

    // Ensure we have strings and limit to 8
    tags = Array.from(new Set(tags)).filter(t => typeof t === 'string' && t.length > 0).slice(0, 8);

    // If still no tags, create some based on content analysis
    if (tags.length === 0 && textContent.length > 0) {
      // Simple keyword extraction as fallback
      const keywords = textContent
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2 && w.length <= 6)
        .slice(0, 5);
      tags = keywords;
    }

    // Return tags along with debug info
    return NextResponse.json({
      tags,
      debug: {
        rawResponse: responseText,
        parsedCount: tags.length
      }
    });
  } catch (error) {
    console.error('Failed to extract tags:', error);
    return NextResponse.json({ error: '提取标签失败', details: String(error) }, { status: 500 });
  }
}