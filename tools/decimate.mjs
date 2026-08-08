// 삼각형 줄이기 — QEM(이차 오차 척도) 모서리 접기.
//
// 왜 이걸 쓰나: 처음엔 "격자 안의 점을 하나로 뭉치는" 방식을 썼는데,
// 장골 날개처럼 얇은 뼈에서 앞면과 뒷면의 점이 같은 격자에 들어가 서로 합쳐지면서
// 구멍이 뚫렸다. 모서리 접기는 면을 지우지 않고 이웃한 두 점을 합치기만 해서
// 위상(구멍 없는 껍질)이 유지된다.
//
// 참고: Garland & Heckbert, "Surface Simplification Using Quadric Error Metrics" (1997)

// 대칭 4x4 행렬을 10개 값으로 저장한다 (xx xy xz xw yy yz yw zz zw ww)
function quadricFromPlane(a, b, c, d) {
  return [a*a, a*b, a*c, a*d, b*b, b*c, b*d, c*c, c*d, d*d];
}
function qAdd(p, q) { for (let i = 0; i < 10; i++) p[i] += q[i]; return p; }
// vᵀ Q v
function qError(q, x, y, z) {
  return q[0]*x*x + 2*q[1]*x*y + 2*q[2]*x*z + 2*q[3]*x
       + q[4]*y*y + 2*q[5]*y*z + 2*q[6]*y
       + q[7]*z*z + 2*q[8]*z + q[9];
}

// 최소 힙 (지연 삭제 방식: 낡은 항목은 꺼낼 때 걸러낸다)
class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].cost <= a[i].cost) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; if (!a.length) return null; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { const l = 2*i+1, r = l+1; let s = i;
        if (l < a.length && a[l].cost < a[s].cost) s = l;
        if (r < a.length && a[r].cost < a[s].cost) s = r;
        if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } }
    return top; }
}

/**
 * @param {Float64Array} pos  정점 좌표 (n*3)
 * @param {Int32Array}   idx  삼각형 인덱스 (m*3)
 * @param {number} targetTris 목표 삼각형 수
 */
