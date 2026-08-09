// 규칙으로 조합되는 한글명. 사전에 없는 것만 여기서 만든다.
//
// 왜 규칙을 쓰나: 남은 이름 500개 중 상당수가 기계적인 반복이다.
// (척추 24개, 추간판 23개, 수핵 23개, 늑연골 11개, 지골 30개, 치아 12개 …)
// 이런 건 규칙이 사람 손보다 정확하고 일관적이다.
//
// 다만 규칙 조합분은 사전(사람이 확인한 것)과 구분해서 표시한다.
// 사전에 있으면 사전이 이긴다.

const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
              seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
const SPINE = { c: '경추', t: '흉추', l: '요추', s: '천추' };

// 관절·부위 이름 조각 → 한글. 인대·관절낭 조합에 쓴다.
const PART = {
  acromioclavicular: '견쇄', sternoclavicular: '흉쇄', glenohumeral: '견갑상완',
  temporomandibular: '측두하악', radiocarpal: '요골수근', 'radio-ulnar': '요척',
  metacarpophalangeal: '중수지', metatarsophalangeal: '중족지',
  interphalangeal: '지절', carpometacarpal: '수근중수', tarsometatarsal: '족근중족',
  intercarpal: '수근간', intercuneiform: '설상골간', cuneonavicular: '설상주상',
  cuneocuboid: '설상입방', cuboideonavicular: '입방주상', calcaneocuboid: '종입방',
  calcaneonavicular: '종주상', talocalcaneal: '거종', talonavicular: '거주상',
  talofibular: '거비', tibiofibular: '경비', tibiocalcaneal: '경종', tibionavicular: '경주상',
  tibiotalar: '경거', calcaneofibular: '종비', costotransverse: '늑횡돌기',
  pubic: '치골', 'pubic symphysis': '치골결합', sacrococcygeal: '천미',
  scapholunate: '주월상', lunotriquetral: '월삼각', pisohamate: '두유구',
  pisometacarpal: '두중수', pisotriquetral: '두삼각', capitohamate: '유두유구',
  scaphocapitate: '주유두', triquetrocapitate: '삼각유두', triquetrohamate: '삼각유구',
  trapeziotrapezoidal: '대소능형', trapezoideocapitate: '소능형유두',
  ulnocarpal: '척수근', ulnolunate: '척월상', ulnotriquetral: '척삼각',
  ulnocapitate: '척유두', ulnopisiform: '척두상', radiocapitate: '요유두',
  radioscaphocapitate: '요주유두', scaphotriquetral: '주삼각',
  meniscotibial: '반월경골', meniscopatellar: '반월슬개', popliteofibular: '슬와비골',
  thyrohyoid: '갑상설골', cricothyroid: '윤상갑상', cricopharyngeal: '윤상인두',
  sphenomandibular: '접형하악', stylomandibular: '경돌하악', stylohyoid: '경돌설골',
  pterygospinous: '익돌극', intercornual: '각간', interclavicular: '쇄골간',
  interpubic: '치골간', intersesamoid: '종자골간', intervertebral: '추간',
  intertransverse: '횡돌기간', interspinous: '극간', interosseous: '골간',
};
const SIDE = {
  anterior: '전', posterior: '후', superior: '상', inferior: '하',
  medial: '내측', lateral: '외측', dorsal: '배측', palmar: '장측',
  plantar: '족저', deep: '심부', superficial: '천부', transverse: '횡',
  oblique: '사', radial: '요측', ulnar: '척측', long: '장', short: '단',
};

