import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// TTS 合成
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { text, voiceType } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // 根据 voiceType 选择声音
    let selectedVoice = '';
    let voiceName = '';

    if (voiceType === 'his' || voiceType === 'male' || voiceType === '男') {
      // 男声 - 随机选择一个
      const maleVoices = ['male-qn-jingying', 'male-qn-jingyingsh', 'male-yujie', 'male-badao', 'male-weiboss'];
      const randomIndex = Math.floor(Math.random() * maleVoices.length);
      selectedVoice = maleVoices[randomIndex];
      voiceName = '青年精英';
    } else {
      // 女声默认
      const femaleVoices = ['female-shaonv', 'female-shaonvsh', 'female-yujie', 'female-weiboss', 'female-jingying'];
      const randomIndex = Math.floor(Math.random() * femaleVoices.length);
      selectedVoice = femaleVoices[randomIndex];
      voiceName = '活泼少女';
    }

    console.log('Selected voice:', selectedVoice);

    const textContent = text.trim().slice(0, 1000);

    // 调用 TTS API
    const response = await fetch('https://api.minimax.chat/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'speech-2.8-hd',
        text: textContent,
        voice_id: selectedVoice,
        speed: 1.0,
        format: 'mp3'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS response error:', errorText);
      try {
        const error = JSON.parse(errorText);
        return NextResponse.json({ error: '语音合成失败', details: error }, { status: 500 });
      } catch {
        return NextResponse.json({ error: '语音合成失败', details: errorText }, { status: 500 });
      }
    }

    // 处理响应
    const contentType = response.headers.get('content-type') || '';
    let audioBase64: string;

    if (contentType.includes('application/json')) {
      const data = await response.json();
      audioBase64 = data.data?.audio;
    } else {
      const audioBuffer = await response.arrayBuffer();
      audioBase64 = Buffer.from(audioBuffer).toString('base64');
    }

    if (!audioBase64) {
      return NextResponse.json({ error: '音频生成失败' }, { status: 500 });
    }

    return NextResponse.json({
      audio: audioBase64,
      format: 'mp3',
      voiceId: selectedVoice,
      voiceName: voiceName
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: '语音合成失败', details: String(error) }, { status: 500 });
  }
}