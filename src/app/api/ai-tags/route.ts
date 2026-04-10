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

    const textContent = content?.trim() || '';

    // 使用 MiniMax API
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
            content: `请为以下记录提取3-6个关键词标签。\n\n记录内容：${textContent}\n\n要求：每个标签2-6个汉字，只返回JSON数组格式，如["任务","网站","AI"]。只返回数组，不要任何其他文字。`
          }
        ],
        temperature: 0.3
      })
    });

    const data = await response.json();

    console.log('MiniMax API status:', response.status);
    console.log('MiniMax API response:', JSON.stringify(data));

    // 检查 API 错误
    if (!response.ok || !data.choices || data.choices.length === 0) {
      const errorMsg = data.base_resp?.status_msg || data.error?.message || 'API返回为空';
      return NextResponse.json({
        error: 'MiniMax API错误',
        details: `状态码: ${response.status}, 错误: ${errorMsg}`
      }, { status: 500 });
    }

    const responseText = data.choices[0].message.content.trim();
    console.log('AI response text:', responseText);

    // 解析标签
    let tags = parseTags(responseText);

    // 兜底：从原文提取
    if (tags.length === 0) {
      tags = extractKeywordsFromText(textContent);
    }

    return NextResponse.json({
      tags: tags.slice(0, 8),
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

// 解析标签
function parseTags(responseText: string): string[] {
  let tags: string[] = [];

  // 策略1: JSON 直接解析
  try {
    const parsed = JSON.parse(responseText);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((t: unknown) => typeof t === 'string' && t.length >= 2 && t.length <= 6);
      if (tags.length > 0) return tags;
    }
  } catch {
    // 继续下一个策略
  }

  // 策略2: 从各种括号中提取
  const patterns = [
    /\[[\s\S]*?\]/g,      // [...]
    /【[\s\S]*?】/g,       // 【...】
    /\([\s\S]*?\)/g       // (...)
  ];

  for (const pattern of patterns) {
    const matches = responseText.match(pattern);
    if (matches) {
      for (const match of matches) {
        try {
          const parsed = JSON.parse(match);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter((t: unknown) => typeof t === 'string' && t.length >= 2 && t.length <= 6);
            if (valid.length > 0) return valid;
          }
        } catch {}
      }
    }
  }

  // 策略3: 按分隔符拆分
  const cleanText = responseText.replace(/[\[\]【】""']/g, '');
  const parts = cleanText.split(/[,，、\n]+/);
  tags = parts
    .map((p: string) => p.trim())
    .filter((p: string) => p.length >= 2 && p.length <= 6);

  return tags;
}

// 从原文提取关键词（兜底方案）
function extractKeywordsFromText(text: string): string[] {
  const words = text.split(/[,，、。！？!?.：:\s]+/);
  return words.filter((w: string) => {
    const trimmed = w.trim();
    if (trimmed.length < 2 || trimmed.length > 6) return false;
    if (/^(.)\1+$/.test(trimmed)) return false;
    if (/^[，。！？!?.]+$/.test(trimmed)) return false;
    return true;
  }).slice(0, 5);
}
