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

    // Build prompt for tag extraction
    const prompt = `请分析以下文字内容，提取3-8个标签。

文字内容：${content || '无'}

请从以下类别中提取标签：
- 地点（如：家、餐厅、公园、旅行目的地）
- 活动（如：约会、吃饭、逛街、旅行、看电影）
- 情感（如：甜蜜、开心、放松、浪漫）
- 主题（如：生日、纪念日、日常、节日）
- 天气/时间（如：晴天、夜晚、周末、早上）
- 其他（任何值得记录的标签）

请直接返回JSON数组格式的标签，不要其他解释。格式如：["标签1", "标签2", "标签3"]`;

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
      return NextResponse.json({ error: 'Failed to extract tags', details: data }, { status: 500 });
    }

    const responseText = data.choices?.[0]?.message?.content || '';

    // Extract JSON array from response
    let tags: string[] = [];
    try {
      tags = JSON.parse(responseText);
    } catch {
      // Try to extract JSON array from text
      const match = responseText.match(/\[[\s\S]*?\]/);
      if (match) {
        try {
          tags = JSON.parse(match[0]);
        } catch {
          tags = [];
        }
      }
    }

    // Ensure we have an array of strings
    if (!Array.isArray(tags)) {
      tags = [];
    }
    tags = tags.filter(t => typeof t === 'string');

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Failed to extract tags:', error);
    return NextResponse.json({ error: 'Failed to extract tags', details: String(error) }, { status: 500 });
  }
}