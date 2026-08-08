# RECON — 3D 에셋 정찰 보고서

작성: 2026-08-08 (세션 00) · 상태: **완료**
스펙: `CLAUDE.md` 0단계

> 이 문서의 모든 숫자는 **실제로 파일을 받아서 센 결과**임. 추정치는 "(추정)"으로 표시함.
> 코드는 작성하지 않음.

---

## 0. 결론 먼저

**1단계에는 BodyParts3D(ISA Release 4.0)의 `.obj` 파일을 쓴다.** 전신이 아니라 **골반/고관절/요추 100개 구조만** 잘라서 쓴다.

| 항목 | 값 |
|---|---|
| 대상 구조 수 | **100개** (근육 85 + 뼈·관절 15) |
| 원본 `.obj` 합계 용량 | **24.6 MB** |
| 합계 폴리곤 | 정점 247,458 / 면 **331,410** |
| 태블릿 적합성 | 면 33만은 여유 있음 (50만 이하 무난) |
| 이름 규칙 | 일관적. `FJ####`, 좌측은 뒤에 `M` |
| 좌우 구분 | **있음** (right 892 / left 877) |
| 라이선스 | CC BY-SA 2.1 Japan (표기 문구는 §5) |

**단, 한 가지가 미해결이다.** `.obj`는 브라우저에서 바로 쓰기엔 무겁고 느리다. `.glb`로 변환해야 하는데 **변환 도구가 이 환경에 없다.** → §6 참조. 사용자 승인이 필요하다.

---

## 1. 후보 3개 조사 결과

### 후보 1. Open3Dmodel (anatomytool.org) — ❌ 조사 불가

`anatomytool.org` 가 이 세션의 네트워크 정책에 **차단(HTTP 403)** 되어 있음. 파일을 받을 수 없어 아무것도 조사하지 못함.

### 후보 2. Z-Anatomy — ⚠️ 받았지만 못 씀

공식 사이트 `z-anatomy.com` 은 차단됐으나, **GitHub 미러 `Z-Anatomy/Models-of-human-anatomy` 로 접근 성공.**

| 파일 | 크기 | 비고 |
|---|---|---|
| `Z-Anatomy.zip` | **82.7 MB** | 모델 본체. Blender 애플리케이션 템플릿 |
| `Z-Biomechanics.7z` | 20.6 MB | |
| `TA2.csv` | 1.4 MB | **Terminologia Anatomica 2 용어집, 7,314줄** |
| `License.txt` | — | CC BY-SA 4.0 |

**왜 못 쓰나:** 내용물이 Blender(`.blend`) 파일이다. `.glb`로 바꾸려면 Blender가 필요한데 **이 환경에 Blender가 설치되어 있지 않다** (`which blender` → 없음).

**그래도 건진 것:** `TA2.csv`. 해부학 국제표준용어 7,314행이 **영어 / 라틴어 / 프랑스어 / 스페인어 / 포르투갈어 / 이탈리아어 / 페르시아어** 로 들어있다. 스펙 2단계 `structures.json`의 `라틴명` 칸을 채울 권위 있는 출처다. **한국어는 없다.**

### 후보 3. BodyParts3D — ✅ 채택

공식 배포처 `lifesciencedb.jp` / `dbarchive.biosciencedbc.jp` 는 **둘 다 차단**됐으나, GitHub 미러 `jixiangying/anatomy` 에 **Release 4.0 전체가 그대로** 들어있어 접근 성공.

---

## 2. 채택한 에셋 상세 (BodyParts3D ISA Release 4.0)

### 메쉬 개수와 구성

`.obj` 파일 **2,234개**. 구조 목록 데이터의 항목 수와 **정확히 일치**(2,234) — 즉 `1파일 = 1해부구조`.

| 계통 | 구조 수 |
|---|---|
| 심혈관 | 1,065 |
| **근육** | **418** |
| **뼈·관절** | **249** |
| 신경 | 173 |
| 소화 | 152 |
| 호흡 | 144 |
| 생식 | 12 |
| 피부 | 9 |
| 비뇨 | 6 |
| 내분비 | 4 |
| 림프 | 2 |
| **합계** | **2,234** |

