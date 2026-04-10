import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// 存储已克隆的声音ID
let clonedVoices: { his: string; her: string } = { his: '', her: '' };
let isInitialized = false;

// 初始化：从sounds文件夹读取音频文件并克隆
async function initializeVoices() {
  if (isInitialized) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('API Key not configured');
    return;
  }

  const soundsDir = path.join(process.cwd(), 'sounds');
  const voiceFiles: { type: 'his' | 'her'; filename: string }[] = [
    { type: 'his', filename: 'his_voice.m4a' },
    { type: 'her', filename: 'her_voice.m4a' }
  ];

  for (const voice of voiceFiles) {
    const filePath = path.join(soundsDir, voice.filename);

    try {
      await fs.access(filePath);

      // 读取音频文件
      const fileBuffer = await fs.readFile(filePath);
      const fileName = voice.filename;

      console.log(`Uploading ${voice.type} voice: ${fileName}`);

      // 1. 上传音频文件获取 file_id
      const uploadUrl = 'https://api.minimax.chat/v1/files/upload';
      const uploadFormData = new FormData();
      uploadFormData.append('purpose', 'voice_clone');
      uploadFormData.append('file', new Blob([fileBuffer]), fileName);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: uploadFormData
      });

      if (!uploadResponse.ok) {
        console.error(`Upload failed for ${voice.type}:`, await uploadResponse.json().catch(() => ({})));
        continue;
      }

      const uploadData = await uploadResponse.json();
      const fileId = uploadData.file?.file_id;

      if (!fileId) {
        console.error(`No file_id for ${voice.type}:`, uploadData);
        continue;
      }

      console.log(`File uploaded, file_id: ${fileId}`);

      // 2. 调用音色克隆接口
      const voiceId = voice.type === 'his' ? 'his_voice' : 'her_voice';
      const sampleText = voice.type === 'his'
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
        console.error(`Clone failed for ${voice.type}:`, await cloneResponse.json().catch(() => ({})));
        continue;
      }

      const cloneData = await cloneResponse.json();
      console.log(`Clone response for ${voice.type}:`, cloneData);

      // 保存克隆的 voice_id
      clonedVoices[voice.type] = voiceId;
      console.log(`${voice.type} voice cloned successfully: ${voiceId}`);

    } catch (error) {
      console.error(`Error processing ${voice.type} voice:`, error);
    }
  }

  isInitialized = true;
  console.log('Voice initialization complete:', clonedVoices);
}

// TTS 合成
export async function POST(request: NextRequest) {
  try {
    // 初始化声音（如果尚未初始化）
    await initializeVoices();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { text, voiceType } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // 根据voiceType选择声音，默认用her的声音
    const selectedVoice = (voiceType === 'his' && clonedVoices.his) ? clonedVoices.his : (clonedVoices.her || 'female-shaonv');

    if (!clonedVoices.his && !clonedVoices.her) {
      return NextResponse.json({ error: '尚未克隆声音，请确保sounds文件夹中有音频文件' }, { status: 400 });
    }

    const textContent = text.trim().slice(0, 1000);

    console.log('TTS request:', { text: textContent, voiceId: selectedVoice });

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
        voice_id: selectedVoice,
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
      voiceId: selectedVoice
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: '语音合成失败', details: String(error) }, { status: 500 });
  }
}

// 获取声音状态
export async function GET() {
  await initializeVoices();

  return NextResponse.json({
    cloned: {
      his: !!clonedVoices.his,
      her: !!clonedVoices.her
    },
    voiceIds: clonedVoices
  });
}