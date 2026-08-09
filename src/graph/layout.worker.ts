/**
 * Layout worker.
 *
 * The vertical axis is fixed by generation: the Prophet at the apex, each
 * layer of transmitters below the one it heard from, the compilers at the
 * floor. That much is not negotiable — it is what makes the shape legible as
 * a chain of transmission rather than a hairball.
 *
 * Everything horizontal is relaxed: nodes are seeded on a golden-angle disc
 * inside their own layer, then pulled toward the people they transmit to and
 * pushed off their neighbours until the layer spreads out. Repulsion only
 * applies within a layer — layers are already separated in Y, so there is
 * nothing to gain from computing it across them, and it keeps the whole pass
 * linear in the number of nodes.
 */

export interface LayoutRequest {
  gen: Int32Array;
  genExact: Float32Array;
  weight: Float32Array;
  edges: Uint32Array;
  edgeWeight: Float32Array;
  /** Relaxation sweeps. More is tidier and slower. */
  iterations?: number;
  /**
   * Echoed back untouched, so the caller can tell which request a result
   * belongs to. The worker takes messages one at a time, and a result that
   * arrives after the selection has changed is for a graph that no longer
   * exists.
   */
  token: number;
}

export interface LayoutResponse {
  token: number;
  positions: Float32Array;
  /** Bounding radius, so the camera can frame the result. */
  radius: number;
  height: number;
  /**
   * Typical gap between neighbouring nodes. A single chain and the whole
   * corpus are drawn at wildly different scales, and node size, label offset
   * and glow all have to follow it or one of the two ends up unreadable.
   */
  spacing: number;
  /** One entry per generation, so the scene can show what the layers mean. */
  bands: LayoutBand[];
}

export interface LayoutBand {
  /** Generations from the Prophet: 0 is him, 1 the Companions, and so on. */
  gen: number;
  y: number;
  radius: number;
  count: number;
}

/**
 * Vertical distance between generations. Large relative to how wide a layer
 * gets: the busiest generation holds a couple of thousand transmitters, and
 * without the height the whole graph reads as a disc rather than a descent.
 */
const LAYER_GAP = 58;

/**
 * How hard a node is drawn toward the people it transmits with. Springs and
 * repulsion are in tension: too much spring and every layer collapses to a
 * point, too little and the layers say nothing about who worked with whom.
 */
