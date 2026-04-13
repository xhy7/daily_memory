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
}

// 预计算位置 - 使用对数螺旋分布解决节点重叠
function calculateGalaxyPositions(records: GraphRecord[], radius: number = 12) {
  const positions: THREE.Vector3[] = [];
  const numRecords = records.length;

  // 使用记录ID作为种子，确保每次渲染位置一致
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  // 对数螺旋参数 - 更高密度时分布更均匀
  const spiralFactor = 0.15; // 对数螺旋增长因子

  for (let i = 0; i < numRecords; i++) {
    const seed = records[i].id || i;
    // 对数螺旋角度：角度随索引对数增长，避免线性螺旋在高密度时的聚集问题
    const angle = (i / numRecords) * Math.PI * 20;
    // 对数螺旋半径：使用对数函数使半径增长放缓，节点分布更均匀
    const r = radius * Math.log(1 + i * spiralFactor);
    // 更大的垂直分散系数，减少上下重叠
    const verticalOffset = (seededRandom(seed + 2) - 0.5) * 4;
    // 基于内容长度调整节点基础尺寸，减少小球被大球遮挡
    const contentSize = Math.min((record.content?.length || 0) / 400, 0.5);
    const sizeFactor = 1 - contentSize * 0.3; // 内容越长，相对位置偏移越小

    positions.push(new THREE.Vector3(
      Math.cos(angle) * r + (seededRandom(seed + 3) - 0.5) * 2 * sizeFactor,
      verticalOffset,
      Math.sin(angle) * r + (seededRandom(seed + 4) - 0.5) * 2 * sizeFactor
    ));
  }

  return positions;
}

// 预计算颜色 - 避免每次渲染重新计算
const AUTHOR_COLORS = {
  him: { core: '#4a90d9', glow: '#87ceeb', halo: '#4169e1' },
  her: { core: '#ff69b4', glow: '#ffb6c1', halo: '#ff1493' }
};

// 优化的Galaxy Node - 减少几何体分段数，支持高亮关联节点
function GalaxyNode({
  record,
  position,
  isSelected,
  isRelated,
  onClick
}: {
  record: GraphRecord;
  position: THREE.Vector3;
  isSelected: boolean;
  isRelated: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const authorColor = record.author === 'him' ? AUTHOR_COLORS.him : AUTHOR_COLORS.her;
  const baseSize = 0.25 + Math.min((record.content?.length || 0) / 400, 0.5);
  const size = hovered || isSelected ? baseSize * 1.5 : baseSize;

  // 非选中且非关联节点降低透明度
  const dimmed = !isSelected && !isRelated;
  const opacity = dimmed ? 0.4 : 0.9;

  // 使用useMemo缓存几何体参数，减少重建
  const sphereArgs = useMemo(() => [size, 16, 16], [size]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.003;
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
    if (coreRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
      coreRef.current.scale.setScalar(size * pulse);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 简化的halo - 非选中时减少分段数 */}
      <Sphere args={[size * 2, isSelected ? 16 : 8, isSelected ? 16 : 8]}>
        <meshBasicMaterial
          color={authorColor.glow}
          transparent
          opacity={hovered || isSelected ? 0.15 : 0.03}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* 核心球体 - 选中时增加细节 */}
      <Sphere
        ref={coreRef}
        args={[size, isSelected ? 32 : 24, isSelected ? 32 : 24]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial
          color={authorColor.core}
          emissive={authorColor.core}
          emissiveIntensity={hovered || isSelected ? 1.5 : isRelated ? 1.0 : 0.6}
          transparent
          opacity={opacity}
          roughness={0.2}
          metalness={0.5}
        />
      </Sphere>

      {/* 选中时的环 */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.8, size * 2, 24]} />
          <meshBasicMaterial color={authorColor.glow} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 关联节点发光效果 */}
      {isRelated && !isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size * 1.5, size * 1.7, 24]} />
          <meshBasicMaterial color="#e91e63" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 悬停提示 - 简化渲染 */}
      {hovered && record.tags && record.tags.length > 0 && (
        <Html position={[0, size + 0.6, 0]} center>
          <div className="bg-black/90 text-white px-2 py-1 rounded-lg text-xs whitespace-nowrap pointer-events-none">
            <div className="text-pink-300 text-center mb-1">
              {new Date(record.created_at).toLocaleDateString('zh-CN')}
            </div>
            <div className="flex flex-wrap gap-1 justify-center">
              {record.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="text-purple-300 text-[10px]">#{tag}</span>
              ))}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// 连接线 - 优化的发光连线效果
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
  const midPoint = useMemo(() => {
    return new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  }, [start, end]);

  // 发光核心颜色
  const coreColor = isHighlighted ? '#ff69b4' : '#ce93d8';
  // 外发光颜色
  const glowColor = isHighlighted ? '#e91e63' : '#7b1fa2';

  return (
    <group>
      {/* 外发光层 - 更粗更透明 */}
      <Line
        points={points}
        color={glowColor}
        lineWidth={isHighlighted ? 4 : 2.5}
        transparent
        opacity={isHighlighted ? 0.25 : 0.12}
      />
      {/* 中层发光 */}
      <Line
        points={points}
        color={coreColor}
        lineWidth={isHighlighted ? 2 : 1}
        transparent
        opacity={isHighlighted ? 0.5 : 0.3}
      />
      {/* 核心亮线 */}
      <Line
        points={points}
        color={isHighlighted ? '#ffffff' : '#e1bee7'}
        lineWidth={isHighlighted ? 1 : 0.4}
        transparent
        opacity={isHighlighted ? 0.9 : 0.5}
      />
      {/* 中点发光球体 - 增强连接感 */}
      <mesh position={midPoint}>
        <sphereGeometry args={[isHighlighted ? 0.08 : 0.04, 8, 8]} />
        <meshBasicMaterial color={coreColor} transparent opacity={isHighlighted ? 0.8 : 0.4} />
      </mesh>
    </group>
  );
}

