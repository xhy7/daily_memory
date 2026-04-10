import { NextRequest, NextResponse } from 'next/server';
import { getClonedVoices, getClonedVoice, saveClonedVoice } from '@/lib/db';

// 初始化：确保数据库表存在
async function ensureDbInitialized() {
  const { initializeDatabase } = await import('@/lib/db');
  await initializeDatabase();
}

// 获取克隆状态
export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId') || 'couple_memory_001';

    const voices = await getClonedVoices(deviceId);

    const voiceMap: { [key: string]: string } = {};
    voices.forEach(v => {
      voiceMap[v.voice_type] = v.voice_id;
    });

    return NextResponse.json({
      cloned: {
        his: !!voiceMap.his,
        her: !!voiceMap.her,
      },
      voiceIds: voiceMap
    });
  } catch (error) {
    console.error('Failed to get cloned voices:', error);
    return NextResponse.json({ error: '获取声音状态失败', details: String(error) }, { status: 500 });
  }
}

// 上传音频文件并克隆声音
export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const voiceType = formData.get('voiceType') as string;
    const deviceId = formData.get('deviceId') as string || 'couple_memory_001';

    if (!audioFile || !voiceType) {
      return NextResponse.json({ error: 'Audio file and voice type are required' }, { status: 400 });
    }

    if (!['his', 'her'].includes(voiceType)) {
      return NextResponse.json({ error: 'Invalid voice type' }, { status: 400 });
    }

    console.log(`Uploading ${voiceType} voice:`, audioFile.name, audioFile.size);

    // 1. 上传音频文件获取 file_id
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadUrl = 'https://api.minimax.chat/v1/files/upload';
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'voice_clone');
    uploadFormData.append('file', new Blob([buffer]), audioFile.name);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: uploadFormData
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({}));
      console.error('Upload failed:', error);
      return NextResponse.json({ error: '上传音频失败', details: error }, { status: 500 });
    }

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.file?.file_id;

    if (!fileId) {
      return NextResponse.json({ error: '获取文件ID失败', details: uploadData }, { status: 500 });
    }

    console.log('File uploaded, file_id:', fileId);

    // 2. 调用音色克隆接口
    const voiceId = voiceType === 'his' ? 'his_voice' : 'her_voice';
    const sampleText = voiceType === 'his'
      ? '今天是我们在一起的第100天，我想对她说，我爱你。'
      : '亲爱的，我会一直陪在你身边，守护你，爱你。';

    const cloneUrl = 'https://api.minimax.chat/v1/voice_clone';
    const cloneResponse = await fetch(cloneUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_id: fileId,
        voice_id: voiceId,
        text: sampleText,
        model: 'speech-2.8'
      })
    });

    if (!cloneResponse.ok) {
      const error = await cloneResponse.json().catch(() => ({}));
      console.error('Clone failed:', error);
      return NextResponse.json({ error: '声音克隆失败', details: error }, { status: 500 });
    }

    const cloneData = await cloneResponse.json();
    console.log('Clone response:', cloneData);

    // 3. 保存到数据库
    await saveClonedVoice(deviceId, voiceType, voiceId);

    return NextResponse.json({
      success: true,
      voiceType,
      voiceId,
      message: `${voiceType === 'his' ? '他的' : '她的'}声音已克隆成功！`
    });
  } catch (error) {
    console.error('Voice clone error:', error);
    return NextResponse.json({ error: '声音克隆失败', details: String(error) }, { status: 500 });
  }
}

// 使用克隆的声音进行TTS
export async function PUT(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { text, voiceType, deviceId } = body;

    if (!text || !voiceType) {
      return NextResponse.json({ error: 'Text and voice type are required' }, { status: 400 });
    }

    const targetDeviceId = deviceId || 'couple_memory_001';

    // 从数据库获取克隆的声音
    const clonedVoice = await getClonedVoice(targetDeviceId, voiceType);
    if (!clonedVoice) {
      return NextResponse.json({ error: `${voiceType === 'his' ? '他的' : '她的'}声音尚未克隆，请先上传音频` }, { status: 400 });
    }

    const voiceId = clonedVoice.voice_id;
    const textContent = text.trim().slice(0, 1000);

    // 调用 TTS API
    const response = await fetch('https://api.minimax.chat/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'speech-2.8',
        text: textContent,
        voice_id: voiceId,
        speed: 1.0,
        format: 'mp3'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json({ error: 'TTS失败', details: error }, { status: 500 });
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
      voiceId,
      voiceType
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: '语音合成失败', details: String(error) }, { status: 500 });
  }
}