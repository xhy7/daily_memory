'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MemoryImage from '@/components/MemoryImage';
import {
  bumpRecordsDataVersion,
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

interface UploadedImagePayload {
  url?: string;
  pathname?: string;
}

interface TodayRecordsCacheEntry {
  records: MemoryItem[];
  hasMore: boolean;
}

const TODAY_RECORDS_CACHE_TTL_MS = 60 * 1000;
const TODAY_RECORDS_CACHE_KEY_PREFIX = 'today-records';
const TODAY_RECORDS_PAGE_SIZE = 20;
const MAX_IMAGE_COUNT = 9;
const MAX_CLIENT_FILE_SIZE = 10 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayCacheKey(currentDeviceId: string, date: string): string {
  return `${TODAY_RECORDS_CACHE_KEY_PREFIX}:${currentDeviceId}:${date}`;
}

function normalizeTodayRecordsCacheEntry(
  value: TodayRecordsCacheEntry | MemoryItem[] | null
): TodayRecordsCacheEntry | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return {
      records: value,
      hasMore: value.length >= TODAY_RECORDS_PAGE_SIZE,
    };
  }

  if (Array.isArray(value.records)) {
    return {
      records: value.records,
      hasMore: Boolean(value.hasMore),
    };
  }

  return null;
}

