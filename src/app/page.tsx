'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

type MemoryType = 'sweet_interaction' | 'todo' | 'feeling' | 'reflection';
type ProfileSlot = 'partnerA' | 'partnerB';

type PartnerProfile = {
  name: string | null;
  avatarUrl: string | null;
};

type CoupleProfiles = Record<ProfileSlot, PartnerProfile>;

type HomeRecord = {
  id: number;
  type: MemoryType;
  content: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: 'him' | 'her';
  is_completed?: boolean;
  created_at: string;
};

type HomeRecordResponse = {
  records: HomeRecord[];
  pagination?: {
    total?: number | null;
    hasMore?: boolean;
  };
};

type CoupleSpaceResponse = {
  inviteCode?: string;
  profiles?: Partial<CoupleProfiles>;
};

type StatsState = {
  todayCount: number;
  totalCount: number;
  todoCount: number;
};

type LegacyNameFallbacks = Record<ProfileSlot, string | null>;

type AvatarCardProps = {
  badgeText: string;
  fallbackName: string;
  profile: PartnerProfile;
  isEditing: boolean;
  isSavingName: boolean;
  isUploading: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveName: (name: string) => void;
  onPickAvatar: () => void;
  onClearAvatar: () => void;
};

const DEFAULT_PROFILE_NAMES: Record<ProfileSlot, string> = {
  partnerA: '他',
  partnerB: '她',
};

const EMPTY_PROFILES: CoupleProfiles = {
  partnerA: { name: null, avatarUrl: null },
  partnerB: { name: null, avatarUrl: null },
};

const EMPTY_STATS: StatsState = {
  todayCount: 0,
  totalCount: 0,
  todoCount: 0,
};

const ACTIONS = [
  {
    href: '/record',
    eyebrow: '\u5feb\u901f\u8bb0\u4e00\u7b14',
    title: '\u8bb0\u5f55\u4eca\u65e5',
    description:
      '\u628a\u4eca\u5929\u7684\u5fc3\u60c5\u3001\u5bf9\u8bdd\u3001\u7167\u7247\u548c\u5f85\u529e\u7b80\u6d01\u5730\u8bb0\u4e0b\u6765\u3002',
    accentClass: 'bg-rose-100 text-rose-500',
    icon: '01',
  },
  {
    href: '/history',
    eyebrow: '\u6339\u65f6\u95f4\u56de\u770b',
    title: '\u6d4f\u89c8\u56de\u5fc6',
    description:
      '\u6309\u65e5\u671f\u628a\u4f60\u4eec\u7684\u76f8\u5904\u7247\u6bb5\u7a7f\u8d77\u6765\uff0c\u5f88\u5feb\u5c31\u80fd\u627e\u5230\u90a3\u5929\u3002',
    accentClass: 'bg-amber-100 text-amber-600',
    icon: '02',
  },
  {
    href: '/graph',
    eyebrow: '\u770b\u5173\u7cfb\u8109\u7edc',
    title: '3D \u56de\u5fc6\u56fe\u8c31',
    description:
      '\u7528\u65f6\u95f4\u3001\u6807\u7b7e\u548c\u60c5\u7eea\u628a\u8bb0\u5f55\u8fde\u6210\u7ebf\uff0c\u66f4\u76f4\u89c2\u5730\u770b\u5230\u53d8\u5316\u3002',
    accentClass: 'bg-sky-100 text-sky-600',
    icon: '3D',
  },
] as const;

const RECORD_TYPE_META: Record<MemoryType, { label: string; className: string }> = {
  sweet_interaction: {
    label: '甜蜜互动',
    className: 'bg-rose-50 text-rose-500 border-rose-100',
  },
  todo: {
    label: '待办',
    className: 'bg-sky-50 text-sky-600 border-sky-100',
  },
  feeling: {
    label: '心情',
    className: 'bg-amber-50 text-amber-600 border-amber-100',
  },
  reflection: {
    label: '碎碎念',
    className: 'bg-violet-50 text-violet-600 border-violet-100',
  },
};

function getDisplayName(name: string | null | undefined, fallback: string) {
  return name && name.trim() ? name.trim() : fallback;
}

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '\u25cf';
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return { text: '夜深了，也别忘了记住今天的温柔', emoji: '🌙' };
  if (hour < 9) return { text: '早上好，新的一天已经开始了', emoji: '🌤️' };
  if (hour < 12) return { text: '上午好，留一句今天的心情吧', emoji: '☀️' };
  if (hour < 14) return { text: '中午好，记得也把午后的陪伴留下', emoji: '🍚' };
  if (hour < 18) return { text: '下午好，今天也有值得记录的片段', emoji: '🌤️' };
  if (hour < 22) return { text: '晚上好，适合把今天慢慢写下来', emoji: '🌙' };
  return { text: '夜晚好，把今天收进回忆里吧', emoji: '🌌' };
}

function formatDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRecordTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '刚刚';
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}…`;
}

function getAuthorLabel(author?: 'him' | 'her') {
  if (author === 'him') {
    return '他';
  }

  if (author === 'her') {
    return '她';
  }

  return '我们';
}

function getAuthorClass(author?: 'him' | 'her') {
  return author === 'him'
    ? 'bg-sky-50 text-sky-600 border-sky-100'
    : 'bg-rose-50 text-rose-500 border-rose-100';
}

function createOrGetDeviceId() {
  const storedDeviceId = localStorage.getItem('coupleDeviceId');
  if (storedDeviceId) {
    return storedDeviceId;
  }

  const newDeviceId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `device_${crypto.randomUUID()}`
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  localStorage.setItem('coupleDeviceId', newDeviceId);
  return newDeviceId;
}

function readLegacyNameFallbacks(): LegacyNameFallbacks {
  const stored = localStorage.getItem('coupleNames');
  if (!stored) {
    return {
      partnerA: null,
      partnerB: null,
    };
  }

  try {
    const parsed = JSON.parse(stored) as { him?: string; her?: string };
    return {
      partnerA: typeof parsed.him === 'string' && parsed.him.trim() ? parsed.him.trim() : null,
      partnerB: typeof parsed.her === 'string' && parsed.her.trim() ? parsed.her.trim() : null,
    };
  } catch {
    return {
      partnerA: null,
      partnerB: null,
    };
  }
}

function mergeProfiles(profiles: Partial<CoupleProfiles> | undefined, legacyNames: LegacyNameFallbacks): CoupleProfiles {
  const partnerA = profiles?.partnerA ?? EMPTY_PROFILES.partnerA;
  const partnerB = profiles?.partnerB ?? EMPTY_PROFILES.partnerB;

  return {
    partnerA: {
      name: partnerA.name ?? legacyNames.partnerA,
      avatarUrl: partnerA.avatarUrl ?? null,
    },
    partnerB: {
      name: partnerB.name ?? legacyNames.partnerB,
      avatarUrl: partnerB.avatarUrl ?? null,
    },
  };
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data as T;
}

async function fetchIncompleteTodoCount(deviceId: string): Promise<number> {
  const pageSize = 200;
  let offset = 0;
  let count = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await requestJson<HomeRecordResponse>(
      `/api/records?deviceId=${encodeURIComponent(deviceId)}&limit=${pageSize}&offset=${offset}&fields=id,type,is_completed`
    );

    count += data.records.filter((record) => record.type === 'todo' && !record.is_completed).length;
    hasMore = Boolean(data.pagination?.hasMore);
    offset += pageSize;
  }

  return count;
}

function AvatarCard({
  badgeText,
  fallbackName,
  profile,
  isEditing,
  isSavingName,
  isUploading,
  onStartEdit,
  onCancelEdit,
  onSaveName,
  onPickAvatar,
  onClearAvatar,
}: AvatarCardProps) {
  const displayName = getDisplayName(profile.name, fallbackName);
  const [draftName, setDraftName] = useState(displayName);

  useEffect(() => {
    setDraftName(displayName);
  }, [displayName]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setDraftName(displayName);
      onCancelEdit();
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <button
        type="button"
        onClick={onPickAvatar}
        className="group relative h-28 w-28 overflow-hidden rounded-full border border-white/85 bg-gradient-to-br from-white to-rose-50 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.4)] sm:h-32 sm:w-32"
      >
        {profile.avatarUrl ? (
          <Image
            src={profile.avatarUrl}
            alt={`${displayName}的头像`}
            fill
            sizes="(max-width: 640px) 112px, 128px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.92),transparent_24%),linear-gradient(135deg,rgba(251,113,133,0.12),rgba(255,255,255,0.96)_52%,rgba(251,191,36,0.12))]">
            <span className="text-4xl font-black tracking-tight text-slate-700 sm:text-5xl">
              {getInitial(displayName)}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/68 via-slate-900/20 to-transparent px-3 pb-3 pt-8 text-center text-xs font-semibold text-white opacity-90 transition sm:opacity-0 sm:group-hover:opacity-100">
          {isUploading ? '上传中...' : '更换头像'}
        </div>

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/75 backdrop-blur-sm">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
          </div>
        )}
      </button>

      <div className="inline-flex items-center rounded-full border border-white/85 bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.24em] text-slate-500 shadow-sm">
        {badgeText}
      </div>

      {isEditing ? (
        <input
          type="text"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => onSaveName(draftName)}
          onKeyDown={handleKeyDown}
          className="w-24 rounded-xl border border-rose-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-800 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          maxLength={8}
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="group inline-flex items-center gap-1 text-lg font-semibold tracking-[0.06em] text-slate-800 transition hover:text-rose-500 sm:text-xl"
        >
          <span>{displayName}</span>
          <span className="text-xs opacity-0 transition group-hover:opacity-100">✎</span>
        </button>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{isSavingName ? '保存中...' : '点击姓名可编辑'}</span>
        {profile.avatarUrl ? (
          <button
            type="button"
            onClick={onClearAvatar}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:border-rose-200 hover:text-rose-500"
          >
            移除头像
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function Home() {
  const [deviceId, setDeviceId] = useState('');
  const [profiles, setProfiles] = useState<CoupleProfiles>(EMPTY_PROFILES);
  const [stats, setStats] = useState<StatsState>(EMPTY_STATS);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [recentRecords, setRecentRecords] = useState<HomeRecord[]>([]);
  const [editingName, setEditingName] = useState<ProfileSlot | null>(null);
  const [savingNameSlot, setSavingNameSlot] = useState<ProfileSlot | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<ProfileSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [greeting] = useState(getTimeGreeting);
  const avatarInputRefs = useRef<Record<ProfileSlot, HTMLInputElement | null>>({
    partnerA: null,
    partnerB: null,
  });
  const legacyNamesRef = useRef<LegacyNameFallbacks>({
    partnerA: null,
    partnerB: null,
  });

  const loadHomeData = useCallback(async (currentDeviceId: string) => {
    const today = formatDay(new Date());

    const [spaceData, todayData, totalData, recentData, todoCount] = await Promise.all([
      requestJson<CoupleSpaceResponse>(`/api/couple-space?deviceId=${encodeURIComponent(currentDeviceId)}`),
      requestJson<HomeRecordResponse>(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&date=${today}&limit=1&fields=id&includeTotal=1`
      ),
      requestJson<HomeRecordResponse>(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&limit=1&fields=id&includeTotal=1`
      ),
      requestJson<HomeRecordResponse>(
        `/api/records?deviceId=${encodeURIComponent(
          currentDeviceId
        )}&limit=3&fields=id,type,content,image_url,image_urls,tags,author,is_completed,created_at`
      ),
      fetchIncompleteTodoCount(currentDeviceId),
    ]);

    setProfiles(mergeProfiles(spaceData.profiles, legacyNamesRef.current));
    setInviteCode(spaceData.inviteCode ?? null);
    setStats({
      todayCount: typeof todayData.pagination?.total === 'number' ? todayData.pagination.total : 0,
      totalCount: typeof totalData.pagination?.total === 'number' ? totalData.pagination.total : 0,
      todoCount,
    });
    setRecentRecords(recentData.records || []);
  }, []);

  useEffect(() => {
    legacyNamesRef.current = readLegacyNameFallbacks();

    const currentDeviceId = createOrGetDeviceId();
    setDeviceId(currentDeviceId);

    let active = true;
    setLoading(true);
    setLoadError(null);

    void loadHomeData(currentDeviceId)
      .catch((error) => {
        if (!active) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : '首页加载失败');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadHomeData]);

  const handleSaveName = useCallback(
    async (slot: ProfileSlot, nextName: string) => {
      const trimmedName = nextName.trim();
      const currentStoredName = profiles[slot].name?.trim() || '';

      if (!deviceId) {
        setEditingName(null);
        return;
      }

      if (trimmedName === currentStoredName || (!trimmedName && !currentStoredName)) {
        setEditingName(null);
        return;
      }

      setSavingNameSlot(slot);
      setProfileMessage(null);

      try {
        const data = await requestJson<CoupleSpaceResponse>('/api/couple-space', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId,
            slot,
            name: trimmedName,
          }),
        });

        setProfiles(mergeProfiles(data.profiles, legacyNamesRef.current));
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : '姓名保存失败');
      } finally {
        setSavingNameSlot(null);
        setEditingName(null);
      }
    },
    [deviceId, profiles]
  );

  const handleAvatarChange = useCallback(
    async (slot: ProfileSlot, event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file || !deviceId) {
        return;
      }

      setUploadingSlot(slot);
      setProfileMessage(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const uploadData = (await uploadResponse.json()) as {
          error?: string;
          url?: string | null;
          pathname?: string | null;
        };

        if (!uploadResponse.ok || !uploadData.url) {
          throw new Error(uploadData.error || '头像上传失败');
        }

        const profileData = await requestJson<CoupleSpaceResponse>('/api/couple-space', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId,
            slot,
            avatarUrl: uploadData.url,
            avatarPathname: uploadData.pathname ?? null,
          }),
        });

        setProfiles(mergeProfiles(profileData.profiles, legacyNamesRef.current));
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : '头像保存失败');
      } finally {
        setUploadingSlot(null);
      }
    },
    [deviceId]
  );

  const handleClearAvatar = useCallback(
    async (slot: ProfileSlot) => {
      if (!deviceId) {
        return;
      }

      setUploadingSlot(slot);
      setProfileMessage(null);

      try {
        const data = await requestJson<CoupleSpaceResponse>('/api/couple-space', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId,
            slot,
            clearAvatar: true,
          }),
        });

        setProfiles(mergeProfiles(data.profiles, legacyNamesRef.current));
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : '移除头像失败');
      } finally {
        setUploadingSlot(null);
      }
    },
    [deviceId]
  );

  const openAvatarPicker = useCallback((slot: ProfileSlot) => {
    avatarInputRefs.current[slot]?.click();
  }, []);

  const partnerAName = getDisplayName(profiles.partnerA.name, DEFAULT_PROFILE_NAMES.partnerA);
  const partnerBName = getDisplayName(profiles.partnerB.name, DEFAULT_PROFILE_NAMES.partnerB);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-[-5rem] h-60 w-60 rounded-full bg-rose-200/40 blur-3xl" />
        <div className="absolute right-[-5rem] top-20 h-56 w-56 rounded-full bg-amber-100/45 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-pink-100/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-white/75 bg-white/78 shadow-[0_30px_80px_-58px_rgba(148,63,117,0.38)] backdrop-blur-xl sm:rounded-[32px]">
          <div className="grid gap-5 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8 lg:px-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/85 bg-white/85 px-4 py-2 text-[11px] font-semibold tracking-[0.28em] text-rose-500 shadow-sm">
                  <span>✦</span>
                  <span>情侣共享记忆册</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50/85 px-3 py-1.5 text-xs text-rose-500">
                  <span>{greeting.emoji}</span>
                  <span className="font-medium">{greeting.text}</span>
                </div>
              </div>

              <h1 className="mt-5 max-w-xl text-3xl font-black leading-tight text-slate-900 sm:text-4xl lg:text-[3.15rem] lg:leading-[1.06]">
                把普通的一天
                <span className="mt-2 block bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 bg-clip-text text-transparent">
                  过成值得回看的回忆
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                你们的头像、名字、记录和邀请码都放在同一个共享空间里。
                首页先看今天的状态，再决定是继续记录、回看回忆，还是去邀请另一台设备加入。
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/record"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:from-rose-600 hover:to-pink-600 hover:shadow-lg sm:min-w-[156px]"
                >
                  <span>📝</span>
                  <span>记录今天</span>
                </Link>
                <Link
                  href="/history"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/85 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white sm:min-w-[156px]"
                >
                  <span>🔎</span>
                  <span>浏览回忆</span>
                </Link>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,248,250,0.98),rgba(255,255,255,0.96))] p-5 shadow-[0_20px_60px_-46px_rgba(148,63,117,0.35)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-400">共享资料</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">头像和姓名会同步到同一情侣空间</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    在任意已加入空间的设备上修改，这里都会同步更新。
                  </p>
                </div>

                <Link
                  href="/invite"
                  className="min-w-[132px] rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-left shadow-sm transition hover:bg-amber-50"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">邀请码</p>
                  <p className="mt-2 text-lg font-bold tracking-[0.14em] text-amber-600">{inviteCode || '------'}</p>
                </Link>
              </div>

              <div className="mt-6 grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-5">
                <div>
                  <AvatarCard
                    badgeText="他"
                    fallbackName={DEFAULT_PROFILE_NAMES.partnerA}
                    profile={profiles.partnerA}
                    isEditing={editingName === 'partnerA'}
                    isSavingName={savingNameSlot === 'partnerA'}
                    isUploading={uploadingSlot === 'partnerA'}
                    onStartEdit={() => {
                      setProfileMessage(null);
                      setEditingName('partnerA');
                    }}
                    onCancelEdit={() => setEditingName(null)}
                    onSaveName={(name) => void handleSaveName('partnerA', name)}
                    onPickAvatar={() => openAvatarPicker('partnerA')}
                    onClearAvatar={() => void handleClearAvatar('partnerA')}
                  />
                  <input
                    ref={(node) => {
                      avatarInputRefs.current.partnerA = node;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void handleAvatarChange('partnerA', event)}
                  />
                </div>

                <div className="flex h-12 w-12 items-center justify-center self-center rounded-full border border-white/80 bg-white text-xl text-rose-400 shadow-sm">
                  ♥
                </div>

                <div>
                  <AvatarCard
                    badgeText="她"
                    fallbackName={DEFAULT_PROFILE_NAMES.partnerB}
                    profile={profiles.partnerB}
                    isEditing={editingName === 'partnerB'}
                    isSavingName={savingNameSlot === 'partnerB'}
                    isUploading={uploadingSlot === 'partnerB'}
                    onStartEdit={() => {
                      setProfileMessage(null);
                      setEditingName('partnerB');
                    }}
                    onCancelEdit={() => setEditingName(null)}
                    onSaveName={(name) => void handleSaveName('partnerB', name)}
                    onPickAvatar={() => openAvatarPicker('partnerB')}
                    onClearAvatar={() => void handleClearAvatar('partnerB')}
                  />
                  <input
                    ref={(node) => {
                      avatarInputRefs.current.partnerB = node;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void handleAvatarChange('partnerB', event)}
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-500 shadow-sm">
                <p>当前显示：{partnerAName} 与 {partnerBName}</p>
                <Link href="/invite" className="font-semibold text-rose-500 transition hover:text-rose-600">
                  管理邀请码 →
                </Link>
              </div>

              {profileMessage ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {profileMessage}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">快速状态</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">先看今天，再决定下一步</h2>
              </div>
              <Link href="/record" className="text-sm font-semibold text-rose-500 transition hover:text-rose-600">
                去记录 →
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-400">今日记录</p>
                <p className="mt-3 text-3xl font-black text-rose-500">{stats.todayCount}</p>
              </div>
              <div className="rounded-2xl border border-pink-100 bg-pink-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-pink-400">总记录</p>
                <p className="mt-3 text-3xl font-black text-pink-500">{stats.totalCount}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-500">未完成待办</p>
                <p className="mt-3 text-3xl font-black text-sky-600">{stats.todoCount}</p>
              </div>
            </div>

            {loadError ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {loadError}
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">最近内容</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">不用翻页，也能先看到最近发生了什么</h2>
              </div>
              <Link href="/history" className="text-sm font-semibold text-slate-700 transition hover:text-slate-900">
                查看全部 →
              </Link>
            </div>

            {loading ? (
              <div className="mt-5 space-y-3">
                {[0, 1].map((value) => (
                  <div key={value} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <div className="h-3 w-28 rounded bg-slate-200" />
                    <div className="mt-4 h-4 w-full rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-3/4 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : recentRecords.length > 0 ? (
              <div className="mt-5 space-y-3">
                {recentRecords.map((record) => {
                  const recordMeta = RECORD_TYPE_META[record.type];
                  const hasImage = (record.image_urls && record.image_urls.length > 0) || Boolean(record.image_url);

                  return (
                    <Link
                      key={record.id}
                      href="/history"
                      className="block rounded-2xl border border-white/80 bg-slate-50/75 px-4 py-4 transition hover:border-rose-100 hover:bg-white"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${recordMeta.className}`}>
                            {recordMeta.label}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getAuthorClass(record.author)}`}>
                            {getAuthorLabel(record.author)}
                          </span>
                          {record.type === 'todo' ? (
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                record.is_completed
                                  ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                                  : 'border-amber-100 bg-amber-50 text-amber-600'
                              }`}
                            >
                              {record.is_completed ? '已完成' : '进行中'}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-slate-400">{formatRecordTime(record.created_at)}</span>
                      </div>

                      <p className="mt-3 text-sm leading-7 text-slate-700">{truncateText(record.content, 88)}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        {record.tags?.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-slate-500 shadow-sm">
                            #{tag}
                          </span>
                        ))}
                        {hasImage ? <span>含图片</span> : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-rose-200 bg-rose-50/65 px-5 py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">今天还没有留下新的记录</p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  从一句话、一张照片，或者一个小待办开始，后面都会慢慢长成回忆。
                </p>
                <Link
                  href="/record"
                  className="mt-5 inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-rose-500 shadow-sm transition hover:bg-rose-50"
                >
                  去写下第一条
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group rounded-[24px] border border-white/80 bg-white/82 p-5 shadow-[0_20px_55px_-44px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-white"
            >
              <div
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold shadow-sm ${action.accentClass}`}
              >
                {action.icon}
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                {action.eyebrow}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-800">{action.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{action.description}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span>进入</span>
                <span className="transition group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
