import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { NARRATOR_GRADES, GRADE_COLOR } from '../corpus/types';
import { LINK_BACKWARD, LINK_PEER, type GraphData } from '../graph/build';
import type { LayoutResult } from '../state/store';

interface Props {
  graph: GraphData;
  layout: LayoutResult;
  hover?: string;
  focus?: string;
  onHover: (id?: string) => void;
  onSelect: (id: string) => void;
}

const GRADE_COLORS = NARRATOR_GRADES.map((grade) => new THREE.Color(GRADE_COLOR[grade]));
const DIM = new THREE.Color('#1b2030');

/**
 * Links that do not run from an earlier generation to a later one get their own
 * colour rather than the grade gradient, because what is interesting about them
 * is the direction, not who the transmitters were.
 */
export const LINK_COLOR = {
  peer: '#b98cf0',
  backward: '#f0913c',
};
const PEER_COLOR = new THREE.Color(LINK_COLOR.peer);
const BACKWARD_COLOR = new THREE.Color(LINK_COLOR.backward);

/**
 * Additive glow behind each node. The quads are billboarded in the vertex
 * shader — a per-instance lookAt on the CPU would cost a full matrix rewrite
 * every frame, and the falloff is cheaper to evaluate than to sample.
 */
function glowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0.16 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vUv = uv;
        vTint = instanceColor;
        // Column 3 is the instance's translation, column 0's length its scale.
        vec3 centre = instanceMatrix[3].xyz;
        float scale = length(instanceMatrix[0].xyz);
        vec4 view = modelViewMatrix * vec4(centre, 1.0);
        view.xy += position.xy * scale;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vTint;
      uniform float uOpacity;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        // Two overlaid falloffs: a tight core and a wide, faint bloom.
        float core = smoothstep(1.0, 0.0, d);
        float halo = pow(core, 4.0);
        float a = (halo * 0.85 + core * 0.15) * uOpacity;
        if (a < 0.002) discard;
        gl_FragColor = vec4(vTint, a);
      }
    `,
  });
}

export function Graph({ graph, layout, hover, focus, onHover, onSelect }: Props) {
  const nodes = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const edgeGeometry = useRef<THREE.BufferGeometry>(null);
  const count = graph.ids.length;

  /**
   * three only declares the `instanceColor` attribute in a shader once the
   * mesh actually has one, and `setColorAt` creates it too late — the programs
   * are already compiled. Attach it as the mesh mounts.
   */
  const withColors = (ref: React.RefObject<THREE.InstancedMesh | null>) => (mesh: THREE.InstancedMesh | null) => {
    ref.current = mesh;
    if (mesh && !mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(mesh.count * 3).fill(1),
        3,
      );
    }
  };

  // The store pairs a layout with the graph it was built for, so this should
  // never trip. It is here because the failure is silent when it does: indices
  // still resolve, every narrator just draws at someone else's coordinates.
  if (layout.positions.length !== count * 3) {
    throw new Error(
      `layout has ${layout.positions.length / 3} positions for ${count} nodes`,
    );
  }

  const glow = useMemo(glowMaterial, []);
  useEffect(() => () => glow.dispose(), [glow]);

  /** Which nodes each node is linked to — drives the highlight. */
  const adjacency = useMemo(() => {
    const map = new Map<number, Set<number>>();
    const pairs = graph.edges.length / 2;
    for (let i = 0; i < pairs; i++) {
      const a = graph.edges[i * 2];
      const b = graph.edges[i * 2 + 1];
      (map.get(a) ?? map.set(a, new Set()).get(a)!).add(b);
      (map.get(b) ?? map.set(b, new Set()).get(b)!).add(a);
    }
    return map;
  }, [graph]);

  const radius = useMemo(() => {
    // Sized off the layout's own spacing so one chain and fifty thousand read
    // the same; the log keeps a narrator carrying 7,000 chains from swamping
    // one carrying three.
    const base = layout.spacing * 0.16;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = base * (1 + Math.log1p(graph.weight[i]) * 0.32);
    }
    return out;
  }, [graph, count, layout.spacing]);

  // --- static placement -----------------------------------------------------
  useEffect(() => {
    const mesh = nodes.current;
    const glow = halos.current;
    if (!mesh || !glow) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        layout.positions[i * 3],
        layout.positions[i * 3 + 1],
        layout.positions[i * 3 + 2],
      );
      dummy.scale.setScalar(radius[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(radius[i] * 4.5);
      dummy.updateMatrix();
      glow.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [layout, radius, count]);

  // --- edges ----------------------------------------------------------------
  const edgeData = useMemo(() => {
    const pairs = graph.edges.length / 2;
    // Additive blending means brightness accumulates with density. One hadith
    // and the whole corpus differ by four orders of magnitude in edge count,
    // so the per-edge contribution has to fall as the graph fills up.
    const density = Math.min(1, Math.max(0.22, 5000 / Math.max(pairs, 1)));
    const positions = new Float32Array(pairs * 6);
    const colors = new Float32Array(pairs * 6);
    for (let i = 0; i < pairs; i++) {
      const a = graph.edges[i * 2];
      const b = graph.edges[i * 2 + 1];
      for (let k = 0; k < 3; k++) {
        positions[i * 6 + k] = layout.positions[a * 3 + k];
        positions[i * 6 + 3 + k] = layout.positions[b * 3 + k];
      }
      // Fade with how well travelled the link is, so the trunk routes read
      // brightly and the one-off transmissions stay as background texture.
      const kind = graph.edgeKind[i];
      const base = Math.min(0.05 + Math.log1p(graph.edgeWeight[i]) * 0.075, 0.42);
      // Only a link running back up a generation gets a brightness floor, so it
      // survives the wash of ordinary transmission around it. Same-generation
      // links get the colour but not the emphasis: with generations bucketed to
      // whole numbers, plenty of them are two adjacent layers rounding together
      // rather than genuine transmission between contemporaries.
      const intensity =
        kind === LINK_BACKWARD
          ? Math.max(base, 0.26) * Math.max(density, 0.5)
          : base * density;
      const from =
        kind === LINK_PEER ? PEER_COLOR : kind === LINK_BACKWARD ? BACKWARD_COLOR : GRADE_COLORS[graph.grade[a]];
      const to =
        kind === LINK_PEER ? PEER_COLOR : kind === LINK_BACKWARD ? BACKWARD_COLOR : GRADE_COLORS[graph.grade[b]];
      colors[i * 6] = from.r * intensity;
      colors[i * 6 + 1] = from.g * intensity;
      colors[i * 6 + 2] = from.b * intensity;
      colors[i * 6 + 3] = to.r * intensity;
      colors[i * 6 + 4] = to.g * intensity;
      colors[i * 6 + 5] = to.b * intensity;
    }
    return { positions, colors, base: colors.slice() };
  }, [graph, layout]);

  useEffect(() => {
    const geometry = edgeGeometry.current;
    if (!geometry) return;
    geometry.setAttribute('position', new THREE.BufferAttribute(edgeData.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(edgeData.colors, 3));
    geometry.computeBoundingSphere();
  }, [edgeData]);

  // --- highlight ------------------------------------------------------------
  const active = focus ?? hover;
  useEffect(() => {
    const mesh = nodes.current;
    const glow = halos.current;
    const geometry = edgeGeometry.current;
    if (!mesh || !glow || !geometry) return;

    const activeIndex = active ? graph.index.get(active) : undefined;
    const near = activeIndex === undefined ? undefined : adjacency.get(activeIndex);
    const colour = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const base = GRADE_COLORS[graph.grade[i]];
      if (activeIndex === undefined) {
        colour.copy(base);
      } else if (i === activeIndex) {
        colour.copy(base).lerp(new THREE.Color('#ffffff'), 0.55);
      } else if (near?.has(i)) {
        colour.copy(base);
      } else {
        colour.copy(base).lerp(DIM, 0.87);
      }
      mesh.setColorAt(i, colour);
      glow.setColorAt(i, colour);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;

    const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
    const array = colors.array as Float32Array;
    const pairs = graph.edges.length / 2;
    for (let i = 0; i < pairs; i++) {
      const a = graph.edges[i * 2];
      const b = graph.edges[i * 2 + 1];
      const lit = activeIndex === undefined || a === activeIndex || b === activeIndex;
      const scale = lit ? (activeIndex === undefined ? 1 : 2.4) : 0.12;
      for (let k = 0; k < 6; k++) array[i * 6 + k] = edgeData.base[i * 6 + k] * scale;
    }
    colors.needsUpdate = true;
  }, [active, adjacency, count, edgeData, graph]);

  // The halos stack in the same way the edges do.
  const glowLevel = Math.min(0.2, Math.max(0.06, 900 / Math.max(count, 1)));

  // Gently breathe the glow so a still scene is never quite static.
  useFrame(({ clock }) => {
    glow.uniforms.uOpacity.value = glowLevel + Math.sin(clock.elapsedTime * 0.6) * 0.02;
  });

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const id = event.instanceId;
    onHover(id === undefined ? undefined : graph.ids[id]);
  };

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={edgeGeometry} />
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      <instancedMesh
        ref={withColors(halos)}
        args={[undefined, glow, count]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={-1}
      >
        <planeGeometry args={[1, 1]} />
      </instancedMesh>

      <instancedMesh
        ref={withColors(nodes)}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        onPointerMove={handleMove}
        onPointerOut={() => onHover(undefined)}
        onClick={(event) => {
          event.stopPropagation();
          if (event.instanceId !== undefined) onSelect(graph.ids[event.instanceId]);
        }}
      >
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial
          roughness={0.35}
          metalness={0.1}
          emissiveIntensity={0.5}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
