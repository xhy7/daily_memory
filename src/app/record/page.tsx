'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MemoryImage from '@/components/MemoryImage';

type MemoryType = 'sweet_interaction' | 'todo' | 'feeling' | 'reflection';

interface MemoryItem {
  id: number;
  type: MemoryType;
  content: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: string;
  is_completed?: boolean;
  deadline?: string | null;
  created_at: string;
}

const MAX_IMAGE_COUNT = 9;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PAGE_SIZE = 20;

const AUTHOR_LABELS: Record<string, string> = {
  him: '\u4ed6',
  her: '\u5979',
};

const TYPE_OPTIONS: Array<{ value: MemoryType; label: string; emoji: string }> = [
  { value: 'sweet_interaction', label: '\u751c\u871c\u4e92\u52a8', emoji: '\ud83d\udc95' },
  { value: 'todo', label: '\u5f85\u529e', emoji: '\ud83d\udccb' },
  { value: 'feeling', label: '\u611f\u53d7', emoji: '\ud83d\udc97' },
  { value: 'reflection', label: '\u53cd\u601d', emoji: '\ud83d\udcad' },
];

const TYPE_COLORS: Record<string, string> = {
  sweet_interaction: 'from-rose-50 to-rose-200 border-rose-400',
  todo: 'from-blue-50 to-blue-100 border-blue-400',
  feeling: 'from-pink-50 to-pink-100 border-pink-400',
  reflection: 'from-yellow-50 to-yellow-100 border-yellow-400',
};

function formatDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecordImages(record: MemoryItem) {
  if (Array.isArray(record.image_urls) && record.image_urls.length > 0) {
    return record.image_urls;
  }

  return record.image_url ? [record.image_url] : [];
}

function getTypeInfo(type: string) {
  return TYPE_OPTIONS.find((item) => item.value === type) || {
    value: type,
    label: '\u8bb0\u5f55',
    emoji: '\ud83d\udcdd',
  };
}

function getTypeColor(type: string) {
  return TYPE_COLORS[type] || 'from-gray-50 to-gray-100 border-gray-400';
}

function getAuthorLabel(author?: string) {
  return AUTHOR_LABELS[author || 'her'] || '\u5979';
}

function getAuthorColor(author?: string) {
  return author === 'him' ? 'bg-blue-400' : 'bg-rose-400';
}