const SPRING = 0.12;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function layout(request: LayoutRequest): LayoutResponse {
  const { gen, genExact, weight, edges, edgeWeight } = request;
  const iterations = request.iterations ?? 220;
  const count = gen.length;
  const token = request.token;
  const positions = new Float32Array(count * 3);
  if (!count) return { token, positions, radius: 1, height: 1, spacing: 1, bands: [] };

  // --- layers ---------------------------------------------------------------
  let maxGen = 0;
  for (let i = 0; i < count; i++) if (gen[i] > maxGen) maxGen = gen[i];
  const layers: number[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (let i = 0; i < count; i++) layers[gen[i]].push(i);

  const height = maxGen * LAYER_GAP;

  // Seed each layer on a sunflower disc: even coverage, no ring artefacts,
  // and the busiest layers get the most room.
  const layerRadius = new Float32Array(maxGen + 1);
  for (let g = 0; g <= maxGen; g++) {
    const members = layers[g];
    // The constant matters most for small selections: three parallel chains
    // need room for three Arabic labels side by side, not just three dots.
    const radius = 18 + Math.sqrt(members.length) * 5;
    layerRadius[g] = radius;
    seating(members, weight).forEach((node, i) => {
      const t = members.length === 1 ? 0 : Math.sqrt((i + 0.5) / members.length);
      const angle = i * GOLDEN_ANGLE;
      positions[node * 3] = Math.cos(angle) * t * radius;
      // Grouped by layer, but placed at its own exact depth.
      positions[node * 3 + 1] = height / 2 - genExact[node] * LAYER_GAP;
      positions[node * 3 + 2] = Math.sin(angle) * t * radius;
    });
  }

  // --- adjacency ------------------------------------------------------------
  const pairs = edges.length / 2;
  const degree = new Int32Array(count);
  for (let i = 0; i < pairs; i++) {
    degree[edges[i * 2]]++;
    degree[edges[i * 2 + 1]]++;
  }
  const offset = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) offset[i + 1] = offset[i] + degree[i];
  const neighbours = new Int32Array(pairs * 2);
  const strength = new Float32Array(pairs * 2);
  const cursor = offset.slice(0, count);
  for (let i = 0; i < pairs; i++) {
    const a = edges[i * 2];
    const b = edges[i * 2 + 1];
    const w = edgeWeight[i];
    neighbours[cursor[a]] = b;
    strength[cursor[a]++] = w;
    neighbours[cursor[b]] = a;
    strength[cursor[b]++] = w;
  }

  // --- relaxation -----------------------------------------------------------
  const fx = new Float32Array(count);
  const fz = new Float32Array(count);

  /**
   * How far apart nodes in a layer should end up. Derived from the layer's own
   * seed disc, so a layer of three and a layer of three thousand both come out
   * legible — the whole graph simply occupies more room when it needs to.
   */
  // Nodes are drawn larger the more chains run through them, so the room they
  // need scales the same way. Mirrors the radius the renderer uses.
  const bulk = new Float32Array(count);
  for (let i = 0; i < count; i++) bulk[i] = 1 + Math.log1p(weight[i]) * 0.32;

  const separation = new Float32Array(maxGen + 1);
  for (let g = 0; g <= maxGen; g++) {
    // Solve for the gap that packs this layer into its own disc: the area the
    // members claim, Σ(target·bulk/2)²π, has to come out as πR². Without this
    // the busiest generations — where `bulk` is largest — would demand several
    // times the room they were allotted and flatten the whole graph.
    let claim = 0;
    for (const node of layers[g]) claim += bulk[node] * bulk[node];
    separation[g] = (2 * layerRadius[g]) / Math.sqrt(Math.max(claim, 1));
  }

  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations;
    fx.fill(0);
    fz.fill(0);

    // Springs: pull each node toward the people it transmitted to and from.
    for (let i = 0; i < count; i++) {
      const start = offset[i];
      const end = offset[i + 1];
      if (start === end) continue;
      let sx = 0;
      let sz = 0;
      let total = 0;
      for (let k = start; k < end; k++) {
        const j = neighbours[k];
        const w = Math.sqrt(strength[k]);
        sx += positions[j * 3] * w;
        sz += positions[j * 3 + 2] * w;
        total += w;
      }
      fx[i] += (sx / total - positions[i * 3]) * SPRING;
      fz[i] += (sz / total - positions[i * 3 + 2]) * SPRING;
    }

    // Integrate the springs, push overlapping nodes apart, then keep the layer
    // from drifting off its axis.
    const damping = cooling * 0.85;
    for (let g = 0; g <= maxGen; g++) {
      const members = layers[g];
      const target = separation[g];

      for (const node of members) {
        let dx = fx[node] * damping;
        let dz = fz[node] * damping;
        const move = Math.hypot(dx, dz);
        const limit = target * 0.4;
        if (move > limit) {
          dx = (dx / move) * limit;
          dz = (dz / move) * limit;
        }
        positions[node * 3] += dx;
        positions[node * 3 + 2] += dz;
      }

      separate(members, positions, target, bulk);

      // Centre the layer on its ink rather than on its headcount.
      //
      // Counting heads pins the average *position* to the axis and says
      // nothing about where the weight ended up. A layer satisfies it
      // perfectly with its forty busiest narrators gathered to one side and a
      // few hundred quiet ones spread over the other, which is what it was
      // doing: 63% of the drawn area on one side of generation 2, against a
      // headcount of 54%. The eye reads the ink.
      //
      // A translation can only zero one of the two, so this is a choice and
      // not a fix: balancing the area unbalances the count, to 66/34. That
      // side holds fewer, larger nodes over the same area and the same
      // brightness, which reads as a difference in texture rather than one in
      // density. The residue is the hubs still drawing together — springs
      // gather what shares chains, and that much is the graph rather than the
      // layout.
      let cx = 0;
      let cz = 0;
      let mass = 0;
      for (const node of members) {
        const area = bulk[node] * bulk[node];
        cx += positions[node * 3] * area;
        cz += positions[node * 3 + 2] * area;
        mass += area;
      }
      cx /= mass || 1;
      cz /= mass || 1;
      for (const node of members) {
        positions[node * 3] -= cx;
        positions[node * 3 + 2] -= cz;
      }
    }
  }

  let radius = 1;
  for (let i = 0; i < count; i++) {
    const r = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
    if (r > radius) radius = r;
  }

  // Spacing from the busiest layer: N nodes spread over a disc of radius R sit
  // roughly 2R/√N apart, and that layer is the one that has to stay readable.
  let busiest = 1;
  let busiestRadius = LAYER_GAP;
  for (let g = 0; g <= maxGen; g++) {
    if (layers[g].length > busiest) {
      busiest = layers[g].length;
      busiestRadius = Math.max(layerRadius[g], LAYER_GAP);
    }
  }
  const spacing = Math.min((2 * busiestRadius) / Math.sqrt(busiest), LAYER_GAP * 0.7);

  // Report the layers themselves. Nodes sit at their own exact depth, so a
  // band is where a generation is centred rather than a line every node is on.
  const bands: LayoutBand[] = [];
  for (let g = 0; g <= maxGen; g++) {
    if (!layers[g].length) continue;
    let extent = 0;
    for (const node of layers[g]) {
      const r = Math.hypot(positions[node * 3], positions[node * 3 + 2]);
      if (r > extent) extent = r;
    }
    bands.push({
      gen: g,
      y: height / 2 - g * LAYER_GAP,
      radius: extent + LAYER_GAP * 0.25,
      count: layers[g].length,
    });
  }

  return { token, positions, radius, height, spacing, bands };
}

