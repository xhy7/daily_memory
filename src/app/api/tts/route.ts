import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { text, voiceId, model } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // 限制文本长度
    const textContent = text.trim().slice(0, 1000);

    // 使用默认音色或自定义音色
    // 可用的音色ID: male-qn-qingse, female-shaonv, male-qn-jingying, female-yujie, male-qn-badao, female-tianxiang
    const selectedVoiceId = voiceId || 'female-shaonv';
    const selectedModel = model || 'speech-2.8';

    console.log('TTS request:', { text: textContent, voiceId: selectedVoiceId, model: selectedModel });

    // 调用 MiniMax TTS API (同步接口)
    const response = await fetch('https://api.minimax.chat/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        text: textContent,
        voice_id: selectedVoiceId,
        speed: 1.0,
        vol: 1.0,
        pitch: 0,
        audio_sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3'
      })
    });

    console.log('TTS API status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.base_resp?.status_msg || errorData.error?.message || 'TTS API failed';
      console.error('TTS API error:', errorMsg);
      return NextResponse.json({
        error: 'TTS API错误',
        details: `状态码: ${response.status}, 错误: ${errorMsg}`
      }, { status: 500 });
    }

    // 检查返回类型
    const contentType = response.headers.get('content-type') || '';
    console.log('TTS response content-type:', contentType);

    if (contentType.includes('application/json')) {
      // 如果返回JSON格式，包含base64音频
      const data = await response.json();
      console.log('TTS JSON response:', data);

      if (data.data?.audio) {
        return NextResponse.json({
          audio: data.data.audio,
          format: 'mp3',
          voiceId: selectedVoiceId,
          textLength: textContent.length
        });
      }

      return NextResponse.json({
        error: 'TTS API返回格式异常',
        details: JSON.stringify(data)
      }, { status: 500 });
    }

    // TTS API 返回的是二进制音频数据
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // 返回音频数据
    return NextResponse.json({
      audio: audioBase64,
      format: 'mp3',
      voiceId: selectedVoiceId,
      textLength: textContent.length
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: '语音合成失败', details: String(error) }, { status: 500 });
  }
}

// 获取可用的音色列表
export async function GET() {
  const voices = [
    { id: 'female-shaonj', name: '少女', description: '甜美可爱的女声' },
    { id: 'female-shaonv', name: '少女v2', description: '甜美可爱的女声v2' },
    { id: 'female-yujie', name: '御姐', description: '成熟稳重的女声' },
    { id: 'female-tianxiang', name: '天问', description: '温柔的女声' },
    { id: 'male-qn-qingse', name: '青涩', description: '年轻青涩的男声' },
    { id: 'male-qn-jingying', name: '精英', description: '成熟稳重的男声' },
    { id: 'male-qn-badao', name: '霸道', description: '低沉磁性的男声' },
  ];

  return NextResponse.json({ voices });
}