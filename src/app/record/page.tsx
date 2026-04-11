'use client';

import { useState, useEffect, useRef } from 'react';
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
  is_completed?: boolean;
  deadline?: string | null;
  created_at: string;
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
  const [loading, setLoading] = useState(true);
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
    if (deviceId) {
      fetchTodayRecords();
    }
  }, [deviceId]);

  const fetchTodayRecords = async () => {
    // 使用本地时区获取今天的日期，保持格式一致 YYYY-MM-DD
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    try {
      // 优化：只请求需要的字段
      const res = await fetch(`/api/records?deviceId=${deviceId}&date=${today}&fields=id,type,content,image_urls,tags,author,is_completed,deadline,created_at`);
      const data = await res.json();
      console.log('Fetched records:', data);
      setTodayRecords(data.records || []);
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let loadedCount = 0;
    const newImages: string[] = [];

    Array.from(files).forEach((file) => {
      // Check file size - warn if too large
      if (file.size > 4.5 * 1024 * 1024) {
        alert(`图片 ${file.name} 超过4.5MB，将被跳过`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        loadedCount++;
        if (loadedCount === files.length) {
          setImageUrls(prev => [...prev, ...newImages].slice(0, 9)); // Max 9 images
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

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
        alert('保存失败: ' + (errorData.error || '未知错误'));
        return;
      }

      const newRecord = await res.json();
      setContent('');
      setImageUrls([]);
      setTodoDeadline('');
      setTodayRecords([newRecord, ...todayRecords]);
    } catch (error) {
      console.error('Failed to create record:', error);
      alert('保存失败，请稍后重试');
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
          ? `提取标签失败: ${data.error}\n详细信息: ${detailsStr}`
          : '提取标签失败: ' + data.error;
        alert(errorMsg);
        setExtracting(false);
        return;
      }

      // 始终显示调试信息
      const debugInfo = data.debug ? `\n(原始响应: ${data.debug.rawResponse || '无'})` : '';

      if (data.tags && data.tags.length > 0) {
        if (recordId === -1) {
          alert('提取到标签: ' + data.tags.join(', ') + debugInfo);
        } else {
          await fetch('/api/records', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: recordId, tags: data.tags }),
          });

          setTodayRecords(todayRecords.map(r =>
            r.id === recordId ? { ...r, tags: data.tags } : r
          ));
        }
      } else {
        alert('未能提取到标签，请重试' + debugInfo);
      }
    } catch (error) {
      console.error('Failed to extract tags:', error);
      alert('提取标签失败，请稍后重试');
    } finally {
      setExtracting(false);
    }
  };

  const handleAddTag = async (recordId: number, newTag: string) => {
    const record = todayRecords.find(r => r.id === recordId);
    if (!record) return;

    const currentTags = record.tags || [];
    const updatedTags = [...currentTags, newTag];

    try {
      await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, tags: updatedTags }),
      });

      setTodayRecords(todayRecords.map(r =>
        r.id === recordId ? { ...r, tags: updatedTags } : r
      ));
    } catch (error) {
      console.error('Failed to add tag:', error);
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

      setTodayRecords(todayRecords.map(r =>
        r.id === recordId ? { ...r, tags: updatedTags } : r
      ));
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  };

  // 切换待办完成状态
  const handleToggleComplete = async (recordId: number, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, isCompleted: !currentStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert('更新失败: ' + (errorData.error || '未知错误'));
        return;
      }

      setTodayRecords(todayRecords.map(r =>
        r.id === recordId ? { ...r, is_completed: !currentStatus } : r
      ));
    } catch (error) {
      console.error('Failed to toggle complete:', error);
    }
  };

  // 更新待办截止时间
  const handleUpdateDeadline = async (recordId: number, newDeadline: string) => {
    try {
      const res = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, deadline: newDeadline || null }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert('更新失败: ' + (errorData.error || '未知错误'));
        return;
      }

      setTodayRecords(todayRecords.map(r =>
        r.id === recordId ? { ...r, deadline: newDeadline || null } : r
      ));
    } catch (error) {
      console.error('Failed to update deadline:', error);
    }
  };

  // 检查待办是否超时
  const isOverdue = (record: MemoryItem) => {
    if (!record.deadline || record.is_completed) return false;
    return new Date(record.deadline) < new Date();
  };

  // 格式化截止时间显示
  const formatDeadline = (deadline: string) => {
    const d = new Date(deadline);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}月${day}日 ${hours}:${minutes}`;
  };

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
    him: '他',
    her: '她',
  };

  const getAuthorColor = (author: string) => {
    const colors: AuthorMap = {
      him: 'bg-blue-400',
      her: 'bg-rose-400',
    };
    return colors[author] || 'bg-rose-400';
  };

  const getAuthorLabel = (author: string) => {
    return authorLabels[author] || '她';
  };

  // Edit record functions
  const handleStartEdit = (record: MemoryItem) => {
    setEditingId(record.id);
    setEditContent(record.content);
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
    if (!editingId || !editContent.trim()) return;

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
        alert('保存失败: ' + (errorData.error || '未知错误'));
        setSavingEdit(false);
        return;
      }

      const updatedRecord = await res.json();
      setTodayRecords(todayRecords.map(r =>
        r.id === editingId ? { ...r, content: updatedRecord.content, image_urls: updatedRecord.image_urls } : r
      ));
      setEditingId(null);
      setEditContent('');
      setEditImages([]);
    } catch (error) {
      console.error('Failed to update record:', error);
      alert('保存失败，请稍后重试');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm('确定要删除这条记录吗？')) return;

    try {
      const res = await fetch(`/api/records?id=${recordId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        alert('删除失败: ' + (errorData.error || '未知错误'));
        return;
      }

      setTodayRecords(todayRecords.filter(r => r.id !== recordId));
    } catch (error) {
      console.error('Failed to delete record:', error);
      alert('删除失败，请稍后重试');
    }
  };

  const handleEditImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let loadedCount = 0;
    let totalToLoad = 0;
    const newImages: string[] = [];

    // First pass: count files to load (excluding oversized)
    Array.from(files).forEach((file) => {
      if (file.size > 4.5 * 1024 * 1024) {
        alert(`图片 ${file.name} 超过4.5MB，将被跳过`);
        return;
      }
      totalToLoad++;
    });

    if (totalToLoad === 0) {
      // Reset input even when all files are oversized
      if (e.target) {
        e.target.value = '';
      }
      return;
    }

    // Second pass: load valid files
    Array.from(files).forEach((file) => {
      if (file.size > 4.5 * 1024 * 1024) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(reader.result as string);
        loadedCount++;
        if (loadedCount === totalToLoad) {
          setEditImages(prev => [...prev, ...newImages].slice(0, 9));
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRemoveEditImage = (index: number) => {
    setEditImages(prev => prev.filter((_, i) => i !== index));
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
        <div className="flex gap-2">
          <span className="text-sm text-pink-400 self-center mr-2">记录人：</span>
          <button
            type="button"
            onClick={() => setAuthor('him')}
            className={`flex-1 py-2 px-4 rounded-full transition flex items-center justify-center gap-2 ${
              author === 'him' ? 'bg-blue-400 text-white' : 'bg-blue-50 text-blue-400'
            }`}
          >
            👦 {authorLabels.him}
          </button>
          <button
            type="button"
            onClick={() => setAuthor('her')}
            className={`flex-1 py-2 px-4 rounded-full transition flex items-center justify-center gap-2 ${
              author === 'her' ? 'bg-rose-400 text-white' : 'bg-rose-50 text-rose-400'
            }`}
          >
            👧 {authorLabels.her}
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
            {uploading ? '上传中...' : '📷 添加图片(最多9张)'}
          </button>
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="relative">
                  <img src={url} alt={`预览${idx + 1}`} className="w-16 h-16 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 text-xs"
                  >
                    ✕
                  </button>
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
              ? '记录甜蜜互动：约会、礼物、小惊喜...'
              : recordType === 'todo'
              ? '写下你要完成的任务...'
              : '记录你的待办、感受或反思...'
          }
          className="w-full p-4 border border-pink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent bg-white"
          rows={4}
        />

        {/* 截止时间输入 - 仅待办类型显示 */}
        {recordType === 'todo' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-400">📅 截止时间：</span>
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
                清除
              </button>
            )}
          </div>
        )}

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
            onClick={() => handleExtractTags(-1, content, imageUrls[0])}
            disabled={(!content.trim() && imageUrls.length === 0) || extracting}
            className="flex-1 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white rounded-xl hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 shadow-md"
          >
            {extracting ? '✨ 分析中...' : '✨ 智能标签'}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-pink-500">今日甜蜜记录 💕</h2>
        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : todayRecords.length === 0 ? (
          <div className="text-center py-10 text-pink-300">
            <p className="text-4xl mb-2">💗</p>
            <p>今天还没有记录哦~</p>
          </div>
        ) : (
          todayRecords.map((record) => (
            <div
              key={record.id}
              className={`p-4 rounded-xl border-l-4 bg-gradient-to-r ${record.is_completed ? 'from-gray-100 to-gray-100 border-gray-400' : getTypeColor(record.type)} shadow-sm`}
            >
              {editingId === record.id ? (
                // Edit mode
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-gray-500">编辑模式</span>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit || !editContent.trim()}
                        className="px-3 py-1 text-sm bg-pink-400 text-white rounded-lg hover:bg-pink-500 disabled:opacity-50"
                      >
                        {savingEdit ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>

                  {/* Edit image upload */}
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
                      className="py-1 px-3 bg-pink-100 text-pink-500 rounded-lg hover:bg-pink-200 transition text-sm flex items-center gap-1"
                    >
                      📷 添加图片
                    </button>
                    {editImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {editImages.map((url, idx) => (
                          <div key={idx} className="relative">
                            <img src={url} alt={`预览${idx + 1}`} className="w-16 h-16 object-cover rounded-lg" />
                            <button
                              type="button"
                              onClick={() => handleRemoveEditImage(idx)}
                              className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 text-xs"
                            >
                              ✕
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
                // Normal display mode
                <>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  {/* 待办完成复选框 */}
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
                    {record.author ? getAuthorLabel(record.author) : '她'}
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
                    ✏️ 编辑
                  </button>
                  <button
                    onClick={() => handleDeleteRecord(record.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* 待办截止时间显示 */}
              {record.type === 'todo' && record.deadline && (
                <div className={`mb-2 text-sm flex items-center gap-2 ${
                  isOverdue(record) ? 'text-red-500 font-semibold' : 'text-blue-500'
                }`}>
                  <span>📅</span>
                  <span>截止：{formatDeadline(record.deadline)}</span>
                  {isOverdue(record) && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">⚠️ 已超时</span>}
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

              {/* Support both single image and multiple images with click to view */}
              {(record.image_url || record.image_urls) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {record.image_urls && record.image_urls.length > 0 ? (
                    record.image_urls.map((url, idx) => (
                      <button key={idx} onClick={() => setSelectedImage(url)} className="relative group">
                        <img src={url} alt={`记录图片${idx + 1}`} className="w-full max-h-64 object-cover rounded-lg cursor-pointer hover:opacity-90 transition" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-lg flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">🔍</span>
                        </div>
                      </button>
                    ))
                  ) : record.image_url ? (
                    <button onClick={() => setSelectedImage(record.image_url!)} className="relative group">
                      <img src={record.image_url} alt="记录图片" className="w-full max-h-64 object-cover rounded-lg cursor-pointer hover:opacity-90 transition" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-lg flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">🔍</span>
                      </div>
                    </button>
                  ) : null}
                </div>
              )}

              <p className={`mb-2 ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{record.content}</p>

              {/* Tags Display */}
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
                {record.tags && record.tags.length > 0 ? '✨ 重新分析' : '✨ 智能标签'}
              </button>
                </>
              )}
            </div>
          ))
        )}
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