/**
 * Which seat on the spiral each member of a layer takes.
 *
 * It must not be the order they arrive in. The spiral seats the *i*th node at
 * radius √(i/n), and members arrive in node order, which is registry order,
 * which is sorted by how many chains a narrator carries — so seat 0, the dead
 * centre of the disc, went to the busiest man in the generation and the rim
 * went to the quietest. The separation pass then gives a big node more room
 * than a small one, which left the middle of every layer over-subscribed by
 * precisely the nodes least able to fit into it. It expanded as one body, and
 * because nothing held that body to the axis it drifted off to one side and
 * stayed there. Generation 2 came out with its busiest forty at mean radius
 * 140 and its quietest four hundred at 106 — the big nodes ringing a core of
 * small ones, the reverse of where they started and no more meaningful.
 *
 * A shuffle breaks the gradient, but leaves each band of radius with whatever
 * mix chance deals it. Ranking the members by the room they will claim and
 * then walking the seats in golden-ratio strides spreads consecutive ranks as
 * far apart as the disc allows, so every band gets the same mix: the same
 * generation now finishes at 118 and 120, which is no radial sorting at all.
 * The stride is made coprime with the layer so it visits every seat exactly
 * once, and nothing here varies between runs — the same selection has to lay
 * out the same way every time it is drawn, or the graph would rearrange itself
 * under the reader on a redraw.
 */
function seating(members: number[], weight: Float32Array): number[] {
  const n = members.length;
  if (n < 3) return members;

  const ranked = [...members].sort((a, b) => weight[b] - weight[a]);

  // The nearest stride to n/φ that is coprime with n, searched both ways: walk
  // down only and a layer of four finds nothing before reaching 1, which is
  // the identity and hands the middle back to the busiest nodes.
  const ideal = Math.round(n / 1.618033988749895);
  let stride = 1;
  for (let step = 0; step < n; step++) {
    const below = ideal - step;
    const above = ideal + step;
    if (below > 1 && gcd(below, n) === 1) {
      stride = below;
      break;
    }
    if (above < n && gcd(above, n) === 1) {
      stride = above;
      break;
    }
  }

  const seated = new Array<number>(n);
  for (let rank = 0; rank < n; rank++) seated[(rank * stride) % n] = ranked[rank];
  return seated;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Push any two nodes in a layer that are closer than `target` apart until they
 * are not.
 *
 * This replaces an inverse-square repulsion, which needs its constant retuned
 * for every graph size — too weak and a sparse layer collapses into a line of
 * overlapping labels, too strong and a dense one explodes. A positional
 * constraint just states the requirement: nodes do not overlap, whatever the
 * scale. Nodes are bucketed on a grid of the target size, so each one only
 * tests the neighbours it could possibly be touching.
 */
function separate(
  members: number[],
  positions: Float32Array,
  target: number,
  bulk: Float32Array,
): void {
  if (members.length < 2 || target <= 0) return;

  const buckets = new Map<number, number[]>();
  for (const node of members) {
    const gx = Math.floor(positions[node * 3] / target);
    const gz = Math.floor(positions[node * 3 + 2] / target);
    const key = gx * 65536 + gz;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(node);
    else buckets.set(key, [node]);
  }

  for (const node of members) {
    const gx = Math.floor(positions[node * 3] / target);
    const gz = Math.floor(positions[node * 3 + 2] / target);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = buckets.get((gx + dx) * 65536 + (gz + dz));
        if (!bucket) continue;
        for (const other of bucket) {
          // Each unordered pair is handled once, by the lower-indexed node.
          if (other <= node) continue;
          let ox = positions[other * 3] - positions[node * 3];
          let oz = positions[other * 3 + 2] - positions[node * 3 + 2];
          const wanted = (target * (bulk[node] + bulk[other])) / 2;
          let distance = Math.hypot(ox, oz);
          if (distance >= wanted) continue;
          if (distance < 1e-4) {
            // Coincident nodes have no direction to separate along; pick one.
            const angle = (node % 360) * 0.0175;
            ox = Math.cos(angle);
            oz = Math.sin(angle);
            distance = 1;
          }
          const shift = (wanted - distance) / 2 / distance;
          positions[node * 3] -= ox * shift;
          positions[node * 3 + 2] -= oz * shift;
          positions[other * 3] += ox * shift;
          positions[other * 3 + 2] += oz * shift;
        }
      }
    }
  }
}

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const result = layout(event.data);
  (self as unknown as Worker).postMessage(result, [result.positions.buffer]);
};