export function compose(base) {
  const s = base.trim();
  let m;

  // 척추뼈: Vertebra C3 / T10 / L5
  if ((m = s.match(/^Vertebra ([CTLS])(\d+)$/i)))
    return { ko: `제${m[2]}${SPINE[m[1].toLowerCase()]}`, how: '규칙' };

  // 추간판·수핵: Intervertebral disc L4-L5 / Nucleus pulposus T12-L1
  if ((m = s.match(/^Intervertebral disc ([CTLS]\d+)-([CTLS]\d+)$/i)))
    return { ko: `${m[1].toUpperCase()}-${m[2].toUpperCase()} 추간판`, how: '규칙' };
  if ((m = s.match(/^Nucleus pulposus ([CTLS]\d+)-([CTLS]\d+)$/i)))
    return { ko: `${m[1].toUpperCase()}-${m[2].toUpperCase()} 수핵`, how: '규칙' };

  // 늑연골
  if ((m = s.match(/^Costal cartilage of (\w+) rib$/i)) && ORD[m[1].toLowerCase()])
    return { ko: `제${ORD[m[1].toLowerCase()]}늑연골`, how: '규칙' };

  // 지골: Distal phalanx of third finger of hand
  if ((m = s.match(/^(Distal|Middle|Proximal) phalanx of (\w+) finger of (hand|foot)$/i))) {
    const pos = { distal: '원위', middle: '중간', proximal: '근위' }[m[1].toLowerCase()];
    const n = ORD[m[2].toLowerCase()];
    const hf = m[3].toLowerCase() === 'hand' ? '손' : '발';
    if (pos && n) return { ko: `${hf} 제${n}${pos}지골`, how: '규칙' };
  }

  // 치아
  if ((m = s.match(/^(Upper|Lower) (medial|lateral) incisor$/i)))
    return { ko: `${m[1].toLowerCase() === 'upper' ? '상악' : '하악'} ${m[2].toLowerCase() === 'medial' ? '중절치' : '측절치'}`, how: '규칙' };
  if ((m = s.match(/^(Upper|Lower) canine$/i)))
    return { ko: `${m[1].toLowerCase() === 'upper' ? '상악' : '하악'} 견치`, how: '규칙' };
  if ((m = s.match(/^(Upper|Lower) (first|second) premolar$/i)))
    return { ko: `${m[1].toLowerCase() === 'upper' ? '상악' : '하악'} 제${ORD[m[2].toLowerCase()]}소구치`, how: '규칙' };
  if ((m = s.match(/^(Upper|Lower) (first|second) molar tooth$/i)))
    return { ko: `${m[1].toLowerCase() === 'upper' ? '상악' : '하악'} 제${ORD[m[2].toLowerCase()]}대구치`, how: '규칙' };

  // 관절낭 / 관절원판
  if ((m = s.match(/^Articular capsule of (?:the )?(.+?) joint$/i))) {
    const p = PART[m[1].toLowerCase()];
    if (p) return { ko: `${p}관절낭`, how: '규칙' };
  }
  if ((m = s.match(/^Articular disc of (?:the )?(.+?) joint$/i))) {
    const p = PART[m[1].toLowerCase()];
    if (p) return { ko: `${p}관절 관절원판`, how: '규칙' };
  }

  // 점액낭 / 건초
  if ((m = s.match(/^Tendon sheath of (.+)$/i))) return { ko: `${m[1]} 건초`, how: '규칙(영문 혼용)' };
  if (/bursa$/i.test(s) || /^Bursa of /i.test(s)) return { ko: `${s} (점액낭)`, how: '규칙(영문 혼용)' };

  // 인대: [방향] + [부위] + ligament
  if ((m = s.match(/^(?:(\w+) )?([A-Za-z-]+) ligaments?$/i))) {
    const dir = m[1] ? SIDE[m[1].toLowerCase()] : '';
    const p = PART[m[2].toLowerCase()];
    if (p) return { ko: `${dir}${p}인대`, how: '규칙' };
  }
  if ((m = s.match(/^(\w+) (\w+) ligaments?$/i))) {
    const dir = SIDE[m[1].toLowerCase()], p = PART[m[2].toLowerCase()];
    if (dir && p) return { ko: `${dir}${p}인대`, how: '규칙' };
  }

  return null;
}
