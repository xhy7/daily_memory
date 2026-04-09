import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { content, type } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const typePrompts: Record<string, string> = {
      todo: '请用简洁、清晰的语气重新表达这条待办事项，使其更具有行动导向。保持原意，但让它更加具体和可执行。',
      feeling: '请用温暖、真诚的语气重新表达这种情绪感受。保持原意，但让情感更加细腻和真实。',
      reflection: '请用深刻、有洞察力的语气重新表达这条反思总结。保持原意，但加入更多的思考和启发。',
      sweet_interaction: '请用甜蜜、温馨的语气重新表达这段甜蜜互动。保持原意，但让情感更加动人。',
    };

    const promptType = type && typePrompts[type] ? typePrompts[type] : typePrompts.reflection;

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
            content: `${promptType}\n\n原始内容：${content}\n\n请直接给出润色后的内容，不要添加任何解释或前缀。`
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('MiniMax API error:', response.status, data);
      return NextResponse.json({ error: 'Failed to polish content', details: data }, { status: 500 });
    }

    const polished = data.choices?.[0]?.message?.content || content;

    return NextResponse.json({ polished });
  } catch (error) {
    console.error('Failed to polish with AI:', error);
    return NextResponse.json({ error: 'Failed to polish content', details: String(error) }, { status: 500 });
  }
}