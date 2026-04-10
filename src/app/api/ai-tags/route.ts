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

    // 更明确的提示词
    const prompt = `请为以下记录提取3-8个关键词标签。

记录内容：${textContent}

提取要求：
1. 标签类型可以是：任务、地点、人物、情感、活动、主题、物品等
2. 每个标签2-6个中文字符
3. 必须返回JSON数组格式，如：["任务", "网站", "AI"]
4. 只返回JSON数组，不要有任何其他文字`;

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
    console.log('Full API response:', JSON.stringify(data));

    let tags: string[] = [];

    // 检查 API 返回的数据结构
    if (!data.choices || data.choices.length === 0) {
      console.error('No choices in API response:', data);
      return NextResponse.json({
        error: 'API返回为空',
        details: {
          rawResponse: JSON.stringify(data),
          message: 'MiniMax API 没有返回有效响应'
        }
      }, { status: 500 });
    }

    // Strategy 1: Direct JSON parse
    try {
      const parsed = JSON.parse(responseText);
      if (Array.isArray(parsed)) {
        tags = parsed.filter((t: unknown) => typeof t === 'string' && (t as string).length >= 2 && (t as string).length <= 6);
      }
    } catch {
      // Continue
    }

    // Strategy 2: Extract from brackets
    if (tags.length === 0) {
      const match = responseText.match(/\[[\s\S]*?\]/);
      if (match) {
        try {
          const extracted = JSON.parse(match[0]);
          if (Array.isArray(extracted)) {
            tags = extracted.filter((t: unknown) => typeof t === 'string' && (t as string).length >= 2 && (t as string).length <= 6);
          }
        } catch {
          // Continue
        }
      }
    }

    // Strategy 3: Split by separators
    if (tags.length === 0) {
      const cleanText = responseText.replace(/[\[\]【】""']/g, '');
      const parts = cleanText.split(/[,，、\n]+/);
      tags = parts
        .map((p: string) => p.trim())
        .filter((p: string) => p.length >= 2 && p.length <= 6);
    }

    // Strategy 4: Extract quoted strings
    if (tags.length === 0) {
      const quoted = responseText.match(/"([^"]+)"/g);
      if (quoted) {
        tags = quoted.map((q: string) => q.replace(/"/g, '').trim())
          .filter((t: string) => t.length >= 2 && t.length <= 6);
      }
    }

    // Strategy 5: Better fallback - extract meaningful keywords
    if (tags.length === 0 && textContent.length > 0) {
      // 提取名词/动词性词汇作为标签
      const words = textContent.split(/[,，、。！？!?.：:\s]+/);
      const meaningfulWords = words.filter((w: string) => {
        const trimmed = w.trim();
        // 过滤掉太短或太长的词
        if (trimmed.length < 2 || trimmed.length > 6) return false;
        // 过滤掉重复的字符（如"加油加油"）
        if (/^(.)\1+$/.test(trimmed)) return false;
        // 过滤掉纯标点
        if (/^[，。！？!?.]+$/.test(trimmed)) return false;
        return true;
      });
      tags = meaningfulWords.slice(0, 5);
    }

    tags = Array.from(new Set(tags)).filter((t: string) => t.length > 0).slice(0, 8);

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
