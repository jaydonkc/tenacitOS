'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Box } from '@react-three/drei';
import type { Mesh } from 'three';
import type { AgentConfig, AgentState } from './agentsConfig';
import VoxelChair from './VoxelChair';
import VoxelKeyboard from './VoxelKeyboard';
import VoxelMacMini from './VoxelMacMini';

interface AgentDeskViewProps {
  agent: AgentConfig;
  state?: AgentState;
  onClick: () => void;
  isSelected: boolean;
}

export default function AgentDeskView({ agent, state, onClick, isSelected }: AgentDeskViewProps) {
  const status: AgentState['status'] = state?.status ?? 'idle';
  const model = state?.model;
  const deskRef = useRef<Mesh>(null);
  const monitorRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((frameState) => {
    if (monitorRef.current && status === 'thinking') {
      monitorRef.current.scale.setScalar(1 + Math.sin(frameState.clock.elapsedTime * 2) * 0.05);
    }
  });

  const statusColor =
    status === 'working'
      ? '#22c55e'
      : status === 'thinking'
      ? '#3b82f6'
      : status === 'error'
      ? '#ef4444'
      : '#6b7280';

  const monitorEmissive =
    status === 'working'
      ? '#15803d'
      : status === 'thinking'
      ? '#1e40af'
      : status === 'error'
      ? '#991b1b'
      : '#374151';

  return (
    <group position={agent.position}>
      <Box
        ref={deskRef}
        args={[2, 0.1, 1.5]}
        position={[0, 0.75, 0]}
        castShadow
        receiveShadow
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={hovered || isSelected ? agent.color : '#8B4513'}
          emissive={hovered || isSelected ? agent.color : '#000000'}
          emissiveIntensity={hovered || isSelected ? 0.2 : 0}
        />
      </Box>

      <Box
        ref={monitorRef}
        args={[1.2, 0.8, 0.05]}
        position={[0, 1.5, -0.5]}
        castShadow
        onClick={onClick}
      >
        <meshStandardMaterial
          color={statusColor}
          emissive={monitorEmissive}
          emissiveIntensity={status === 'idle' ? 0.1 : 0.5}
        />
      </Box>

      <Box args={[0.1, 0.4, 0.1]} position={[0, 1, -0.5]} castShadow>
        <meshStandardMaterial color="#2d2d2d" />
      </Box>

      <VoxelKeyboard position={[0, 0.81, 0.2]} rotation={[0, 0, 0]} />
      <VoxelMacMini position={[0.5, 0.825, -0.5]} />

      <group scale={2}>
        <VoxelChair
          position={[0, 0, 0.9]}
          rotation={[0, Math.PI, 0]}
          color="#1f2937"
        />
      </group>

      <Text
        position={[0, 2.5, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {agent.emoji} {agent.name}
      </Text>

      <Text
        position={[0, 2.2, 0]}
        fontSize={0.1}
        color={statusColor}
        anchorX="center"
        anchorY="middle"
      >
        {status.toUpperCase()}
        {model && ` • ${model}`}
      </Text>

      {[-0.8, 0.8].map((x, i) =>
        [-0.6, 0.6].map((z, j) => (
          <Box
            key={`leg-${i}-${j}`}
            args={[0.05, 0.7, 0.05]}
            position={[x, 0.35, z]}
            castShadow
          >
            <meshStandardMaterial color="#5d4037" />
          </Box>
        ))
      )}

      {isSelected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.5, 32]} />
          <meshBasicMaterial color={agent.color} transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
}
