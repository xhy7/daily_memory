'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

type TypeMap = { [key: string]: { label: string; emoji: string } };
type ColorMap = { [key: string]: string };
type AuthorMap = { [key: string]: string };

interface MemoryItem {
  id: number;
  type: string;
  content: string;
  polished_content?: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: string;
  created_at: string;
}

interface DayItem {
  date: string;
  records: MemoryItem[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayRecords, setDayRecords] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [allRecords, setAllRecords] = useState<DayItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [playingTTSId, setPlayingTTSId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // TTS 朗读功能 - 使用克隆的声音
  const playRecordTTS = async (recordId: number, text: string, author?: string) => {
    if (playingTTSId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingTTSId(null);
      return;
    }

    setPlayingTTSId(recordId);
    try {
      // 根据作者选择声音类型，默认用她的声音
      const voiceType = (author === 'him') ? 'his' : 'her';

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceType })
      });
      const data = await res.json();

      if (data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        audioRef.current = audio;
        audio.onended = () => setPlayingTTSId(null);
        audio.onerror = () => setPlayingTTSId(null);
        await audio.play();
      } else {
        // 声音未克隆，提示用户
        alert(data.error || '请先在声音克隆页面配置声音');
        setPlayingTTSId(null);
      }
    } catch (error) {
      console.error('TTS error:', error);
      setPlayingTTSId(null);
    }
  };

  useEffect(() => {
    let storedDeviceId = localStorage.getItem('coupleDeviceId');
    if (!storedDeviceId) {
      storedDeviceId = 'couple_memory_001';
      localStorage.setItem('coupleDeviceId', storedDeviceId);
    }
    setDeviceId(storedDeviceId);
  }, []);

  useEffect(() => {
    if (deviceId) {
      fetchAllRecords();
    }
  }, [deviceId]);

  useEffect(() => {
    if (deviceId && allRecords.length > 0 && !selectedDate) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
      fetchDayRecords(today);
    }
  }, [deviceId, allRecords]);

  const fetchAllRecords = async () => {
    try {
      // 优化：只请求需要的字段，不获取图片
      const res = await fetch(`/api/records?deviceId=${deviceId}&fields=id,type,content,polished_content,tags,author,created_at`);
      const data = await res.json();

      const grouped: { [key: string]: MemoryItem[] } = {};
      (data.records || []).forEach((record: MemoryItem) => {
        const date = record.created_at.split('T')[0];
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(record);
      });

      const groupedArray: DayItem[] = Object.entries(grouped).map(([date, records]) => ({
        date,
        records,
      })).sort((a, b) => b.date.localeCompare(a.date));

      setAllRecords(groupedArray);
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDayRecords = async (date: string) => {
    try {
      // 优化：只请求需要的字段
      const res = await fetch(`/api/records?deviceId=${deviceId}&date=${date}&fields=id,type,content,polished_content,image_urls,tags,author,created_at`);
      const data = await res.json();
      setDayRecords(data.records || []);
      setSelectedDate(date);
    } catch (error) {
      console.error('Failed to fetch day records:', error);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (number | null)[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(i);
    }

    return days;
  };

  const formatDate = (day: number) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  };

  const hasRecords = (day: number) => {
    const dateStr = formatDate(day);
    return allRecords.some(dr => dr.date === dateStr);
  };

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const days = getDaysInMonth(currentDate);

  const typeLabels: TypeMap = {
    todo: { label: '待办', emoji: '📝' },
    feeling: { label: '感受', emoji: '💭' },
    reflection: { label: '反思', emoji: '🌟' },
    sweet_interaction: { label: '甜蜜互动', emoji: '💕' },
  };

  const getTypeInfo = (type: string) => {
    return typeLabels[type] || { label: '记录', emoji: '📝' };
  };

  const getTypeColor = (type: string) => {
    const colors: ColorMap = {
      todo: 'from-blue-50 to-blue-100 border-blue-400',
      feeling: 'from-pink-50 to-pink-100 border-pink-400',
      reflection: 'from-yellow-50 to-yellow-100 border-yellow-400',
      sweet_interaction: 'from-rose-50 to-rose-200 border-rose-400',
    };
    return colors[type] || 'from-gray-50 to-gray-100 border-gray-400';
  };

  const authorLabels: AuthorMap = {
    him: '👦 他',
    her: '👧 她',
  };

  const authorColors: AuthorMap = {
    him: 'bg-blue-400',
    her: 'bg-rose-400',
  };

  const getAuthorColor = (author: string) => {
    return authorColors[author] || 'bg-rose-400';
  };

  const getAuthorLabel = (author: string) => {
    return authorLabels[author] || '👧 她';
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  // Get all images from a record for lightbox
  const getRecordImages = (record: MemoryItem) => {
    if (record.image_urls && record.image_urls.length > 0) {
      return record.image_urls;
    }
    if (record.image_url) {
      return [record.image_url];
    }
    return [];
  };

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto pb-10">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          💕 甜蜜回忆
        </h1>
        <button onClick={() => router.push('/')} className="text-pink-400 hover:text-pink-500">
          返回 ❤️
        </button>
      </header>

      <div className="bg-white rounded-2xl shadow-lg p-4 mb-6 border border-pink-100">
        <div className="flex justify-between items-center mb-4">
          <button onClick={prevMonth} className="p-2 hover:bg-pink-50 rounded-full text-pink-400 transition">
            ◀
          </button>
          <span className="text-lg font-semibold text-pink-500">
            {currentDate.getFullYear()}年 {monthNames[currentDate.getMonth()]}
          </span>
          <button onClick={nextMonth} className="p-2 hover:bg-pink-50 rounded-full text-pink-400 transition">
            ▶
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(day => (
            <div key={day} className="text-center text-sm text-pink-300 py-2 font-medium">
              {day}
            </div>
          ))}
          {days.map((day, index) => (
            <button
              key={index}
              onClick={() => day && fetchDayRecords(formatDate(day))}
              disabled={!day}
              className={`p-2 text-center rounded-xl transition relative ${
                day && hasRecords(day)
                  ? 'bg-gradient-to-br from-pink-100 to-rose-100 hover:from-pink-200 hover:to-rose-200'
                  : 'hover:bg-gray-50'
              } ${day && selectedDate === formatDate(day) ? 'ring-2 ring-pink-400' : ''}`}
            >
              <span className={day && hasRecords(day) ? 'text-pink-500 font-medium' : 'text-gray-600'}>
                {day || ''}
              </span>
              {day && hasRecords(day) && (
                <span className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 text-xs">
                  💕
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedDate && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-pink-500 flex items-center gap-2">
            📅 {selectedDate} 的甜蜜回忆
          </h2>
          {loading ? (
            <p className="text-gray-500">加载中...</p>
          ) : dayRecords.length === 0 ? (
            <div className="text-center py-10 text-pink-300">
              <p className="text-4xl mb-2">💗</p>
              <p>这天还没有记录哦~</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayRecords.map((record) => (
                <div
                  key={record.id}
                  className={`p-4 rounded-xl border-l-4 bg-gradient-to-r ${getTypeColor(record.type)} shadow-sm`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs text-white ${getAuthorColor(record.author || 'her')}`}>
                        {record.author ? getAuthorLabel(record.author) : '👧 她'}
                      </span>
                      <span className="text-sm font-medium text-gray-600">
                        {getTypeInfo(record.type).emoji} {getTypeInfo(record.type).label}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(record.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Images with click to view */}
                  {getRecordImages(record).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {getRecordImages(record).map((url, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedImage(url)}
                          className="relative group"
                        >
                          <img
                            src={url}
                            alt={`记录图片${idx + 1}`}
                            className="w-full max-h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-lg flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">🔍</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="mb-2 text-gray-700">{record.content}</p>

                  {/* TTS Button */}
                  <button
                    onClick={() => playRecordTTS(record.id, record.content, record.author)}
                    disabled={playingTTSId !== null}
                    className="mt-2 mr-2 text-sm text-pink-500 hover:text-pink-700 disabled:opacity-50"
                  >
                    {playingTTSId === record.id ? '🔊 播放中...' : '🔊 播放'}
                  </button>

                  {record.polished_content && (
                    <div className="mt-2 p-2 bg-white/50 rounded-lg text-sm text-purple-700">
                      <strong>✨ 润色后：</strong>{record.polished_content}
                    </div>
                  )}

                  {record.tags && record.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {record.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-600 rounded-full text-xs"
                        >
                          🏷️ {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!selectedDate && !loading && (
        <div className="text-center py-8">
          <p className="text-pink-300 text-lg mb-2">💕</p>
          <p className="text-pink-300">点击日历上的日期查看甜蜜回忆</p>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl hover:text-pink-400 transition"
            onClick={() => setSelectedImage(null)}
          >
            ✕
          </button>
          <img
            src={selectedImage}
            alt="查看大图"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
