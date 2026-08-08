# Z-Anatomy 전체를 부위별 묶음으로 뽑아낸다.
#
# 왜 Blender에서 감면까지 하나: Blender의 Decimate(Collapse)가 QEM 모서리 접기라
# 우리가 만든 것과 같은 방식이고, 4,569개를 한 번에 처리하는 게 훨씬 빠르다.
#
# 출력 형식 (부위마다 .bin 하나 + .json 하나):
#   .json  [{name, region, system, v0, vn, i0, ic}]  — 구조 목록과 버퍼 내 위치
#   .bin   좌표(float32) 전부 이어붙인 뒤, 인덱스(uint32) 전부 이어붙임
# 법선은 넣지 않는다. 용량의 33%를 차지하는데 브라우저가 로드할 때 계산하면 된다.
#
# 실행: blender --background Startup.blend --python export-all.py -- <출력폴더> <감면비율>
import bpy, sys, os, re, json, struct, mathutils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/workspace/za_full'
RATIO = float(argv[1]) if len(argv) > 1 else 0.4
MIN_TRIS = 150          # 이보다 작으면 감면하지 않는다
os.makedirs(OUT, exist_ok=True)

SYSTEMS = {
    '1: Skeletal system': '뼈',
    '2: Muscular insertions': '부착부',
    '3: Joints': '관절·인대',
    '4: Muscular system': '근육',
}
# 신경에 대해 확인한 것 (2026-08-08):
#  · '7: Nervous system & Sense organs' 안은 전부 뇌와 감각기관이다. 재활에 안 쓴다
#  · Bonus collection 의 'Peripheral nervous system' 은 이름과 달리 근육 목록이다
#    (신경 지배 기준으로 근육을 묶어둔 것으로 보임). 여기 넣으면 근육이 신경으로 잘못 분류된다
#  · 이름에 nerve/plexus 가 든 메쉬 62개 중 형체가 있는 건 27개뿐이고,
#    전부 뇌·뇌신경핵·달팽이신경이다. 좌골신경·대퇴신경·요신경총은 형체가 아예 없다
# → 뇌는 빼고, 재활에 쓰는 척수·척수신경절만 이름으로 골라 넣는다.
SPINAL = re.compile(r'^(spinal cord|spinal ganglion|cauda equina|filum terminale|conus medullaris)', re.I)
# 부위를 뷰어에서 다룰 묶음으로 합친다
GROUP = {
    'Head': 'head', 'Neck': 'head',
    'Trunk': 'trunk',
    'Left lower limb': 'lower', 'Right lower limb': 'lower',
    'Left foot': 'lower', 'Right foot': 'lower',
    'Left upper limb': 'upper', 'Right upper limb': 'upper',
    'Left hand': 'upper', 'Right hand': 'upper',
}

# Z-Anatomy는 아틀라스라 대부분의 구조가 숨겨진 채로 저장돼 있다.
# 숨겨진 객체는 depsgraph 평가에서 빈 메쉬로 나와 통째로 유실된다. 전부 켜고 시작한다.
def unhide_all():
    def rec(lc):
        lc.exclude = False
        lc.hide_viewport = False
        for c in lc.children: rec(c)
    rec(bpy.context.view_layer.layer_collection)
    for c in bpy.data.collections:
        c.hide_viewport = False
        c.hide_render = False
    for o in bpy.data.objects:
        o.hide_viewport = False
        o.hide_render = False
        try: o.hide_set(False)
        except Exception: pass
unhide_all()

def leaves(col, out=None):
    if out is None: out = set()
    for o in col.objects:
        if o.type == 'MESH': out.add(o.name)
    for c in col.children: leaves(c, out)
    return out

# 메쉬 → 계통
sys_of = {}
for cname, label in SYSTEMS.items():
    c = bpy.data.collections.get(cname)
    if c:
        for n in leaves(c): sys_of[n] = label

# 척수·척수신경절만 이름으로 골라 넣는다 (위 주석 참조)
spinal_n = 0
for o in bpy.data.objects:
    if o.type == 'MESH' and SPINAL.match(o.name) and len(o.data.polygons) > 0:
        sys_of[o.name] = '신경'
        spinal_n += 1
print(f'SPINAL 척수 계열 {spinal_n}개')

# 메쉬 → 부위
region_of = {}
b = bpy.data.collections.get('Bonus collection')
for c in b.children:
    if c.name.startswith('Regions'):
        for ch in c.children:
            if ch.name == 'Main divisions':
                for rc in ch.children:
                    for n in leaves(rc): region_of[n] = rc.name

# 부위 정보가 없는 것은 높이/좌우로 판정한다 (Z-Anatomy가 분류를 안 해둔 것들)
def guess_region(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    z = sum(v.z for v in bb) / 8 * 1000
    x = abs(sum(v.x for v in bb) / 8) * 1000
    if z > 1500: return 'Head'
    if z > 1380: return 'Neck'
    if x > 220: return 'Left upper limb'
    if z < 850: return 'Left lower limb'
    return 'Trunk'

buckets = {}
dg = bpy.context.evaluated_depsgraph_get()
skipped = 0
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    sysname = sys_of.get(o.name)
    if not sysname: continue                      # 대상 계통이 아니면 버림
    grp = GROUP.get(region_of.get(o.name) or guess_region(o), 'trunk')
    buckets.setdefault(grp, []).append((o, sysname, region_of.get(o.name, '(추정)')))

print('BUCKETS ' + json.dumps({k: len(v) for k, v in buckets.items()}))

for grp, items in buckets.items():
    meta, pos_parts, idx_parts = [], [], []
    v_off = i_off = 0
    for o, sysname, region in items:
        # 감면: 원본 삼각형이 MIN_TRIS를 넘을 때만
        mod = None
        ntri = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if ntri > MIN_TRIS:
            mod = o.modifiers.new('__dec', 'DECIMATE')
            mod.decimate_type = 'COLLAPSE'
            mod.ratio = max(RATIO, MIN_TRIS / ntri)
        ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        me.calc_loop_triangles()
        mw = ev.matrix_world
        vs = [mw @ v.co for v in me.vertices]
        tris = [t.vertices for t in me.loop_triangles]
        if len(vs) and len(tris):
            for v in vs: pos_parts.append(struct.pack('<3f', v.x * 1000, v.y * 1000, v.z * 1000))
            for t in tris: idx_parts.append(struct.pack('<3I', t[0], t[1], t[2]))
            meta.append({'name': o.name, 'system': sysname, 'region': region,
                         'v0': v_off, 'vn': len(vs), 'i0': i_off, 'ic': len(tris) * 3})
            v_off += len(vs); i_off += len(tris) * 3
        ev.to_mesh_clear()
        if mod: o.modifiers.remove(mod)

    with open(os.path.join(OUT, grp + '.bin'), 'wb') as f:
        f.write(b''.join(pos_parts)); f.write(b''.join(idx_parts))
    with open(os.path.join(OUT, grp + '.json'), 'w') as f:
        json.dump({'posBytes': v_off * 12, 'structures': meta}, f, ensure_ascii=False)
    print(f'GRP {grp} 구조 {len(meta)} 정점 {v_off} 삼각형 {i_off // 3}')
