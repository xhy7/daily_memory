import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'API Key 未配置'
      }, { status: 500 });
    }

    console.log('Testing MiniMax API...');

    // MiniMax API format
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
            content: '请回复"测试成功"四个字'
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('MiniMax API error:', response.status, data);
      return NextResponse.json({
        success: false,
        error: 'API 请求失败',
        status: response.status,
        details: data
      }, { status: 500 });
    }

    const responseText = data.choices?.[0]?.message?.content || 'No response';

    return NextResponse.json({
      success: true,
      message: 'AI 连接成功',
      response: responseText,
      raw: data
    });
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({
      success: false,
      error: 'AI 连接失败',
      details: error.message
    }, { status: 500 });
  }
}