export default function RecordPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [recordType, setRecordType] = useState<string>('sweet_interaction');
  const [author, setAuthor] = useState<string>('her');
  const [content, setContent] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [todayRecords, setTodayRecords] = useState<MemoryItem[]>([]);
  const [todayRecordsHasMore, setTodayRecordsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Todo-specific state
  const [todoDeadline, setTodoDeadline] = useState<string>('');

  // Edit mode state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImages, setEditImages] = useState<string[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const recordsRequestRef = useRef<AbortController | null>(null);
  const todayRecordsRef = useRef<MemoryItem[]>([]);
  const todayRecordsHasMoreRef = useRef(false);

  const setTodayRecordsHasMoreState = useCallback((value: boolean) => {
    todayRecordsHasMoreRef.current = value;
    setTodayRecordsHasMore(value);
  }, []);

  const syncTodayRecordsCache = useCallback((
    records: MemoryItem[],
    options: { bumpVersion?: boolean; hasMore?: boolean } = {}
  ) => {
    if (!deviceId) {
      return;
    }

    const today = formatLocalDate(new Date());
    const version = options.bumpVersion
      ? bumpRecordsDataVersion(deviceId)
      : getRecordsDataVersion(deviceId);
    const hasMore = options.hasMore ?? todayRecordsHasMoreRef.current;

    writeSessionCache<TodayRecordsCacheEntry>(
      getTodayCacheKey(deviceId, today),
      { records, hasMore },
      version
    );
  }, [deviceId]);

  const updateTodayRecordsState = (
    updater: (records: MemoryItem[]) => MemoryItem[],
    bumpVersion: boolean = false
  ) => {
    if (bumpVersion) {
      recordsRequestRef.current?.abort();
      recordsRequestRef.current = null;
    }

    setTodayRecords((previousRecords) => {
      const nextRecords = updater(previousRecords);
      todayRecordsRef.current = nextRecords;
      syncTodayRecordsCache(nextRecords, { bumpVersion });
      return nextRecords;
    });
  };

  const uploadImagesToStorage = useCallback(async (files: File[]) => {
    const uploadedUrls: string[] = [];
    const failedFiles: string[] = [];

    for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
      const batch = files.slice(i, i + UPLOAD_CONCURRENCY);
      const formData = new FormData();
      batch.forEach((file) => {
        formData.append('files', file);
      });

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Upload failed: ${response.status}`);
        }

        const batchUploads = Array.isArray(data.uploads) ? data.uploads : [];
        if (batchUploads.length !== batch.length) {
          throw new Error('Upload response count did not match request count');
        }

        uploadedUrls.push(
          ...batchUploads
            .map((upload: UploadedImagePayload) => (typeof upload?.url === 'string' ? upload.url : null))
            .filter((url: string | null): url is string => Boolean(url))
        );
      } catch (error) {
        batch.forEach((file) => {
          console.error(`Failed to upload image ${file.name}:`, error);
          failedFiles.push(file.name);
        });
      }
    }

    return { uploadedUrls, failedFiles };
  }, []);

  useEffect(() => {
    // Use a shared couple device ID
    let storedDeviceId = localStorage.getItem('coupleDeviceId');

    // If no shared ID exists, create one
    if (!storedDeviceId) {
      // Use a fixed couple ID - in production you might want this to be configurable
      storedDeviceId = 'couple_memory_001';
      localStorage.setItem('coupleDeviceId', storedDeviceId);
    }
    setDeviceId(storedDeviceId);

    const lastAuthor = localStorage.getItem('lastAuthor');
    if (lastAuthor) {
      setAuthor(lastAuthor);
    }
  }, []);

  useEffect(() => {
    return () => {
      recordsRequestRef.current?.abort();
    };
  }, []);


  const fetchTodayRecords = useCallback(async (options: { append?: boolean } = {}) => {
    const append = options.append === true;
    const today = formatLocalDate(new Date());
    const cacheKey = getTodayCacheKey(deviceId, today);

    if (!append) {
      const cacheVersion = getRecordsDataVersion(deviceId);
      const cachedRecords = normalizeTodayRecordsCacheEntry(readSessionCache<TodayRecordsCacheEntry | MemoryItem[]>(
        cacheKey,
        TODAY_RECORDS_CACHE_TTL_MS,
        cacheVersion
      ));

      if (cachedRecords) {
        todayRecordsRef.current = cachedRecords.records;
        setTodayRecords(cachedRecords.records);
        setTodayRecordsHasMoreState(cachedRecords.hasMore);
        setLoading(false);
      }
    }

    recordsRequestRef.current?.abort();
    const controller = new AbortController();
    recordsRequestRef.current = controller;

    if (append) {
      setLoadingMore(true);
    }

    try {
      const res = await fetch(
        `/api/records?deviceId=${encodeURIComponent(deviceId)}&date=${today}&limit=${TODAY_RECORDS_PAGE_SIZE}&offset=${append ? todayRecordsRef.current.length : 0}&includeTotal=0&fields=id,type,content,image_url,image_urls,tags,author,is_completed,deadline,created_at`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch records: ${res.status}`);
      }

      const data = await res.json();
      const nextPage = (data.records || []) as MemoryItem[];
      const nextRecords = append ? [...todayRecordsRef.current, ...nextPage] : nextPage;
      const hasMore = Boolean(data.pagination?.hasMore);

      todayRecordsRef.current = nextRecords;
      setTodayRecords(nextRecords);
      setTodayRecordsHasMoreState(hasMore);
      syncTodayRecordsCache(nextRecords, { hasMore });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Failed to fetch records:', error);
    } finally {
      if (recordsRequestRef.current === controller) {
        recordsRequestRef.current = null;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [deviceId, setTodayRecordsHasMoreState, syncTodayRecordsCache]);

  useEffect(() => {
    if (deviceId) {
      void fetchTodayRecords();
    }
  }, [deviceId, fetchTodayRecords]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const pendingFiles = Array.from(input.files || []);
    void (async () => {
      if (pendingFiles.length === 0) return;

      const remainingSlots = Math.max(0, MAX_IMAGE_COUNT - imageUrls.length);
      const selectedFiles = pendingFiles.slice(0, remainingSlots);
      const oversizedFiles = selectedFiles.filter((file) => file.size > MAX_CLIENT_FILE_SIZE);
      const validFiles = selectedFiles.filter((file) => file.size <= MAX_CLIENT_FILE_SIZE);

      if (pendingFiles.length > remainingSlots) {
        alert(`You can upload up to ${MAX_IMAGE_COUNT} images. Extra files were skipped.`);
      }

      if (oversizedFiles.length > 0) {
        alert(`Some images exceed ${MAX_CLIENT_FILE_SIZE / 1024 / 1024}MB and were skipped: ${oversizedFiles.map((file) => file.name).join(', ')}`);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (validFiles.length === 0) {
        return;
      }

      setUploading(true);

      try {
        const { uploadedUrls, failedFiles } = await uploadImagesToStorage(validFiles);
        if (uploadedUrls.length > 0) {
          setImageUrls((previous) => [...previous, ...uploadedUrls].slice(0, MAX_IMAGE_COUNT));
        }

        if (failedFiles.length > 0) {
          alert(`Some images failed to upload: ${failedFiles.join(', ')}`);
        }
      } finally {
        setUploading(false);
        input.value = '';
      }
    })();
  };
  const removeImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || uploading) return;

    localStorage.setItem('lastAuthor', author);

    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          type: recordType,
          content,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          author,
          isCompleted: false,
          deadline: recordType === 'todo' && todoDeadline ? todoDeadline : null
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert('淇濆瓨澶辫触: ' + (errorData.error || '鏈煡閿欒'));
        return;
      }

      const newRecord = await res.json();
      setContent('');
      setImageUrls([]);
      setTodoDeadline('');
      updateTodayRecordsState((records) => [newRecord, ...records], true);
    } catch (error) {
      console.error('Failed to create record:', error);
      alert('淇濆瓨澶辫触锛岃绋嶅悗閲嶈瘯');
    }
  };

  const handleExtractTags = async (recordId: number, currentContent: string, currentImageUrl?: string) => {
    setExtracting(true);
    try {
      // Get all existing tags from today's records
      const allTags = new Set<string>();
      todayRecords.forEach(r => r.tags?.forEach(t => allTags.add(t)));
      const existingTags = Array.from(allTags);

      const res = await fetch('/api/ai-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: currentContent,
          imageUrl: currentImageUrl,
          existingTags
        }),
      });
      const data = await res.json();

      console.log('AI tags response:', data);

      if (data.error) {
        // Show detailed error info - handle object details properly
        let detailsStr = '';
        if (data.details) {
          if (typeof data.details === 'string') {
            detailsStr = data.details;
          } else if (data.details.fullResponse) {
            detailsStr = data.details.fullResponse;
          } else {
            detailsStr = JSON.stringify(data.details);
          }
        }
        const errorMsg = detailsStr
          ? `鎻愬彇鏍囩澶辫触: ${data.error}\n璇︾粏淇℃伅: ${detailsStr}`
          : '鎻愬彇鏍囩澶辫触: ' + data.error;
        alert(errorMsg);
        setExtracting(false);
        return;
      }

      // 濮嬬粓鏄剧ず璋冭瘯淇℃伅
      const debugInfo = data.debug ? `\n(Raw response: ${data.debug.rawResponse || 'none'})` : '';

      if (data.tags && data.tags.length > 0) {
        if (recordId === -1) {
          alert('鎻愬彇鍒版爣绛? ' + data.tags.join(', ') + debugInfo);
        } else {
          await fetch('/api/records', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: recordId, tags: data.tags }),
          });

          updateTodayRecordsState(
            (records) => records.map((record) =>
              record.id === recordId ? { ...record, tags: data.tags } : record
            ),
            true
          );
        }
      } else {
        alert('No tags were extracted. Please try again.' + debugInfo);
      }
    } catch (error) {
      console.error('Failed to extract tags:', error);
      alert('鎻愬彇鏍囩澶辫触锛岃绋嶅悗閲嶈瘯');
    } finally {
      setExtracting(false);
    }
  };

  const handleRemoveTag = async (recordId: number, tagToRemove: string) => {
    const record = todayRecords.find(r => r.id === recordId);
    if (!record) return;

    const currentTags = record.tags || [];
    const updatedTags = currentTags.filter(t => t !== tagToRemove);

    try {
      await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, tags: updatedTags }),
      });

      updateTodayRecordsState(
        (records) => records.map((record) =>
          record.id === recordId ? { ...record, tags: updatedTags } : record
        ),
        true
      );
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  };

  // 鍒囨崲寰呭姙瀹屾垚鐘舵€?  const handleToggleComplete = async (recordId: number, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, isCompleted: !currentStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert('鏇存柊澶辫触: ' + (errorData.error || '鏈煡閿欒'));
        return;
      }

      updateTodayRecordsState(
        (records) => records.map((record) =>
          record.id === recordId ? { ...record, is_completed: !currentStatus } : record
        ),
        true
      );
    } catch (error) {
      console.error('Failed to toggle complete:', error);
    }
  };

  // 鏇存柊寰呭姙鎴鏃堕棿
  const handleUpdateDeadline = async (recordId: number, newDeadline: string) => {
    try {
      const res = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, deadline: newDeadline || null }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert('鏇存柊澶辫触: ' + (errorData.error || '鏈煡閿欒'));
        return;
      }

      updateTodayRecordsState(
        (records) => records.map((record) =>
          record.id === recordId ? { ...record, deadline: newDeadline || null } : record
        ),
        true
      );
    } catch (error) {
      console.error('Failed to update deadline:', error);
    }
  };

  const isOverdue = (record: MemoryItem) => {
    if (!record.deadline || record.is_completed) return false;
    return new Date(record.deadline) < new Date();
  };

  const formatDeadline = (deadline: string) => {
    const d = new Date(deadline);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  };

  const typeLabels: TypeMap = {
    todo: { label: '寰呭姙', emoji: '馃摑' },
    feeling: { label: '鎰熷彈', emoji: '馃挱' },
    reflection: { label: 'Reflection', emoji: '💭' },
    sweet_interaction: { label: '鐢滆湝浜掑姩', emoji: '馃挄' },
  };

  const getTypeInfo = (type: string) => {
    return typeLabels[type] || { label: '璁板綍', emoji: '馃摑' };
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
    him: 'Him',
    her: 'Her',
  };

  const getAuthorColor = (author: string) => {
    const colors: AuthorMap = {
      him: 'bg-blue-400',
      her: 'bg-rose-400',
    };
    return colors[author] || 'bg-rose-400';
  };

  const getAuthorLabel = (author: string) => {
    return authorLabels[author] || 'Her';
  };

  // Edit record functions
  const handleStartEdit = (record: MemoryItem) => {
    setEditingId(record.id);
    setEditContent(record.content);
    setEditUploading(false);
    // Get images from record - support both old and new format
    const existingImages = record.image_urls && record.image_urls.length > 0
      ? record.image_urls
      : (record.image_url ? [record.image_url] : []);
    setEditImages(existingImages);
    // Reset file input to allow re-selecting same file
    if (editFileInputRef.current) {
      editFileInputRef.current.value = '';
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditImages([]);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim() || editUploading) return;

    setSavingEdit(true);
    try {
      const res = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          content: editContent.trim(),
          imageUrls: editImages
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert('淇濆瓨澶辫触: ' + (errorData.error || '鏈煡閿欒'));
        setSavingEdit(false);
        return;
      }

      const updatedRecord = await res.json();
      updateTodayRecordsState(
        (records) => records.map((record) =>
          record.id === editingId
            ? { ...record, content: updatedRecord.content, image_urls: updatedRecord.image_urls }
            : record
        ),
        true
      );
      setEditingId(null);
      setEditContent('');
      setEditImages([]);
    } catch (error) {
      console.error('Failed to update record:', error);
      alert('淇濆瓨澶辫触锛岃绋嶅悗閲嶈瘯');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm('Delete this record?')) return;

    try {
      const res = await fetch(`/api/records?id=${recordId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        alert('鍒犻櫎澶辫触: ' + (errorData.error || '鏈煡閿欒'));
        return;
      }

      updateTodayRecordsState(
        (records) => records.filter((record) => record.id !== recordId),
        true
      );
    } catch (error) {
      console.error('Failed to delete record:', error);
      alert('鍒犻櫎澶辫触锛岃绋嶅悗閲嶈瘯');
    }
  };

  const handleEditImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const pendingFiles = Array.from(input.files || []);
    void (async () => {
      if (pendingFiles.length === 0) return;

      const remainingSlots = Math.max(0, MAX_IMAGE_COUNT - editImages.length);
      const selectedFiles = pendingFiles.slice(0, remainingSlots);
      const oversizedFiles = selectedFiles.filter((file) => file.size > MAX_CLIENT_FILE_SIZE);
      const validFiles = selectedFiles.filter((file) => file.size <= MAX_CLIENT_FILE_SIZE);

      if (pendingFiles.length > remainingSlots) {
        alert(`You can upload up to ${MAX_IMAGE_COUNT} images. Extra files were skipped.`);
      }

      if (oversizedFiles.length > 0) {
        alert(`Some images exceed ${MAX_CLIENT_FILE_SIZE / 1024 / 1024}MB and were skipped: ${oversizedFiles.map((file) => file.name).join(', ')}`);
      }

      input.value = '';

      if (validFiles.length === 0) {
        return;
      }

      setEditUploading(true);

      try {
        const { uploadedUrls, failedFiles } = await uploadImagesToStorage(validFiles);
        if (uploadedUrls.length > 0) {
          setEditImages((previous) => [...previous, ...uploadedUrls].slice(0, MAX_IMAGE_COUNT));
        }

        if (failedFiles.length > 0) {
          alert(`Some images failed to upload: ${failedFiles.join(', ')}`);
        }
      } finally {
        setEditUploading(false);
        input.value = '';
      }
    })();
  };
  const handleRemoveEditImage = (index: number) => {
    setEditImages(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          馃挅 璁板綍浠婃棩
        </h1>
        <button onClick={() => router.push('/')} className="text-pink-400 hover:text-pink-500">
          杩斿洖 鉂わ笍
        </button>
      </header>

      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <div className="flex gap-2">
          <span className="text-sm text-pink-400 self-center mr-2">璁板綍浜猴細</span>
          <button
            type="button"
            onClick={() => setAuthor('him')}
            className={`flex-1 py-2 px-4 rounded-full transition flex items-center justify-center gap-2 ${
              author === 'him' ? 'bg-blue-400 text-white' : 'bg-blue-50 text-blue-400'
            }`}
          >
            馃懄 {authorLabels.him}
          </button>
          <button
            type="button"
            onClick={() => setAuthor('her')}
            className={`flex-1 py-2 px-4 rounded-full transition flex items-center justify-center gap-2 ${
              author === 'her' ? 'bg-rose-400 text-white' : 'bg-rose-50 text-rose-400'
            }`}
          >
            馃懅 {authorLabels.her}
          </button>
        </div>

        <div className="flex gap-2">
          {(Object.keys(typeLabels) as string[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setRecordType(type)}
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

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            multiple
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="py-2 px-4 bg-pink-100 text-pink-500 rounded-lg hover:bg-pink-200 transition flex items-center gap-2"
          >
            {uploading ? '涓婁紶涓?..' : '馃摲 娣诲姞鍥剧墖(鏈€澶?寮?'}
          </button>
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="relative">
                  <MemoryImage
                    src={url}
                    alt={`棰勮${idx + 1}`}
                    width={64}
                    height={64}
                    sizes="64px"
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 text-xs"
                  >
                    鉁?                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            recordType === 'sweet_interaction'
              ? '璁板綍鐢滆湝浜掑姩锛氱害浼氥€佺ぜ鐗┿€佸皬鎯婂枩...'
              : recordType === 'todo'
              ? '鍐欎笅浣犺瀹屾垚鐨勪换鍔?..'
              : '璁板綍浣犵殑寰呭姙銆佹劅鍙楁垨鍙嶆€?..'
          }
          className="w-full p-4 border border-pink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent bg-white"
          rows={4}
        />

        {/* 鎴鏃堕棿杈撳叆 - 浠呭緟鍔炵被鍨嬫樉绀?*/}
        {recordType === 'todo' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-400">Deadline</span>
            <input
              type="datetime-local"
              value={todoDeadline}
              onChange={(e) => setTodoDeadline(e.target.value)}
              className="flex-1 p-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
            />
            {todoDeadline && (
              <button
                type="button"
                onClick={() => setTodoDeadline('')}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                娓呴櫎
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!content.trim() || uploading}
            className="flex-1 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 shadow-md"
          >
            馃挄 淇濆瓨
          </button>
          <button
            type="button"
            onClick={() => handleExtractTags(-1, content, imageUrls[0])}
            disabled={(!content.trim() && imageUrls.length === 0) || extracting || uploading}
            className="flex-1 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white rounded-xl hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 shadow-md"
          >
            {extracting ? '鉁?鍒嗘瀽涓?..' : '鉁?鏅鸿兘鏍囩'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-pink-500">Today's Memories</h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : todayRecords.length === 0 ? (
          <div className="text-center py-10 text-pink-300">
            <p className="text-4xl mb-2">🫶</p>
            <p>No records yet today.</p>
          </div>
        ) : (
          <>
            {todayRecords.map((record) => (
              <div
                key={record.id}
                className={`p-4 rounded-xl border-l-4 bg-gradient-to-r ${record.is_completed ? 'from-gray-100 to-gray-100 border-gray-400' : getTypeColor(record.type)} shadow-sm`}
              >
                {editingId === record.id ? (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-gray-500">Editing</span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelEdit}
                          disabled={editUploading}
                          className="px-3 py-1 text-sm bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={savingEdit || editUploading || !editContent.trim()}
                          className="px-3 py-1 text-sm bg-pink-400 text-white rounded-lg hover:bg-pink-500 disabled:opacity-50"
                        >
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div className="mb-3">
                      <input
                        type="file"
                        ref={editFileInputRef}
                        onChange={handleEditImageUpload}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={editUploading}
                        className="py-1 px-3 bg-pink-100 text-pink-500 rounded-lg hover:bg-pink-200 transition text-sm flex items-center gap-1"
                      >
                        Add images
                      </button>
                      {editImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {editImages.map((url, idx) => (
                            <div key={idx} className="relative">
                              <MemoryImage
                                src={url}
                                alt={`Preview ${idx + 1}`}
                                width={64}
                                height={64}
                                sizes="64px"
                                className="w-16 h-16 object-cover rounded-lg"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveEditImage(idx)}
                                className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 text-xs"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
                      rows={4}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        {record.type === 'todo' && (
                          <button
                            onClick={() => handleToggleComplete(record.id, record.is_completed || false)}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                              record.is_completed
                                ? 'bg-green-400 border-green-400 text-white'
                                : 'border-gray-300 hover:border-green-400'
                            }`}
                          >
                            {record.is_completed && '✓'}
                          </button>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs text-white ${getAuthorColor(record.author || 'her')}`}>
                          {record.author ? getAuthorLabel(record.author) : 'Her'}
                        </span>
                        <span className={`text-sm font-medium ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                          {getTypeInfo(record.type).emoji} {getTypeInfo(record.type).label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {new Date(record.created_at).toLocaleTimeString()}
                        </span>
                        <button
                          onClick={() => handleStartEdit(record)}
                          className="text-xs text-blue-400 hover:text-blue-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {record.type === 'todo' && record.deadline && (
                      <div className={`mb-2 text-sm flex items-center gap-2 ${
                        isOverdue(record) ? 'text-red-500 font-semibold' : 'text-blue-500'
                      }`}>
                        <span>Deadline: {formatDeadline(record.deadline)}</span>
                        {isOverdue(record) && (
                          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">Overdue</span>
                        )}
                        {!record.is_completed && (
                          <input
                            type="datetime-local"
                            defaultValue={record.deadline ? record.deadline.slice(0, 16) : ''}
                            onChange={(e) => handleUpdateDeadline(record.id, e.target.value ? new Date(e.target.value).toISOString() : '')}
                            className="ml-2 text-xs p-1 border border-gray-200 rounded"
                          />
                        )}
                      </div>
                    )}

                    {(record.image_url || record.image_urls) && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {record.image_urls && record.image_urls.length > 0 ? (
                          record.image_urls.map((url, idx) => (
                            <button key={idx} onClick={() => setSelectedImage(url)} className="relative group">
                              <MemoryImage
                                src={url}
                                alt={`Record image ${idx + 1}`}
                                width={720}
                                height={540}
                                sizes="(max-width: 768px) 100vw, 720px"
                                className="w-full max-h-64 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-lg flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">🔍</span>
                              </div>
                            </button>
                          ))
                        ) : record.image_url ? (
                          <button onClick={() => setSelectedImage(record.image_url!)} className="relative group">
                            <MemoryImage
                              src={record.image_url}
                              alt="Record image"
                              width={720}
                              height={540}
                              sizes="(max-width: 768px) 100vw, 720px"
                              className="w-full max-h-64 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-lg flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">🔍</span>
                            </div>
                          </button>
                        ) : null}
                      </div>
                    )}

                    <p className={`mb-2 ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                      {record.content}
                    </p>

                    {record.tags && record.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {record.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-600 rounded-full text-xs"
                          >
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(record.id, tag)}
                              className="ml-1 text-purple-400 hover:text-purple-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => handleExtractTags(record.id, record.content, record.image_url)}
                      disabled={extracting}
                      className="mt-2 text-sm text-purple-500 hover:text-purple-700 disabled:opacity-50"
                    >
                      {record.tags && record.tags.length > 0 ? 'Re-run tags' : 'Generate tags'}
                    </button>
                  </>
                )}
              </div>
            ))}
            {todayRecordsHasMore && (
              <button
                type="button"
                onClick={() => void fetchTodayRecords({ append: true })}
                disabled={loadingMore}
                className="w-full rounded-xl border border-pink-200 bg-white/90 px-4 py-3 text-sm font-medium text-pink-500 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
      </div>

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
            鉁?          </button>
          <MemoryImage
            src={selectedImage}
            alt="鏌ョ湅澶у浘"
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


