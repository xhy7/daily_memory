'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface CloneStatus {
  his: boolean;
  her: boolean;
  voiceIds: {
    his: string;
    her: string;
  };
}

export default function VoiceClonePage() {
  const router = useRouter();
  const [status, setStatus] = useState<CloneStatus>({ his: false, her: false, voiceIds: { his: '', her: '' } });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<'his' | 'her' | null>(null);
  const [testingVoice, setTestingVoice] = useState<'his' | 'her' | null>(null);
  const [testAudio, setTestAudio] = useState<HTMLAudioElement | null>(null);
  const [message, setMessage] = useState('');
  const [deviceId, setDeviceId] = useState('couple_memory_001');

  useEffect(() => {
    // 获取设备ID
    let storedDeviceId = localStorage.getItem('coupleDeviceId');
    if (!storedDeviceId) {
      storedDeviceId = 'couple_memory_001';
      localStorage.setItem('coupleDeviceId', storedDeviceId);
    }
    setDeviceId(storedDeviceId);
    fetchStatus(storedDeviceId);
  }, []);

  const fetchStatus = async (id: string) => {
    try {
      const res = await fetch(`/api/voice-clone?deviceId=${id}`);
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, voiceType: 'his' | 'her') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小 (最大20MB)
    if (file.size > 20 * 1024 * 1024) {
      setMessage('文件大小不能超过20MB');
      return;
    }

    // 检查文件格式
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/wav', 'audio/x-wav'];
    if (!validTypes.includes(file.type)) {
      setMessage('请上传 mp3、m4a 或 wav 格式的音频文件');
      return;
    }

    setUploading(voiceType);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('voiceType', voiceType);
      formData.append('deviceId', deviceId);

      const res = await fetch('/api/voice-clone', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        setMessage(data.message);
        fetchStatus(deviceId);
      } else {
        setMessage(data.error + (data.details ? `: ${data.details}` : ''));
      }
    } catch (error) {
      setMessage('上传失败: ' + String(error));
    } finally {
      setUploading(null);
      if (e.target) e.target.value = '';
    }
  };

  const testVoice = async (voiceType: 'his' | 'her') => {
    // 停止当前播放
    if (testAudio) {
      testAudio.pause();
      setTestAudio(null);
    }

    if (testingVoice === voiceType) {
      setTestingVoice(null);
      return;
    }

    setTestingVoice(voiceType);

    const sampleText = voiceType === 'his'
      ? '亲爱的，这是我第一次用我的声音对你说话，我会一直爱你。'
      : '亲爱的，我好爱你呀，我会一直陪在你身边的。';

    try {
      const res = await fetch('/api/voice-clone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sampleText, voiceType, deviceId })
      });

      const data = await res.json();

      if (data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        setTestAudio(audio);
        audio.onended = () => setTestingVoice(null);
        audio.onerror = () => setTestingVoice(null);
        await audio.play();
      } else {
        setMessage('播放失败: ' + (data.error || '未知错误'));
        setTestingVoice(null);
      }
    } catch (error) {
      setMessage('播放失败: ' + String(error));
      setTestingVoice(null);
    }
  };

  const voiceLabels = {
    his: { title: '他的声音', emoji: '👦', desc: '上传他的语音样本（10秒-5分钟）' },
    her: { title: '她的声音', emoji: '👧', desc: '上传她的语音样本（10秒-5分钟）' }
  };

  return (
    <div className="min-h-screen p-4 max-w-xl mx-auto">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          🎙️ 声音克隆
        </h1>
        <button onClick={() => router.push('/')} className="text-pink-400 hover:text-pink-500">
          返回 ❤️
        </button>
      </header>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="space-y-6">
        {(['his', 'her'] as const).map((voiceType) => (
          <div key={voiceType} className="bg-white rounded-2xl shadow-lg p-6 border border-pink-100">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{voiceLabels[voiceType].emoji}</span>
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{voiceLabels[voiceType].title}</h2>
                <p className="text-sm text-gray-500">{voiceLabels[voiceType].desc}</p>
              </div>
            </div>

            {status[voiceType] ? (
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                  ✅ 已克隆
                </span>
                <button
                  onClick={() => testVoice(voiceType)}
                  disabled={testingVoice && testingVoice !== voiceType}
                  className="px-4 py-2 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-full text-sm hover:from-pink-500 hover:to-rose-500 disabled:opacity-50"
                >
                  {testingVoice === voiceType ? '🔊 播放中...' : '🎧 试听'}
                </button>
              </div>
            ) : (
              <div>
                <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl cursor-pointer transition ${
                  uploading === voiceType
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-pink-50 text-pink-500 hover:bg-pink-100'
                }`}>
                  {uploading === voiceType ? (
                    <>⏳ 上传中...</>
                  ) : (
                    <>
                      <span>📎</span>
                      <span>上传音频文件</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="audio/mp3,audio/mpeg,audio/m4a,audio/wav"
                    onChange={(e) => handleUpload(e, voiceType)}
                    disabled={uploading !== null}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  支持 mp3、m4a、wav 格式，时长10秒-5分钟
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100">
        <h3 className="font-semibold text-purple-600 mb-2">💡 使用说明</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• 上传你或对象的语音片段（至少10秒，不超过5分钟）</li>
          <li>• 音频越清晰、时间越长，克隆效果越好</li>
          <li>• 克隆成功后可以使用专属声音朗读记录</li>
          <li>• 在记录页和历史页的朗读按钮会自动使用对应的声音</li>
        </ul>
      </div>
    </div>
  );
}