// 优化的星空背景 - 使用useMemo缓存
function GalaxyStarField() {
  const starField = useMemo(() => {
    const count = 1500; // 减少星星数量
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const radius = 25 + Math.random() * 25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);

      const colorChoice = Math.random();
      if (colorChoice < 0.3) {
        col[i * 3] = 1; col[i * 3 + 1] = 0.4; col[i * 3 + 2] = 0.7;
      } else if (colorChoice < 0.6) {
        col[i * 3] = 0.4; col[i * 3 + 1] = 0.6; col[i * 3 + 2] = 1;
      } else {
        col[i * 3] = 1; col[i * 3 + 1] = 0.9; col[i * 3 + 2] = 0.8;
      }
    }
    return { positions: pos, colors: col, count };
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={starField.count} array={starField.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={starField.count} array={starField.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.12} vertexColors transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

// 主3D场景 - 优化连接线计算，支持关联节点高亮
function GalaxyScene({
  records,
  positions,
  selectedId,
  onNodeClick,
  showConnections
}: {
  records: GraphRecord[];
  positions: THREE.Vector3[];
  selectedId: number | null;
  onNodeClick: (record: GraphRecord) => void;
  showConnections: boolean;
}) {
  // 计算关联节点ID集合（共享相同tag的节点）
  const relatedIds = useMemo(() => {
    if (!selectedId) return new Set<number>();

    const selectedRecord = records.find(r => r.id === selectedId);
    if (!selectedRecord || !selectedRecord.tags) return new Set<number>();

    const related = new Set<number>();
    records.forEach(record => {
      if (record.id !== selectedId && record.tags) {
        const hasCommonTag = record.tags.some(tag => selectedRecord.tags!.includes(tag));
        if (hasCommonTag) {
          related.add(record.id);
        }
      }
    });
    return related;
  }, [records, selectedId]);

  // 使用Map优化连接线计算 - 连接所有具有相同tag的节点
  const connections = useMemo(() => {
    const conns: { start: THREE.Vector3; end: THREE.Vector3; isHighlighted: boolean }[] = [];
    const tagToIndices = new Map<string, number[]>();

    records.forEach((record, idx) => {
      (record.tags || []).forEach(tag => {
        const indices = tagToIndices.get(tag) || [];
        indices.push(idx);
        tagToIndices.set(tag, indices);
      });
    });

    const processed = new Set<string>();
    tagToIndices.forEach((indices) => {
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const idx1 = indices[i];
          const idx2 = indices[j];
          const key = idx1 < idx2 ? `${idx1}-${idx2}` : `${idx2}-${idx1}`;

          if (!processed.has(key)) {
            processed.add(key);
            const isHighlighted = selectedId !== null &&
              (records[idx1].id === selectedId || records[idx2].id === selectedId);
            conns.push({
              start: positions[idx1],
              end: positions[idx2],
              isHighlighted
            });
          }
        }
      }
    });

    return conns;
  }, [records, positions, selectedId]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={1} color="#ff69b4" />
      <pointLight position={[15, 15, 15]} intensity={0.5} color="#4169e1" />

      <GalaxyStarField />

      {/* 只在 showConnections 为 true 时渲染连线 */}
      {showConnections && connections.map((conn, i) => (
        <GalaxyConnection key={i} start={conn.start} end={conn.end} isHighlighted={conn.isHighlighted} />
      ))}

      {records.map((record, index) => (
        <GalaxyNode
          key={record.id}
          record={record}
          position={positions[index]}
          isSelected={selectedId === record.id}
          isRelated={relatedIds.has(record.id)}
          onClick={() => onNodeClick(record)}
        />
      ))}

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

// 主组件
export default function Diary3DGraph({
  records,
  onNodeClick,
  onTagClick
}: Diary3DGraphProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | '7d' | '30d'>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showConnections, setShowConnections] = useState(true);
  // 移动端筛选面板状态
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // 详情抽屉状态
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);

  // 预计算位置
  const positions = useMemo(() => calculateGalaxyPositions(records), [records]);

  // 提取所有标签
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    records.forEach(r => r.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [records]);

  // 过滤记录
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

  // 对应的位置
  const filteredPositions = useMemo(() => {
    const ids = new Set(filteredRecords.map(r => r.id));
    return positions.filter((_, idx) => ids.has(records[idx].id));
  }, [filteredRecords, records, positions]);

  const handleNodeClick = useCallback((record: GraphRecord) => {
    const newSelectedId = selectedId === record.id ? null : record.id;
    setSelectedId(newSelectedId);
    if (newSelectedId) {
      setShowDetailDrawer(false); // 重置详情抽屉状态，点击节点时只显示预览
    }
    onNodeClick?.(record);
  }, [selectedId, onNodeClick]);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTag(prev => prev === tag ? null : tag);
    onTagClick?.(tag);
  }, [onTagClick]);

  const selectedRecord = selectedId ? records.find(r => r.id === selectedId) : null;

  // 计算选中节点的位置用于预览气泡
  const selectedPosition = useMemo(() => {
    if (!selectedId) return null;
    const idx = filteredRecords.findIndex(r => r.id === selectedId);
    return idx >= 0 ? filteredPositions[idx] : null;
  }, [selectedId, filteredRecords, filteredPositions]);

  return (
    <div className="w-full h-screen relative" style={{
      background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f23 50%, #050510 100%)'
    }}>
      {/* 移动端 hamburger 按钮 */}
      <button
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-black/70 backdrop-blur-md rounded-lg text-white"
        onClick={() => setIsFilterOpen(true)}
      >
        ☰
      </button>

      {/* 移动端筛选面板抽屉 */}
      <div className={`md:hidden fixed top-0 left-0 h-full w-[280px] bg-gray-900/95 backdrop-blur-md z-30 transform transition-transform duration-300 ${isFilterOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* 抽屉头部 */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <span className="text-white font-medium">筛选</span>
          <button onClick={() => setIsFilterOpen(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* 抽屉内容 */}
        <div className="p-4 space-y-4">
          <div className="bg-black/30 rounded-xl p-3">
            <div className="text-xs text-gray-400 mb-2">时间筛选</div>
            <div className="flex gap-1">
              {(['7d', '30d', 'all'] as const).map(v => (
                <button key={v} onClick={() => setTimeFilter(v)}
                  className={`px-3 py-1 rounded-lg text-xs ${timeFilter === v ? 'bg-pink-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                  {v === '7d' ? '7天' : v === '30d' ? '30天' : '全部'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-black/30 rounded-xl p-3">
            <div className="text-xs text-gray-400 mb-2">标签筛选</div>
            <div className="flex flex-wrap gap-1 max-h-[200px] overflow-y-auto">
              {allTags.slice(0, 20).map(tag => (
                <button key={tag} onClick={() => handleTagClick(tag)}
                  className={`px-2 py-1 rounded-full text-xs ${selectedTag === tag ? 'bg-purple-500 text-white' : 'bg-purple-900/50 text-purple-300'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => { setSelectedId(null); setSelectedTag(null); setTimeFilter('all'); setShowDetailDrawer(false); }}
            className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm">
            重置视图
          </button>

          <button
            onClick={() => setShowConnections(prev => !prev)}
            className={`w-full px-4 py-2 rounded-lg text-sm transition ${
              showConnections
                ? 'bg-purple-600 hover:bg-purple-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {showConnections ? '🔗 隐藏标签连线' : '🔗 显示标签连线'}
          </button>
        </div>
      </div>

      {/* 移动端抽屉遮罩 */}
      {isFilterOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-20"
          onClick={() => setIsFilterOpen(false)}
        />
      )}

      {/* 桌面端 Controls - 默认显示 */}
      <div className="hidden md:block absolute top-4 left-4 z-10 space-y-3">
        <div className="bg-black/70 backdrop-blur-md rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-2">时间筛选</div>
          <div className="flex gap-1">
            {(['7d', '30d', 'all'] as const).map(v => (
              <button key={v} onClick={() => setTimeFilter(v)}
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

        <button onClick={() => { setSelectedId(null); setSelectedTag(null); setTimeFilter('all'); setShowDetailDrawer(false); }}
          className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm">
          重置视图
        </button>

        <button
          onClick={() => setShowConnections(prev => !prev)}
          className={`w-full px-4 py-2 rounded-lg text-sm transition ${
            showConnections
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {showConnections ? '🔗 隐藏标签连线' : '🔗 显示标签连线'}
        </button>
      </div>

      {/* Stats */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/70 backdrop-blur-md rounded-xl p-3 text-white text-sm">
        <span className="text-pink-400">{filteredRecords.length}</span> 条记录 |
        <span className="text-purple-400 ml-2">{allTags.length}</span> 个标签
      </div>

      {/* 3D Canvas - 根据是否显示详情抽屉调整宽度 */}
      <div className={`absolute inset-0 transition-all duration-300 ${showDetailDrawer ? 'sm:right-[400px]' : ''}`}>
        <Canvas camera={{ position: [0, 5, 15], fov: 60 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <GalaxyScene
            records={filteredRecords}
            positions={filteredPositions}
            selectedId={selectedId}
            onNodeClick={handleNodeClick}
            showConnections={showConnections}
          />

          {/* 选中节点的预览气泡 */}
          {selectedRecord && selectedPosition && !showDetailDrawer && (
            <group position={selectedPosition}>
              <Html position={[0, 1.5, 0]} center>
                <div className="bg-black/90 backdrop-blur-md rounded-xl p-3 max-w-[200px] border border-pink-500/30">
                  <div className="text-xs text-gray-400 mb-1">{selectedRecord.author === 'him' ? '👦 他' : '👧 她'}</div>
                  <p className="text-white text-xs line-clamp-3">{selectedRecord.content}</p>
                  <button
                    onClick={() => setShowDetailDrawer(true)}
                    className="mt-2 w-full px-3 py-1 bg-pink-500 text-white rounded-lg text-xs hover:bg-pink-400 transition"
                  >
                    查看详情 →
                  </button>
                </div>
              </Html>
            </group>
          )}
        </Canvas>
      </div>

      {/* 详情侧边抽屉 - 替代原来的居中Modal */}
      <div className={`fixed right-0 top-0 h-full w-full sm:w-[400px] bg-gray-900/95 backdrop-blur-md z-30 transform transition-transform duration-300 ${showDetailDrawer ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedRecord && (
          <div className="h-full flex flex-col">
            {/* 抽屉头部 */}
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <div>
                <div className="text-pink-400 text-sm">{new Date(selectedRecord.created_at).toLocaleString('zh-CN')}</div>
                <span className={`px-2 py-1 rounded-full text-xs text-white mt-1 inline-block ${selectedRecord.author === 'him' ? 'bg-blue-500' : 'bg-rose-500'}`}>
                  {selectedRecord.author === 'him' ? '👦 他' : '👧 她'}
                </span>
              </div>
              <button onClick={() => { setShowDetailDrawer(false); setSelectedId(null); }} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {/* 抽屉内容 */}
            <div className="flex-1 overflow-y-auto p-4">
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

              {selectedRecord.tags && selectedRecord.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedRecord.tags.map((tag, i) => (
                    <button key={i} onClick={() => handleTagClick(tag)} className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded-full text-xs hover:bg-purple-800/50 transition">
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Image Lightbox */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-4 right-4 text-white text-3xl hover:text-pink-400 transition" onClick={() => setSelectedImage(null)}>✕</button>
          <img src={selectedImage} alt="查看大图" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}