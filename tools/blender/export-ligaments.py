import bpy, mathutils, re, os, json

# 앞서 최소제곱으로 구한 Z-Anatomy → BodyParts3D 좌표 변환 (단위 mm)
S = [0.95986, 0.91210, 0.99152]
T = [0.04, -96.39, -31.98]

OUT = '/workspace/za_export'
os.makedirs(OUT, exist_ok=True)

WANT = re.compile(
  r'^(Sacrotuberous ligament|Sacrospinous ligament|Iliolumbar ligament'
  r'|Anterior sacro-iliac ligament|Posterior sacro-iliac ligament|Interosseous sacro-iliac ligament'
  r'|Descending part of iliofemoral ligament|Transverse part of iliofemoral ligament'
  r'|Pubofemoral ligament|Ischiofemoral ligament|Obturator membrane'
  r'|Anterior layer of thoracolumbar fascia|Middle layer of thoracolumbar fascia'
  r'|Posterior layer of thoracolumbar fascia)\.(l|r)$')

def slug(n):
    base, side = n.rsplit('.', 1)
    b = re.sub(r'[^a-z0-9]+', '_', base.lower()).strip('_')
    return f'ZA_{b}_{side}'

meta = []
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if o.type != 'MESH' or not WANT.match(o.name):
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    mw = ev.matrix_world
    verts = []
    for v in me.vertices:
        w = mw @ v.co
        verts.append((S[0]*w.x*1000 + T[0], S[1]*w.y*1000 + T[1], S[2]*w.z*1000 + T[2]))
    tris = [tuple(t.vertices) for t in me.loop_triangles]
    sid = slug(o.name)
    with open(os.path.join(OUT, sid + '.obj'), 'w') as f:
        f.write(f'# {o.name}\n')
        f.write('# Z-Anatomy, CC BY-SA 4.0 — https://z-anatomy.com\n')
        f.write('# BodyParts3D 좌표계로 맞추려고 축별 배율/이동을 적용함 (평균 오차 3.9mm)\n')
        for p in verts: f.write('v %.3f %.3f %.3f\n' % p)
        for t in tris: f.write('f %d %d %d\n' % (t[0]+1, t[1]+1, t[2]+1))
    meta.append({'id': sid, 'nameEn': o.name.rsplit('.',1)[0],
                 'side': o.name.rsplit('.',1)[1], 'verts': len(verts), 'tris': len(tris)})
    ev.to_mesh_clear()

print('EXPORT_JSON ' + json.dumps(meta))
print(f'EXPORT_COUNT {len(meta)}')
