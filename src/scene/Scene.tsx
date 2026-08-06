import { OrbitControls, Html } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { GraphData } from '../graph/build';
import type { LayoutBand } from '../graph/layout.worker';
import { useStore, type LayoutResult } from '../state/store';
import { Graph } from './Graph';

/** Below this the viewport is a phone held upright. */
const NARROW = 860;

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
  // Framing moves the camera, so it must happen when the graph changes and at
  // no other time. Anything else — a resize, a re-render behind a hover —
  // would yank the view back and undo whatever the viewer was looking at.
  const framed = useRef<LayoutResult>(undefined);
  useEffect(() => {
    if (framed.current === layout) return;
    framed.current = layout;
    const vertical = Math.tan((camera.fov * Math.PI) / 360);
    const aspect = Math.max(size.width / size.height, 0.4);
    // Labels sit above their nodes, so the top of the graph is not the top of
    // what has to be on screen.
    const fitHeight = (layout.height / 2 / vertical) * 1.32;
    // A phone has no sidebar over the canvas, so the graph gets the full width
    // and needs far less horizontal padding than a desktop window does.
    const sidePadding = size.width < NARROW ? 1.12 : 1.55;
    const fitWidth = (layout.radius / (vertical * aspect)) * sidePadding;
    const distance = Math.max(fitHeight, fitWidth, 60);
    camera.position.set(distance * 0.3, layout.height * 0.16, distance * 0.94);
    void size.height;
    camera.near = 0.5;
    camera.far = distance * 14;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [layout, camera, controls, size]);
  return null;
}

/**
 * A faint ring at each generation, numbered at the rim.
 *
 * Without them the layers read as one continuous cloud, and there is no way to
 * tell whether a narrator sits three links from the Prophet or six — which is
 * most of what the vertical axis is for.
 */
function Generations({ bands }: { bands: LayoutBand[] }) {
  const width = useThree((state) => state.size.width);
  // The bottom band is not a generation and must not be numbered as one: it
  // holds the compilers whose chains quote a book instead of a teacher, placed
  // by when they died because nothing else in the corpus reaches them.
  const lateBand = useStore((s) => s.manifest?.lateBand);
  const rings = useMemo(() => {
    const segments = 96;
    return bands.map((band) => {
      const points = new Float32Array((segments + 1) * 3);
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points[i * 3] = Math.cos(angle) * band.radius;
        points[i * 3 + 1] = band.y;
        points[i * 3 + 2] = Math.sin(angle) * band.radius;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
      return { band, geometry };
    });
  }, [bands]);

  useEffect(() => () => rings.forEach(({ geometry }) => geometry.dispose()), [rings]);

  return (
    <>
      {rings.map(({ band, geometry }) => (
        <group key={band.gen}>
          <line>
            <primitive object={geometry} attach="geometry" />
            <lineBasicMaterial color="#8ea2c8" transparent opacity={0.09} depthWrite={false} />
          </line>
          {/* On a phone these run off the edge and cover the graph; the rings
              still show the layering, and a narrator's generation is in the
              panel when you open him. */}
          {width >= NARROW ? (
            <Html
              position={[band.radius * 1.02, band.y, 0]}
              zIndexRange={[10, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="band-label">
                <span className="band-label__gen">
                  {band.gen === 0
                    ? 'the Prophet ﷺ'
                    : band.gen === lateBand
                      ? 'later than the chains reach'
                      : `generation ${band.gen}`}
                </span>
                {band.gen > 0 ? (
                  <span className="band-label__n">{band.count.toLocaleString()}</span>
                ) : null}
              </div>
            </Html>
          ) : null}
        </group>
      ))}
    </>
  );
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
  const width = useThree((state) => state.size.width);

  // Ranking is over every node, so it must not be redone on each hover.
  const ranked = useMemo(() => {
    // A dozen Arabic names is readable across a desktop window and a wall of
    // overlapping text on a phone.
    const most = width < NARROW ? 5 : 12;
    const order = Array.from(graph.ids.keys());
    order.sort((a, b) => graph.weight[b] - graph.weight[a]);
    return order.slice(0, graph.ids.length > 60 ? most : graph.ids.length);
  }, [graph, width]);

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
        // Sit the name just clear of its own node rather than a fixed distance
        // above the layer. The gap used to be a share of the space between
        // generations, which on a busy layer left a name floating far enough
        // from its node that it read as belonging to something else — and it
        // ignored how large the node is, so the biggest transmitters, whose
        // names matter most, were the furthest from theirs.
        //
        // Mirrors the radius the renderer gives each node, plus a little air.
        const radius = layout.spacing * 0.16 * (1 + Math.log1p(graph.weight[i]) * 0.32);
        // Neighbours in a layer sit close enough that their labels would still
        // collide, so keep a small stagger — much smaller than the old one,
        // which was doing the work of both jobs at once.
        const lift = radius * 1.05 + layout.spacing * (0.03 + (n % 3) * 0.07);
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
              {emphasis ? (
                <span className="node-label__meta">
                  {entry?.en ? `${entry.en} · ` : ''}
                  {graph.gen[i] === 0 ? 'the origin' : `generation ${graph.gen[i]}`}
                  {entry?.d ? ` · d. ${entry.d} AH` : ''}
                </span>
              ) : null}
            </div>
          </Html>
        );
      })}
    </>
  );
}

export function Scene() {
  // The paired graph and layout, never one without the other.
  const scene = useStore((s) => s.scene);
  const hover = useStore((s) => s.hover);
  const focus = useStore((s) => s.focus);
  const setHover = useStore((s) => s.setHover);
  const setFocus = useStore((s) => s.setFocus);
  const openMenu = useStore((s) => s.openMenu);
  const closeMenu = useStore((s) => s.closeMenu);
  const controls = useRef<OrbitControlsImpl>(null);

  const graph = scene?.graph;
  const layout = scene?.layout;
  // The store only ever pairs a layout with the graph it was computed for, so
  // the counts agreeing is a restatement of that. It is checked here rather
  // than trusted because the failure has no floor: indices still resolve, so
  // every narrator would simply be drawn at someone else's coordinates — and
  // where the two disagree on how many there are, drawing nothing for a frame
  // is recoverable in a way that throwing out of the render is not. A thrown
  // error unmounts the canvas, and the WebGL context goes with it.
  const ready =
    graph && layout && graph.ids.length > 0 && layout.positions.length === graph.ids.length * 3;

  return (
    <Canvas
      className="scene"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 48, position: [0, 30, 150] }}
      onPointerMissed={() => {
        setFocus(undefined);
        closeMenu();
      }}
      // Right-clicking empty space should not offer to save the canvas as an
      // image; the menu on a node handles its own.
      onContextMenu={(event: React.MouseEvent) => event.preventDefault()}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[40, 90, 60]} intensity={1.1} />
      <directionalLight position={[-60, -30, -40]} intensity={0.4} color="#6f8bd0" />
      <Dust />

      {ready ? (
        <>
          <Framing layout={layout} controls={controls} />
          <Generations bands={layout.bands} />
          <Graph
            graph={graph}
            layout={layout}
            hover={hover}
            focus={focus}
            onHover={setHover}
            onSelect={setFocus}
            onMenu={openMenu}
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
