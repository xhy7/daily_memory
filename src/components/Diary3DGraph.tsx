'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Html, Line } from '@react-three/drei';
import * as THREE from 'three';

export interface GraphRecord {
  id: number;
  content: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: string;
  created_at: string;
  type: string;
}

interface Diary3DGraphProps {
  records: GraphRecord[];
  onNodeClick?: (record: GraphRecord) => void;
  onTagClick?: (tag: string) => void;
  deviceId?: string;
}

// Generate beautiful galaxy-like spiral positions
function calculateGalaxyPositions(records: GraphRecord[], radius: number = 10) {
  const positions: THREE.Vector3[] = [];
  const numRecords = records.length;

  for (let i = 0; i < numRecords; i++) {
    // Galaxy spiral formula with some randomness
    const angle = (i / numRecords) * Math.PI * 4; // 2 full rotations
    const spread = 0.3 + Math.random() * 0.2;
    const r = radius * (0.2 + (i / numRecords) * 0.8) * spread;

    // Add vertical variation for 3D effect
    const verticalOffset = (Math.random() - 0.5) * 3;

    positions.push(new THREE.Vector3(
      Math.cos(angle) * r + (Math.random() - 0.5) * 1.5,
      verticalOffset,
      Math.sin(angle) * r + (Math.random() - 0.5) * 1.5
    ));
  }

  return positions;
}

// Galaxy Node - glowing core with orbiting particles
function GalaxyNode({
  record,
  position,
  isSelected,
  onClick
}: {
  record: GraphRecord;
  position: THREE.Vector3;
  isSelected: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const baseSize = 0.25 + (record.content?.length || 0) / 400;
  const size = hovered || isSelected ? baseSize * 1.5 : baseSize;

  // Color based on author - warm colors for love theme
  const authorColor = record.author === 'him'
    ? { core: '#4a90d9', glow: '#87ceeb', halo: '#4169e1' }
    : { core: '#ff69b4', glow: '#ffb6c1', halo: '#ff1493' };

  // Gentle rotation animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005;
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
    if (coreRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      coreRef.current.scale.setScalar(size * pulse);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Outer glow/halo */}
      <Sphere args={[size * 2, 16, 16]}>
        <meshBasicMaterial
          color={authorColor.glow}
          transparent
          opacity={hovered || isSelected ? 0.15 : 0.05}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Middle halo */}
      <Sphere args={[size * 1.5, 16, 16]}>
        <meshBasicMaterial
          color={authorColor.halo}
          transparent
          opacity={hovered || isSelected ? 0.2 : 0.08}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Core sphere */}
      <Sphere
        ref={coreRef}
        args={[size, 32, 32]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          color={authorColor.core}
          emissive={authorColor.core}
          emissiveIntensity={hovered || isSelected ? 1.5 : 0.8}
          transparent
          opacity={0.9}
          roughness={0.2}
          metalness={0.5}
        />
      </Sphere>

      {/* Orbiting particles ring */}
      {hovered || isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.8, size * 2, 32]} />
          <meshBasicMaterial
            color={authorColor.glow}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Hover tooltip */}
      {hovered && record.tags && record.tags.length > 0 && (
        <Html position={[0, size + 0.8, 0]} center>
          <div className="bg-black/90 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap pointer-events-none">
            <div className="text-pink-300 font-medium mb-1">
              {new Date(record.created_at).toLocaleDateString('zh-CN')}
            </div>
            <div className="flex flex-wrap gap-1">
              {record.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="text-purple-300">#{tag}</span>
              ))}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// Glowing connection line
function GalaxyConnection({
  start,
  end,
  isHighlighted
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  isHighlighted: boolean;
}) {
  const points = useMemo(() => [start, end], [start, end]);

  // Calculate midpoint for curve
  const midPoint = useMemo(() => {
    return new THREE.Vector3(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2 + 0.5,
      (start.z + end.z) / 2
    );
  }, [start, end]);

  return (
    <Line
      points={[start, end]}
      color={isHighlighted ? '#ff69b4' : '#9c27b0'}
      lineWidth={isHighlighted ? 1.5 : 0.3}
      transparent
      opacity={isHighlighted ? 0.6 : 0.15}
    />
  );
}