function formatDeadline(deadline?: string | null) {
  if (!deadline) {
    return '';
  }

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocal(deadline?: string | null) {
  if (!deadline) {
    return '';
  }

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

export default function RecordPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [deviceId, setDeviceId] = useState('');
  const [recordType, setRecordType] = useState<MemoryType>('sweet_interaction');
  const [author, setAuthor] = useState<'him' | 'her'>('her');
  const [content, setContent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [todayRecords, setTodayRecords] = useState<MemoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingRecordIds, setDeletingRecordIds] = useState<number[]>([]);
  const [togglingRecordIds, setTogglingRecordIds] = useState<number[]>([]);
  const [removingTagKeys, setRemovingTagKeys] = useState<string[]>([]);
  const recordsLengthRef = useRef(0);

  useEffect(() => {
    let storedDeviceId = localStorage.getItem('coupleDeviceId');
    if (!storedDeviceId) {
      storedDeviceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('coupleDeviceId', storedDeviceId);
    }

    setDeviceId(storedDeviceId);
    const lastAuthor = localStorage.getItem('lastAuthor');
    if (lastAuthor === 'him' || lastAuthor === 'her') {
      setAuthor(lastAuthor);
    }
  }, []);

  useEffect(() => {
    recordsLengthRef.current = todayRecords.length;
  }, [todayRecords.length]);

  const fetchTodayRecords = useCallback(async (append: boolean) => {
    const currentOffset = append ? recordsLengthRef.current : 0;
    const url = `/api/records?deviceId=${encodeURIComponent(deviceId)}&date=${formatDay(new Date())}&limit=${PAGE_SIZE}&offset=${currentOffset}&fields=id,type,content,image_url,image_urls,tags,author,is_completed,deadline,created_at`;

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'load failed');
      }

      const nextRecords = Array.isArray(data.records) ? data.records : [];
      setTodayRecords((previous) => (append ? [...previous, ...nextRecords] : nextRecords));
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch (error) {
      console.error(error);
      alert('\u83b7\u53d6\u4eca\u65e5\u8bb0\u5f55\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    void fetchTodayRecords(false);
  }, [deviceId, fetchTodayRecords]);

  async function uploadFiles(files: File[]) {
    const accepted = files
      .slice(0, MAX_IMAGE_COUNT)
      .filter((file) => file.size <= MAX_FILE_SIZE);

    if (accepted.length === 0) {
      return [];
    }

    const formData = new FormData();
    accepted.forEach((file) => formData.append('files', file));

    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'upload failed');
    }

    return (Array.isArray(data.uploads) ? data.uploads : [])
      .map((item: { url?: string }) => item.url)
      .filter((url: string | undefined): url is string => Boolean(url));
  }

  async function handleUpload(files: File[], mode: 'create' | 'edit') {
    if (files.length === 0) {
      return;
    }

    const currentCount = mode === 'create' ? imageUrls.length : editImages.length;
    const limited = files.slice(0, Math.max(0, MAX_IMAGE_COUNT - currentCount));
    if (limited.length === 0) {
      alert(`\u6700\u591a\u53ea\u80fd\u4e0a\u4f20 ${MAX_IMAGE_COUNT} \u5f20\u56fe\u7247\u3002`);
      return;
    }

    try {
      if (mode === 'create') {
        setUploading(true);
      } else {
        setEditUploading(true);
      }
      const uploaded = await uploadFiles(limited);
      if (mode === 'create') {
        setImageUrls((previous) => [...previous, ...uploaded].slice(0, MAX_IMAGE_COUNT));
      } else {
        setEditImages((previous) => [...previous, ...uploaded].slice(0, MAX_IMAGE_COUNT));
      }
    } catch (error) {
      console.error(error);
      alert('\u56fe\u7247\u4e0a\u4f20\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      if (mode === 'create') {
        setUploading(false);
      } else {
        setEditUploading(false);
      }
    }
  }

  async function submitRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!deviceId || !content.trim() || uploading) {
      return;
    }

    localStorage.setItem('lastAuthor', author);

    try {
      const response = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          type: recordType,
          content: content.trim(),
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          author,
          isCompleted: false,
          deadline: recordType === 'todo' && deadline ? new Date(deadline).toISOString() : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'save failed');
      }

      setContent('');
      setImageUrls([]);
      setDeadline('');
      setTodayRecords((previous) => [data, ...previous]);
    } catch (error) {
      console.error(error);
      alert('\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    }
  }

  async function extractTags(recordId: number | null, sourceContent: string, sourceImage?: string) {
    if (!sourceContent.trim() && !sourceImage) {
      return;
    }

    try {
      setExtracting(true);
      const existingTags = Array.from(
        new Set(todayRecords.flatMap((record) => (Array.isArray(record.tags) ? record.tags : []))),
      );

      const response = await fetch('/api/ai-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: sourceContent,
          imageUrl: sourceImage,
          existingTags,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'tag failed');
      }

      if (!Array.isArray(data.tags) || data.tags.length === 0) {
        alert('\u6ca1\u6709\u63d0\u53d6\u5230\u6807\u7b7e\uff0c\u53ef\u4ee5\u7a0d\u540e\u518d\u8bd5\u4e00\u6b21\u3002');
        return;
      }

      if (recordId === null) {
        alert(`\u63d0\u53d6\u5230\u6807\u7b7e\uff1a${data.tags.join('\u3001')}`);
        return;
      }

      const patchResponse = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, tags: data.tags }),
      });

      const patchData = await patchResponse.json();
      if (!patchResponse.ok) {
        throw new Error(patchData.error || 'tag patch failed');
      }

      setTodayRecords((previous) =>
        previous.map((record) => (record.id === recordId ? { ...record, tags: data.tags } : record)),
      );
    } catch (error) {
      console.error(error);
      alert('\u63d0\u53d6\u6807\u7b7e\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setExtracting(false);
    }
  }

  async function removeTag(recordId: number, tag: string) {
    const target = todayRecords.find((record) => record.id === recordId);
    if (!target) {
      return;
    }

    const tagKey = `${recordId}:${tag}`;
    const nextTags = (target.tags || []).filter((current) => current !== tag);
    try {
      setRemovingTagKeys((previous) => [...previous, tagKey]);
      const response = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, tags: nextTags }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'remove tag failed');
      }

      setTodayRecords((previous) =>
        previous.map((record) => (record.id === recordId ? { ...record, tags: nextTags } : record)),
      );
    } catch (error) {
      console.error(error);
      alert('\u66f4\u65b0\u6807\u7b7e\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setRemovingTagKeys((previous) => previous.filter((current) => current !== tagKey));
    }
  }

  async function toggleTodo(record: MemoryItem) {
    try {
      setTogglingRecordIds((previous) => [...previous, record.id]);
      const response = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, isCompleted: !record.is_completed }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'toggle failed');
      }

      setTodayRecords((previous) =>
        previous.map((item) =>
          item.id === record.id ? { ...item, is_completed: !item.is_completed } : item,
        ),
      );
    } catch (error) {
      console.error(error);
      alert('\u66f4\u65b0\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setTogglingRecordIds((previous) => previous.filter((currentId) => currentId !== record.id));
    }
  }

  async function updateDeadline(recordId: number, value: string) {
    try {
      const response = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recordId,
          deadline: value ? new Date(value).toISOString() : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'deadline failed');
      }

      setTodayRecords((previous) =>
        previous.map((record) =>
          record.id === recordId
            ? { ...record, deadline: value ? new Date(value).toISOString() : null }
            : record,
        ),
      );
    } catch (error) {
      console.error(error);
      alert('\u66f4\u65b0\u622a\u6b62\u65f6\u95f4\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    }
  }

  function startEdit(record: MemoryItem) {
    setEditingId(record.id);
    setEditContent(record.content);
    setEditImages(getRecordImages(record));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent('');
    setEditImages([]);
  }

  async function saveEdit() {
    if (!editingId || !editContent.trim()) {
      return;
    }

    try {
      setSavingEdit(true);
      const response = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          content: editContent.trim(),
          imageUrls: editImages,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'edit failed');
      }

      setTodayRecords((previous) =>
        previous.map((record) =>
          record.id === editingId
            ? { ...record, content: data.content, image_url: data.image_url, image_urls: data.image_urls }
            : record,
        ),
      );
      cancelEdit();
    } catch (error) {
      console.error(error);
      alert('\u4fdd\u5b58\u4fee\u6539\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteRecord(id: number) {
    if (!window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u6761\u8bb0\u5f55\u5417\uff1f')) {
      return;
    }

    try {
      setDeletingRecordIds((previous) => [...previous, id]);
      const response = await fetch(`/api/records?id=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'delete failed');
      }

      setTodayRecords((previous) => previous.filter((record) => record.id !== id));
    } catch (error) {
      console.error(error);
      alert('\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setDeletingRecordIds((previous) => previous.filter((currentId) => currentId !== id));
    }
  }

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          {'\ud83d\udc95'} {'\u8bb0\u5f55\u4eca\u65e5'}
        </h1>
        <button type="button" onClick={() => router.push('/')} className="text-pink-400 hover:text-pink-500">
          {'\u8fd4\u56de\u9996\u9875'}
        </button>
      </header>

      <form onSubmit={submitRecord} className="mb-8 space-y-4">
        <div className="flex gap-2">
          <span className="text-sm text-pink-400 self-center mr-2">{'\u8bb0\u5f55\u4eba\uff1a'}</span>
          {(['him', 'her'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAuthor(value)}
              className={`flex-1 py-2 px-4 rounded-full transition ${
                author === value
                  ? value === 'him'
                    ? 'bg-blue-400 text-white'
                    : 'bg-rose-400 text-white'
                  : value === 'him'
                    ? 'bg-blue-50 text-blue-400'
                    : 'bg-rose-50 text-rose-400'
              }`}
            >
              {getAuthorLabel(value)}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRecordType(option.value)}
              className={`flex-1 min-w-[120px] py-2 px-2 rounded-lg transition text-sm ${
                recordType === option.value
                  ? 'bg-gradient-to-r from-pink-400 to-rose-400 text-white'
                  : 'bg-pink-50 text-pink-400'
              }`}
            >
              {option.emoji} {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              void handleUpload(files, 'create');
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="py-2 px-4 bg-pink-100 text-pink-500 rounded-lg hover:bg-pink-200 transition disabled:opacity-60"
          >
            {uploading ? '\u4e0a\u4f20\u4e2d...' : '\u6dfb\u52a0\u56fe\u7247'}
          </button>
          <span className="text-xs text-gray-400">{`\u6700\u591a ${MAX_IMAGE_COUNT} \u5f20\uff0c\u5355\u5f20\u4e0d\u8d85\u8fc7 10MB`}</span>
        </div>

        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageUrls.map((url, index) => (
              <div key={`${url}-${index}`} className="relative">
                <MemoryImage src={url} alt={`preview-${index}`} width={64} height={64} sizes="64px" className="w-16 h-16 object-cover rounded-lg" />
                <button type="button" onClick={() => setImageUrls((prev) => prev.filter((_, i) => i !== index))} className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 text-xs">
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={
            recordType === 'sweet_interaction'
              ? '\u8bb0\u5f55\u4eca\u5929\u7684\u751c\u871c\u4e92\u52a8\u3001\u793c\u7269\u3001\u7ea6\u4f1a\u6216\u5c0f\u60ca\u559c...'
              : recordType === 'todo'
                ? '\u5199\u4e0b\u4eca\u5929\u60f3\u5b8c\u6210\u7684\u4e8b\u60c5...'
                : recordType === 'feeling'
                  ? '\u5199\u4e0b\u4f60\u7684\u611f\u53d7...'
                  : '\u8bb0\u5f55\u4eca\u5929\u7684\u601d\u8003\u548c\u53cd\u601d...'
          }
          className="w-full p-4 border border-pink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
          rows={4}
        />

        {recordType === 'todo' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-400">{'\u622a\u6b62\u65f6\u95f4\uff1a'}</span>
            <input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="flex-1 p-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm" />
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={!content.trim() || uploading} className="flex-1 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-xl hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 shadow-md">
            {'\u4fdd\u5b58\u8bb0\u5f55'}
          </button>
          <button type="button" onClick={() => void extractTags(null, content, imageUrls[0])} disabled={extracting || (!content.trim() && imageUrls.length === 0)} className="flex-1 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white rounded-xl disabled:opacity-50 shadow-md">
            {extracting ? '\u5206\u6790\u4e2d...' : '\u667a\u80fd\u6807\u7b7e'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-pink-500">{'\u4eca\u5929\u7684\u8bb0\u5f55'}</h2>
        {loading ? (
          <p className="text-gray-500">{'\u52a0\u8f7d\u4e2d...'}</p>
        ) : todayRecords.length === 0 ? (
          <div className="text-center py-10 text-pink-300">
            <p className="text-4xl mb-2">{'\ud83e\udef6'}</p>
            <p>{'\u4eca\u5929\u8fd8\u6ca1\u6709\u8bb0\u5f55\uff0c\u5148\u5199\u4e0b\u7b2c\u4e00\u6761\u5427\u3002'}</p>
          </div>
        ) : (
          <>
            {todayRecords.map((record) => (
              <div key={record.id} className={`p-4 rounded-xl border-l-4 bg-gradient-to-r ${getTypeColor(record.type)} shadow-sm`}>
                {editingId === record.id ? (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-gray-500">{'\u7f16\u8f91\u4e2d'}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={cancelEdit} disabled={editUploading || savingEdit} className="px-3 py-1 text-sm bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                          {'\u53d6\u6d88'}
                        </button>
                        <button type="button" onClick={() => void saveEdit()} disabled={savingEdit || editUploading || !editContent.trim()} className="px-3 py-1 text-sm bg-pink-400 text-white rounded-lg hover:bg-pink-500 disabled:opacity-50">
                          {savingEdit ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58'}
                        </button>
                      </div>
                    </div>

                    <div className="mb-3">
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          event.target.value = '';
                          void handleUpload(files, 'edit');
                        }}
                      />
                      <button type="button" onClick={() => editFileInputRef.current?.click()} disabled={editUploading} className="py-1 px-3 bg-pink-100 text-pink-500 rounded-lg hover:bg-pink-200 transition text-sm disabled:opacity-60">
                        {editUploading ? '\u4e0a\u4f20\u4e2d...' : '\u6dfb\u52a0\u56fe\u7247'}
                      </button>
                      {editImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {editImages.map((url, index) => (
                            <div key={`${url}-${index}`} className="relative">
                              <MemoryImage src={url} alt={`edit-${index}`} width={64} height={64} sizes="64px" className="w-16 h-16 object-cover rounded-lg" />
                              <button type="button" onClick={() => setEditImages((prev) => prev.filter((_, i) => i !== index))} className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 text-xs">
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white" rows={4} />
                  </div>
                ) : (
                  <>
                    {(() => {
                      const images = getRecordImages(record);
                      const isDeleting = deletingRecordIds.includes(record.id);
                      const isToggling = togglingRecordIds.includes(record.id);
                      return (
                        <>
                    <div className="flex justify-between items-start mb-2 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {record.type === 'todo' && (
                          <button type="button" disabled={isToggling} onClick={() => void toggleTodo(record)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center disabled:opacity-60 ${record.is_completed ? 'bg-green-400 border-green-400 text-white' : 'border-gray-300'}`}>
                            {record.is_completed ? '✓' : ''}
                          </button>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs text-white ${getAuthorColor(record.author)}`}>{getAuthorLabel(record.author)}</span>
                        <span className={`text-sm font-medium ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                          {getTypeInfo(record.type).emoji} {getTypeInfo(record.type).label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{new Date(record.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                        <button type="button" onClick={() => startEdit(record)} className="text-xs text-blue-400 hover:text-blue-600">{'\u7f16\u8f91'}</button>
                        <button type="button" disabled={isDeleting} onClick={() => void deleteRecord(record.id)} className="text-xs text-red-400 hover:text-red-600 disabled:opacity-60">{isDeleting ? '\u5220\u9664\u4e2d...' : '\u5220\u9664'}</button>
                      </div>
                    </div>

                    {record.deadline && (
                      <div className="mb-2 text-sm text-blue-500 flex items-center gap-2 flex-wrap">
                        <span>{`\u622a\u6b62\uff1a${formatDeadline(record.deadline)}`}</span>
                        {record.type === 'todo' && !record.is_completed && (
                          <input type="datetime-local" defaultValue={toDatetimeLocal(record.deadline)} onChange={(event) => void updateDeadline(record.id, event.target.value)} className="ml-2 text-xs p-1 border border-gray-200 rounded" />
                        )}
                      </div>
                    )}

                    {images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {images.map((url, index) => (
                          <button key={`${record.id}-${index}`} type="button" onClick={() => setSelectedImage(url)} className="relative group">
                            <MemoryImage src={url} alt={`record-${index}`} width={720} height={540} sizes="(max-width: 768px) 100vw, 720px" className="w-full max-h-64 object-cover rounded-lg cursor-pointer hover:opacity-90 transition" />
                          </button>
                        ))}
                      </div>
                    )}

                    <p className={record.is_completed ? 'text-gray-400 line-through' : 'text-gray-700'}>{record.content}</p>

                    {record.tags && record.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {record.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-600 rounded-full text-xs">
                            {tag}
                            <button type="button" disabled={removingTagKeys.includes(`${record.id}:${tag}`)} onClick={() => void removeTag(record.id, tag)} className="ml-1 text-purple-400 hover:text-purple-600 disabled:opacity-50">x</button>
                          </span>
                        ))}
                      </div>
                    )}

                    <button type="button" onClick={() => void extractTags(record.id, record.content, images[0] ?? undefined)} disabled={extracting} className="mt-2 text-sm text-purple-500 hover:text-purple-700 disabled:opacity-50">
                      {record.tags && record.tags.length > 0 ? '\u91cd\u65b0\u5206\u6790\u6807\u7b7e' : '\u751f\u6210\u6807\u7b7e'}
                    </button>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            ))}

            {hasMore && (
              <button type="button" onClick={() => void fetchTodayRecords(true)} disabled={loadingMore} className="w-full rounded-xl border border-pink-200 bg-white/90 px-4 py-3 text-sm font-medium text-pink-500 transition hover:bg-pink-50 disabled:opacity-60">
                {loadingMore ? '\u52a0\u8f7d\u4e2d...' : '\u52a0\u8f7d\u66f4\u591a'}
              </button>
            )}
          </>
        )}
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setSelectedImage(null)}>
          <button type="button" className="absolute top-4 right-4 text-white text-3xl hover:text-pink-400 transition" onClick={() => setSelectedImage(null)}>
            x
          </button>
          <MemoryImage src={selectedImage} alt="preview-full" width={1600} height={1200} sizes="90vw" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
