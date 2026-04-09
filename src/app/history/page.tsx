'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MemoryRecord {
  id: number;
  type: string;
  content: string;
  polished_content?: string;
  image_url?: string;
  author?: string;
  created_at: string;
}

interface DayRecord {
  date: string;
  records: MemoryRecord[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayRecords, setDayRecords] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [allRecords, setAllRecords] = useState<DayRecord[]>([]);

  useEffect(() => {
    const storedDeviceId = localStorage.getItem('deviceId');
    if (!storedDeviceId) {
      const newDeviceId = 'device_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('deviceId', newDeviceId);
      setDeviceId(newDeviceId);
    } else {
      setDeviceId(storedDeviceId);
    }
  }, []);

  useEffect(() => {
    if (deviceId) {
      fetchAllRecords();
    }
  }, [deviceId]);

  // Load today's records by default
  useEffect(() => {
    if (deviceId && allRecords.length > 0 && !selectedDate) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
      fetchDayRecords(today);
    }
  }, [deviceId, allRecords]);

  const fetchAllRecords = async () => {
    try {
      const res = await fetch(`/api/records?deviceId=${deviceId}`);
      const data = await res.json();

      const grouped: Record<string, MemoryRecord[]> = {};
      (data.records || []).forEach((record: MemoryRecord) => {
        const date = record.created_at.split('T')[0];
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(record);
      });

      const groupedArray: DayRecord[] = Object.entries(grouped).map(([date, records]) => ({
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
      const res = await fetch(`/api/records?deviceId=${deviceId}&date=${date}`);
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

  const getRecordCount = (day: number) => {
    const dateStr = formatDate(day);
    const dayRecord = allRecords.find(dr => dr.date === dateStr);
    return dayRecord ? dayRecord.records.length : 0;
  };

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const days = getDaysInMonth(currentDate);

  const typeLabels: Record<string, { label: string; emoji: string }> = {
    todo: { label: '待办', emoji: '📝' },
    feeling: { label: '感受', emoji: '💭' },
    reflection: { label: '反思', emoji: '🌟' },
    sweet_interaction: { label: '甜蜜互动', emoji: '💕' },
  };

  const getTypeInfo = (type: string) => {
    return typeLabels[type] || { label: '记录', emoji: '📝' };
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      todo: 'from-blue-50 to-blue-100 border-blue-400',
      feeling: 'from-pink-50 to-pink-100 border-pink-400',
      reflection: 'from-yellow-50 to-yellow-100 border-yellow-400',
      sweet_interaction: 'from-rose-50 to-rose-200 border-rose-400',
    };
    return colors[type] || 'from-gray-50 to-gray-100 border-gray-400';
  };

  const authorLabels: Record<string, string> = {
    him: '👦 他',
    her: '👧 她',
  };

  const authorColors: Record<string, string> = {
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
                day
                  ? hasRecords(day)
                    ? 'bg-gradient-to-br from-pink-100 to-rose-100 hover:from-pink-200 hover:to-rose-200'
                    : 'hover:bg-gray-50'
                  : ''
              } ${day && selectedDate === formatDate(day) ? 'ring-2 ring-pink-400' : ''}`}
            >
              <span className={hasRecords(day) ? 'text-pink-500 font-medium' : 'text-gray-600'}>
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

                  {record.image_url && (
                    <img
                      src={record.image_url}
                      alt="Record image"
                      className="w-full max-h-48 object-cover rounded-lg mb-3"
                    />
                  )}

                  <p className="mb-2 text-gray-700">{record.content}</p>

                  {record.polished_content && (
                    <div className="mt-2 p-2 bg-white/50 rounded-lg text-sm text-purple-700">
                      <strong>✨ 润色后：</strong>{record.polished_content}
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
    </div>
  );
}
