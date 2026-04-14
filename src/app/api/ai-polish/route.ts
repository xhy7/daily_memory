import { NextRequest, NextResponse } from 'next/server';
import { chatWithAI } from '@/lib/ai';

/**
 * Escape special characters in user input to prevent prompt injection
 */
function escapeForPrompt(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, type } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Sanitize user input to prevent prompt injection
    const sanitizedContent = escapeForPrompt(content);

    const typePrompts: Record<string, string> = {
      todo: '请用简洁、清晰的语气重新表达这条待办事项，使其更具有行动导向。保持原意，但让它更加具体和可执行。',
      feeling: '请用温暖、真诚的语气重新表达这种情绪感受。保持原意，但让情感更加细腻和真实。',
      reflection: '请用深刻、有洞察力的语气重新表达这条反思总结。保持原意，但加入更多的思考和启发。',
      sweet_interaction: '请用甜蜜、温馨的语气重新表达这段甜蜜互动。保持原意，但让情感更加动人。',
    };

    const promptType = type && typePrompts[type] ? typePrompts[type] : typePrompts.reflection;

    const result = await chatWithAI([
      {
        role: 'user',
        content: `${promptType}\n\n原始内容：${sanitizedContent}\n\n请直接给出润色后的内容，不要添加任何解释或前缀。`,
      },
    ]);

    return NextResponse.json({ polished: result.content });
  } catch (error) {
    console.error('Failed to polish with AI:', error);
    return NextResponse.json({ error: 'Failed to polish content', details: String(error) }, { status: 500 });
  }
}