### 이름 규칙 — 일관적임

- 파일명은 `FJ` + 숫자 (예: `FJ1418.obj`)
- **좌측은 같은 번호 뒤에 `M`** (예: 우측 대둔근 `FJ1418` / 좌측 대둔근 `FJ1418M`)
- 이름 자체는 코드라 사람이 못 읽지만, **완전한 매핑표가 같이 들어있음**:

| 파일 | 줄 수 | 내용 |
|---|---|---|
| `data/isa_element_parts.txt` | 29,550 | FMA개념ID ↔ 영문명 ↔ 파일ID(FJ####) |
| `data/isa_parts_list_e.txt` | 2,906 | 개념ID ↔ 표현ID ↔ 영문명 |
| `data/anatomy_data_simple_refined.json` | 2,234 | 파일ID + 영문명 + 중문명 + 계통 |

### 매핑 신뢰도 — 대조 검증함

미러 저장소 README에 *"분류와 번역은 AI가 자동 생성했으므로 틀릴 수 있음"* 이라는 경고가 있어서, **AI 생성 JSON의 영문명을 원본 BodyParts3D 매핑표와 2,234개 전건 대조**했다.

| 결과 | 개수 | 비율 |
|---|---|---|
| 일치 | 2,205 | **98.7%** |
| 불일치 | 29 | 1.3% |
| 원본에 없음 | 0 | 0% |

불일치 29개는 **전부 심장 유두근(papillary muscle)** 계열로, 원본 매핑이 상위 개념(`anatomical entity`)만 갖고 있어 생긴 것. **우리가 쓸 골반/고관절/요추 부위에는 불일치가 하나도 없다.**

→ **결론: 영문명은 신뢰해도 된다. 계통 분류(`systemEn`)와 중문명은 AI 생성물이므로 신뢰하지 말 것.**

### ⚠️ 이름 규칙의 함정 두 가지 (2단계 설계에 직결)

대상 100개를 훑다가 발견한 것. **이걸 모르고 2단계를 짜면 버그가 난다.**

**함정 1 — 이름만 보고 좌/우를 판단하면 안 된다.**

대부분은 `left ~` / `right ~` 로 이름에 좌우가 들어있지만, **8개는 이름에 좌우가 없고 `M` 접미사에만 들어있다.**

| 파일 ID | 영문명 | 실제 좌우 |
|---|---|---|
| `FJ1465` / `FJ1465M` | tendinous arch of levator ani | 우 / 좌 |
| `FJ1547` / `FJ1547M` | lateral lumbar intertransversarius | 우 / 좌 |
| `FJ1548` / `FJ1548M` | medial lumbar intertransversarius | 우 / 좌 |
| `FJ2552`, `FJ2553` | tendinous arch of levator ani | 불명 |

반면 진짜로 좌우가 없는 정중선 구조도 11개 있다 (요추 L1~L5, 추간판 5개, 천골).

→ **규칙: 좌우는 이름이 아니라 `M` 접미사로 판단할 것. 단, 정중선 구조 11개는 예외.**

**함정 2 — 같은 이름의 파일이 중복 존재한다.**

대상 100개 중 **6종 / 파일 14개**가 이름 중복이다:

| 중복 이름 | 해당 파일 |
|---|---|
| left coccygeus | `FJ1449M`, `FJ2542` |
| left iliococcygeus | `FJ1453M`, `FJ2544` |
| left pubococcygeus | `FJ1457M`, `FJ2545` |
| tendinous arch of levator ani | `FJ1465`, `FJ1465M`, `FJ2552`, `FJ2553` |
| lateral lumbar intertransversarius | `FJ1547`, `FJ1547M` |
| medial lumbar intertransversarius | `FJ1548`, `FJ1548M` |

미러 저장소 README도 이 문제를 알고 있다 (*"원본 BodyParts3D의 데이터 구성상 동일 해부 실체의 중복 모델 파일이 존재한다 — 예: FJ2440과 FJ2769는 둘 다 윤상연골"*).

> ✅ **2단계에서 해소됨 (2026-08-08).** 무게중심과 정점 수를 비교한 결과 **진짜 중복이 맞다.**
> 예: 좌측 미골근 `FJ1449M` 중심 `(22.2, -18.2, 816.1)` / `FJ2542` 중심 `(22.2, -17.7, 815.7)` — 같은 자리, 메쉬 해상도만 다름.
>
> **원인:** `FJ14xx` 계열은 골반저근에 **왼쪽만** 있고, `FJ25xx` 계열은 **좌우 모두** 있다.
> 0단계 선별이 두 계열을 섞어서 좌측만 중복되고 우측이 비어 있었다.
> → **`FJ25xx` 계열로 통일**하고 `FJ1449M`/`FJ1453M`/`FJ1457M`/`FJ1465`/`FJ1465M`를 제거함.
> 결과적으로 좌 37 / 우 37 / 정중 11 로 좌우가 맞았다.

### 압축 여부

**적용 안 되어 있음.** 원본은 무압축 일반 텍스트 `.obj`다. Draco/meshopt는 우리가 변환할 때 넣어야 한다.

### 메쉬 품질 (실측 샘플)

`FJ1418` (우측 대둔근): 196 KB / 정점 2,053 / 면 2,376 / 법선 있음.
→ 저폴리곤이지만 형태 식별에는 충분. 뷰어 용도로 적합.

---

## 3. 골반 / 고관절 / 요추 부위 — 실측

키워드 매칭(둔근·장요근·이상근·내전근·햄스트링·척추기립근·요방형근·천장관절·치골·좌골 등 38개 키워드)으로 추린 결과:

| 항목 | 값 |
|---|---|
| **근육** | **85개** |
| **뼈·관절** | **15개** |
| 소계 (1단계 대상) | **100개** |
| `.obj` 원본 합계 | **24.6 MB** |
| 폴리곤 합계 | 정점 247,458 / 면 331,410 |

전체 목록은 **부록 A** 참조.

> ⚠️ **미검증:** 이 100개는 **영문 이름 문자열 매칭**으로 뽑은 것이다. 해부학적으로 이 부위에 속하는데 이름에 키워드가 없어서 **누락된 구조가 있을 수 있다.** 2단계에서 사용자가 검수해야 한다.

---

## 4. 1단계 실현 가능성 판정

| 스펙의 제약 | 판정 | 근거 |
|---|---|---|
| 태블릿 브라우저에서 열림 | ✅ 가능 | 면 33만은 모바일 GPU에 부담 없음 |
| 공개 URL 배포 | ⛔ **막힘** | **레포가 private이고 무료 플랜이라 GitHub Pages 불가.** 아래 정정 참조 |
| GitHub 파일 100MB 제한 | ✅ 통과 | 24.6MB, 변환 후 더 줄어듦 |
| Cloudflare Pages 25MB 제한 | ✅ 통과 | 변환 후 7.02MB라 여유 있음 |
| 로딩 5초 이내 | ✅ 가능 (추정) | 변환 결과 7.02MB. 실측은 배포 후 |
| 두 번째 방문 빠름 | ✅ 가능 | 브라우저 캐시로 충분 |

> **정정 (2026-08-08, 1단계 중 발견):** 이 표는 처음에 "레포가 public이라 Pages 무료"로
> 적혀 있었으나 **틀렸다.** 레포는 private이고 계정은 무료 플랜이라 GitHub Pages를 쓸 수 없다.
> 대안 3개(public 전환 / GitHub Pro / Cloudflare Pages)는 `CLAUDE.md` 부록 B-4 참조.
> 변환 결과가 7.02MB로 나온 덕에 Cloudflare Pages(파일당 25MB)도 선택지에 들어왔다.

---

## 5. 라이선스 — 표기 의무 (원문 확인함)

`.obj` 파일 **헤더에 직접 박혀 있는 문구**다. 추측 아님:

> The license for this database is specified in the Creative Commons Attribution-Share Alike 2.1 Japan. If you use data from this database, please be sure attribute this database as follows:
> **"BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan"**

### 페이지 하단에 반드시 넣을 문구

```
BodyParts3D, (c) The Database Center for Life Science
licensed under CC Attribution-Share Alike 2.1 Japan
https://creativecommons.org/licenses/by-sa/2.1/jp/
```

`TA2.csv`를 쓸 경우 추가:

```
Z-Anatomy, licensed under CC BY-SA 4.0
https://creativecommons.org/licenses/by-sa/4.0/
```

**ShareAlike 조항:** 모델을 변형해서 배포하면 파생물도 같은 라이선스로 공개해야 한다. 이 레포는 이미 public이고 개인 뷰어이므로 출처 표기만 하면 충족된다.

> ⚠️ **미검증:** 공식 라이선스 페이지(`dbarchive.biosciencedbc.jp/.../lic.html`)가 차단되어 **원문 전체를 읽지 못했다.** 위 문구는 `.obj` 파일 헤더에 있는 것을 그대로 옮긴 것이라 정확하지만, 그 외 세부 조건이 더 있을 수 있다. 사용자가 태블릿으로 한 번 열어 확인 권장.

---

## 6. 미해결 — 사용자 결정 필요

### `.obj` → `.glb` 변환 도구

`.obj` 2,234개(또는 100개)를 브라우저용 `.glb` 한 개로 합쳐야 한다. 이유:
- `.obj`는 텍스트라 용량이 크고 파싱이 느림
- 파일 100개를 각각 받으면 HTTP 요청 100번 → 태블릿에서 느림

**Blender가 없으므로 다른 방법이 필요하다.** 스펙 작업규칙 3번("의존성 추가 전에 물어볼 것")에 따라 진행하지 않고 보고한다. 선택지:

| 방법 | 추가 의존성 | 비고 |
|---|---|---|
| **A. three.js로 직접 변환 스크립트** | 없음 (three.js는 이미 승인됨) | three.js의 `OBJLoader` + `GLTFExporter`를 Node에서 실행. 변환 스크립트 1개 추가 |
| B. `obj2gltf` (Cesium 제작) | npm 패키지 1개 | 검증된 도구지만 의존성 추가 |
| C. Draco 압축까지 적용 | +1개 | 용량 더 줄지만 로더도 추가 필요 |

**추천: A안.** 승인된 의존성만으로 되고, 변환 스크립트는 한 번 돌리고 버리는 것이라 소스 파일 수 제한(5개)에도 영향이 없다.

---

## 7. 검증됨 / 미검증 정리

### ✅ 실제로 확인한 것
- 2,234개 `.obj` 존재, 구조 목록과 1:1 일치
- 이름 규칙 `FJ####` / 좌측 `M` 접미사
- 좌우 구분 존재 (right 892 / left 877)
- 영문명 98.7%가 원본 BodyParts3D 매핑과 일치
- 골반/고관절/요추 100개, 24.6 MB, 면 331,410
- 압축 미적용 (평문 `.obj`)
- **좌우 판단은 이름이 아니라 `M` 접미사로 해야 함** (이름에 좌우 없는 파일 8개 실측)
- **정중선 구조 11개** (요추 L1~L5 / 추간판 5 / 천골) 는 좌우 개념 없음
- **이름 중복 6종 14파일** 존재 (목록 §2)
- 라이선스 문구 (파일 헤더 원문)
- Blender 미설치
- Z-Anatomy는 CC BY-SA 4.0, 82.7MB `.blend` zip
- `TA2.csv` 7,314행, 한국어 없음

### ⚠️ 추측·미검증 (사용자 검수 필요)
1. **골반/고관절/요추 100개 선정** — 이름 문자열 매칭이라 누락 가능. 2단계에서 검수 필요
2. **`.glb` 변환 후 3~6MB 예상** — 실제로 변환해봐야 앎
3. **계통 분류(`systemEn`)와 중문명** — 미러 저장소가 AI로 생성한 값. 신뢰 불가. 2단계에서 쓰지 말 것
4. **BodyParts3D 공식 라이선스 페이지 전문** — 차단되어 못 읽음
5. **Open3Dmodel(후보 1)** — 차단되어 전혀 조사 못 함. 더 나은 에셋일 가능성 남아있음
6. **한국어 명칭** — 어떤 출처에도 없음. 2단계에서 별도 작성 필요하며 전부 미검증 표시 대상
7. **중복 파일 6종 14개의 정체** — 진짜 중복인지 근육의 갈래인지 확인 안 함. 2단계에서 육안 확인 필요
8. **`FJ2552` / `FJ2553`의 좌우** — 이름에도 `M` 접미사에도 단서가 없어 판정 불가

---

## 8. 다음 세션(1단계)에 물어볼 것

1. `.obj` → `.glb` 변환 방식 A/B/C 중 선택 (§6)
2. 1단계 범위를 **골반/고관절/요추 100개**로 확정할지, 아니면 **뼈 249개 전체**부터 볼지
3. 차단된 Open3Dmodel을 굳이 뚫어서 비교해볼지, 아니면 BodyParts3D로 확정하고 진행할지

---

## 부록 0. 재현 방법 (다음 세션용)

작업 컨테이너는 세션이 끝나면 사라진다. 다음 세션에서 에셋을 다시 받으려면:

```bash
# BodyParts3D ISA 4.0 (채택된 에셋) — 파일 목록만 먼저 받음
GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-checkout --depth 1 \
  https://github.com/jixiangying/anatomy /workspace/jixiangying/anatomy

# 필요한 파일만 골라 받기
cd /workspace/jixiangying/anatomy
git checkout HEAD -- data/            # 매핑표 (작음)
git checkout HEAD -- isa_BP3D_4.0_obj_99/FJ1418.obj   # 개별 .obj

# Z-Anatomy 용어집 (TA2.csv) — 2단계에서 필요
GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-checkout --depth 1 \
  https://github.com/z-anatomy/models-of-human-anatomy /workspace/z-anatomy/models-of-human-anatomy
cd /workspace/z-anatomy/models-of-human-anatomy && git checkout HEAD -- TA2.csv
```

**주의 2가지:**
1. `--filter=blob:none` 로 받은 저장소에서 `git ls-tree -l`(크기 조회)을 쓰면 파일마다 서버에 물어보느라 **멈춘 것처럼 느려진다.** 크기가 필요하면 `git checkout` 으로 받은 뒤 `du` 로 잴 것
2. GitHub **API**(`api.github.com`)는 이 세션에서 403이다. **git clone만 된다**

---

## 부록 A. 골반 / 고관절 / 요추 구조 100개 전체 목록

> 영문명은 원본 BodyParts3D 매핑과 대조 완료(§2). 한국어명은 아직 없음.
> `M` 접미사 = 좌측.

### 근육 (85개)

| 파일 ID | 영문명 |
|---|---|
| `FJ1547` | lateral lumbar intertransversarius |
| `FJ1547M` | lateral lumbar intertransversarius |
| `FJ1401M` | left adductor brevis |
| `FJ1402M` | left adductor longus |
| `FJ1403M` | left adductor magnus |
| `FJ1404M` | left adductor minimus |
| `FJ1449M` | left coccygeus |
| `FJ2542` | left coccygeus |
| `FJ1416M` | left gemellus inferior |
| `FJ1417M` | left gemellus superior |
| `FJ1418M` | left gluteus maximus |
| `FJ1419M` | left gluteus medius |
| `FJ1420M` | left gluteus minimus |
| `FJ1422M` | left iliacus |
| `FJ1453M` | left iliococcygeus |
| `FJ2544` | left iliococcygeus |
| `FJ1526M` | left iliocostalis cervicis |
| `FJ1527M` | left iliocostalis lumborum |
| `FJ1528M` | left iliocostalis thoracis |
| `FJ1533M` | left longissimus capitis |
| `FJ1534M` | left longissimus cervicis |
| `FJ1535M` | left longissimus thoracis |
| `FJ1522M` | left lumbar rotator |
| `FJ1425M` | left obturator externus |
| `FJ1426M` | left obturator internus |
| `FJ1427M` | left pectineus |
| `FJ1428M` | left piriformis |
| `FJ1431M` | left psoas major |
| `FJ1457M` | left pubococcygeus |
| `FJ2545` | left pubococcygeus |
| `FJ1432M` | left quadratus femoris |
| `FJ1433M` | left rectus femoris |
| `FJ1434M` | left sartorius |
| `FJ1435M` | left semimembranosus |
| `FJ1436M` | left semitendinosus |
| `FJ1438M` | left tensor fasciae latae |
| `FJ1395M` | long head of left biceps femoris |
| `FJ1395` | long head of right biceps femoris |
| `FJ1548` | medial lumbar intertransversarius |
| `FJ1548M` | medial lumbar intertransversarius |
| `FJ1398M` | oblique head of left adductor hallucis |
| `FJ1481M` | oblique head of left adductor pollicis |
| `FJ1398` | oblique head of right adductor hallucis |
| `FJ1481` | oblique head of right adductor pollicis |
| `FJ1401` | right adductor brevis |
| `FJ1402` | right adductor longus |
| `FJ1403` | right adductor magnus |
| `FJ1404` | right adductor minimus |
| `FJ2547` | right coccygeus |
| `FJ1416` | right gemellus inferior |
| `FJ1417` | right gemellus superior |
| `FJ1418` | right gluteus maximus |
| `FJ1419` | right gluteus medius |
| `FJ1420` | right gluteus minimus |
| `FJ1422` | right iliacus |
| `FJ2549` | right iliococcygeus |
| `FJ1526` | right iliocostalis cervicis |
| `FJ1527` | right iliocostalis lumborum |
| `FJ1528` | right iliocostalis thoracis |
| `FJ1533` | right longissimus capitis |
| `FJ1534` | right longissimus cervicis |
| `FJ1535` | right longissimus thoracis |
| `FJ1522` | right lumbar rotator |
| `FJ1425` | right obturator externus |
| `FJ1426` | right obturator internus |
| `FJ1427` | right pectineus |
| `FJ1428` | right piriformis |
| `FJ1431` | right psoas major |
| `FJ2550` | right pubococcygeus |
| `FJ1432` | right quadratus femoris |
| `FJ1433` | right rectus femoris |
| `FJ1434` | right sartorius |
| `FJ1435` | right semimembranosus |
| `FJ1436` | right semitendinosus |
| `FJ1438` | right tensor fasciae latae |
| `FJ1444M` | short head of left biceps femoris |
| `FJ1444` | short head of right biceps femoris |
| `FJ1465` | tendinous arch of levator ani |
| `FJ1465M` | tendinous arch of levator ani |
| `FJ2552` | tendinous arch of levator ani |
| `FJ2553` | tendinous arch of levator ani |
| `FJ1445M` | transverse head of left adductor hallucis |
| `FJ1515M` | transverse head of left adductor pollicis |
| `FJ1445` | transverse head of right adductor hallucis |
| `FJ1515` | transverse head of right adductor pollicis |

### 뼈·관절 (15개)

| 파일 ID | 영문명 |
|---|---|
| `FJ3393` | Sacrum |
| `FJ3168` | fifth lumbar vertebra |
| `FJ3157` | first lumbar vertebra |
| `FJ3165` | fourth lumbar vertebra |
| `FJ3217` | intervertebral disk of fifth lumbar vertebra |
| `FJ3212` | intervertebral disk of first lumbar vertebra |
| `FJ3216` | intervertebral disk of fourth lumbar vertebra |
| `FJ3214` | intervertebral disk of second lumbar vertebra |
| `FJ3215` | intervertebral disk of third lumbar vertebra |
| `FJ3259` | left femur |
| `FJ3288` | left hip bone |
| `FJ3365` | right femur |
| `FJ3152` | right hip bone |
| `FJ3159` | second lumbar vertebra |
| `FJ3162` | third lumbar vertebra |

---

*이 보고서의 수치는 `jixiangying/anatomy` (BodyParts3D ISA Release 4.0 미러)와 `Z-Anatomy/Models-of-human-anatomy` 를 실제로 내려받아 측정한 것임.*
