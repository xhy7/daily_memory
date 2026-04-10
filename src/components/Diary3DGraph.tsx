'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
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
}

// Generate positions in 3D space
function calculatePositions(records: GraphRecord[], radius: number = 8) {
  return records.map((_, index) => {
    const phi = Math.acos(-1 + (2 * index) / records.length);
    const theta = Math.sqrt(records.length * Math.PI) * phi;

    return new THREE.Vector3(
      radius * Math.cos(theta) * Math.sin(phi),
      radius * Math.sin(theta) * Math.sin(phi),
      radius * Math.cos(phi)
    );
  });
}

// Node Component
function GraphNode({
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
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const size = 0.3 + Math.min((record.content?.length || 0) / 300, 0.5);
  const nodeColor = record.author === 'him' ? '#4a90d9' : '#e91e63';

  return (
    <group position={position}>
      <Sphere
        ref={meshRef}
        args={[hovered || isSelected ? size * 1.3 : size, 24, 24]}
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
          color={nodeColor}
          emissive={nodeColor}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0.2}
          transparent
          opacity={1}
          roughness={0.4}
          metalness={0.3}
        />
      </Sphere>

      {hovered && record.tags && record.tags.length > 0 && (
        <Html position={[0, size + 0.4, 0]} center>
          <div className="bg-black/90 text-white px-2 py-1 rounded-lg text-xs whitespace-nowrap pointer-events-none">
            <div className="text-pink-300 font-medium">
              {new Date(record.created_at).toLocaleDateString('zh-CN')}
            </div>
            <div className="flex gap-1 mt-1">
              {record.tags.slice(0, 2).map((tag, i) => (
                <span key={i} className="text-purple-300">#{tag}</span>
              ))}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// Connection Line
function ConnectionLine({
  start,
  end,
  isHighlighted
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  isHighlighted: boolean;
}) {
  const points = useMemo(() => [start, end], [start, end]);

  return (
    <Line
      points={points}
      color={isHighlighted ? '#ff69b4' : '#9c27b0'}
      lineWidth={isHighlighted ? 1.5 : 0.3}
      transparent
      opacity={isHighlighted ? 0.7 : 0.2}
    />
  );
}

// Star Field Background
function StarField() {
  const count = 1500;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    return pos;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#ffffff" transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

// Main 3D Scene
function Scene({
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
  const connections = useMemo(() => {
    const conns: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const tags1 = records[i].tags || [];
        const tags2 = records[j].tags || [];
        if (tags1.some(t => tags2.includes(t))) {
          conns.push({ start: positions[i], end: positions[j] });
        }
      }
    }
    return conns;
  }, [records, positions]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.4} color="#ff69b4" />

      <StarField />

      {connections.map((conn, i) => {
        const isHighlighted = selectedId !== null &&
          (records.some(r => r.id === selectedId && r.tags?.some(t => records.find(p => positions.indexOf(conn.start) >= 0)?.tags?.includes(t))) ||
           records.some(r => r.id === selectedId && r.tags?.some(t => records.find(p => positions.indexOf(conn.end) >= 0)?.tags?.includes(t))));
        return <ConnectionLine key={i} start={conn.start} end={conn.end} isHighlighted={isHighlighted} />;
      })}

      {records.map((record, index) => (
        <GraphNode
          key={record.id}
          record={record}
          position={positions[index]}
          isSelected={selectedId === record.id}
          onClick={() => onNodeClick(record)}
        />
      ))}

      <OrbitControls enableDamping dampingFactor={0.05} minDistance={4} maxDistance={20} />
    </>
  );
}

// Main Component
export default function Diary3DGraph({
  records,
  onNodeClick,
  onTagClick
}: Diary3DGraphProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | '7d' | '30d'>('all');

  const positions = useMemo(() => calculatePositions(records), [records]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    records.forEach(r => r.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [records]);

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
    <div className="w-full h-screen relative" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
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
          重置
        </button>
      </div>

      {/* Stats */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/70 backdrop-blur-md rounded-xl p-3 text-white text-sm">
        <span className="text-pink-400">{filteredRecords.length}</span> 条记录 |
        <span className="text-purple-400 ml-2">{allTags.length}</span> 个标签
      </div>

      {/* Help */}
      <div className="absolute bottom-4 right-4 z-10 bg-black/70 backdrop-blur-md rounded-xl p-3 text-gray-400 text-xs">
        拖拽旋转 | 滚轮缩放 | 点击查看
      </div>

      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 0, 12], fov: 60 }} gl={{ antialias: true }}>
        <Scene records={filteredRecords} positions={positions} selectedId={selectedId} onNodeClick={handleNodeClick} />
      </Canvas>

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl p-6 max-w-sm w-full border border-pink-500/30">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-pink-400 text-sm">{new Date(selectedRecord.created_at).toLocaleString('zh-CN')}</div>
                <span className={`px-2 py-1 rounded-full text-xs text-white mt-1 inline-block ${selectedRecord.author === 'him' ? 'bg-blue-500' : 'bg-rose-500'}`}>
                  {selectedRecord.author === 'him' ? '他' : '她'}
                </span>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            {selectedRecord.image_url && <img src={selectedRecord.image_url} alt="" className="w-full h-24 object-cover rounded-lg mb-3" />}
            <p className="text-white text-sm mb-3">{selectedRecord.content}</p>
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
    </div>
  );
}
