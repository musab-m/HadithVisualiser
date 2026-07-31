import { OrbitControls, Html } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { GraphData } from '../graph/build';
import { useStore, type LayoutResult } from '../state/store';
import { Graph } from './Graph';

/** A faint starfield, so the space around the chains does not read as empty. */
function Dust() {
  const geometry = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Rejection-free shell sampling: direction from a normal, radius cubed.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 420 + Math.random() * 460;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.6;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={1.6} color="#8ea2c8" transparent opacity={0.32} sizeAttenuation />
    </points>
  );
}

/**
 * Frame the graph whenever its extent changes. The graph is roughly a cylinder
 * of `radius` by `height`, so back off far enough for whichever of the two the
 * viewport is tighter on — the sidebar takes a third of the width, so the
 * horizontal fit is padded more than the vertical.
 */
function Framing({
  layout,
  controls,
}: {
  layout: LayoutResult;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera);
  const size = useThree((state) => state.size);
  useEffect(() => {
    const vertical = Math.tan((camera.fov * Math.PI) / 360);
    const aspect = Math.max(size.width / size.height, 0.4);
    // Labels sit above their nodes, so the top of the graph is not the top of
    // what has to be on screen.
    const fitHeight = (layout.height / 2 / vertical) * 1.32;
    const fitWidth = (layout.radius / (vertical * aspect)) * 1.55;
    const distance = Math.max(fitHeight, fitWidth, 60);
    camera.position.set(distance * 0.3, layout.height * 0.16, distance * 0.94);
    camera.near = 0.5;
    camera.far = distance * 14;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [layout, camera, controls, size]);
  return null;
}

interface LabelProps {
  graph: GraphData;
  layout: LayoutResult;
}

/**
 * Labels are expensive and clutter fast, so only the busiest transmitters get
 * a permanent one; everything else is named on hover.
 */
function Labels({ graph, layout }: LabelProps) {
  const narrators = useStore((s) => s.narrators);
  const hover = useStore((s) => s.hover);
  const focus = useStore((s) => s.focus);

  // Ranking is over every node, so it must not be redone on each hover.
  const ranked = useMemo(() => {
    const order = Array.from(graph.ids.keys());
    order.sort((a, b) => graph.weight[b] - graph.weight[a]);
    return order.slice(0, graph.ids.length > 60 ? 12 : graph.ids.length);
  }, [graph]);

  const shown = useMemo(() => {
    const picks = new Set(ranked);
    for (const id of [hover, focus]) {
      const at = id ? graph.index.get(id) : undefined;
      if (at !== undefined) picks.add(at);
    }
    return [...picks];
  }, [ranked, graph, hover, focus]);

  return (
    <>
      {shown.map((i, n) => {
        const id = graph.ids[i];
        const entry = narrators.get(id);
        const emphasis = id === hover || id === focus;
        // Neighbours in a layer sit close enough that their labels would
        // overlap; stagger the height so both stay readable.
        const lift = layout.spacing * (0.5 + (n % 3) * 0.34);
        return (
          <Html
            key={id}
            position={[
              layout.positions[i * 3],
              layout.positions[i * 3 + 1] + lift,
              layout.positions[i * 3 + 2],
            ]}
            center
            zIndexRange={[20, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className={`node-label${emphasis ? ' node-label--active' : ''}`}>
              <span className="node-label__ar">{entry?.ar ?? id}</span>
              {emphasis && entry?.en ? <span className="node-label__en">{entry.en}</span> : null}
            </div>
          </Html>
        );
      })}
    </>
  );
}

export function Scene() {
  const graph = useStore((s) => s.graph);
  const layout = useStore((s) => s.layout);
  const hover = useStore((s) => s.hover);
  const focus = useStore((s) => s.focus);
  const setHover = useStore((s) => s.setHover);
  const setFocus = useStore((s) => s.setFocus);
  const controls = useRef<OrbitControlsImpl>(null);

  const ready = graph && layout && graph.ids.length > 0;

  return (
    <Canvas
      className="scene"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 48, position: [0, 30, 150] }}
      onPointerMissed={() => setFocus(undefined)}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[40, 90, 60]} intensity={1.1} />
      <directionalLight position={[-60, -30, -40]} intensity={0.4} color="#6f8bd0" />
      <Dust />

      {ready ? (
        <>
          <Framing layout={layout} controls={controls} />
          <Graph
            graph={graph}
            layout={layout}
            hover={hover}
            focus={focus}
            onHover={setHover}
            onSelect={setFocus}
          />
          <Labels graph={graph} layout={layout} />
        </>
      ) : null}

      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        maxDistance={1600}
        minDistance={6}
      />
    </Canvas>
  );
}
