import bpy, re, collections
objs = [o for o in bpy.data.objects if o.type == 'MESH']
print(f"ZA_TOTAL {len(objs)}")
print(f"ZA_COLLECTIONS {len(bpy.data.collections)}")
# 최상위 컬렉션 이름
tops = [c.name for c in bpy.data.collections][:40]
print("ZA_COLNAMES " + " | ".join(tops))
PAT = re.compile(r'ligament|fascia|aponeuros|membran|retinacul|tendon|raphe|septum', re.I)
hits = [o.name for o in objs if PAT.search(o.name)]
print(f"ZA_LIGFASCIA {len(hits)}")
PELVIS = re.compile(r'sacro|sacral|iliolumb|inguinal|pubo|ischio|iliofem|pubofem|thoracolumb|obturator|coccyg|hip|iliac|lumb', re.I)
ph = [n for n in hits if PELVIS.search(n)]
print(f"ZA_PELVIS_LIGFASCIA {len(ph)}")
for n in sorted(ph)[:60]:
    print("  ZA_P " + n)