export function decimate(pos, idx, targetTris) {
  const nv = pos.length / 3;
  let faces = Array.from({ length: idx.length / 3 }, (_, f) => [idx[f*3], idx[f*3+1], idx[f*3+2]]);
  const alive = new Uint8Array(faces.length).fill(1);
  const vAlive = new Uint8Array(nv).fill(1);
  const P = Float64Array.from(pos);

  // 정점 → 접한 면 목록
  const vf = Array.from({ length: nv }, () => []);
  faces.forEach((f, i) => { for (const v of f) vf[v].push(i); });

  function faceNormal(f, override = -1, ox = 0, oy = 0, oz = 0) {
    const g = (v, c) => (v === override ? [ox, oy, oz][c] : P[v*3+c]);
    const ax = g(f[1],0)-g(f[0],0), ay = g(f[1],1)-g(f[0],1), az = g(f[1],2)-g(f[0],2);
    const bx = g(f[2],0)-g(f[0],0), by = g(f[2],1)-g(f[0],1), bz = g(f[2],2)-g(f[0],2);
    return [ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx];
  }

  // 정점별 이차 오차 행렬
  const Q = Array.from({ length: nv }, () => new Float64Array(10));
  faces.forEach((f) => {
    const [nx, ny, nz] = faceNormal(f);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return;
    const a = nx/len, b = ny/len, c = nz/len;
    const d = -(a*P[f[0]*3] + b*P[f[0]*3+1] + c*P[f[0]*3+2]);
    const q = quadricFromPlane(a, b, c, d);
    for (const v of f) qAdd(Q[v], q);
  });

  // 모서리 목록
  const edgeKey = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  const edges = new Map();
  for (const f of faces) for (let i = 0; i < 3; i++) {
    const a = f[i], b = f[(i+1)%3];
    edges.set(edgeKey(a, b), [Math.min(a,b), Math.max(a,b)]);
  }

  // 접었을 때의 위치와 비용. 위치는 두 끝점과 중점 중 오차가 가장 작은 것으로 고른다.
  function evaluate(a, b) {
    const q = new Float64Array(10); qAdd(q, Q[a]); qAdd(q, Q[b]);
    const cands = [
      [P[a*3], P[a*3+1], P[a*3+2]],
      [P[b*3], P[b*3+1], P[b*3+2]],
      [(P[a*3]+P[b*3])/2, (P[a*3+1]+P[b*3+1])/2, (P[a*3+2]+P[b*3+2])/2],
    ];
    let best = null, bestE = Infinity;
    for (const c of cands) {
      const e = Math.abs(qError(q, c[0], c[1], c[2]));
      if (e < bestE) { bestE = e; best = c; }
    }
    return { cost: bestE, at: best };
  }

  const heap = new Heap();
  const version = new Int32Array(nv);   // 정점이 바뀌면 올라간다. 낡은 항목 걸러내기용.
  for (const [a, b] of edges.values()) {
    const r = evaluate(a, b);
    heap.push({ a, b, va: version[a], vb: version[b], cost: r.cost, at: r.at });
  }

  let liveTris = faces.length;
  while (liveTris > targetTris) {
    const e = heap.pop();
    if (!e) break;
    const { a, b } = e;
    if (!vAlive[a] || !vAlive[b]) continue;
    if (e.va !== version[a] || e.vb !== version[b]) continue;   // 낡은 항목

    // 접은 뒤 면이 뒤집히면 형태가 망가진다. 미리 확인하고 건너뛴다.
    const [nx, ny, nz] = e.at;
    let flips = false;
    for (const fi of vf[a].concat(vf[b])) {
      if (!alive[fi]) continue;
      const f = faces[fi];
      if (f.includes(a) && f.includes(b)) continue;             // 사라질 면
      const before = faceNormal(f);
      const after = faceNormal(f, f.includes(a) ? a : b, nx, ny, nz);
      const dot = before[0]*after[0] + before[1]*after[1] + before[2]*after[2];
      const la = Math.hypot(...after);
      if (la < 1e-14 || dot <= 0) { flips = true; break; }
    }
    if (flips) continue;

    // b를 a로 합친다
    P[a*3] = nx; P[a*3+1] = ny; P[a*3+2] = nz;
    qAdd(Q[a], Q[b]);
    vAlive[b] = 0;
    for (const fi of vf[b]) {
      if (!alive[fi]) continue;
      const f = faces[fi];
      if (f.includes(a)) { alive[fi] = 0; liveTris--; continue; }   // 납작해진 면 제거
      for (let i = 0; i < 3; i++) if (f[i] === b) f[i] = a;
      vf[a].push(fi);
    }
    vf[b] = [];
    version[a]++;

    // a에 새로 이어진 모서리들의 비용을 다시 계산해 넣는다
    const nb = new Set();
    for (const fi of vf[a]) { if (!alive[fi]) continue; for (const v of faces[fi]) if (v !== a && vAlive[v]) nb.add(v); }
    for (const v of nb) {
      const r = evaluate(a, v);
      heap.push({ a, b: v, va: version[a], vb: version[v], cost: r.cost, at: r.at });
    }
  }

  // 살아남은 것만 다시 번호 매기기
  const remap = new Int32Array(nv).fill(-1);
  const outPos = [];
  for (let v = 0; v < nv; v++) if (vAlive[v]) { remap[v] = outPos.length / 3; outPos.push(P[v*3], P[v*3+1], P[v*3+2]); }
  const outIdx = [];
  for (let f = 0; f < faces.length; f++) {
    if (!alive[f]) continue;
    const [a, b, c] = faces[f];
    if (a === b || b === c || a === c) continue;
    outIdx.push(remap[a], remap[b], remap[c]);
  }
  return { pos: Float64Array.from(outPos), idx: Int32Array.from(outIdx) };
}