// Beautiful star field background
function GalaxyStarField() {
  const count = 2000;
  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Distribute in a large sphere
      const radius = 20 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);

      // Warm colors for galaxy feel
      const colorChoice = Math.random();
      if (colorChoice < 0.3) {
        // Pink
        col[i * 3] = 1; col[i * 3 + 1] = 0.4; col[i * 3 + 2] = 0.7;
      } else if (colorChoice < 0.6) {
        // Blue
        col[i * 3] = 0.4; col[i * 3 + 1] = 0.6; col[i * 3 + 2] = 1;
      } else {
        // White/warm
        col[i * 3] = 1; col[i * 3 + 1] = 0.9; col[i * 3 + 2] = 0.8;
      }
    }
    return [pos, col];
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

// Main 3D Scene
function GalaxyScene({
  records,
  positions,
  selectedId,
  onNodeClick
}: {
  records: GraphRecord[];
  positions: THREE.Vector3[];
  selectedId: number | null;
  onNodeClick: (record: GraphRecord) => void;
}) {
  // Calculate connections based on shared tags
  const connections = useMemo(() => {
    const conns: { start: THREE.Vector3; end: THREE.Vector3; isHighlighted: boolean }[] = [];

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const tags1 = records[i].tags || [];
        const tags2 = records[j].tags || [];
        const common = tags1.filter(t => tags2.includes(t));

        if (common.length > 0) {
          const isHighlighted = selectedId !== null &&
            (records[i].id === selectedId || records[j].id === selectedId);
          conns.push({
            start: positions[i],
            end: positions[j],
            isHighlighted
          });
        }
      }
    }
    return conns;
  }, [records, positions, selectedId]);

  return (
    <>
      {/* Ambient lighting for soft glow */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={1} color="#ff69b4" />
      <pointLight position={[15, 15, 15]} intensity={0.5} color="#4169e1" />
      <pointLight position={[-15, -10, -15]} intensity={0.3} color="#ff1493" />

      {/* Background */}
      <GalaxyStarField />

      {/* Connections */}
      {connections.map((conn, i) => (
        <GalaxyConnection
          key={i}
          start={conn.start}
          end={conn.end}
          isHighlighted={conn.isHighlighted}
        />
      ))}

      {/* Galaxy nodes */}
      {records.map((record, index) => (
        <GalaxyNode
          key={record.id}
          record={record}
          position={positions[index]}
          isSelected={selectedId === record.id}
          onClick={() => onNodeClick(record)}
        />
      ))}

      {/* Camera controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.03}
        minDistance={3}
        maxDistance={25}
        autoRotate={true}
        autoRotateSpeed={0.3}
      />
    </>
  );
}

// Main Component
export default function Diary3DGraph({
  records,
  onNodeClick,
  onTagClick,
  deviceId: propDeviceId
}: Diary3DGraphProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | '7d' | '30d'>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [playingTTS, setPlayingTTS] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 获取设备ID
  const deviceId = propDeviceId || localStorage.getItem('coupleDeviceId') || 'couple_memory_001';

  // TTS 朗读功能 - 使用克隆的声音
  const playTTS = useCallback(async (text: string, author?: string) => {
    if (playingTTS) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingTTS(false);
      return;
    }

    setPlayingTTS(true);
    try {
      // 根据作者选择声音类型，默认用她的声音
      const voiceType = (author === 'him') ? 'his' : 'her';

      const res = await fetch('/api/voice-clone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceType, deviceId })
      });
      const data = await res.json();

      if (data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        audioRef.current = audio;
        audio.onended = () => setPlayingTTS(false);
        audio.onerror = () => setPlayingTTS(false);
        await audio.play();
      } else {
        console.error('TTS failed:', data.error);
        setPlayingTTS(false);
      }
      console.error('TTS error:', error);
      setPlayingTTS(false);
    }
  }, [playingTTS]);

  // Calculate galaxy positions
  const positions = useMemo(() => calculateGalaxyPositions(records), [records]);

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    records.forEach(r => r.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [records]);

  // Filter records
  const filteredRecords = useMemo(() => {
    let filtered = records;

    if (timeFilter !== 'all') {
      const days = timeFilter === '7d' ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = filtered.filter(r => new Date(r.created_at) >= cutoff);
    }

    if (selectedTag) {
      filtered = filtered.filter(r => r.tags?.includes(selectedTag));
    }

    return filtered;
  }, [records, timeFilter, selectedTag]);

  const handleNodeClick = useCallback((record: GraphRecord) => {
    setSelectedId(prev => prev === record.id ? null : record.id);
    onNodeClick?.(record);
  }, [onNodeClick]);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTag(prev => prev === tag ? null : tag);
    onTagClick?.(tag);
  }, [onTagClick]);

  const selectedRecord = selectedId ? records.find(r => r.id === selectedId) : null;

  return (
    <div className="w-full h-screen relative" style={{
      background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f23 50%, #050510 100%)'
    }}>
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 space-y-3">
        <div className="bg-black/70 backdrop-blur-md rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-2">时间筛选</div>
          <div className="flex gap-1">
            {['7d', '30d', 'all'].map(v => (
              <button key={v} onClick={() => setTimeFilter(v as typeof timeFilter)}
                className={`px-3 py-1 rounded-lg text-xs ${timeFilter === v ? 'bg-pink-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                {v === '7d' ? '7天' : v === '30d' ? '30天' : '全部'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-black/70 backdrop-blur-md rounded-xl p-3 max-w-[200px]">
          <div className="text-xs text-gray-400 mb-2">标签筛选</div>
          <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
            {allTags.slice(0, 20).map(tag => (
              <button key={tag} onClick={() => handleTagClick(tag)}
                className={`px-2 py-1 rounded-full text-xs ${selectedTag === tag ? 'bg-purple-500 text-white' : 'bg-purple-900/50 text-purple-300'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => { setSelectedId(null); setSelectedTag(null); setTimeFilter('all'); }}
          className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm">
          重置视图
        </button>
      </div>

      {/* Stats */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/70 backdrop-blur-md rounded-xl p-3 text-white text-sm">
        <span className="text-pink-400">{filteredRecords.length}</span> 条记录 |
        <span className="text-purple-400 ml-2">{allTags.length}</span> 个标签
      </div>

      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 5, 15], fov: 60 }} gl={{ antialias: true }}>
        <GalaxyScene
          records={filteredRecords}
          positions={positions}
          selectedId={selectedId}
          onNodeClick={handleNodeClick}
        />
      </Canvas>

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl p-6 max-w-sm w-full border border-pink-500/30 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-pink-400 text-sm">{new Date(selectedRecord.created_at).toLocaleString('zh-CN')}</div>
                <span className={`px-2 py-1 rounded-full text-xs text-white mt-1 inline-block ${selectedRecord.author === 'him' ? 'bg-blue-500' : 'bg-rose-500'}`}>
                  {selectedRecord.author === 'him' ? '👦 他' : '👧 她'}
                </span>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {/* Record images - clickable */}
            {(selectedRecord.image_urls || selectedRecord.image_url) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedRecord.image_urls?.map((url, idx) => (
                  <button key={idx} onClick={() => setSelectedImage(url)} className="relative group">
                    <img src={url} alt="" className="w-full max-h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition rounded-lg flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-xl">🔍</span>
                    </div>
                  </button>
                )) || (selectedRecord.image_url && (
                  <button onClick={() => setSelectedImage(selectedRecord.image_url!)} className="relative group">
                    <img src={selectedRecord.image_url} alt="" className="w-full max-h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition rounded-lg flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-xl">🔍</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="text-white text-sm mb-3">{selectedRecord.content}</p>

            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => playTTS(selectedRecord.content, selectedRecord.author)}
                disabled={playingTTS}
                className="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-full text-xs flex items-center gap-1 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50"
              >
                {playingTTS ? '🔊 播放中...' : '🔊 朗读'}
              </button>
            </div>

            {selectedRecord.tags && selectedRecord.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedRecord.tags.map((tag, i) => (
                  <button key={i} onClick={() => handleTagClick(tag)} className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded-full text-xs">
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
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
