# Z-Anatomy 안에 들어있는 구조 설명글을 통째로 뽑아낸다.
#
# Z-Anatomy 는 각 구조의 설명을 .blend 파일 안의 "텍스트 블록"으로 갖고 있다.
# (Blender 에서 스크립트를 적어두는 칸인데, 여기에 위키백과에서 가져온
#  해부학 설명을 넣어뒀다.) 블록 이름 = 구조 이름이라 그대로 짝지을 수 있다.
#
# 내용은 위키백과 문서를 다듬은 것이고 이는 곳/닿는 곳/신경지배가 적혀 있다.
# 지금 뷰어가 쓰는 attachments.json 은 Claude 가 손으로 적은 미검증 자료라
# 이걸로 갈아끼우면 출처가 생긴다.
#
# 실행:
#   blender --background /workspace/z-anatomy/unz/Z-Anatomy/Startup.blend \
#           --python tools/blender/export-descriptions.py -- /workspace/za_desc.json
import bpy, sys, json

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/workspace/za_desc.json'

d = {}
for t in bpy.data.texts:
    body = t.as_string()
    if not body.strip():
        continue
    d[t.name] = body

with open(out, 'w') as f:
    json.dump(d, f, ensure_ascii=False)

print(f'텍스트 블록 {len(bpy.data.texts)}개 중 내용 있는 것 {len(d)}개 -> {out}')
