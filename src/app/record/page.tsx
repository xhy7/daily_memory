'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface MemoryMemoryRecord {
  id: number;
  type: string;
  content: string;
  polished_content?: string;
  image_url?: string;
  author?: string;
  created_at: string;
}

export default function MemoryRecordPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [recordType, setMemoryRecordType] = useState<MemoryRecordType>('sweet_interaction');
  const [author, setAuthor] = useState<Author>('her');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [polishing, setPolishing] = useState(false);
  const [todayMemoryRecords, setTodayMemoryRecords] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedDeviceId = localStorage.getItem('deviceId');
    if (!storedDeviceId) {
      const newDeviceId = 'device_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('deviceId', newDeviceId);
      setDeviceId(newDeviceId);
    } else {
      setDeviceId(storedDeviceId);
    }

    // Set default author based on last selection
    const lastAuthor = localStorage.getItem('lastAuthor') as Author;
    if (lastAuthor) {
      setAuthor(lastAuthor);
    }
  }, []);

  useEffect(() => {
    if (deviceId) {
      fetchTodayMemoryRecords();
    }
  }, [deviceId]);

  const fetchTodayMemoryRecords = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/records?deviceId=${deviceId}&date=${today}`);
      const data = await res.json();
      setTodayMemoryRecords(data.records || []);
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageUrl(reader.result as string);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    // Save author preference
    localStorage.setItem('lastAuthor', author);

    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, type: recordType, content, imageUrl, author }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Error creating record:', errorData);
        alert('保存失败: ' + (errorData.error || '未知错误'));
        return;
      }

      const newMemoryRecord = await res.json();
      console.log('MemoryRecord created successfully:', newMemoryRecord);
      setContent('');
      setImageUrl('');
      setTodayMemoryRecords([newMemoryRecord, ...todayMemoryRecords]);
    } catch (error) {
      console.error('Failed to create record:', error);
      alert('保存失败，请稍后重试');
    }
  };

  const handlePolish = async (id: number, currentContent: string, type: MemoryRecordType) => {
    setPolishing(true);
    try {
      const res = await fetch('/api/ai-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentContent, type }),
      });
      const data = await res.json();

      await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, polishedContent: data.polished }),
      });

      setTodayMemoryRecords(todayMemoryRecords.map(r =>
        r.id === id ? { ...r, polished_content: data.polished } : r
      ));
    } catch (error) {
      console.error('Failed to polish:', error);
    } finally {
      setPolishing(false);
    }
  };

  const typeLabels: MemoryRecord<string, { label: string; emoji: string }> = {
    todo: { label: '待办', emoji: '📝' },
    feeling: { label: '感受', emoji: '💭' },
    reflection: { label: '反思', emoji: '🌟' },
    sweet_interaction: { label: '甜蜜互动', emoji: '💕' },
  };

  const getTypeInfo = (type: string) => {
    return typeLabels[type] || { label: '记录', emoji: '📝' };
  };

  const getTypeColor = (type: string) => {
    const colors: MemoryRecord<string, string> = {
      todo: 'from-blue-50 to-blue-100 border-blue-400',
      feeling: 'from-pink-50 to-pink-100 border-pink-400',
      reflection: 'from-yellow-50 to-yellow-100 border-yellow-400',
      sweet_interaction: 'from-rose-50 to-rose-200 border-rose-400',
    };
    return colors[type] || 'from-gray-50 to-gray-100 border-gray-400';
  };

  const authorLabels: MemoryRecord<string, string> = {
    him: '他',
    her: '她',
  };

  const authorColors: MemoryRecord<string, string> = {
    him: 'bg-blue-400',
    her: 'bg-rose-400',
  };

  const getAuthorLabel = (author: string) => {
    return authorLabels[author] || '她';
  };

  const getAuthorColor = (author: string) => {
    const colors: MemoryRecord<string, string> = {
      him: 'bg-blue-400',
      her: 'bg-rose-400',
    };
    return colors[author] || 'bg-rose-400';
  };

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          💖 记录今日
        </h1>
        <button onClick={() => router.push('/')} className="text-pink-400 hover:text-pink-500">
          返回 ❤️
        </button>
      </header>

      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        {/* Author selection */}
        <div className="flex gap-2">
          <span className="text-sm text-pink-400 self-center mr-2">记录人：</span>
          <button
            type="button"
            onClick={() => setAuthor('him')}
            className={`flex-1 py-2 px-4 rounded-full transition flex items-center justify-center gap-2 ${
              author === 'him'
                ? 'bg-blue-400 text-white'
                : 'bg-blue-50 text-blue-400'
            }`}
          >
            👦 {authorLabels.him}
          </button>
          <button
            type="button"
            onClick={() => setAuthor('her')}
            className={`flex-1 py-2 px-4 rounded-full transition flex items-center justify-center gap-2 ${
              author === 'her'
                ? 'bg-rose-400 text-white'
                : 'bg-rose-50 text-rose-400'
            }`}
          >
            👧 {authorLabels.her}
          </button>
        </div>

        {/* MemoryRecord type selection */}
        <div className="flex gap-2">
          {(Object.keys(typeLabels) as string[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setMemoryRecordType(type as MemoryRecordType)}
              className={`flex-1 py-2 px-2 rounded-lg transition text-sm ${
                recordType === type
                  ? 'bg-gradient-to-r from-pink-400 to-rose-400 text-white'
                  : 'bg-pink-50 text-pink-400'
              }`}
            >
              {getTypeInfo(type).emoji} {getTypeInfo(type).label}
            </button>
          ))}
        </div>

        {/* Image upload */}
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="py-2 px-4 bg-pink-100 text-pink-500 rounded-lg hover:bg-pink-200 transition flex items-center gap-2"
          >
            {uploading ? '上传中...' : '📷 添加图片'}
          </button>
          {imageUrl && (
            <div className="relative">
              <img src={imageUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 text-xs"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            recordType === 'sweet_interaction'
              ? '记录甜蜜互动：约会、礼物、小惊喜...'
              : '记录你的待办、感受或反思...'
          }
          className="w-full p-4 border border-pink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent bg-white"
          rows={4}
        />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!content.trim()}
            className="flex-1 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 shadow-md"
          >
            💕 保存
          </button>
          <button
            type="button"
            onClick={() => handlePolish(-1, content, recordType)}
            disabled={!content.trim() || polishing}
            className="flex-1 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white rounded-xl hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 shadow-md"
          >
            {polishing ? '✨ 润色中...' : '✨ AI润色'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-pink-500">今日甜蜜记录 💕</h2>
        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : todayMemoryRecords.length === 0 ? (
          <div className="text-center py-10 text-pink-300">
            <p className="text-4xl mb-2">💗</p>
            <p>今天还没有记录哦~</p>
          </div>
        ) : (
          todayMemoryRecords.map((record) => (
            <div
              key={record.id}
              className={`p-4 rounded-xl border-l-4 bg-gradient-to-r ${getTypeColor(record.type)} shadow-sm`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs text-white ${getAuthorColor(record.author || 'her')}`}>
                    {record.author ? getAuthorLabel(record.author) : '她'}
                  </span>
                  <span className="text-sm font-medium text-gray-600">
                    {getTypeInfo(record.type).emoji} {getTypeInfo(record.type).label}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(record.created_at).toLocaleTimeString()}
                </span>
              </div>

              {record.image_url && (
                <img
                  src={record.image_url}
                  alt="MemoryRecord image"
                  className="w-full max-h-64 object-cover rounded-lg mb-3"
                />
              )}

              <p className="mb-2 text-gray-700">{record.content}</p>

              {record.polished_content && (
                <div className="mt-2 p-2 bg-white/50 rounded-lg text-sm text-purple-700">
                  <strong>✨ 润色后：</strong>{record.polished_content}
                </div>
              )}

              <button
                onClick={() => handlePolish(record.id, record.content, record.type)}
                disabled={polishing}
                className="mt-2 text-sm text-purple-500 hover:text-purple-700 disabled:opacity-50"
              >
                ✨ AI润色
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
