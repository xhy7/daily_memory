'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MemoryImage from '@/components/MemoryImage';
import {
  getRecordsDataVersion,
  readSessionCache,
  writeSessionCache,
} from '@/lib/client-cache';

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
  is_completed?: boolean;
  deadline?: string | null;
  created_at: string;
}

interface DaySummary {
  date: string;
  count: number;
}

interface DayRecordsCacheEntry {
  records: MemoryItem[];
  hasMore: boolean;
}

const MONTH_SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;
const DAY_RECORDS_CACHE_TTL_MS = 60 * 1000;
const MONTH_SUMMARY_CACHE_KEY_PREFIX = 'history-month-summary';
const DAY_RECORDS_CACHE_KEY_PREFIX = 'history-day-records';
const DAY_RECORDS_PAGE_SIZE = 20;

const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

function getBrowserTimezone(): string {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  }

  return 'Asia/Shanghai';
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export default function HistoryPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayRecords, setDayRecords] = useState<MemoryItem[]>([]);
  const [dayRecordsHasMore, setDayRecordsHasMore] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayLoadingMore, setDayLoadingMore] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [monthSummary, setMonthSummary] = useState<Record<string, number>>({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const monthSummaryCacheRef = useRef(new Map<string, Record<string, number>>());
  const dayRecordsCacheRef = useRef(new Map<string, DayRecordsCacheEntry>());
  const monthRequestRef = useRef<AbortController | null>(null);
  const dayRequestRef = useRef<AbortController | null>(null);

  const timezone = useMemo(() => getBrowserTimezone(), []);
  const currentMonthKey = useMemo(() => formatMonthKey(currentDate), [currentDate]);
  const currentCacheVersion = useMemo(
    () => (deviceId ? getRecordsDataVersion(deviceId) : '0'),
    [deviceId]
  );

  const buildMonthCacheKey = useCallback(
    (month: string) => `${MONTH_SUMMARY_CACHE_KEY_PREFIX}:${deviceId}:${timezone}:${month}`,
    [deviceId, timezone]
  );
  const buildDayCacheKey = useCallback(
    (date: string) => `${DAY_RECORDS_CACHE_KEY_PREFIX}:${deviceId}:${timezone}:${date}`,
    [deviceId, timezone]
  );

  useEffect(() => {
    let storedDeviceId = localStorage.getItem('coupleDeviceId');
    if (!storedDeviceId) {
      storedDeviceId = 'couple_memory_001';
      localStorage.setItem('coupleDeviceId', storedDeviceId);
    }
    setDeviceId(storedDeviceId);
  }, []);

  useEffect(() => {
    return () => {
      monthRequestRef.current?.abort();
      dayRequestRef.current?.abort();
    };
  }, []);

  const fetchMonthSummary = useCallback(async (month: string) => {
    const cacheKey = buildMonthCacheKey(month);
    const cached = monthSummaryCacheRef.current.get(cacheKey);
    if (cached) {
      setMonthSummary(cached);
      setCalendarLoading(false);
      return;
    }

    const cachedFromSession = readSessionCache<Record<string, number>>(
      cacheKey,
      MONTH_SUMMARY_CACHE_TTL_MS,
      currentCacheVersion
    );
    if (cachedFromSession) {
      monthSummaryCacheRef.current.set(cacheKey, cachedFromSession);
      setMonthSummary(cachedFromSession);
      setCalendarLoading(false);
      return;
    }

    monthRequestRef.current?.abort();
    const controller = new AbortController();
    monthRequestRef.current = controller;
    setCalendarLoading(true);

    try {
      const res = await fetch(
        `/api/records?deviceId=${encodeURIComponent(deviceId)}&summary=calendar&month=${month}&timezone=${encodeURIComponent(timezone)}`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch calendar summary: ${res.status}`);
      }

      const data = await res.json();
      const summaryMap = Object.fromEntries(
        ((data.days || []) as DaySummary[]).map((item) => [item.date, item.count])
      );
      monthSummaryCacheRef.current.set(cacheKey, summaryMap);
      writeSessionCache(cacheKey, summaryMap, currentCacheVersion);
      setMonthSummary(summaryMap);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch calendar summary:', error);
      setMonthSummary({});
    } finally {
      if (monthRequestRef.current === controller) {
        monthRequestRef.current = null;
        setCalendarLoading(false);
      }
    }
  }, [buildMonthCacheKey, currentCacheVersion, deviceId, timezone]);

  const prefetchMonthSummary = useCallback(async (month: string) => {
    const cacheKey = buildMonthCacheKey(month);
    if (monthSummaryCacheRef.current.has(cacheKey)) {
      return;
    }

    const cachedFromSession = readSessionCache<Record<string, number>>(
      cacheKey,
      MONTH_SUMMARY_CACHE_TTL_MS,
      currentCacheVersion
    );
    if (cachedFromSession) {
      monthSummaryCacheRef.current.set(cacheKey, cachedFromSession);
      return;
    }

    try {
      const res = await fetch(
        `/api/records?deviceId=${encodeURIComponent(deviceId)}&summary=calendar&month=${month}&timezone=${encodeURIComponent(timezone)}`
      );
      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const summaryMap = Object.fromEntries(
        ((data.days || []) as DaySummary[]).map((item) => [item.date, item.count])
      );
      monthSummaryCacheRef.current.set(cacheKey, summaryMap);
      writeSessionCache(cacheKey, summaryMap, currentCacheVersion);
    } catch {
      // Ignore background prefetch failures.
    }
  }, [buildMonthCacheKey, currentCacheVersion, deviceId, timezone]);

  const fetchDayRecords = useCallback(async (
    date: string,
    options: { append?: boolean } = {}
  ) => {
    const append = options.append === true;
    const cacheKey = buildDayCacheKey(date);
    const currentOffset = append ? dayRecords.length : 0;

    setSelectedDate(date);

    if (!append) {
      const cached = dayRecordsCacheRef.current.get(cacheKey);
      if (cached) {
        setDayRecords(cached.records);
        setDayRecordsHasMore(cached.hasMore);
        setDayLoading(false);
        return;
      }

      const cachedFromSession = readSessionCache<DayRecordsCacheEntry>(
        cacheKey,
        DAY_RECORDS_CACHE_TTL_MS,
        currentCacheVersion
      );
      if (cachedFromSession) {
        dayRecordsCacheRef.current.set(cacheKey, cachedFromSession);
        setDayRecords(cachedFromSession.records);
        setDayRecordsHasMore(cachedFromSession.hasMore);
        setDayLoading(false);
        return;
      }
    }

    dayRequestRef.current?.abort();
    const controller = new AbortController();
    dayRequestRef.current = controller;

    if (append) {
      setDayLoadingMore(true);
    } else {
      setDayLoading(true);
      setDayRecords([]);
      setDayRecordsHasMore(false);
    }

    try {
      const res = await fetch(
        `/api/records?deviceId=${encodeURIComponent(deviceId)}&date=${date}&timezone=${encodeURIComponent(timezone)}&limit=${DAY_RECORDS_PAGE_SIZE}&offset=${currentOffset}&includeTotal=0&fields=id,type,content,polished_content,image_url,image_urls,tags,author,is_completed,deadline,created_at`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch day records: ${res.status}`);
      }

      const data = await res.json();
      const nextPage = (data.records || []) as MemoryItem[];
      const hasMore = Boolean(data.pagination?.hasMore);
      const mergedRecords = append ? [...dayRecords, ...nextPage] : nextPage;
      const cacheEntry: DayRecordsCacheEntry = {
        records: mergedRecords,
        hasMore,
      };

      dayRecordsCacheRef.current.set(cacheKey, cacheEntry);
      writeSessionCache(cacheKey, cacheEntry, currentCacheVersion);
      setDayRecords(mergedRecords);
      setDayRecordsHasMore(hasMore);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch day records:', error);
      if (!append) {
        setDayRecords([]);
        setDayRecordsHasMore(false);
      }
    } finally {
      if (dayRequestRef.current === controller) {
        dayRequestRef.current = null;
        setDayLoading(false);
        setDayLoadingMore(false);
      }
    }
  }, [buildDayCacheKey, currentCacheVersion, dayRecords, deviceId, timezone]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    void fetchMonthSummary(currentMonthKey);
  }, [currentMonthKey, deviceId, fetchMonthSummary]);

  useEffect(() => {
    if (!deviceId || selectedDate) {
      return;
    }

    const today = formatDateKey(new Date());
    setSelectedDate(today);
    void fetchDayRecords(today);
  }, [deviceId, fetchDayRecords, selectedDate]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    const previousMonthKey = formatMonthKey(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
    const nextMonthKey = formatMonthKey(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );

    const timer = window.setTimeout(() => {
      void prefetchMonthSummary(previousMonthKey);
      void prefetchMonthSummary(nextMonthKey);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentDate, deviceId, prefetchMonthSummary]);

  function getDaysInMonth(date: Date) {
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
  }

  function formatCalendarDate(day: number) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  }

  function getRecordCount(day: number) {
    const dateKey = formatCalendarDate(day);
    return monthSummary[dateKey] || 0;
  }

  function getRecordGradientStyle(day: number) {
    const count = getRecordCount(day);
    if (count === 0) return 'bg-white hover:bg-gray-50';
    if (count <= 2) return 'bg-gradient-to-br from-pink-100 to-rose-100 hover:from-pink-200 hover:to-rose-200';
    if (count <= 5) return 'bg-gradient-to-br from-pink-200 to-rose-200 hover:from-pink-300 hover:to-rose-300';
    return 'bg-gradient-to-br from-pink-300 to-rose-300 hover:from-pink-400 hover:to-rose-400';
  }

  function getRecordTextStyle(day: number) {
    const count = getRecordCount(day);
    if (count === 0) return 'text-gray-600';
    if (count <= 2) return 'text-rose-600 font-semibold';
    if (count <= 5) return 'text-rose-700 font-bold';
    return 'text-white font-bold';
  }

  const days = useMemo(() => getDaysInMonth(currentDate), [currentDate]);

  const typeLabels: TypeMap = {
    todo: { label: '待办', emoji: '📝' },
    feeling: { label: '感受', emoji: '💭' },
    reflection: { label: '反思', emoji: '🌙' },
    sweet_interaction: { label: '甜蜜互动', emoji: '💗' },
  };

  const getTypeInfo = (type: string) => {
    return typeLabels[type] || { label: '记录', emoji: '📘' };
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
          💗 甜蜜回忆
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
            {currentDate.getFullYear()} 年 {monthNames[currentDate.getMonth()]}
          </span>
          <button onClick={nextMonth} className="p-2 hover:bg-pink-50 rounded-full text-pink-400 transition">
            ▶
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => (
            <div key={day} className="text-center text-sm text-pink-300 py-2 font-medium">
              {day}
            </div>
          ))}
          {days.map((day, index) => {
            const recordCount = day ? getRecordCount(day) : 0;
            return (
              <button
                key={index}
                onClick={() => day && void fetchDayRecords(formatCalendarDate(day))}
                disabled={!day}
                className={`p-2 text-center rounded-xl transition relative ${
                  day ? getRecordGradientStyle(day) : ''
                } ${day && selectedDate === formatCalendarDate(day) ? 'ring-2 ring-pink-400' : ''}`}
              >
                <span className={day ? getRecordTextStyle(day) : 'text-gray-600'}>
                  {day || ''}
                </span>
                {day && recordCount > 0 && (
                  <span className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 text-xs">
                    {recordCount <= 2 ? '💗' : recordCount <= 5 ? '💕' : '💖'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-pink-500 flex items-center gap-2">
            📅 {selectedDate} 的甜蜜回忆
          </h2>
          {dayLoading ? (
            <p className="text-gray-500">加载中...</p>
          ) : dayRecords.length === 0 ? (
            <div className="text-center py-10 text-pink-300">
              <p className="text-4xl mb-2">💞</p>
              <p>这一天还没有记录哦~</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayRecords.map((record) => (
                <div
                  key={record.id}
                  className={`p-4 rounded-xl border-l-4 bg-gradient-to-r ${record.is_completed ? 'from-gray-100 to-gray-100 border-gray-400' : getTypeColor(record.type)} shadow-sm`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs text-white ${getAuthorColor(record.author || 'her')}`}>
                        {record.author ? getAuthorLabel(record.author) : '👧 她'}
                      </span>
                      <span className={`text-sm font-medium ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                        {getTypeInfo(record.type).emoji} {getTypeInfo(record.type).label}
                        {record.type === 'todo' && record.is_completed && ' 已完成'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(record.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  {record.type === 'todo' && record.deadline && (
                    <div className={`mb-2 text-sm flex items-center gap-2 ${
                      record.is_completed ? 'text-gray-400' :
                      new Date(record.deadline) < new Date() ? 'text-red-500 font-semibold' : 'text-blue-500'
                    }`}>
                      <span>📅</span>
                      <span>
                        截止：
                        {new Date(record.deadline).toLocaleString('zh-CN', {
                          timeZone: 'Asia/Shanghai',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {!record.is_completed && new Date(record.deadline) < new Date() && (
                        <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">已超时</span>
                      )}
                    </div>
                  )}

                  {getRecordImages(record).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {getRecordImages(record).map((url, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedImage(url)}
                          className="relative group"
                        >
                          <MemoryImage
                            src={url}
                            alt={`记录图片${idx + 1}`}
                            width={720}
                            height={540}
                            sizes="(max-width: 768px) 100vw, 720px"
                            className="w-full max-h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-lg flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">🔍</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <p className={`mb-2 ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{record.content}</p>

                  {record.polished_content && (
                    <div className="mt-2 p-2 bg-white/50 rounded-lg text-sm text-purple-700">
                      <strong>润色后：</strong>{record.polished_content}
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

              {dayRecordsHasMore && selectedDate && (
                <button
                  type="button"
                  onClick={() => void fetchDayRecords(selectedDate, { append: true })}
                  disabled={dayLoadingMore}
                  className="w-full rounded-xl border border-pink-200 bg-white/90 px-4 py-3 text-sm font-medium text-pink-500 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {dayLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!selectedDate && !calendarLoading && (
        <div className="text-center py-8">
          <p className="text-pink-300 text-lg mb-2">💗</p>
          <p className="text-pink-300">点击日历上的日期查看甜蜜回忆</p>
        </div>
      )}

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl hover:text-pink-400 transition"
            onClick={() => setSelectedImage(null)}
          >
            ×
          </button>
          <MemoryImage
            src={selectedImage}
            alt="查看大图"
            width={1600}
            height={1200}
            sizes="90vw"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
