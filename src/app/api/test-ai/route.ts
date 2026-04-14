import { NextRequest, NextResponse } from 'next/server';
import { chatWithAI } from '@/lib/ai';

export async function GET() {
  try {
    const result = await chatWithAI([
      { role: 'user', content: '请回复"测试成功"四个字' },
    ]);

    return NextResponse.json({
      success: true,
      message: 'AI 连接成功',
      response: result.content,
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json({
      success: false,
      error: 'AI 连接失败',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
