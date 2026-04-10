import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const runtime = 'nodejs';

// 获取 __dirname
const getDirname = () => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // 兼容处理
  return path.dirname(fileURLToPath(import.meta.url));
};

// 存储已克隆的声音ID
let clonedVoices: { his: string; her: string } = { his: '', her: '' };
let isInitialized = false;

// 尝试多个可能的 sounds 目录位置
async function findSoundsDir(): Promise<string | null> {
  const currentDir = getDirname();
  const possiblePaths = [
    '/var/task/sounds',
    '/var/task/sounds/',
    process.cwd() + '/sounds',
    path.join(currentDir, '../../../../sounds'),
    path.join(currentDir, '../../../../../sounds'),
    path.join(currentDir, '../../../sounds'),
    path.join(process.cwd(), 'sounds'),
  ];

  console.log('Trying to find sounds directory...');
  console.log('Current dir (getDirname):', currentDir);
  console.log('process.cwd():', process.cwd());

  for (const dir of possiblePaths) {
    console.log(`Checking: ${dir}`);
    try {
      await fs.access(dir);
      console.log(`Found sounds directory at: ${dir}`);
      return dir;
    } catch {
      // Not found
    }
  }

  // 尝试列出 /var/task 目录内容
  console.log('Listing /var/task contents:');
  try {
    const taskFiles = await fs.readdir('/var/task');
    console.log('/var/task files:', taskFiles);
  } catch (e) {
    console.log('Cannot read /var/task:', e);
  }

  return null;
}

// 初始化：从sounds文件夹读取音频文件并克隆
async function initializeVoices() {
  if (isInitialized) {
    console.log('Voices already initialized, skipping...');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('API Key not configured');
    return;
  }

  // 尝试找到 sounds 目录
  const soundsDir = await findSoundsDir();
  if (!soundsDir) {
    console.error('Could not find sounds directory in any location');
    return;
  }

  console.log('Using sounds directory:', soundsDir);

  const voiceFiles: { type: 'his' | 'her'; filename: string }[] = [
    { type: 'his', filename: 'his_voice.m4a' },
    { type: 'her', filename: 'her_voice.m4a' }
  ];

  for (const voice of voiceFiles) {
    const filePath = path.join(soundsDir, voice.filename);
    console.log(`Checking file: ${filePath}`);

    try {
      await fs.access(filePath);
      console.log(`File exists: ${voice.filename}`);

      // 读取音频文件
      const fileBuffer = await fs.readFile(filePath);
      const fileName = voice.filename;
      console.log(`File size: ${fileBuffer.length} bytes`);

      console.log(`[${voice.type}] Uploading ${fileName}...`);

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

      console.log(`[${voice.type}] Upload response status:`, uploadResponse.status);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`[${voice.type}] Upload failed:`, errorText);
        try {
          const errorObj = JSON.parse(errorText);
          console.error(`[${voice.type}] Upload error details:`, JSON.stringify(errorObj));
        } catch {}
        continue;
      }

      // 解析上传响应
      let uploadData;
      const uploadContentType = uploadResponse.headers.get('content-type');
      if (uploadContentType?.includes('application/json')) {
        uploadData = await uploadResponse.json();
      } else {
        const text = await uploadResponse.text();
        console.error(`[${voice.type}] Upload response not JSON:`, text);
        uploadData = { error: text };
      }

      console.log(`[${voice.type}] Upload response:`, JSON.stringify(uploadData));
      const fileId = uploadData.file?.file_id;

      if (!fileId) {
        console.error(`[${voice.type}] No file_id in response:`, uploadData);
        continue;
      }

      console.log(`[${voice.type}] File uploaded, file_id: ${fileId}`);

      // 2. 调用音色克隆接口
      const voiceId = voice.type === 'his' ? 'his_voice' : 'her_voice';
      const sampleText = voice.type === 'his'
        ? '今天是我们在一起的第100天，我想对她说，我爱你。'
        : '亲爱的，我会一直陪在你身边，守护你，爱你。';

      console.log(`[${voice.type}] Calling clone API with voice_id: ${voiceId}...`);

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

      console.log(`[${voice.type}] Clone response status:`, cloneResponse.status);

      // 解析响应
      let cloneData;
      const contentType = cloneResponse.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        cloneData = await cloneResponse.json();
      } else {
        // 不是 JSON，可能是错误信息
        const errorText = await cloneResponse.text();
        console.error(`[${voice.type}] Clone response is not JSON:`, errorText);
        cloneData = { error: errorText };
      }

      console.log(`[${voice.type}] Clone response:`, JSON.stringify(cloneData));

      // 检查各种可能的错误
      const errorCode = cloneData.base_resp?.status_code || cloneData.error?.code || cloneData.code;
      if (errorCode === 1008 || errorCode === 'insufficient_balance') {
        console.error(`[${voice.type}] Insufficient balance! Voice clone failed.`);
        continue;
      }

      // 检查是否有错误
      if (!cloneResponse.ok || cloneData.error) {
        console.error(`[${voice.type}] Clone failed with error:`, cloneData);
        continue;
      }

      // 保存克隆的 voice_id
      clonedVoices[voice.type] = voiceId;
      console.log(`[${voice.type}] Voice cloned successfully: ${voiceId}`);

    } catch (error) {
      console.error(`[${voice.type}] Error:`, error);
    }
  }

  isInitialized = true;
  console.log('Voice initialization complete. Cloned voices:', clonedVoices);
}

// TTS 合成
export async function POST(request: NextRequest) {
  try {
    // 初始化声音（如果尚未初始化）
    console.log('Initializing voices...');
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

    console.log('Current cloned voices:', clonedVoices);
    console.log('Requested voiceType:', voiceType);

    // 根据voiceType选择声音
    // 如果对应的克隆声音存在且有余额，使用克隆声音
    // 否则使用默认音色
    let selectedVoice = '';

    if (voiceType === 'his' && clonedVoices.his) {
      selectedVoice = clonedVoices.his;
      console.log('Using his cloned voice');
    } else if (voiceType === 'her' && clonedVoices.her) {
      selectedVoice = clonedVoices.her;
      console.log('Using her cloned voice');
    } else if (clonedVoices.her) {
      selectedVoice = clonedVoices.her;
      console.log('Falling back to her cloned voice');
    } else if (clonedVoices.his) {
      selectedVoice = clonedVoices.his;
      console.log('Falling back to his cloned voice');
    } else {
      // 使用默认音色
      selectedVoice = voiceType === 'his' ? 'male-qn-jingying' : 'female-shaonv';
      console.log('Using default voice:', selectedVoice);
    }

    console.log('Selected voice:', selectedVoice);

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

    console.log('TTS response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS response error:', errorText);
      try {
        const error = JSON.parse(errorText);
        return NextResponse.json({ error: 'TTS失败', details: error }, { status: 500 });
      } catch {
        return NextResponse.json({ error: 'TTS失败', details: errorText }, { status: 500 });
      }
    }

    // 处理响应
    const contentType = response.headers.get('content-type') || '';
    console.log('TTS response content-type:', contentType);

    let audioBase64: string;

    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('TTS JSON response:', JSON.stringify(data));
      audioBase64 = data.data?.audio;
    } else {
      const audioBuffer = await response.arrayBuffer();
      console.log('TTS audio buffer size:', audioBuffer.byteLength);
      audioBase64 = Buffer.from(audioBuffer).toString('base64');
    }

    if (!audioBase64) {
      return NextResponse.json({ error: '音频生成失败' }, { status: 500 });
    }

    console.log('Audio generated successfully, length:', audioBase64.length);

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