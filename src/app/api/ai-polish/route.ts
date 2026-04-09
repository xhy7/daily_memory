import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const typePrompts = {
  todo: '这是一条待办事项，请用简洁、清晰的语气重新表达，使其更具有行动导向。保持原意，但让它更加具体和可执行。',
  feeling: '这是一种情绪感受，请用温暖、真诚的语气重新表达。保持原意，但让情感更加细腻和真实。',
  reflection: '这是一条反思总结，请用深刻、有洞察力的语气重新表达。保持原意，但加入更多的思考和启发。',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, type } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const promptType = type && typePrompts[type as keyof typeof typePrompts]
      ? typePrompts[type as keyof typeof typePrompts]
      : typePrompts.reflection;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `${promptType}\n\n原始内容：${content}\n\n请直接给出润色后的内容，不要添加任何解释或前缀。`,
        },
      ],
    });

    const polished = message.content[0].type === 'text'
      ? message.content[0].text
      : content;

    return NextResponse.json({ polished });
  } catch (error) {
    console.error('Failed to polish with AI:', error);
    return NextResponse.json({ error: 'Failed to polish content' }, { status: 500 });
  }
}
