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

    // If there's content, use it directly
    const textContent = content?.trim() || '无文字内容';

    // Build prompt for tag extraction
    const prompt = `请分析以下文字内容，提取3-8个中文标签。

文字内容：${textContent}

请从以下类别中提取标签（每类最多1-2个标签）：
- 地点（如：家、餐厅、公园、旅行目的地、城市）
- 活动（如：约会、吃饭、逛街、旅行、看电影、购物）
- 情感（如：甜蜜、开心、放松、浪漫、温暖）
- 主题（如：生日、纪念日、日常、节日、周末）
- 天气/时间（如：晴天、夜晚、周末、早上、夏天）
- 其他（任何值得记录的标签）

请只返回JSON数组格式的标签，不要任何其他文字。格式：["标签1", "标签2"]`;

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

    if (!response.ok) {
      console.error('MiniMax API error:', response.status, data);
      return NextResponse.json({ error: 'API请求失败', details: data }, { status: 500 });
    }

    const responseText = data.choices?.[0]?.message?.content?.trim() || '';

    // Extract JSON array from response
    let tags: string[] = [];

    // First try direct JSON parse
    try {
      const parsed = JSON.parse(responseText);
      if (Array.isArray(parsed)) {
        tags = parsed.filter(t => typeof t === 'string');
      }
    } catch {
      // If that fails, try to extract array from text
      const match = responseText.match(/\[[\s\S]*?\]/);
      if (match) {
        try {
          const extracted = JSON.parse(match[0]);
          if (Array.isArray(extracted)) {
            tags = extracted.filter(t => typeof t === 'string');
          }
        } catch {
          // Still failed, try one more approach - split by common separators
          const cleanText = responseText.replace(/[\[\]【】]/g, '');
          const parts = cleanText.split(/[,，、]/);
          tags = parts.map(p => p.trim()).filter(p => p.length > 0 && p.length < 20);
        }
      }
    }

    // Ensure we have strings and limit to 8
    tags = tags.filter(t => typeof t === 'string').slice(0, 8);

    if (tags.length === 0) {
      return NextResponse.json({ error: '未能解析出标签', rawResponse: responseText }, { status: 500 });
    }

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Failed to extract tags:', error);
    return NextResponse.json({ error: '提取标签失败', details: String(error) }, { status: 500 });
  }
}