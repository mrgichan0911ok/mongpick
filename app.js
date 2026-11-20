/* =========================================================
   몽픽(MongPick)
   - 꿈 상징 11,705 색인 + 7×7 숫자 압축 엔진
   - 만세력(사주·오행·일진) 계산 + 꿈 운세 결합
   데이터: dream_data.json
   ========================================================= */
(function () {
  'use strict';

  /* =========================================================
     0. 유틸
     ========================================================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uniq = (a) => Array.from(new Set(a));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const fmt1 = (v) => (Math.round(v * 10) / 10).toString();

  const ballClass = (n) => (n <= 10 ? 'b1' : n <= 20 ? 'b2' : n <= 30 ? 'b3' : n <= 40 ? 'b4' : 'b5');
  const numballHTML = (n, cls = '') => `<span class="numball ${ballClass(n)} ${cls}">${n}</span>`;

  function hasJong(word) {
    const w = String(word || '');
    for (let i = w.length - 1; i >= 0; i--) {
      const c = w.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) return ((c - 0xAC00) % 28) !== 0;
      if (/[a-zA-Z0-9]/.test(w[i])) return false;
    }
    return false;
  }
  function josa(word, pair) {
    return word + (hasJong(word) ? pair[0] : pair[1]);
  }
  /* '으로'는 받침이 ㄹ일 때 '로'가 된다 (한자·괄호가 붙어도 마지막 한글을 본다) */
  function roJosa(word) {
    const w = String(word || '');
    for (let i = w.length - 1; i >= 0; i--) {
      const c = w.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) {
        const jong = (c - 0xAC00) % 28;
        return (jong === 0 || jong === 8) ? '로' : '으로';
      }
      if (/[a-zA-Z0-9]/.test(w[i])) return '으로';
    }
    return '으로';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickWeighted(rng, arr, weights) {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return arr[Math.floor(rng() * arr.length)];
    let r = rng() * total;
    for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  }

  let toastTimer = null;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 1900);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
  }

  /* =========================================================
     1. 7×7 용지 기하
     ========================================================= */
  const G = {
    rowOf: (n) => Math.ceil(n / 7),
    colOf: (n) => ((n - 1) % 7) + 1,
    rowNums(r) {
      const s = (r - 1) * 7 + 1, e = Math.min(r * 7, 45), out = [];
      for (let i = s; i <= e; i++) out.push(i);
      return out;
    },
    colNums(c) { const out = []; for (let i = c; i <= 45; i += 7) out.push(i); return out; },
    rowEnd: (r) => Math.min(r * 7, 45),
    diagNums(n) {
      const r = G.rowOf(n), c = G.colOf(n), out = [];
      for (let k = -6; k <= 6; k++) {
        const rr = r + k;
        if (rr < 1 || rr > 7) continue;
        for (const cc of [c + k, c - k]) {
          if (cc < 1 || cc > 7) continue;
          const v = (rr - 1) * 7 + cc;
          if (v >= 1 && v <= 45 && v !== n) out.push(v);
        }
      }
      return uniq(out).sort((a, b) => a - b);
    },
    sameEnd(n) {
      const d = n % 10, out = [];
      for (let v = d === 0 ? 10 : d; v <= 45; v += 10) if (v !== n) out.push(v);
      return out;
    }
  };

  function acValue(nums) {
    const d = new Set();
    for (let i = 0; i < nums.length; i++)
      for (let j = i + 1; j < nums.length; j++) d.add(Math.abs(nums[i] - nums[j]));
    return d.size - (nums.length - 1);
  }
  function statsOf(nums) {
    const odd = nums.filter((n) => n % 2 === 1).length;
    const bands = [0, 0, 0, 0, 0];
    nums.forEach((n) => bands[clamp(Math.floor((n - 1) / 10), 0, 4)]++);
    return {
      ac: acValue(nums), odd, even: 6 - odd, total: sum(nums),
      bands, bandStr: bands.join('·'), bandCount: bands.filter((x) => x > 0).length,
      consecutive: nums.filter((n, i) => i > 0 && n - nums[i - 1] === 1).length
    };
  }

  /* =========================================================
     2. 만세력(사주) 엔진
        - 일진: 율리우스일 기준 60갑자 (2000-01-01 무오일 앵커)
        - 년주: 입춘(태양황경 315°) / 월주: 12절(황경 30° 간격)
        - 시주: 오자법, 23시 이후는 다음 날(조자시설)
     ========================================================= */
  const SAJU = (function () {
    const GAN = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
    const GAN_H = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const JI = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
    const JI_H = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const GAN_E = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
    const JI_E = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
    const ELEMS = ['목', '화', '토', '금', '수'];
    const ELEM_H = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };
    const ELEM_NUMS = { 수: [1, 6], 화: [2, 7], 목: [3, 8], 금: [4, 9], 토: [0, 5] };
    const SAENG = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
    const GEUK = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' };
    const GROUP_MEAN = {
      비화: '동료·경쟁·자립', 식상: '표현·활동·재능', 재성: '재물·현실·결과',
      관성: '규범·압박·직장', 인성: '도움·문서·보호'
    };

    function jdFromYMD(y, m, d) {
      if (m <= 2) { y -= 1; m += 12; }
      const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
      return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
    }
    const jdn = (y, m, d) => Math.floor(jdFromYMD(y, m, d) + 0.5);

    function sunLon(jd) {
      const T = (jd - 2451545.0) / 36525;
      const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
      const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
      const Mr = M * Math.PI / 180;
      const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
        + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
        + 0.000289 * Math.sin(3 * Mr);
      const app = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * Math.PI / 180);
      return ((app % 360) + 360) % 360;
    }
    const lonAt = (y, m, d, hourKST) => sunLon(jdFromYMD(y, m, d) + (hourKST - 9) / 24);

    const TERM_APPROX = {
      315: [2, 4], 345: [3, 6], 15: [4, 5], 45: [5, 6], 75: [6, 6], 105: [7, 7],
      135: [8, 8], 165: [9, 8], 195: [10, 8], 225: [11, 7], 255: [12, 7], 285: [1, 6]
    };
    const TERM_NAME = { 315: '입춘', 345: '경칩', 15: '청명', 45: '입하', 75: '망종', 105: '소서', 135: '입추', 165: '백로', 195: '한로', 225: '입동', 255: '대설', 285: '소한' };

    function termInstant(year, deg) {
      const ap = TERM_APPROX[deg];
      let lo = jdFromYMD(year, ap[0], ap[1]) - 5;
      let hi = lo + 10;
      const f = (j) => ((sunLon(j) - deg + 540) % 360) - 180;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    }
    function jdToKSTStr(jd) {
      const j = jd + 9 / 24 + 0.5;
      const Z = Math.floor(j), F = j - Z;
      let A = Z;
      if (Z >= 2299161) {
        const alpha = Math.floor((Z - 1867216.25) / 36524.25);
        A = Z + 1 + alpha - Math.floor(alpha / 4);
      }
      const B = A + 1524, C = Math.floor((B - 122.1) / 365.25);
      const D = Math.floor(365.25 * C), E = Math.floor((B - D) / 30.6001);
      const day = B - D - Math.floor(30.6001 * E) + F;
      const month = E < 14 ? E - 1 : E - 13;
      const year = month > 2 ? C - 4716 : C - 4715;
      const dInt = Math.floor(day), frac = day - dInt;
      const hh = Math.floor(frac * 24), mm = Math.round((frac * 24 - hh) * 60);
      const pad = (v) => String(v).padStart(2, '0');
      return `${year}-${pad(month)}-${pad(dInt)} ${pad(hh)}:${pad(mm)}`;
    }

    function yearPillar(y, m, d, hour) {
      const birthJd = jdFromYMD(y, m, d) + ((hour == null ? 12 : hour) - 9) / 24;
      const ipchun = termInstant(y, 315);
      const yy = birthJd < ipchun ? y - 1 : y;
      const idx = ((yy - 4) % 60 + 60) % 60;
      return { idx, stem: idx % 10, branch: idx % 12, solarYear: yy };
    }
    function monthIndex(lon) { return Math.floor((((lon - 315) % 360 + 360) % 360) / 30); }
    function monthPillar(yearStem, lon) {
      const mi = monthIndex(lon);
      const base = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0][yearStem];
      const stem = (base + mi) % 10;
      const branch = (2 + mi) % 12;
      return { stem, branch, mi };
    }
    function dayPillar(y, m, d, hour) {
      let idx = (jdn(y, m, d) + 49) % 60;
      if (hour != null && (hour >= 23 || hour < 1)) {
        // 조자시설: 23시~01시는 다음 날 일주
        if (hour >= 23) idx = (idx + 1) % 60;
      }
      return { idx, stem: idx % 10, branch: idx % 12 };
    }
    function hourPillar(dayStem, hour) {
      const branch = Math.floor(((hour + 1) % 24) / 2);
      const base = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8][dayStem];
      return { stem: (base + branch) % 10, branch };
    }

    function tenGod(dayStem, otherStem) {
      const e1 = GAN_E[dayStem], e2 = GAN_E[otherStem];
      const same = dayStem % 2 === otherStem % 2;
      if (e1 === e2) return { group: '비화', name: same ? '비견' : '겁재' };
      if (SAENG[e1] === e2) return { group: '식상', name: same ? '식신' : '상관' };
      if (GEUK[e1] === e2) return { group: '재성', name: same ? '편재' : '정재' };
      if (GEUK[e2] === e1) return { group: '관성', name: same ? '편관' : '정관' };
      return { group: '인성', name: same ? '편인' : '정인' };
    }
    function relOf(dayStem, elem) {
      const e1 = GAN_E[dayStem];
      if (e1 === elem) return '비화';
      if (SAENG[e1] === elem) return '식상';
      if (GEUK[e1] === elem) return '재성';
      if (GEUK[elem] === e1) return '관성';
      return '인성';
    }

    function pillarObj(stem, branch) {
      return {
        stem, branch,
        stemChar: GAN[stem], stemH: GAN_H[stem], stemE: GAN_E[stem],
        branchChar: JI[branch], branchH: JI_H[branch], branchE: JI_E[branch],
        ganji: GAN[stem] + JI[branch],
        ganjiH: GAN_H[stem] + JI_H[branch]
      };
    }

    function natal(birth) {
      const { y, m, d } = birth;
      const hour = birth.hour == null ? null : birth.hour;
      const lon = lonAt(y, m, d, hour == null ? 12 : hour);
      const yp = yearPillar(y, m, d, hour);
      const mp = monthPillar(yp.stem, lon);
      const dp = dayPillar(y, m, d, hour);
      const hp = hour == null ? null : hourPillar(dp.stem, hour);

      const pillars = [
        { key: '년', ...pillarObj(yp.stem, yp.branch) },
        { key: '월', ...pillarObj(mp.stem, mp.branch) },
        { key: '일', ...pillarObj(dp.stem, dp.branch) },
        hour == null ? { key: '시', unknown: true } : { key: '시', ...pillarObj(hp.stem, hp.branch) }
      ];
      const chars = [];
      pillars.forEach((p) => {
        if (p.unknown) return;
        chars.push({ elem: p.stemE, pos: p.key, kind: '천간' });
        chars.push({ elem: p.branchE, pos: p.key, kind: '지지' });
      });
      const counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
      chars.forEach((c) => counts[c.elem]++);
      const total = chars.length;
      const minCount = Math.min.apply(null, ELEMS.map((e) => counts[e]));
      const maxCount = Math.max.apply(null, ELEMS.map((e) => counts[e]));
      const weak = ELEMS.filter((e) => counts[e] === minCount);
      const strong = ELEMS.filter((e) => counts[e] === maxCount);

      return {
        birth, lon, pillars, counts, total, weak, strong,
        dayStem: dp.stem, dayElem: GAN_E[dp.stem],
        dayGanji: GAN[dp.stem] + JI[dp.branch],
        monthBranch: mp.branch, monthBranchChar: JI[mp.branch], monthBranchH: JI_H[mp.branch],
        monthElem: JI_E[mp.branch],
        hasHour: hour != null,
        monthTerm: TERM_NAME[([315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285][mp.mi])] || '',
        monthTermDeg: [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285][mp.mi]
      };
    }

    function today(now) {
      const d = now || new Date();
      const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(), h = d.getHours();
      const lon = lonAt(y, m, day, h);
      const yp = yearPillar(y, m, day, h);
      const mp = monthPillar(yp.stem, lon);
      const dp = dayPillar(y, m, day, null); // 오늘의 일진은 달력 날짜 기준
      return {
        y, m, d: day, hour: h, lon,
        year: yp, month: mp, day: dp,
        pillars: [
          { key: '년', ...pillarObj(yp.stem, yp.branch) },
          { key: '월', ...pillarObj(mp.stem, mp.branch) },
          { key: '일', ...pillarObj(dp.stem, dp.branch) }
        ],
        ganji: GAN[dp.stem] + JI[dp.branch],
        ganjiH: GAN_H[dp.stem] + JI_H[dp.branch],
        term: TERM_NAME[[315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285][mp.mi]],
        termInstant: jdToKSTStr(termInstant(y, [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285][mp.mi]))
      };
    }

    /* 오늘 간지 vs 내 일간 */
    function dayFeeling(dayStem, t) {
      const stemTG = tenGod(dayStem, t.day.stem);
      const branchRel = relOf(dayStem, JI_E[t.day.branch]);
      // 오늘의 년·월·일 천지 6글자에 대한 십신 가중 집계
      const weights = { 년: 1, 월: 1.4, 일: 2.2 };
      const groups = { 비화: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
      t.pillars.forEach((p) => {
        const w = weights[p.key] || 1;
        groups[tenGod(dayStem, p.stem).group] += w;
        groups[relOf(dayStem, p.branchE)] += w;
      });
      const sorted = Object.keys(groups).sort((a, b) => groups[b] - groups[a]);
      return {
        stemTG, branchRel, groups, dominant: sorted[0],
        second: sorted[1],
        meaning: GROUP_MEAN[stemTG.group]
      };
    }

    function elemOfNumber(n) {
      const d = n % 10;
      if (d === 1 || d === 6) return '수';
      if (d === 2 || d === 7) return '화';
      if (d === 3 || d === 8) return '목';
      if (d === 4 || d === 9) return '금';
      return '토'; // 0, 5
    }
    function numbersOfElem(e) {
      const out = [];
      const digits = ELEM_NUMS[e] || [];
      for (let n = 1; n <= 45; n++) if (digits.includes(n % 10)) out.push(n);
      return out;
    }

    return {
      GAN, GAN_H, JI, JI_H, GAN_E, JI_E, ELEMS, ELEM_H, ELEM_NUMS, GROUP_MEAN,
      natal, today, dayFeeling, tenGod, relOf, elemOfNumber, numbersOfElem,
      termInstant, jdToKSTStr, sunLon, lonAt
    };
  })();

  /* =========================================================
     3. 꿈 성격(길몽/흉몽) · 오행 표
     ========================================================= */
  const SIGN_LEX = [
    // p: +길몽 / -주의, cat: 성격, e: 오행
    ['돼지', 2.2, '재물', '수'], ['똥', 2.4, '재물', '토'], ['돈', 2.0, '재물', '금'],
    ['황금', 1.8, '재물', '금'], ['금', 1.2, '재물', '금'], ['보석', 1.6, '재물', '금'],
    ['쌀', 1.6, '재물', '토'], ['떡', 1.2, '재물', '토'], ['잉어', 2.0, '재물', '수'],
    ['물고기', 1.2, '재물', '수'], ['맑은 물', 1.6, '재물', '수'], ['물', 0.8, '재물', '수'],
    ['불', 1.0, '변화', '화'], ['용', 2.0, '변화', '토'], ['해', 1.2, '변화', '화'],
    ['하늘', 1.0, '변화', '화'], ['무지개', 1.4, '변화', '화'], ['별', 0.8, '변화', '화'],
    ['조상', 2.0, '대인', '토'], ['아기', 1.6, '대인', '수'], ['결혼', 1.8, '대인', '화'],
    ['웃', 1.0, '대인', '화'], ['꽃', 1.0, '대인', '목'], ['집', 0.8, '대인', '토'],
    ['나무', 0.6, '변화', '목'], ['숲', 0.8, '변화', '목'], ['산', 0.6, '변화', '토'],
    // 주의
    ['이빨', -2.0, '건강', '금'], ['피', -1.8, '건강', '수'], ['죽', -2.2, '변화', '수'],
    ['시체', -2.0, '변화', '토'], ['쫓', -1.8, '대인', '화'], ['도망', -1.6, '대인', '수'],
    ['떨어', -1.2, '변화', '토'], ['깨', -1.2, '변화', '금'], ['잃', -1.4, '재물', '수'],
    ['다치', -1.8, '건강', '금'], ['울', -1.0, '대인', '수'], ['감옥', -1.8, '변화', '토'],
    ['썩', -1.8, '건강', '토'], ['검은', -1.0, '변화', '수'], ['도둑', -1.4, '재물', '수'],
    ['넘어', -1.0, '건강', '토'], ['사고', -1.8, '건강', '금'], ['타는', -1.4, '변화', '화'],
    ['빠지', -0.8, '변화', '수'], ['빠져', -0.8, '변화', '수'], ['무서', -1.0, '대인', '수']
  ];

  const ELEM_WORDS = [
    ['물', '수'], ['바다', '수'], ['강', '수'], ['비', '수'], ['눈사람', '수'], ['술', '수'],
    ['커피', '수'], ['국물', '수'], ['피', '수'], ['우물', '수'], ['호수', '수'], ['수영', '수'],
    ['불', '화'], ['해', '화'], ['촛불', '화'], ['번개', '화'], ['라이터', '화'], ['담배', '화'],
    ['나무', '목'], ['숲', '목'], ['풀', '목'], ['꽃', '목'], ['잎', '목'], ['부추', '목'],
    ['채소', '목'], ['대나무', '목'], ['화분', '목'], ['풀밭', '목'],
    ['흙', '토'], ['산', '토'], ['돌', '토'], ['집', '토'], ['방', '토'], ['밭', '토'],
    ['벽', '토'], ['계단', '토'], ['길', '토'], ['마당', '토'],
    ['칼', '금'], ['가위', '금'], ['유리', '금'], ['금', '금'], ['시계', '금'], ['돈', '금'],
    ['차', '금'], ['자전거', '금'], ['안경', '금'], ['열쇠', '금'], ['스마트폰', '금'], ['가방', '금']
  ];
  const ANIMAL_ELEM = {
    쥐: '수', 소: '토', 호랑이: '목', 토끼: '목', 용: '토', 뱀: '화',
    말: '화', 양: '토', 원숭이: '금', 닭: '금', 개: '토', 돼지: '수',
    고양이: '목', 강아지: '토', 뱀: '화'
  };

  function elementOfWord(word, cat) {
    const w = String(word || '');
    let best = null;
    const consider = (k, e) => { if (w.indexOf(k) >= 0 && (!best || k.length > best.k.length)) best = { k, e }; };
    ELEM_WORDS.forEach(([k, e]) => consider(k, e));
    Object.keys(ANIMAL_ELEM).forEach((k) => consider(k, ANIMAL_ELEM[k]));
    if (best) return best.e;
    if (cat) {
      if (cat.indexOf('자연 상징군 > 물') === 0) return '수';
      if (cat.indexOf('자연 상징군 > 불') === 0) return '화';
      if (cat.indexOf('자연 상징군 > 지형') === 0) return '토';
      if (cat.indexOf('자연 상징군 > 식물') === 0) return '목';
      if (cat.indexOf('자연 상징군 > 하늘') === 0) return '화';
      if (cat.indexOf('자연 상징군 > 기상') === 0) return '수';
      if (cat.indexOf('음식 상징군') === 0) return '토';
    }
    return null;
  }

  /* =========================================================
     3-b. 사주 × 꿈 — 15칸 매칭 엔진 (2차 판)
        꿈 소재 → 그 소재의 오행 → 내 원국의 그 오행 상태(부족·중간·과다)
        → 15칸 판정(채움몽·관찰몽·완충몽·주의몽).
        물상(풍경화)은 옮기는 비유일 뿐, 판정 근거로 쓰지 않는다.
        같은 꿈이라도 원국의 그 오행이 얇으면 채움몽, 넘치면 완충·주의몽으로 갈린다.
     ========================================================= */
  const ELEM_NOUN = { 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' };
  const ELEM_STATE_KO = { weak: '부족', neutral: '중간', strong: '과다' };

  function sajuPack() { return (D.raw && D.raw.saju) || null; }

  /* 눈높이(통변) 게이트 — 사용자가 사주 용어를 꺼내면 그만큼만 용어를 쓴다 */
  function toneOf(text) {
    const t = String(text || '');
    if (/일간|용신|희신|월지|격국|종격|비견|겁주|겁재|식신|상관|편재|정재|편관|정관|편인|정인|십성/.test(t)) return '상';
    if (/오행|[木火土金水]|부족한 기운|기운이 부족|목화토금수/.test(t)) return '중';
    return '하';
  }
  function elemLabel(elem, tone) {
    if (!elem) return '';
    const h = SAJU.ELEM_H[elem] || '';
    if (tone === '하') return ELEM_NOUN[elem] || elem;
    return elem + '(' + h + ')';
  }

  /* 한 글자 소재('물'·'강'·'불')는 '강아지'·'물건' 같은 다른 낱말 속에서 걸리지 않게 경계를 본다 */
  const DREAM_JOSA = ['에서는', '에게서', '이라고', '에서', '에게', '한테', '부터', '까지', '처럼', '보다',
    '으로', '이라', '라도', '이나', '이랑', '에는', '에도', '만큼', '조차', '마저', '인데', '지만', '는데',
    '이', '가', '은', '는', '을', '를', '에', '와', '과', '도', '만', '로', '랑', '의', '께'];
  function singleCharOk(text, pos) {
    const before = text[pos - 1] || ' ';
    if (/[가-힣a-zA-Z0-9]/.test(before)) return false;
    const after = text.slice(pos + 1);
    if (!after) return true;
    if (/^[\s.,!?~·"'\])\}>:;]/.test(after)) return true;
    for (const j of DREAM_JOSA) {
      if (after.indexOf(j) !== 0) continue;
      const rest = after.slice(j.length);
      if (!rest || /^[\s.,!?~·"'\])\}>:;]/.test(rest)) return true;
      if (/^(다|요|고|서|면|니|죠|서요|는데|지만)/.test(rest)) return true;
    }
    return false;
  }
  function findWordAt(text, w) {
    if (!w) return -1;
    if (w.length > 1) return text.indexOf(w);
    let pos = text.indexOf(w);
    while (pos !== -1) {
      if (singleCharOk(text, pos)) return pos;
      pos = text.indexOf(w, pos + 1);
    }
    return -1;
  }

  /* 꿈 문장 → 소재별 오행 (데이터의 dreamSymbols 우선, 없으면 내장 오행 낱말) */
  function scanDreamElems(text) {
    const pack = sajuPack();
    const syms = (pack && pack.dreamSymbols) || [];
    const out = [];
    syms.forEach((sym) => {
      const words = (sym.match && sym.match.length ? sym.match : [sym.ko]);
      let pos = text.length;
      const hits = [];
      words.forEach((w) => {
        const i = findWordAt(text, w);
        if (i < 0) return;
        hits.push(w);
        if (i < pos) pos = i;
      });
      if (!hits.length) return;
      out.push({ ko: sym.ko, elem: sym.elem, sense: sym.sense || '', hits, pos, source: 'symbol' });
    });
    return out.sort((a, b) => a.pos - b.pos);
  }
  function scanElemWords(text) {
    const out = [];
    ELEM_WORDS.forEach(([w, e]) => {
      const pos = findWordAt(text, w);
      if (pos >= 0) out.push({ ko: w, elem: e, sense: '', hits: [w], pos, source: 'word' });
    });
    Object.keys(ANIMAL_ELEM).forEach((k) => {
      const pos = findWordAt(text, k);
      if (pos >= 0) out.push({ ko: k, elem: ANIMAL_ELEM[k], sense: '', hits: [k], pos, source: 'animal' });
    });
    return out.sort((a, b) => a.pos - b.pos);
  }
  function dreamElemProfile(text) {
    const sym = scanDreamElems(text || '');
    const base = sym.length ? sym : scanElemWords(text || '');
    const by = {};
    SAJU.ELEMS.forEach((e) => { by[e] = { elem: e, ko: '', score: 0, words: [], senses: [], sources: [] }; });
    base.forEach((h) => {
      const b = by[h.elem];
      if (!b) return;
      b.score += 1 + 0.45 * (h.hits.length - 1) + (h.source === 'symbol' ? 0.5 : 0);
      if (!b.ko) b.ko = h.ko;
      h.hits.forEach((x) => { if (b.words.indexOf(x) < 0) b.words.push(x); });
      if (h.sense && b.senses.indexOf(h.sense) < 0) b.senses.push(h.sense);
      if (b.sources.indexOf(h.source) < 0) b.sources.push(h.source);
    });
    const ranked = SAJU.ELEMS.map((e) => by[e]).filter((b) => b.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ranked, primary: ranked[0] || null, matches: base };
  }

  function natalElemState(ntl, elem) {
    if (!ntl || !elem) return { key: 'neutral', count: 0, total: 0 };
    const count = ntl.counts[elem] || 0;
    const weak = ntl.weak.indexOf(elem) >= 0;
    const strong = ntl.strong.indexOf(elem) >= 0;
    let key = 'neutral';
    if (weak && !strong) key = 'weak';
    else if (strong && !weak) key = 'strong';
    return { key, count, total: ntl.total, weak, strong };
  }
  function matchRule(dreamElem, stateKey) {
    const pack = sajuPack();
    const rules = (pack && pack.matchRules) || [];
    return rules.filter((r) => r.dreamElem === dreamElem && r.natal === stateKey)[0] || null;
  }

  /* 22글자 물상 → 내 사주 풍경화 한 줄 (설명용 그림) */
  function mulsangOf(ntl) {
    if (!ntl) return null;
    const pack = sajuPack();
    const letters = (pack && pack.letters) || [];
    const seasons = (pack && pack.seasons) || {};
    const adjustMap = (pack && pack.seasonAdjust) || {};
    const byId = (id) => letters.filter((l) => l.id === id)[0] || null;
    const day = ntl.pillars.filter((p) => p.key === '일')[0];
    const month = ntl.pillars.filter((p) => p.key === '월')[0];
    const dayL = day ? byId(day.stemH) : null;
    const monthL = month ? byId(month.branchH) : null;
    if (!dayL && !monthL) return null;
    const season = (monthL && monthL.season) || seasons[month ? month.branchH : ''] || '';
    const bg = (monthL && (monthL.bg || monthL.image)) || '';
    const hero = (dayL && dayL.image) || (SAJU.GAN[ntl.dayStem] + '(' + ntl.dayElem + ')');
    const props = [];
    ntl.pillars.forEach((p) => {
      if (p.unknown) return;
      [p.stemH, p.branchH].forEach((id) => {
        if (day && id === day.stemH) return;
        if (month && id === month.branchH) return;
        const L = byId(id);
        if (!L || !L.prop) return;
        if (props.indexOf(L.prop) < 0) props.push(L.prop);
      });
    });
    const shown = props.slice(0, 2);
    const seasonElem = monthL ? monthL.elem : null;
    const adj = seasonElem ? adjustMap[seasonElem] : null;
    const needHere = adj ? adj.need : null;
    const hasNeed = needHere ? (ntl.counts[needHere] || 0) > 0 : false;
    const adjust = adj ? (hasNeed ? adj.present : adj.absent) : '';
    let line = (bg ? bg + ' 위에 선 ' : '') + hero;
    if (shown.length) line += ' 곁에 ' + shown.join('·');
    if (adjust) line += ' — ' + adjust;
    return {
      line, bg, hero, props: shown, season, seasonElem, adjust, needHere, hasNeed,
      monthBranch: month ? month.branchH : '',
      needThin: !!(needHere && ntl.weak.indexOf(needHere) >= 0)
    };
  }

  function scanSigns(text) {
    const out = [];
    SIGN_LEX.forEach(([w, p, cat, e]) => {
      if (text.indexOf(w) >= 0) out.push({ word: w, p, cat, e });
    });
    // 상위어끼리 중복(물 / 맑은 물)은 강한 쪽만
    return out.filter((s) => !out.some((o) => o !== s && o.word.length > s.word.length && o.word.indexOf(s.word) >= 0));
  }

  /* =========================================================
     4. 데이터 색인
     ========================================================= */
  const D = { raw: null, aliasMap: new Map(), bucket: new Map(), applyMap: new Map(), applyBucket: new Map() };

  function aliasesOf(kw) {
    const clean = kw.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/[*★]/g, ' ').trim();
    return uniq(clean.split(/[·\/]/).map((p) => p.trim()).filter((p) => p.length >= 1 && p.length <= 12));
  }
  function parseNumTokens(str) {
    const nums = [], ends = [];
    String(str).split(',').forEach((t) => {
      t = t.trim();
      if (!t) return;
      const m = t.match(/^(\d)끝수?$/);
      if (m) { ends.push(Number(m[1])); return; }
      const v = Number(t);
      if (v >= 1 && v <= 45) nums.push(v);
    });
    ends.forEach((d) => { for (let n = d === 0 ? 10 : d; n <= 45; n += 10) if (!nums.includes(n)) nums.push(n); });
    return { nums: uniq(nums.sort((a, b) => a - b)), ends };
  }

  function buildIndices(raw) {
    D.raw = raw;
    raw.words.forEach(([kw, numStr, star, catIdx]) => {
      const p = parseNumTokens(numStr);
      if (!p.nums.length) return;
      const entry = { kw, nums: p.nums, ends: p.ends, star, cat: raw.categories[catIdx] || '', layer: 'A' };
      aliasesOf(kw).forEach((a) => {
        if (!D.aliasMap.has(a)) D.aliasMap.set(a, []);
        D.aliasMap.get(a).push(entry);
      });
    });
    raw.apply.forEach(([kw, nums, notes]) => {
      const list = nums.map(Number).filter((n) => n >= 1 && n <= 45);
      if (!list.length) return;
      const entry = { kw, nums: uniq(list.sort((a, b) => a - b)), ends: [], star: 0, notes: notes || [], layer: 'B' };
      aliasesOf(kw).forEach((a) => {
        if (!D.applyMap.has(a)) D.applyMap.set(a, []);
        D.applyMap.get(a).push(entry);
      });
    });
    const mk = (map, target) => map.forEach((_, alias) => {
      const c = alias[0];
      if (!target.has(c)) target.set(c, []);
      target.get(c).push(alias);
    });
    mk(D.aliasMap, D.bucket);
    mk(D.applyMap, D.applyBucket);
  }

  /* =========================================================
     5. 문장 → 상징 매칭
     ========================================================= */
  const JOSA = /(에서|에게|한테|부터|까지|처럼|보다|으로|라고|하고|라도|이나|이랑|께서|에는|에도|에만|만큼|조차|마저|인데|지만|는데|어요|아요|입니다|했다|한다|했다|한|할|된|될|인|의|을|를|이|가|은|는|도|에|와|과|랑|로|서|요|다|고|만)$/;

  function okSingleChar(text, pos, alias) {
    const before = text[pos - 1] || ' ';
    const after = text.slice(pos + alias.length);
    if (/[가-힣a-zA-Z0-9]/.test(before)) return false;
    if (!after) return true;
    if (/[\s.,!?~·]/.test(after[0])) return true;
    const tail = after.match(/^[가-힣]{1,3}/);
    return tail ? JOSA.test(tail[0]) : false;
  }

  /* '물(빠짐)' 같은 변형 표제어: 괄호 안 조건어가 문장에 있을 때만 적용.
     기본 표제어('물')가 있으면 그것은 항상 적용한다. */
  function condStem(kw, alias) {
    const m = kw.match(/\(([^)]+)\)/);
    if (!m) return null;
    const base = kw.replace(/\([^)]*\)/g, '').trim();
    if (base !== alias) return null;               // 괄호 안이 별칭으로 등록된 경우
    let stem = m[1].replace(/(참|음|짐|속|중|함|됨|는|운|한|된|기)$/, '');
    if (!stem) stem = m[1].slice(0, 1);
    return stem.slice(0, 2);
  }
  function filterEntries(alias, entries, text) {
    if (entries.length <= 1) return entries;
    const base = entries.filter((e) => e.kw === alias);
    if (base.length) {
      const extra = entries.filter((e) => {
        if (e.kw === alias) return false;
        const st = condStem(e.kw, alias);
        return st ? text.indexOf(st) >= 0 : false;
      });
      return base.concat(extra);
    }
    return entries;
  }

  function matchLayer(text, chars, bucket) {
    const hits = [], seen = new Set();
    for (const ch of chars) {
      const list = bucket.get(ch);
      if (!list) continue;
      for (const alias of list) {
        if (seen.has(alias)) continue;
        seen.add(alias);
        let pos = text.indexOf(alias);
        while (pos !== -1) {
          if (alias.length > 1 || okSingleChar(text, pos, alias)) { hits.push({ alias, pos }); break; }
          pos = text.indexOf(alias, pos + 1);
        }
      }
    }
    return hits;
  }

  function matchText(text) {
    const chars = uniq(Array.from(text).filter((c) => /[가-힣a-zA-Z]/.test(c)));
    const rawA = matchLayer(text, chars, D.bucket);
    const rawB = matchLayer(text, chars, D.applyBucket);
    const merged = new Map();
    rawA.forEach((h) => {
      const e = filterEntries(h.alias, D.aliasMap.get(h.alias) || [], text);
      if (e.length) merged.set(h.alias, { alias: h.alias, pos: h.pos, entries: e.slice() });
    });
    rawB.forEach((h) => {
      const e = D.applyMap.get(h.alias) || [];
      if (!e.length) return;
      if (merged.has(h.alias)) merged.get(h.alias).entries = merged.get(h.alias).entries.concat(e);
      else merged.set(h.alias, { alias: h.alias, pos: h.pos, entries: e.slice() });
    });
    const all = Array.from(merged.values());
    all.sort((x, y) => (y.alias.length - x.alias.length) || (x.pos - y.pos));
    const used = new Array(text.length).fill(false);
    const accepted = [];
    for (const h of all) {
      let free = true;
      for (let i = h.pos; i < h.pos + h.alias.length; i++) if (used[i]) { free = false; break; }
      if (!free) continue;
      for (let i = h.pos; i < h.pos + h.alias.length; i++) used[i] = true;
      accepted.push(h);
    }
    return accepted.sort((a, b) => a.pos - b.pos);
  }

  const NUM_WORDS = [['한', 1], ['두', 2], ['세', 3], ['네', 4], ['다섯', 5], ['여섯', 6], ['일곱', 7], ['여덟', 8], ['아홉', 9], ['열', 10], ['스물', 20], ['서른', 30], ['마흔', 40]];
  const NUM_UNIT = '(명|마리|개|번|층|사람|가지|칸|대|잔|송이|군데|곳|살|시|분|년|월|일)';

  function findDirectNumbers(text) {
    const out = [];
    const re = /(^|[^\d])(\d{1,2})(?=[^\d]|$)/g;
    let m;
    while ((m = re.exec(text))) {
      const v = Number(m[2]);
      if (v >= 1 && v <= 45) out.push({ n: v, raw: m[2], at: m.index + m[1].length });
    }
    NUM_WORDS.forEach(([w, v]) => {
      if (w.length === 1) return;
      const re2 = new RegExp(w + '\\s*' + NUM_UNIT, 'g');
      let m2;
      while ((m2 = re2.exec(text))) out.push({ n: v, raw: w + m2[1], at: m2.index });
    });
    return out;
  }

  const CLAUSE_SPLIT = /[.!?~…\n]|그리고|그런데|근데|하지만|그러다|그때/;
  function clauseText(text, pos) {
    const re = new RegExp(CLAUSE_SPLIT.source, 'g');
    let start = 0, end = text.length, m;
    while ((m = re.exec(text))) {
      if (m.index < pos) start = m.index + m[0].length;
      else { end = m.index; break; }
    }
    return text.slice(start, end);
  }

  /* =========================================================
     6. 분석 보드
     ========================================================= */
  const WEIGHT = { direct: 62, A: (star) => 17 + 5 * (star || 0), B: 23, P: 15, saju: 13, iljin: 8 };
  const POSW = { 세로: 4.2, 가로: 3.6, 동끝: 3.4, 대각: 1.8, 연번: 2.2 };

  function vote(board, n, src) {
    if (n < 1 || n > 45) return;
    if (!board.has(n)) board.set(n, { n, score: 0, primary: 0, sources: [], posTypes: new Set(), weak: false });
    const cell = board.get(n);
    if (!cell.sources.some((s) => s.label === src.label)) {
      cell.sources.push({ label: src.label, layer: src.layer });
      if (src.kind === 'primary') cell.primary += 1;
    }
    cell.score += src.weight;
    if (src.weak) cell.weak = true;
  }

  function modOf(clause) {
    let mod = 0;
    const hits = [];
    const M = D.raw.motion || {}, C = D.raw.color || {};
    Object.keys(M).forEach((k) => { if (clause.includes(k)) { mod += M[k]; hits.push({ w: k, v: M[k] }); } });
    Object.keys(C).forEach((k) => { if (clause.includes(k)) { mod += C[k]; hits.push({ w: k, v: C[k] }); } });
    hits.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    return { mod: clamp(mod, -1.8, 1.6), hits: hits.map((h) => h.w), total: mod };
  }

  const ELEM_OF_DIGIT = { 0: '토', 5: '토', 1: '수', 6: '수', 2: '화', 7: '화', 3: '목', 8: '목', 4: '금', 9: '금' };
  const ELEM_HANJA_MINI = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };

  function matchReason(s) {
    const parts = [];
    const e = s.best;
    const aNums = uniq(s.entries.filter((x) => x.layer === 'A').flatMap((x) => x.nums)).sort((x, y) => x - y);
    const bNums = uniq(s.entries.filter((x) => x.layer === 'B').flatMap((x) => x.nums)).sort((x, y) => x - y);
    const layerText = (layer, tag) => {
      const list = s.entries.filter((x) => x.layer === layer);
      if (!list.length) return '';
      if (list.length === 1) return `${tag} ${list[0].nums.join('·')}`;
      const shown = list.slice(0, 2).map((x) => `${x.kw} ${x.nums.join('·')}`).join(' + ');
      return `${tag} ${shown}${list.length > 2 ? ` 외 ${list.length - 2}` : ''}`;
    };
    const aTxt = layerText('A', '상징');
    const bTxt = layerText('B', '적용');
    if (aTxt) parts.push(aTxt);
    if (bTxt) parts.push(bTxt);
    if (e.cat) parts.push(`분류 ${e.cat.split('>').map((x) => x.trim()).join(' › ')}`);
    if (e.layer === 'A' && e.star >= 2) parts.push(`강조 ${'★'.repeat(Math.min(e.star, 5))}`);
    if (s.modHits.length) {
      const dir = s.mod > 0.25 ? '강화' : s.mod < -0.25 ? '약화' : '상쇄(중립)';
      parts.push(`상태어 ${s.modHits.slice(0, 3).join('·')} → ${dir}${s.mod < -1 ? ' (제외 흐름)' : ''}`);
    }
    return parts.join(' · ');
  }

  function analyze(text, opts) {
    const o = Object.assign({ birth: null, people: [], excluded: [], mode: 'dream', saju: null }, opts || {});
    const board = new Map();
    const matches = [], principleHits = [], notes = [];

    const direct = findDirectNumbers(text);
    direct.forEach((d) => vote(board, d.n, { label: `꿈 속 수 ${d.raw}`, layer: 'D', weight: WEIGHT.direct, kind: 'primary' }));

    const hits = matchText(text);
    const scored = hits.map((h) => {
      const entries = (h.entries || []).slice().sort((a, b) => (a.layer === 'A' ? -1 : 1) - (b.layer === 'A' ? -1 : 1) || b.star - a.star);
      const clause = clauseText(text, h.pos);
      const m = modOf(clause);
      return { alias: h.alias, pos: h.pos, entries, best: entries[0], mod: m.mod, modHits: m.hits };
    }).sort((a, b) => (b.best.star - a.best.star) || (b.alias.length - a.alias.length));

    scored.forEach((s) => {
      const scale = 1 + 0.18 * s.mod;
      s.entries.forEach((e, idx) => {
        const base = e.layer === 'A' ? WEIGHT.A(e.star) : WEIGHT.B;
        const weight = base * (idx === 0 ? scale : scale * 0.72);
        e.nums.forEach((n) => vote(board, n, {
          label: `${e.layer === 'A' ? '상징' : '사례'}「${e.kw}」${e.nums.join('·')}`,
          layer: e.layer, weight, kind: 'primary', weak: s.mod < -1.0
        }));
      });
      matches.push({
        word: s.alias, pos: s.pos, layer: s.best.layer, kw: s.best.kw,
        nums: uniq(s.entries.flatMap((e) => e.nums)).sort((a, b) => a - b),
        layers: uniq(s.entries.map((e) => e.layer)),
        /* 추천 배경 페이지가 '상징 숫자'와 '실전 사례 숫자'를 나눠 설명할 수 있게 원자료를 남긴다 */
        entries: s.entries.map((e) => ({ layer: e.layer, kw: e.kw, nums: e.nums, cat: e.cat, star: e.star, notes: e.notes || [] })),
        star: s.best.star, cat: s.best.cat, mod: s.mod, modHits: s.modHits,
        why: matchReason(s)
      });
    });

    /* 원리 폴백: 상징 DB에 없는 표현만 */
    const spans = hits.map((h) => [h.pos, h.pos + h.alias.length]);
    const inCovered = (i) => spans.some(([a, b]) => i >= a && i < b);
    (D.raw.shape || []).forEach(([word, nums, why]) => {
      const pos = text.indexOf(word);
      if (pos < 0 || inCovered(pos)) return;
      nums.map(Number).forEach((n) => vote(board, n, { label: `모양「${word}」`, layer: 'P', weight: WEIGHT.P, kind: 'primary' }));
      principleHits.push({ word, nums: nums.map(Number), why, kind: '형상' });
    });
    (D.raw.sound || []).forEach(([w, nums, why]) => {
      const re = new RegExp('(^|[^가-힣])(' + w + '[가-힣]{1,4})', 'g');
      let m;
      while ((m = re.exec(text))) {
        const posTok = m.index + m[1].length;
        if (inCovered(posTok)) continue;
        nums.map(Number).forEach((n) => vote(board, n, { label: `소리「${m[2]}」`, layer: 'P', weight: WEIGHT.P * 0.9, kind: 'primary' }));
        principleHits.push({ word: m[2], nums: nums.map(Number), why, kind: '소리' });
        break;
      }
    });

    /* 색 규칙 */
    const colorRules = [
      [/검은|검정|까만|시커/, [32, 33, 40, 42], '검은색'],
      [/흰|하얀|뽀얀/, [2, 7, 38], '흰색'],
      [/금|황금/, [16], '금색'],
      [/파란|푸른/, [5, 15, 25, 35, 45], '파란색'],
      [/빨간|붉은/, [1, 11, 21, 31, 41], '붉은색']
    ];
    const colorHits = [];
    colorRules.forEach(([re, nums, name]) => {
      if (re.test(text)) {
        nums.forEach((n) => vote(board, n, { label: `색「${name}」`, layer: 'B', weight: 9, kind: 'primary' }));
        colorHits.push({ name, nums });
      }
    });

    /* 사주 오행수 반영 */
    const sajuVotes = [];
    if (o.saju && o.saju.natal) {
      const ntl = o.saju.natal;
      ntl.weak.forEach((e) => {
        const nums = SAJU.numbersOfElem(e);
        nums.forEach((n) => vote(board, n, { label: `내게 얇은 ${e} 기운 끝자리 ${(SAJU.ELEM_NUMS[e] || []).join('·')}`, layer: 'S', weight: WEIGHT.saju, kind: 'primary' }));
        sajuVotes.push({ kind: 'weak', elem: e, nums });
      });
      const t = o.saju.today;
      const jn = [t.day.stem + 1, t.day.branch + 1].filter((n) => n <= 45);
      jn.forEach((n) => vote(board, n, { label: `오늘 일진 ${t.ganji}`, layer: 'S', weight: WEIGHT.iljin, kind: 'primary' }));
      sajuVotes.push({ kind: 'iljin', elem: null, nums: jn, ganji: t.ganji });
    }

    /* 시드 */
    const seeds = [];
    const birthNums = [];
    if (o.birth && o.birth.day) {
      if (o.birth.month) { seeds.push({ n: o.birth.month, label: `내 생일 ${o.birth.month}월`, kind: 'birth' }); birthNums.push(o.birth.month); }
      seeds.push({ n: o.birth.day, label: `내 생일 ${o.birth.day}일`, kind: 'birth' });
      birthNums.push(o.birth.day);
    }
    (o.people || []).forEach((p) => {
      const label = (p.name || '동행').trim() || '동행';
      if (p.month) { seeds.push({ n: p.month, label: `함께한 사람 ${label} ${p.month}월`, kind: 'people' }); birthNums.push(p.month); }
      if (p.day) { seeds.push({ n: p.day, label: `함께한 사람 ${label} ${p.day}일`, kind: 'people' }); birthNums.push(p.day); }
    });
    direct.forEach((d) => seeds.push({ n: d.n, label: `꿈 속 수 ${d.raw}`, kind: 'direct' }));

    const topKw = matches.slice().sort((a, b) => b.star - a.star || b.nums.length - a.nums.length).slice(0, 2);
    topKw.slice(0, 1).forEach((m) => m.nums.slice(0, 2).forEach((n) => seeds.push({ n, label: `핵심 단어「${m.word}」`, kind: 'keyword' })));

    /* 7×7 확장 */
    const exp = { rows: new Set(), cols: new Set(), diags: new Set(), ends: new Set(), neighbors: new Set(), lineEnds: new Set(), list: [] };
    const seedSeen = new Set();
    seeds.forEach((s) => {
      if (s.n < 1 || s.n > 45 || seedSeen.has(s.n)) return;
      seedSeen.add(s.n);
      const r = G.rowOf(s.n), c = G.colOf(s.n);
      exp.rows.add(r); exp.cols.add(c);
      G.rowNums(r).forEach((n) => {
        exp.list.push({ n, type: '가로', from: s.n });
        vote(board, n, { label: `가로 ${r}줄`, layer: 'X', weight: POSW.가로, kind: 'pos' });
      });
      G.colNums(c).forEach((n) => {
        exp.list.push({ n, type: '세로', from: s.n });
        vote(board, n, { label: `세로 ${c}칸`, layer: 'X', weight: POSW.세로, kind: 'pos' });
      });
      const showLine = s.kind !== 'keyword';   // 대각·같은 끝자리는 생일·꿈 속 수 기준으로만 표시
      G.diagNums(s.n).forEach((n) => {
        if (showLine) exp.diags.add(n);
        exp.list.push({ n, type: '대각', from: s.n });
        vote(board, n, { label: `대각`, layer: 'X', weight: POSW.대각, kind: 'pos' });
      });
      [s.n - 1, s.n + 1].filter((n) => n >= 1 && n <= 45).forEach((n) => {
        exp.neighbors.add(n); exp.list.push({ n, type: '연번', from: s.n });
        vote(board, n, { label: `이웃 번호`, layer: 'X', weight: POSW.연번, kind: 'pos' });
      });
      G.sameEnd(s.n).forEach((n) => {
        if (showLine) exp.ends.add(n);
        exp.list.push({ n, type: '동끝', from: s.n });
        vote(board, n, { label: `같은 끝자리 ${s.n % 10}`, layer: 'X', weight: POSW.동끝, kind: 'pos' });
      });
      exp.lineEnds.add(G.rowEnd(r));
    });

    /* 2차 판: 15칸 판정이 번호 가중을 바꾼다.
       완충·주의몽이면 꿈의 오행 번호를 낮추고, 채움몽이면 올린다. */
    const fort = o.fortune;
    if (fort && fort.primary && fort.state && board.size) {
      const dset = new Set(SAJU.numbersOfElem(fort.primary.elem));
      if (fort.state.key === 'strong') {
        board.forEach((c) => { if (dset.has(c.n)) { c.score *= 0.5; c.damped = true; } });
        notes.push(`꿈의 ${fort.primary.elem} 기운이 원국에 이미 많은 편(${fort.rule ? fort.rule.verdict : '완충'})이라 ${fort.primary.elem} 오행수 후보 점수를 낮췄습니다.`);
      } else if (fort.state.key === 'weak') {
        board.forEach((c) => { if (dset.has(c.n)) c.score *= 1.25; });
        notes.push(`꿈의 ${fort.primary.elem} 기운이 원국에서 얇은 편(채움몽)이라 ${fort.primary.elem} 오행수 후보 점수를 올렸습니다.`);
      }
    }

    const excluded = new Set(o.excluded || []);
    excluded.forEach((n) => board.delete(n));

    const pool = Array.from(board.values()).sort((a, b) => b.score - a.score);
    if (!pool.length) notes.push('상징 DB·원리 어느 쪽에서도 수를 잡지 못했습니다. 생일 라인과 균형 배분만으로 조합을 만듭니다.');
    if (!matches.length && !principleHits.length) notes.push('입력 문장에서 등록된 상징 표제가 검출되지 않았습니다. 형상·소리·색 규칙만 적용했습니다.');

    matches.sort((a, b) => a.pos - b.pos);
    return {
      text, mode: o.mode, board, pool, matches, principleHits, direct, colorHits,
      seeds, exp, birthNums, excluded, notes, topKw, sajuVotes, saju: o.saju
    };
  }

  /* =========================================================
     7. 조합 생성
     ========================================================= */
  const STRATEGIES = [
    { key: 'core', label: '가장 많이 겹친 수', note: '가장 세게 겹친 수부터', pow: 3.0, minAC: 7 },
    { key: 'cross', label: '근거가 겹친 수', note: '서로 다른 근거 2개 이상', pow: 1.2, minAC: 7, filter: (p) => p.primary >= 2 },
    { key: 'end', label: '끝자리 같은 수', note: '같은 끝수 3수 이상', pow: 1.8, minAC: 7, endFocus: true },
    { key: 'paper', label: '생일 줄에서', note: '생일 라인의 가로·세로', pow: 1.2, minAC: 7, lineFocus: true },
    { key: 'balance', label: '골고루 섞은 수', note: 'AC 8 이상 · 홀짝 3:3', pow: 0.5, minAC: 8, strict: true }
  ];

  function softOk(chosen, n) {
    const bands = [0, 0, 0, 0, 0];
    chosen.forEach((v) => bands[clamp(Math.floor((v - 1) / 10), 0, 4)]++);
    const b = clamp(Math.floor((n - 1) / 10), 0, 4);
    if (bands[b] >= 2) return false;
    const odd = chosen.filter((v) => v % 2).length + (n % 2);
    if (odd > 4 || chosen.length + 1 - odd > 4) return false;
    return true;
  }
  function finalOk(nums, cfg) {
    const st = statsOf(nums);
    if (st.ac < cfg.minAC) return false;
    if (st.total < 100 || st.total > 175) return false;
    if (st.bandCount < 3) return false;
    if (cfg.strict && st.odd !== 3) return false;
    if (st.consecutive > 2) return false;
    if (cfg.endDigit != null && nums.filter((n) => n % 10 === cfg.endDigit).length < 3) return false;
    if (cfg.lineSet && nums.filter((n) => cfg.lineSet.has(n)).length < 3) return false;
    return true;
  }
  function drawCombo(rng, items, cfg, taken, maxScore, usage) {
    const weightOf = (p) => {
      const base = Math.pow(Math.max(p.score, 0) / maxScore, cfg.pow || 1.5) + 0.02;
      const used = usage ? (usage[p.n] || 0) : 0;
      return base / (1 + 1.15 * used) + 0.004;
    };
    for (let attempt = 0; attempt < 420; attempt++) {
      const chosen = [];
      let guard = 0;
      while (chosen.length < 6 && guard++ < 240) {
        const cand = items.filter((p) => !chosen.includes(p.n) && softOk(chosen, p.n));
        if (!cand.length) break;
        const w = cand.map((p) => {
          let v = weightOf(p);
          if (cfg.endDigit != null && p.n % 10 === cfg.endDigit) v *= 3.2;
          if (cfg.lineSet && cfg.lineSet.has(p.n)) v *= 2.2;
          return v;
        });
        chosen.push(pickWeighted(rng, cand, w).n);
      }
      if (chosen.length < 6) continue;
      const nums = chosen.slice().sort((a, b) => a - b);
      if (!finalOk(nums, cfg)) continue;
      if (taken.some((t) => t.filter((v) => nums.includes(v)).length > 2)) continue;
      return nums;
    }
    return null;
  }
  function buildCombos(ctx, seed, opts) {
    const o = Object.assign({ count: 5 }, opts || {});
    const rng = mulberry32(seed);
    const banned = ctx.excluded || new Set();
    const pool = ctx.pool.filter((p) => !banned.has(p.n));
    if (pool.length < 8) {
      for (let n = 1; n <= 45; n++) {
        if (banned.has(n)) continue;
        if (!pool.some((p) => p.n === n)) pool.push({ n, score: 1, primary: 0, posTypes: new Set(), sources: [] });
      }
    }
    if (pool.length < 6) return [];
    const maxScore = Math.max.apply(null, pool.map((p) => p.score).concat([1]));
    const lineSet = new Set();
    ctx.seeds.forEach((s) => {
      if (s.n < 1 || s.n > 45) return;
      G.rowNums(G.rowOf(s.n)).forEach((n) => lineSet.add(n));
      G.colNums(G.colOf(s.n)).forEach((n) => lineSet.add(n));
    });
    const endCount = {};
    pool.slice(0, 10).forEach((p) => { const d = p.n % 10; endCount[d] = (endCount[d] || 0) + 1; });
    let domEnd = null, bestC = -1;
    Object.keys(endCount).forEach((d) => { if (endCount[d] > bestC) { bestC = endCount[d]; domEnd = Number(d); } });

    const taken = [], out = [], usage = {};
    STRATEGIES.forEach((st) => {
      if (out.length >= o.count) return;
      const cfg = Object.assign({}, st);
      if (o.minAC) cfg.minAC = Math.max(cfg.minAC, o.minAC);
      if (o.strict) cfg.strict = true;
      let items = pool;
      if (st.filter) { const f = pool.filter(st.filter); if (f.length >= 9) items = f; }
      cfg.endDigit = st.endFocus ? domEnd : null;
      cfg.lineSet = st.lineFocus ? lineSet : null;
      let nums = drawCombo(rng, items, cfg, taken, maxScore, usage);
      let relax = 0;
      while (!nums && relax < 3) {
        relax++;
        const floorAC = o.minAC ? o.minAC : 5;
        nums = drawCombo(rng, items, Object.assign({}, cfg, { minAC: Math.max(floorAC, cfg.minAC - relax) }), taken, maxScore, usage);
      }
      if (!nums) nums = drawCombo(rng, pool, Object.assign({}, cfg, { minAC: 0, strict: false, endDigit: null, lineSet: null, pow: 0.2 }), taken, maxScore, usage);
      if (nums) { taken.push(nums); nums.forEach((n) => { usage[n] = (usage[n] || 0) + 1; }); out.push({ nums, strat: st }); }
    });
    let guard = 0;
    while (out.length < o.count && guard++ < 40) {
      const nums = drawCombo(rng, pool, { minAC: o.minAC || 6, pow: 0.3, strict: !!o.strict }, taken, maxScore, usage);
      if (!nums) break;
      taken.push(nums);
      nums.forEach((n) => { usage[n] = (usage[n] || 0) + 1; });
      out.push({ nums, strat: { key: 'fill', label: '보충 균형', note: '후보가 부족해 균형으로 채움' } });
    }
    return out;
  }

  function whyText(ctx, nums, strat) {
    const parts = [];
    const kwBits = [];
    ctx.matches.forEach((m) => {
      const hit = m.nums.filter((n) => nums.includes(n));
      if (hit.length) kwBits.push(`${m.word}(${m.nums.join('·')})→${hit.join('·')}`);
    });
    if (kwBits.length) parts.push(`상징 ${kwBits.slice(0, 2).join(', ')}`);
    const d = uniq(ctx.direct.filter((x) => nums.includes(x.n)).map((x) => x.n));
    if (d.length) parts.push(`직시수 ${d.join('·')}`);
    const cross = nums.filter((n) => { const c = ctx.board.get(n); return c && c.primary >= 2; });
    if (cross.length) parts.push(`교차근거 ${cross.length}수(${cross.join('·')})`);
    const lineHit = ctx.seeds.map((s) => {
      const line = uniq(G.rowNums(G.rowOf(s.n)).concat(G.colNums(G.colOf(s.n))));
      const k = nums.filter((n) => line.includes(n)).length;
      return k >= 2 ? { s, k } : null;
    }).filter(Boolean);
    if (lineHit.length) {
      const b = lineHit.sort((a, z) => z.k - a.k)[0];
      parts.push(`${b.s.label} 라인 ${b.k}수`);
    }
    if (ctx.sajuVotes && ctx.sajuVotes.length) {
      const sv = ctx.sajuVotes.filter((v) => v.kind === 'weak')[0];
      if (sv && nums.filter((n) => (SAJU.ELEM_NUMS[sv.elem] || []).includes(n % 10)).length) {
        parts.push(`사주 보완 ${sv.elem} 오행`);
      }
    }
    const ends = {};
    nums.forEach((n) => { ends[n % 10] = (ends[n % 10] || 0) + 1; });
    const topEnd = Object.keys(ends).sort((a, b) => ends[b] - ends[a])[0];
    if (ends[topEnd] >= 3) parts.push(`${topEnd}끝 ${ends[topEnd]}수`);
    const st = statsOf(nums);
    let tail = `AC ${st.ac} · 홀짝 ${st.odd}:${st.even} · 합 ${st.total}`;
    if (strat && strat.key === 'balance') tail += ' · 균형 우선';
    return (parts.length ? parts.join(' · ') : '후보 전체에서 균형 있게 추출') + ' → ' + tail;
  }

  /* =========================================================
     8. 꿈 운세 결합 — 15칸 판정
        SIGN_LEX의 ±점수는 '장면 강도'로만 남기고, 길흉 판정은
        꿈 오행 × 원국 상태 매트릭스가 정한다.
     ========================================================= */
  function dreamFortune(text, saju, mode) {
    const signs = scanSigns(text || '');
    let score = 0;
    const cats = { 재물: 0, 대인: 0, 건강: 0, 변화: 0 };
    signs.forEach((s) => { score += s.p; cats[s.cat] = (cats[s.cat] || 0) + Math.abs(s.p); });
    const catSorted = Object.keys(cats).sort((a, b) => cats[b] - cats[a]);
    const dominantCat = cats[catSorted[0]] > 0 ? catSorted[0] : null;
    const pos = signs.filter((s) => s.p > 0), neg = signs.filter((s) => s.p < 0);

    let bias = 0, feeling = null;
    if (saju && saju.natal && saju.today) {
      feeling = SAJU.dayFeeling(saju.natal.dayStem, saju.today);
      const g = feeling.groups;
      bias += g.재성 * 0.16 + g.식상 * 0.13 + g.인성 * 0.07 - g.관성 * 0.12;
      bias = clamp(bias, -1.6, 1.6);
    }
    const total = score * 0.62 + bias;

    /* 꿈 오행 집계(기존 화면 호환) */
    const dreamElems = { 목: [], 화: [], 토: [], 금: [], 수: [] };
    (signs || []).forEach((s) => { if (s.e) dreamElems[s.e].push(s.word); });
    const elemCounts = {};
    SAJU.ELEMS.forEach((e) => { elemCounts[e] = dreamElems[e].length; });

    /* --- 15칸 매칭 (2차 판 본체) --- */
    const ntl = saju && saju.natal;
    const profile = dreamElemProfile(text || '');
    const primary = profile.primary;
    const state = primary ? natalElemState(ntl, primary.elem) : null;
    const rule = primary ? matchRule(primary.elem, state.key) : null;
    const verdict = rule ? rule.verdict : null;

    let badgeClass = 'mixed';
    if (verdict === '채움몽') badgeClass = 'good';
    else if (verdict === '주의몽') badgeClass = 'warn';
    const badge = verdict || (total >= 1.3 ? '길몽' : total <= -1.3 ? '주의' : '길흉반반');

    /* 보완 오행: 채움몽이면 꿈의 오행이 곰 채울 자리, 아니면 원국에서 가장 얇은 오행 */
    let fillElem = null;
    if (state && state.key === 'weak' && primary) fillElem = primary.elem;
    else if (ntl && ntl.weak.length) fillElem = ntl.weak[0];
    else if (primary) fillElem = primary.elem;

    const mood = total >= 1.3 ? '길몽' : total <= -1.3 ? '주의' : '길흉반반';
    return {
      score, total, badge, badgeClass, cats, dominantCat, signs, pos, neg, mood,
      bias, feeling, dreamElems, elemCounts, mode: mode || 'dream',
      profile, primary, state, rule, verdict, fillElem
    };
  }

  /* =========================================================
     9. 렌더링 — 3차 판 (쉬운 말 · 텍스트 다이어트 · 단계적 공개)
        · 첫 화면: 추천 번호 6개 + 1~2줄 요약
        · 다음: 오늘 내 기운 2~3줄 (여백 넉넉히)
        · 나머지: 전부 <details> 접힘 (기본 닫힘)
     ========================================================= */
  const E_CLASS = { 목: 'e-mok', 화: 'e-hwa', 토: 'e-to', 금: 'e-geum', 수: 'e-su' };

  /* 전문 용어 → 일상어. 기본 화면에는 왼쪽(쉬운 말)만 노출한다 */
  const VERDICT_PLAIN = {
    채움몽: { text: '채워지는 꿈', cls: 'good' },
    관찰몽: { text: '잔잔한 꿈', cls: 'mixed' },
    완충몽: { text: '덜어내는 꿈', cls: 'mixed' },
    주의몽: { text: '천천히 가는 꿈', cls: 'warn' }
  };
  const BADGE_PLAIN = { 길몽: '좋은 꿈', 주의: '조심할 꿈', 길흉반반: '반반인 꿈' };
  const STRAT_PLAIN = {
    core: '가장 많이 겹친 수', cross: '근거가 겹친 수', end: '끝자리 같은 수',
    paper: '생일 줄에서', balance: '골고루 섞은 수', fill: '빈자리 채움'
  };
  const DAY_PLAIN = {
    비화: '비교보다 역할을 나누면 편한 날이에요',
    식상: '표현하고 시작하기 좋은 날이에요',
    재성: '정리하고 확인하면 결과가 따라오는 날이에요',
    관성: '규칙과 압박이 세게 걸리는 날이에요',
    인성: '도움을 청하고 정리하기 좋은 날이에요'
  };
  const KIND_PLAIN = { 형상: '모양으로 읽은 수', 소리: '소리로 읽은 수' };
  const LAYER_PLAIN = { A: '꿈 상징 기본수', B: '실전 꿈 사례 규칙', P: '모양·소리 원리', D: '꿈에 나온 숫자' };

  function plainStrat(strat) {
    return (strat && STRAT_PLAIN[strat.key]) || (strat && strat.label) || '추천';
  }
  function plainVerdict(f, hasNatal) {
    /* 생일이 없으면 사주 대조가 안 되므로 판정 이름(채움·완충)을 쓰지 않는다 */
    if (hasNatal && f && f.verdict && VERDICT_PLAIN[f.verdict]) return VERDICT_PLAIN[f.verdict];
    if (f && BADGE_PLAIN[f.mood]) return { text: BADGE_PLAIN[f.mood], cls: f.badgeClass || 'mixed' };
    if (f && BADGE_PLAIN[f.badge]) return { text: BADGE_PLAIN[f.badge], cls: f.badgeClass || 'mixed' };
    return { text: '오늘의 꿈', cls: 'mixed' };
  }

  function fold(title, note, body, open) {
    return `<details class="fold"${open ? ' open' : ''}>
      <summary><span>${title}</span>${note ? `<span class="fold-note">${note}</span>` : ''}</summary>
      <div class="fold-body">${body}</div>
    </details>`;
  }

  /* 꿈에서 가장 세게 잡힌 단어 몇 개 — 첫 줄 요약용 */
  function topWords(ctx, n) {
    const seen = new Set(), out = [];
    ctx.matches.slice().sort((a, b) => (b.star - a.star) || (b.nums.length - a.nums.length)).forEach((m) => {
      const w = String(m.word || '').trim();
      if (!w || seen.has(w)) return;
      seen.add(w); out.push(w);
    });
    return out.slice(0, n);
  }

  function comboShareText(ctx, nums, idx) {
    const lines = [`몽픽 ${META.next_round}회 추천 ${idx + 1}`, nums.join(' · ')];
    if (ctx.text) lines.push(`${ctx.mode === 'sign' ? '오늘 본 것' : '꿈'}: ${ctx.text.slice(0, 60)}`);
    lines.push('재미로 보는 참고용이에요. 당첨을 보장하지 않아요.');
    return lines.join('\n');
  }

  function renderNoCombo() {
    return `<div class="card note-card"><b>번호를 만들 수 없어요</b>
      <p class="micro">빼고 싶은 번호가 너무 많아요. 몇 개 줄이고 다시 뽑아 주세요.</p></div>`;
  }

  /* ① 추천 번호 6개 + 1~2줄 요약 */
  function renderTop(ctx, fortune, combos) {
    const top = combos[0];
    const words = topWords(ctx, 3);
    const word = words.join('·');
    const where = ctx.mode === 'sign' ? '오늘 본 것에서' : '꿈에서';
    let head;
    if (ctx.mode === 'balance') head = '생일 숫자와 균형만으로 뽑았어요.';
    else if (words.length) head = `${where} <b>${esc(word)}</b>${hasJong(word) ? '이' : '가'} 잡혀서 뽑았어요.`;
    else head = `${where} 뚜렷한 단어를 못 찾아 오늘 기운으로 뽑았어요.`;
    const birth = ctx.mode !== 'balance' && ctx.birthNums && ctx.birthNums.length
      ? `생일 숫자 ${uniq(ctx.birthNums).slice(0, 3).join('·')}도 함께 봤어요.` : '';
    const hasNatal = !!(ctx.saju && ctx.saju.natal);
    const pv = fortune ? plainVerdict(fortune, hasNatal) : { text: ctx.mode === 'balance' ? '균형 조합' : '오늘의 조합', cls: 'mixed' };
    const txt = comboShareText(ctx, top.nums, 0);
    return `<div class="card pick-card">
      <div class="pick-top"><span class="pick-label">오늘의 추천 번호</span><span class="badge badge-${pv.cls}">${esc(pv.text)}</span></div>
      <div class="pick-balls">${top.nums.map((n, i) => `<span class="ball ${ballClass(n)}" style="animation-delay:${i * 45}ms" title="${esc(numberTitle(ctx, n))}">${n}</span>`).join('')}</div>
      <p class="pick-line">${head}</p>
      ${birth ? `<p class="pick-line sub">${esc(birth)}</p>` : ''}
      <div class="pick-actions">
        <button type="button" class="ghost-btn js-copy" data-copy="${esc(txt)}">번호 복사</button>
        <button type="button" class="ghost-btn js-share" data-copy="${esc(txt)}">공유</button>
      </div>
    </div>`;
  }

  /* ② 오늘 내 기운 — 2~3줄 */
  function renderVibe(fortune, saju, mode) {
    const lines = [];
    const ntl = saju && saju.natal;
    const p = fortune && fortune.primary;
    const isSign = mode === 'sign';
    const src = isSign ? '오늘 본 것' : '꿈';
    if (fortune && p) {
      const noun = ELEM_NOUN[p.elem] || p.elem;
      const st = fortune.state && fortune.state.key;
      let l1 = `${src}에 나온 건 ‘${noun}’ 기운이에요.`;
      if (ntl && st === 'weak') l1 += ` 내 생일로 보면 ${noun} 기운이 얇아서, 채워 주면 좋은 자리로 봤어요.`;
      else if (ntl && st === 'strong') l1 += ` 내 생일로 보면 ${noun} 기운이 이미 넘쳐서, 조금 덜어내는 쪽이 좋아요.`;
      else if (ntl) l1 += ` 내 생일로 보면 ${noun} 기운이 무난해서, 잔잔한 흐름이에요.`;
      else l1 += ' 생일을 넣으면 내 기운까지 맞춰 볼 수 있어요.';
      lines.push(l1);
      if (fortune.rule && fortune.rule.action) lines.push(`오늘 해 볼 일 — ${esc(fortune.rule.action)}.`);
    } else if (mode === 'balance') {
      lines.push('꿈 없이 생일 숫자와 균형만으로 뽑았어요.');
      lines.push('홀짝 반반, 번호대 고루, 간격 넓게 맞췄어요.');
    } else if (ntl) {
      const w = ntl.weak.map((e) => ELEM_NOUN[e] || e).join('·');
      lines.push(`${src}에서 기운까지 읽을 단어는 못 찾았어요. 그래서 내 생일에 얇은 ${w} 기운으로 뽑았어요.`);
    } else {
      lines.push(`${src}에서 기운까지 읽을 단어는 못 찾았어요. 오늘 날짜 기운과 함께 뽑았어요.`);
    }
    const dom = fortune && fortune.feeling && fortune.feeling.dominant;
    if (dom && DAY_PLAIN[dom]) lines.push(`오늘 흐름은 ${DAY_PLAIN[dom]}.`);
    return `<div class="card vibe-card">
      <p class="vibe-head">오늘 내 기운</p>
      ${lines.map((l) => `<p class="vibe-line">${l}</p>`).join('')}
    </div>`;
  }

  /* ③ 나머지 조합 (접힘) */
  function renderRest(ctx, combos) {
    const rest = combos.slice(1);
    if (!rest.length) return '';
    const rows = rest.map((c, i) => `<div class="alt-row">
      <span class="alt-label">${i + 2}번째<em>${esc(plainStrat(c.strat))}</em></span>
      <span class="alt-balls">${c.nums.map((n) => numballHTML(n)).join('')}</span>
    </div>`).join('');
    const all = combos.map((c, i) => comboShareText(ctx, c.nums, i)).join('\n\n');
    return fold('다른 조합 보기', `${rest.length}개 더`,
      `${rows}<div class="fold-foot"><button type="button" class="ghost-btn js-copy" data-copy="${esc(all)}">5조합 모두 복사</button></div>`);
  }

  /* ④ 단어별 근거 (접힘) */
  function plainWhy(m) {
    const parts = [];
    if (m.layers.indexOf('A') >= 0) parts.push('꿈 상징 기본 번호');
    if (m.layers.indexOf('B') >= 0) parts.push('실전 꿈 사례에서 쓰인 규칙');
    return parts.join(' + ') || '꿈 단어에서 잡힌 번호';
  }

  /* 꿈 전체에 걸린 상태어는 한 번만 설명한다 */
  function sceneNote(ctx) {
    const m = (ctx.matches || []).filter((x) => x.modHits && x.modHits.length)[0];
    if (!m) return '';
    const dir = m.mod > 0.25 ? '조금 더 세게' : m.mod < -0.25 ? '조금 약하게' : '그대로';
    return `꿈에 쓴 말(${esc(m.modHits.slice(0, 3).join('·'))})은 모든 단어에 ‘${dir}’로 걸렸어요.`;
  }

  function renderWhy(ctx) {
    const items = [];
    ctx.direct.forEach((d) => items.push(`<div class="kw">
      <div class="kw-top"><span class="kw-word">${d.n}</span><span class="kw-layer layer-D">${LAYER_PLAIN.D}</span>
      <span class="kw-nums">${numballHTML(d.n)}</span></div>
      <p class="kw-why">꿈에 숫자가 그대로 나왔어요.</p></div>`));
    ctx.matches.forEach((m) => {
      const hasB = m.layers.indexOf('B') >= 0;
      const both = hasB && m.layers.indexOf('A') >= 0;
      const tag = both ? '상징 + 실전 규칙' : (hasB ? '실전 꿈 사례 규칙' : '꿈 상징 기본수');
      items.push(`<div class="kw">
        <div class="kw-top"><span class="kw-word">${esc(m.word)}</span><span class="kw-layer ${hasB ? 'layer-B' : 'layer-A'}">${tag}</span>
        <span class="kw-nums">${m.nums.map((n) => numballHTML(n, m.mod < -1 ? 'is-weak' : '')).join('')}</span></div>
        <p class="kw-why">${esc(plainWhy(m))}</p></div>`);
    });
    ctx.principleHits.forEach((p) => items.push(`<div class="kw">
      <div class="kw-top"><span class="kw-word">${esc(p.word)}</span><span class="kw-layer layer-P">${esc(KIND_PLAIN[p.kind] || '원리')}</span>
      <span class="kw-nums">${p.nums.map((n) => numballHTML(n)).join('')}</span></div>
      <p class="kw-why">${esc(p.why)}</p></div>`));
    if (!items.length) {
      return fold('왜 이 번호인가요?', '단어 근거 없음',
        '<p class="micro">꿈에서 등록된 상징 단어를 찾지 못했어요. 생일과 오늘 기운만으로 뽑았어요.</p>');
    }
    const notes = [];
    if (ctx.matches.some((m) => m.mod < -1)) notes.push('줄 그인 수는 이번 꿈에서 약하게 본 수예요.');
    const sn = sceneNote(ctx);
    if (sn) notes.push(sn);
    notes.push('같은 단어라도 어떤 상태로 나왔는지(빠짐·깨짐·검정 등)에 따라 무게를 달리 봐요.');
    return fold('왜 이 번호인가요?', `${items.length}개 단어`,
      `<div class="kw-list">${items.join('')}</div><p class="micro">${notes.join(' ')}</p>`);
  }

  /* ⑤ 용지 배치 — 표만 만든다(추천 배경 페이지와 접힘에서 함께 쓴다) */
  function paperInner(ctx) {
    const primaryMap = new Map();
    ctx.board.forEach((c) => primaryMap.set(c.n, c));
    const seedSet = new Map();
    ctx.seeds.forEach((s) => { if (s.n >= 1 && s.n <= 45) seedSet.set(s.n, s.label); });
    const seedNums = new Set(seedSet.keys());

    let html = '<table class="paper" aria-label="7x7 용지"><thead><tr><th class="rowlab"></th>';
    for (let c = 1; c <= 7; c++) html += `<th>${c}</th>`;
    html += '</tr></thead><tbody>';
    for (let r = 1; r <= 7; r++) {
      html += `<tr><th class="rowlab">${r}</th>`;
      for (let c = 1; c <= 7; c++) {
        const n = (r - 1) * 7 + c;
        if (n > 45) { html += '<td><div class="cell empty"></div></td>'; continue; }
        const cls = ['cell'];
        if (ctx.exp.rows.has(r)) cls.push('hl-row');
        if (ctx.exp.cols.has(c)) cls.push('hl-col');
        if (ctx.exp.diags.has(n)) cls.push('hl-diag');
        if (ctx.exp.ends.has(n)) cls.push('hl-end');
        if (seedNums.has(n)) cls.push('seed');
        const cell = primaryMap.get(n);
        if (cell && cell.primary >= 2) cls.push('cross');
        if (ctx.excluded.has(n) && !seedNums.has(n)) cls.push('excluded');
        const title = seedSet.get(n) || (cell ? cell.sources.slice(0, 3).map((s) => s.label).join(' / ') : '');
        html += `<td><div class="${cls.join(' ')}" title="${esc(title)}">${n}</div></td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    html += `<div class="legend">
      <span><i class="lg-seed"></i>출발점</span>
      <span><i class="lg-row"></i>가로 줄</span><span><i class="lg-col"></i>세로 칸</span>
      <span><i class="lg-diag"></i>대각선</span><span><i class="lg-end"></i>같은 끝자리</span>
      <span><i class="lg-cross"></i>겹친 수</span></div>`;

    const chips = [];
    if (ctx.exp.rows.size) chips.push(`<span class="rule-chip">가로 <b>${ctx.exp.rows.size}</b>줄</span>`);
    if (ctx.exp.cols.size) chips.push(`<span class="rule-chip">세로 <b>${ctx.exp.cols.size}</b>칸</span>`);
    if (ctx.exp.diags.size) chips.push(`<span class="rule-chip">대각선 <b>${ctx.exp.diags.size}</b>수</span>`);
    if (ctx.exp.ends.size) chips.push(`<span class="rule-chip">같은 끝자리 <b>${ctx.exp.ends.size}</b>수</span>`);
    chips.push(`<span class="rule-chip">겹친 수 <b>${ctx.pool.filter((p) => p.primary >= 2).length}</b></span>`);
    if (ctx.excluded.size) chips.push(`<span class="rule-chip">뺀 수 <b>${ctx.excluded.size}</b></span>`);
    html += `<div class="rule-chips">${chips.join('')}</div>`;

    return `<div class="card paper-card">${html}</div>
       <p class="micro">생일과 꿈에서 나온 수를 출발점으로, 로또용지의 가로 줄·세로 칸·대각선을 따라 번호를 넓혀 봤어요.</p>`;
  }
  function renderPaperCard(ctx) {
    return fold('용지에 놓아 보기', '7×7 표', paperInner(ctx));
  }

  function numberTitle(ctx, n) {
    const c = ctx.board.get(n);
    if (!c) return `${n}`;
    return `${n} — ` + c.sources.slice(0, 4).map((s) => s.label).join(' / ');
  }

  /* ⑥ 내 생일로 본 기운 (접힘) */
  function adviceMoney(jae, sik, gwan, tone) {
    const plain = tone === '하';
    if (jae >= 1.5) return plain ? '돈이 오가는 판단은 오늘 미루지 말고 바로 정리하세요.'
      : '재성(財星)이 세게 걸립니다 — 돈이 오가는 판단은 오늘 미루지 말고 바로 정리하세요.';
    if (sik >= 1.5) return plain ? '버는 쪽보다 만들어 파는 쪽에서 돈이 붙는 날입니다.'
      : '식상(食傷)이 살아 움직이는 날 — 재물은 벌어들이는 쪽보다 만들어 파는 쪽에서 붙습니다.';
    if (gwan >= 1.5) return plain ? '지출은 고정비 점검부터, 큰 결제는 하루 미루는 편이 낫습니다.'
      : '관성(官星)이 압박으로 걸립니다 — 지출은 고정비 점검부터, 큰 결제는 하루 미루는 편이 낫습니다.';
    return '재물 기운은 잔잔합니다. 새 지출보다 이미 있는 돈의 흐름을 정리하기 좋습니다.';
  }
  function advicePeople(inseong, bihwa, gwan, tone) {
    const plain = tone === '하';
    if (inseong >= 1.5) return plain ? '웃사람·문서·계약 쪽에서 도움을 청해 볼 만합니다.'
      : '인성(印星)이 도와주는 날 — 웃사람·문서·계약 쪽에서 도움을 청해 볼 만합니다.';
    if (bihwa >= 1.5) return plain ? '동료·경쟁이 같이 움직입니다. 비교보다 역할 나누기가 이깁니다.'
      : '비화(比和)가 강해 동료·경쟁이 함께 움직입니다 — 비교보다 역할 분담이 이깁니다.';
    if (gwan >= 1.5) return '대인관계에서 예의와 순서를 지키는 게 이득입니다.';
    return '대인운은 무난합니다. 먼저 말을 거는 쪽이 유리합니다.';
  }
  function adviceHealth(ntl, gwan, tone) {
    const e = ntl.weak[0];
    const organ = { 목: '간·눈', 화: '심장·혈압', 토: '위·소화', 금: '폐·피부', 수: '신장·허리' }[e] || '전반';
    if (gwan >= 1.5) return `긴장이 쌓이기 쉽습니다. ${organ} 쪽을 특히 살피고 잠을 앞당기세요.`;
    return `${ELEM_NOUN[e] || ''}(${organ}) 기운이 얇습니다. 무리한 일정보다 물·수면으로 채우는 쪽이 좋습니다.`;
  }

  function elemBarsHTML(ntl) {
    let html = '<div class="elem-bars">';
    SAJU.ELEMS.forEach((e) => {
      const c = ntl.counts[e];
      const pct = c === 0 ? 0 : Math.max(6, Math.round((c / ntl.total) * 100));
      const cls = ntl.weak.indexOf(e) >= 0 ? ' is-weak' : (ntl.strong.indexOf(e) >= 0 && c > 0 ? ' is-strong' : '');
      html += `<div class="elem-row"><span class="elem-name ${E_CLASS[e]}">${ELEM_NOUN[e]}</span>
        <span class="elem-bar"><i class="${E_CLASS[e]}" style="width:${pct}%"></i></span>
        <span class="elem-count${cls}">${c}</span></div>`;
    });
    return html + '</div>';
  }

  function renderSajuCard(saju) {
    const ntl = saju && saju.natal;
    if (!ntl) {
      return fold('내 생일로 본 기운', '생일 안 넣음',
        '<p class="micro">생일을 넣으면 내 기운까지 맞춰서 뽑아요. 지금은 꿈과 오늘 날짜만 봤습니다.</p>');
    }
    const t = saju.today;
    const pn = ntl.pillars;
    let body = '<div class="card saju-card">';
    body += '<p class="micro" style="margin:0 0 10px">태어난 해·달·날을 여덟 글자로 적은 표예요.</p>';
    body += `<div class="pillars">${pn.map((pl) => pl.unknown
      ? `<div class="pillar is-unknown"><span class="p-label">${pl.key}주</span><span class="p-unknown">시간 모름</span></div>`
      : `<div class="pillar"><span class="p-label">${pl.key}주</span>
           <span class="p-char ${E_CLASS[pl.stemE]}">${pl.stemChar}<i>${pl.stemH}</i></span>
           <span class="p-char ${E_CLASS[pl.branchE]}">${pl.branchChar}<i>${pl.branchH}</i></span>
           <span class="p-elem">${ELEM_NOUN[pl.stemE]}·${ELEM_NOUN[pl.branchE]}</span>
         </div>`).join('')}</div>`;

    body += elemBarsHTML(ntl);

    body += `<p class="saju-summary">태어난 날은 <b>${ntl.dayGanji}일</b>, 중심 기운은 <b>${ELEM_NOUN[ntl.dayElem]}</b>이에요.
      얇은 기운 <b>${ntl.weak.map((e) => ELEM_NOUN[e]).join('·')}</b>,
      두꺼운 기운 <b>${ntl.strong.map((e) => ELEM_NOUN[e]).join('·')}</b>${ntl.hasHour ? '' : ' · 태어난 시간을 몰라 시간 칸은 비웠어요'}</p>`;

    const ms = mulsangOf(ntl);
    if (ms) body += `<div class="mulsang-box">
      <p class="mulsang-label">내 사주 그림</p>
      <p class="mulsang-line">${esc(ms.line)}</p>
      <p class="micro">설명용 그림이에요. 좋고 나쁨은 위 기운 분포로 봐요.</p>
    </div>`;

    const f = SAJU.dayFeeling(ntl.dayStem, t);
    body += `<div class="today-box">
      <div class="today-top"><span class="today-label">오늘 일진</span><b class="today-ganji">${t.ganji}<i>${t.ganjiH}</i></b><span class="today-meta">${t.y}.${t.m}.${t.d}</span></div>
      <div class="tengod-line">오늘 기운은 <b>${SAJU.GROUP_MEAN[f.stemTG.group]}</b> 쪽으로 걸려요.</div>
      <div class="advice-list">
        <div><span>재물</span>${adviceMoney(f.groups.재성, f.groups.식상, f.groups.관성, '하')}</div>
        <div><span>대인</span>${advicePeople(f.groups.인성, f.groups.비화, f.groups.관성, '하')}</div>
        <div><span>건강</span>${adviceHealth(ntl, f.groups.관성, '하')}</div>
      </div>
    </div>`;
    body += '</div>';
    return fold('내 생일로 본 기운', `${t.ganji}일`, body);
  }

  /* ⑦ 계산 과정 (전문 용어는 여기서만 — 추천 배경 페이지에서는 접힘 안에 들어간다) */
  function calcInner(ctx, fortune, saju) {
    const rows = [];
    rows.push('<li><b>꿈 단어 → 번호</b> — 몽픽 꿈 상징 DB의 기본 번호와, 실전 꿈 사례에서 검증된 규칙 번호를 함께 봤어요.</li>');
    rows.push('<li><b>용지 규칙(7×7)</b> — 생일·꿈에서 나온 수를 출발점으로 가로 줄·세로 칸·대각선·끝자리를 따라 번호를 넓혔어요.</li>');
    rows.push('<li><b>겹친 수(교차수)</b> — 서로 다른 근거 두 개 이상이 같은 수를 가리키면 점수를 더 줬어요.</li>');
    rows.push('<li><b>내 기운 보완</b> — 생일에서 얇은 기운의 끝자리 번호를 후보에 더했어요.</li>');
    rows.push('<li><b>빼기</b> — 빼고 싶은 번호는 조합 단계에서 완전히 뺐어요.</li>');
    rows.push('<li><b>같은 입력, 같은 조합</b> — 꿈·생일·뺀 번호로 난수를 고정했어요.</li>');

    let matrix = '';
    if (fortune && fortune.primary && fortune.state) {
      const stKey = { weak: '부족', neutral: '중간', strong: '과다' }[fortune.state.key] || '중간';
      const h = SAJU.ELEM_H[fortune.primary.elem] || '';
      matrix = `<p class="calc-line">15칸 판정 — 꿈의 기운 <b>${esc(fortune.primary.elem)}(${esc(h)})</b> × 내 사주 상태 <b>${stKey}</b>
        → <b>${esc(fortune.verdict || '판정 없음')}</b>${fortune.rule ? ` · ${esc(fortune.rule.headline)}` : ''}</p>`;
    }

    const notes = (ctx.notes || []).map((n) => `<li>${esc(n)}</li>`).join('');

    const glossary = `<ul class="glossary">
      <li><b>채움몽 · 완충몽 · 관찰몽 · 주의몽</b> — 내 사주에 얇은 기운을 채워 주는 꿈인지, 이미 넘치는 기운을 덜어 주는 꿈인지, 잔잔한지, 속도를 줄이자는 꿈인지 나눈 이름이에요.</li>
      <li><b>오행(五行)</b> — 나무·불·흙·쇠·물 다섯 기운. 번호는 각 기운의 끝자리로 나눠요.</li>
      <li><b>물상(物象)</b> — 사주 글자를 풍경에 비유한 설명용 그림이에요. 판정 근거로는 쓰지 않아요.</li>
      <li><b>천간·지지</b> — 해·달·날·시간을 각각 두 글자로 적은 여덟 글자(사주)의 낱자예요.</li>
      <li><b>동끝</b> — 끝자리가 같은 번호(3·13·23…)를 말해요.</li>
      <li><b>AC</b> — 고른 여섯 수 사이 간격이 얼마나 다양한지 나타내는 값이에요.</li>
      <li><b>용신·조후</b> — 유파별로 쓰는 이론인데 몽픽은 쓰지 않아요. 기운 분포와 오늘 날짜만 봐요.</li>
    </ul>`;

    return `<ul class="notice-list">${rows.join('')}${notes}</ul>${matrix}${glossary}
       <p class="micro">재미로 보는 참고용이에요. 꿈은 앞날의 예고가 아니고, 당첨을 보장하지도 않아요.</p>`;
  }
  function renderCalc(ctx, fortune, saju) {
    return fold('계산 과정 자세히 보기', '전문 용어 포함', calcInner(ctx, fortune, saju));
  }

  /* =========================================================
     9-b. 추천 배경 전용 페이지 (탭 3)
       1단계 꿈 단어 → 2단계 생일·오늘 기운 → 3단계 공 하나하나
       → 4단계 7×7 번호판과 계산 근거(전문 용어는 접힘 안에서만)
     ========================================================= */
  const STRAT_NOTE = {
    core: '서로 다른 근거가 가장 많이 겹친 수부터 골랐어요.',
    cross: '근거가 두 개 이상 겹친 수만 모아서 골랐어요.',
    end: '같은 끝자리가 세 개 이상 되도록 골랐어요.',
    paper: '생일과 꿈에서 나온 수가 놓인 줄에서 골랐어요.',
    balance: '홀짝을 반반, 번호대를 고루, 간격을 넓게 맞춰 골랐어요.',
    fill: '후보가 모자라 균형을 맞춰 채웠어요.'
  };

  function stepHead(no, title, sub) {
    return `<div class="step-head">
      <span class="step-no" aria-hidden="true">${no}</span>
      <div class="step-txt"><h3 class="step-title">${title}</h3>${sub ? `<p class="step-sub">${sub}</p>` : ''}</div>
    </div>`;
  }
  const subcatNotes = () => (D.raw && D.raw.subcategory_notes) || {};
  const catNotes = () => (D.raw && D.raw.category_notes) || {};
  function dictCount() {
    const n = D.raw && D.raw.words ? D.raw.words.length : 0;
    return (n || 11705).toLocaleString('ko-KR');
  }

  /* 결과 첫 화면: 배경 페이지로 넘기는 버튼 */
  function renderReasonCta() {
    return `<button type="button" class="reason-cta js-reason">
      <span class="rc-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="10.6" cy="10.6" r="6.1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.1 15.1L20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
      <span class="rc-text"><span class="rc-title">이 번호가 나온 배경 자세히 보기</span>
        <span class="rc-sub">꿈 단어 · 내 생일 기운 · 공 하나하나</span></span>
      <span class="rc-arrow" aria-hidden="true">→</span>
    </button>`;
  }

  /* 상단 요약 — 대표 6개 공 + 한 줄 결론 */
  function renderReasonSummary(ctx, fortune, combos) {
    const top = combos[0];
    const words = topWords(ctx, 3);
    const hasNatal = !!(ctx.saju && ctx.saju.natal);
    const src = ctx.mode === 'sign' ? '오늘 본 것' : '꿈';
    let line;
    if (ctx.mode === 'balance') line = '생일 숫자와 균형만으로 이렇게 뽑았어요.';
    else if (!words.length) line = `${src}에서 뚜렷한 단어를 못 찾아 오늘 기운으로 뽑았어요.`;
    else if (hasNatal) line = `${src}에서 잡힌 <b>${esc(words.join('·'))}</b> + 내 생일 기운이 만나 이렇게 뽑혔어요.`;
    else line = `${src}에서 잡힌 <b>${esc(words.join('·'))}</b> — 이 단어들을 번호로 옮겨 이렇게 뽑았어요.`;
    const pv = fortune ? plainVerdict(fortune, hasNatal)
      : { text: ctx.mode === 'balance' ? '균형 조합' : '오늘의 조합', cls: 'mixed' };
    return `<div class="card reason-sum">
      <div class="rs-top"><span class="rs-label">이번에 뽑힌 6개 공</span>
        <span class="badge badge-${pv.cls}">${esc(pv.text)}</span></div>
      <div class="rs-balls">${top.nums.map((n) => `<span class="ball ${ballClass(n)}">${n}</span>`).join('')}</div>
      <p class="rs-line">${line}</p>
      <p class="rs-meta">‘${esc(plainStrat(top.strat))}’ 방식으로 뽑은 1번째 조합이에요.</p>
    </div>`;
  }

  /* 1단계 — 꿈 단어별 상징 숫자와 연결 원리 */
  function wordLayers(m) {
    const es = m.entries || [];
    const a = uniq(es.filter((e) => e.layer === 'A').flatMap((e) => e.nums)).sort((x, y) => x - y);
    const b = uniq(es.filter((e) => e.layer === 'B').flatMap((e) => e.nums)).sort((x, y) => x - y);
    const notes = uniq(es.filter((e) => e.layer === 'B').flatMap((e) => e.notes || [])).slice(0, 2);
    return { a, b, notes };
  }

  /* 단어 자체에 모양·소리 원리가 붙는 경우(내장 원리 표) */
  function principleForWord(word) {
    const out = [];
    const w = String(word || '');
    if (!w) return out;
    (D.raw && D.raw.shape || []).forEach(([kw, nums, why]) => {
      if (w === kw || (w.length > 1 && (w.indexOf(kw) >= 0 || kw.indexOf(w) >= 0))) {
        out.push({ kind: '모양', kw, nums: nums.map(Number), why });
      }
    });
    (D.raw && D.raw.sound || []).forEach(([kw, nums, why]) => {
      if (w === kw || (w.length > 1 && w.indexOf(kw) >= 0)) {
        out.push({ kind: '소리', kw, nums: nums.map(Number), why });
      }
    });
    return out.slice(0, 2);
  }

  function renderReasonWord(m, pick) {
    const lay = wordLayers(m);
    const cats = String(m.cat || '').split('>').map((s) => s.trim()).filter(Boolean);
    const group = cats[0] || '', sub = cats[1] || '';
    const note = (sub && subcatNotes()[sub]) || (group && catNotes()[group]) || '';
    const elem = elementOfWord(m.kw || m.word, m.cat);
    const hit = m.nums.filter((n) => pick.has(n));
    const elemTag = elem ? `<span class="rw-elem ${E_CLASS[elem]}">${ELEM_NOUN[elem]} 기운</span>` : '';
    const nums = m.nums.map((n) => numballHTML(n, pick.has(n) ? 'is-pick' : '')).join('');
    const withWa = hasJong(m.word) ? '과' : '와';
    const fromCase = lay.b.length
      ? ` 여기에 실전 꿈 사례 데이터 155건을 교차 대조해 ‘${esc(m.word)}’${withWa} 함께 쓰인 숫자도 더했어요 — <b>${lay.b.join('·')}</b>.`
      : '';
    const caseNote = lay.notes.length
      ? `<p class="rw-meta">사례에 쓰인 말 — ${esc(lay.notes.join(', '))}</p>`
      : '';
    const principles = principleForWord(m.kw || m.word).map((pr) =>
      `<p class="rw-meta">${pr.kind}${roJosa(pr.kind)} 읽는 원리 — ${esc(pr.why)} <span class="muted-line">(${pr.nums.join('·')})</span></p>`).join('');
    const principle = note
      ? `<p class="rw-meta">상징 분류 — ${esc(group)}${sub ? ' › ' + esc(sub) : ''}. 몽픽 상징 체계에서는 이 묶음을 이렇게 읽어요 — ${esc(note)}</p>`
      : '';
    const stateLine = m.modHits && m.modHits.length
      ? `<p class="rw-meta">꿈에 함께 쓴 ‘${esc(m.modHits.slice(0, 3).join('·'))}’ 때문에 이 단어는 ${m.mod > 0.25 ? '조금 세게' : m.mod < -0.25 ? '조금 약하게' : '그대로'} 봤어요.</p>`
      : '';
    const used = hit.length
      ? `<p class="rw-used">최종 6개에 들어간 수 — ${hit.join('·')}</p>`
      : `<p class="rw-meta">이 단어에서 나온 수는 이번 6개에는 들어가지 않았어요.</p>`;
    return `<div class="rw">
      <div class="rw-top"><span class="rw-word">${esc(m.word)}</span>${elemTag}</div>
      <div class="rw-nums">${nums}</div>
      <p class="rw-why"><b>어디서 나온 숫자예요?</b> 몽픽이 오랜 해몽 사례와 수리 체계를 교차 검증해 구축한 ${dictCount()}개 꿈 상징 DB의 ‘${esc(m.word)}’ 고유 숫자예요.${fromCase}</p>
      ${principles}${principle}${caseNote}${stateLine}${used}
    </div>`;
  }

  function renderReasonStep1(ctx, pick) {
    const isBalance = ctx.mode === 'balance';
    const head = stepHead(1, isBalance ? '꿈 단어 대신 생일 숫자' : '꿈 단어에서 나온 숫자',
      isBalance ? '꿈 없이 뽑아서 꿈 단어는 쓰지 않았어요. 2단계부터 보세요.' : '꿈에 나온 말 하나하나가 어떤 숫자를 데려왔는지 봐요.');
    const words = isBalance ? [] : (ctx.matches || []).filter((m) => m.nums.length).slice(0, 5);
    const cards = words.map((m) => renderReasonWord(m, pick)).join('');
    const extra = [];
    (ctx.direct || []).forEach((d) => extra.push(`<li>꿈에 숫자 <b>${d.raw}</b>가 그대로 나와서 <b>${d.n}</b>이 후보가 됐어요.</li>`));
    (ctx.colorHits || []).forEach((c) => extra.push(`<li>꿈에 나온 ‘${esc(c.name)}’에서 ${c.nums.join('·')}이 나왔어요.</li>`));
    (ctx.principleHits || []).forEach((p) => extra.push(`<li>‘${esc(p.word)}’ — ${esc(p.why)} <span class="muted-line">(${p.nums.join('·')})</span></li>`));
    const extraHTML = extra.length
      ? `<p class="rw-label">그 밖에 숫자가 된 것</p><ul class="reason-extra">${extra.join('')}</ul>` : '';
    const empty = words.length ? ''
      : (isBalance
        ? '<p class="rw-why">꿈 없이 뽑았으니 꿈 단어는 쓰지 않았어요. 생일 숫자와 균형만으로 뽑았어요.</p>'
        : '<p class="rw-why">꿈 문장에서 몽픽 상징 DB에 있는 단어를 찾지 못했어요. 그래서 생일과 오늘 기운만으로 뽑았어요.</p>');
    const note = words.length
      ? '<p class="reason-note">같은 단어라도 해석 체계에 따라 기준 숫자가 달라질 수 있어요. 몽픽은 자체 검증한 상징 데이터와 오늘 기운을 함께 대조해 수를 정하고, 꿈에 쓴 ‘맑은·빠짐’ 같은 말은 숫자를 새로 만들지 않고 힘만 바꿔요.</p>'
      : '';
    return `<section class="reason-step">${head}${empty}${cards}${extraHTML}${note}</section>`;
  }

  /* 2단계 — 생일 숫자와 오늘 기운이 더한 힘 */
  function renderReasonStep2(ctx, fortune, saju, pick) {
    const head = stepHead(2, '내 생일과 오늘 기운이 더한 힘',
      '생일 숫자는 번호판의 출발점이 되고, 얇거나 넘치는 기운은 어느 쪽 수에 힘을 줄지 정해요.');
    const ntl = saju && saju.natal;
    if (!ntl) {
      return `<section class="reason-step">${head}
        <p class="rw-why">생일을 넣으면 내 기운 반영 설명도 함께 나와요.</p>
        <p class="rw-meta">생일을 넣지 않으면 꿈 단어와 오늘 날짜만으로 뽑아요.</p>
        <div class="step-actions"><button type="button" class="ghost-btn js-open-birth">생일 넣으러 가기</button></div>
      </section>`;
    }
    const births = (ctx.seeds || []).filter((s) => s.kind === 'birth');
    const monthS = births.filter((b) => /월$/.test(b.label))[0];
    const dayS = births.filter((b) => /일$/.test(b.label))[0];
    const birthBalls = (monthS || dayS)
      ? `<div class="rw-nums">${[monthS, dayS].filter(Boolean).map((b) => `<span class="numball ${ballClass(b.n)}${pick.has(b.n) ? ' is-pick' : ''}">${b.n}</span>`).join('')}</div>`
      : '';
    let birthLine;
    if (monthS && dayS) {
      birthLine = `태어난 달 <b>${monthS.n}</b>와 날 <b>${dayS.n}</b> — 이 두 수가 번호판의 출발점이 됐어요. 출발점이 놓인 가로줄·세로칸을 따라 옆 번호로 수가 퍼져요. 태어난 해는 숫자로 쓰지 않아요.`;
    } else if (monthS) {
      birthLine = `태어난 달 <b>${monthS.n}</b>이 번호판의 출발점이 됐어요. 출발점이 놓인 가로줄·세로칸을 따라 옆 번호로 수가 퍼져요.`;
    } else if (dayS) {
      birthLine = `태어난 날 <b>${dayS.n}</b>이 번호판의 출발점이 됐어요. 출발점이 놓인 가로줄·세로칸을 따라 옆 번호로 수가 퍼져요.`;
    } else {
      birthLine = '이번에는 생일 숫자를 쓰지 않았어요.';
    }
    const bd = (ntl.birth && ntl.birth.y && ntl.birth.m && ntl.birth.d)
      ? `<p class="rw-meta">생일 ${ntl.birth.y}-${String(ntl.birth.m).padStart(2, '0')}-${String(ntl.birth.d).padStart(2, '0')}${ntl.hasHour ? '' : ' · 태어난 시간 모름'} 기준</p>`
      : '';

    const p = fortune && fortune.primary;
    const st = fortune && fortune.state && fortune.state.key;
    let energy = '';
    if (p) {
      const noun = ELEM_NOUN[p.elem] || p.elem;
      const cnt = ntl.counts[p.elem] || 0;
      const enums = SAJU.numbersOfElem(p.elem);
      const inPick = enums.filter((n) => pick.has(n));
      const mouth = (SAJU.ELEM_NUMS[p.elem] || []).join('·');
      let verdictLine;
      if (st === 'weak') {
        verdictLine = `꿈에서 가장 세게 잡힌 건 <b>‘${noun}’ 기운</b>이에요. 내 여덟 글자에는 ${noun} 기운이 <b>${cnt}칸</b>뿐이라 얇았어요. 그래서 ‘채워지는 꿈’으로 보고 ${noun} 끝자리(${mouth})가 붙은 수 쪽에 힘을 실었어요.`;
      } else if (st === 'strong') {
        verdictLine = `꿈에서 가장 세게 잡힌 건 <b>‘${noun}’ 기운</b>이에요. 내 여덟 글자에는 ${noun} 기운이 <b>${cnt}칸</b>으로 이미 넘쳐서 ‘덜어내는 꿈’으로 보고, ${noun} 끝자리(${mouth}) 수는 힘을 줄였어요.`;
      } else {
        verdictLine = `꿈에서 가장 세게 잡힌 건 <b>‘${noun}’ 기운</b>이에요. 내 여덟 글자에 ${noun} 기운이 <b>${cnt}칸</b>으로 무난해서, 그 기운만 앞세우지 않고 다른 근거와 고루 섞었어요.`;
      }
      energy = `<p class="rw-why">${verdictLine}</p>
        <p class="rw-meta">${noun} 끝자리 수 — ${enums.join('·')}${inPick.length ? ` · 이 중 ${inPick.join('·')}이 최종 6개에 들어갔어요.` : ''}</p>`;
    } else if (ctx.mode === 'balance') {
      energy = '<p class="rw-why">꿈 없이 뽑았으니 꿈 기운 대신 생일 숫자와 균형만 봤어요.</p>';
    }

    const ilj = (ctx.sajuVotes || []).filter((v) => v.kind === 'iljin')[0];
    const todayLine = ilj
      ? `<p class="rw-why">오늘 날짜(${esc(ilj.ganji)}일) 기운에서 온 수 <b>${ilj.nums.join('·')}</b>도 후보에 더했어요.</p>` : '';
    const ruleLine = fortune && fortune.rule
      ? `<div class="reason-tip"><b>${esc(fortune.rule.headline)}</b><span>오늘 해 볼 일 — ${esc(fortune.rule.action)}</span></div>` : '';
    return `<section class="reason-step">${head}
      ${birthBalls}
      <p class="rw-why">${birthLine}</p>
      ${bd}${energy}${todayLine}${ruleLine}
      <p class="rw-label">내 여덟 글자의 기운 분포</p>
      ${elemBarsHTML(ntl)}
      <p class="rw-meta">얇은 기운 — ${ntl.weak.map((e) => ELEM_NOUN[e]).join('·') || '없음'} · 넘치는 기운 — ${ntl.strong.filter((e) => (ntl.counts[e] || 0) > 0).map((e) => ELEM_NOUN[e]).join('·') || '없음'}</p>
      ${renderSajuCard(saju)}
    </section>`;
  }

  /* 3단계 — 최종 6개 공 하나하나의 이유 */
  function briefSources(ctx, n) {
    const cell = ctx.board.get(n);
    if (!cell) return null;
    const wordLayers = new Map();   /* 단어 → 상징(A)·실전사례(B) 층 */
    const others = [], pos = [];
    cell.sources.forEach((src) => {
      const s = String(src.label);
      let m;
      if ((m = s.match(/^(상징|사례)「(.+?)」/))) {
        const w = m[2];
        if (!wordLayers.has(w)) wordLayers.set(w, new Set());
        wordLayers.get(w).add(m[1] === '상징' ? 'A' : 'B');
        return;
      }
      if (/^내게 얇은/.test(s)) { if (!others.includes('생일에서 얇은 기운 채우기')) others.push('생일에서 얇은 기운 채우기'); return; }
      if (/^내게 넘치는/.test(s)) { if (!others.includes('생일에서 넘치는 기운 덜기')) others.push('생일에서 넘치는 기운 덜기'); return; }
      if (/^오늘 일진/.test(s)) { if (!others.includes('오늘 날짜 기운')) others.push('오늘 날짜 기운'); return; }
      if ((m = s.match(/^색「(.+?)」/))) { if (!others.includes(`꿈에 나온 ‘${m[1]}’`)) others.push(`꿈에 나온 ‘${m[1]}’`); return; }
      if ((m = s.match(/^(모양|소리)「(.+?)」/))) { const t = `‘${m[2]}’ ${m[1] === '모양' ? '생김새' : '발음'}`; if (!others.includes(t)) others.push(t); return; }
      if (/^꿈 속 수/.test(s)) { if (!others.includes('꿈에 그대로 나온 숫자')) others.push('꿈에 그대로 나온 숫자'); return; }
      if ((m = s.match(/^가로 (\d+)줄/))) { if (!pos.includes(`${m[1]}번째 가로줄`)) pos.push(`${m[1]}번째 가로줄`); return; }
      if ((m = s.match(/^세로 (\d+)칸/))) { if (!pos.includes(`${m[1]}번째 세로칸`)) pos.push(`${m[1]}번째 세로칸`); return; }
      if (/^대각/.test(s)) { if (!pos.includes('대각선')) pos.push('대각선'); return; }
      if (/^이웃 번호/.test(s)) { if (!pos.includes('옆 번호')) pos.push('옆 번호'); return; }
      if ((m = s.match(/^같은 끝자리 (\d+)/))) { if (!pos.includes(`끝자리 ${m[1]}`)) pos.push(`끝자리 ${m[1]}`); return; }
    });
    const parts = [];
    const words = Array.from(wordLayers.keys());
    if (words.length) parts.push(`꿈 단어 ‘${words.join('·')}’`);
    parts.push(...others);
    if (pos.length) parts.push(pos[0]);
    /* 「겹친 근거」는 화면에 보이는 직접 근거(단어·생일 기운·오늘 기운·색·원리) 수로 센다 */
    const cross = words.length + others.length;
    return { parts, cross, hasDirect: cross > 0, posCount: pos.length };
  }

  function ballRow(ctx, n) {
    const b = briefSources(ctx, n);
    const why = (b && b.parts.length) ? b.parts.join(' + ') : '출발점에서 이어진 수';
    const cross = b ? b.cross : 0;
    const chip = cross >= 2
      ? '<span class="br-chip cross">근거 겹침</span>'
      : (b && !b.hasDirect ? '<span class="br-chip bal">균형 자리</span>' : '');
    let meta;
    if (cross >= 2) meta = `직접 근거 ${cross}개가 같은 수를 가리켜 힘이 센 수로 뽑혔어요.`;
    else if (b && !b.hasDirect) meta = '직접 근거는 약해서, 홀짝·번호대·간격을 맞추는 자리에서 들어갔어요.';
    else if (b && b.posCount) meta = '근거 하나에 자리(줄·끝자리)가 더해져서 들어왔어요.';
    else meta = '한 가지 근거에서 온 수예요.';
    return `<div class="ball-row">
      <span class="rball ${ballClass(n)}">${n}</span>
      <div class="br-body"><p class="br-why">${esc(why)}${chip ? ' ' + chip : ''}</p><p class="br-meta">${meta}</p></div>
    </div>`;
  }

  function renderReasonStep3(ctx, combos) {
    const top = combos[0];
    const head = stepHead(3, '최종 6개 공이 결정된 순간',
      '근거가 많이 겹친 수부터 고르고, 6수가 홀짝·번호대·간격 조건을 통과할 때까지 다시 골랐어요.');
    const strat = `<p class="rw-why">이 조합은 <b>‘${esc(plainStrat(top.strat))}’</b> 방식이에요. ${esc(STRAT_NOTE[top.strat && top.strat.key] || '')}</p>`;
    const rows = top.nums.map((n) => ballRow(ctx, n)).join('');
    return `<section class="reason-step">${head}${strat}
      <div class="ball-rows">${rows}</div>
      <p class="reason-note">같은 근거에서 나온 수라도 조합마다 다르게 섞여요. 나머지 네 조합은 결과 화면의 ‘다른 조합 보기’에서 볼 수 있어요.</p>
    </section>`;
  }

  /* 4단계 — 7×7 번호판과 계산 근거 */
  function renderReasonStep4(ctx, fortune, saju) {
    const head = stepHead(4, '7×7 번호판에 놓고 본 자리',
      '출발점에서 넓히고, 겹친 수를 세고, 조건에 안 맞으면 다시 고르는 순서예요.');
    const rows = [
      '<li><b>출발점</b> — 꿈 단어·내 생일·오늘 기운에서 나온 수예요. 보라색 칸이 출발점이에요.</li>',
      '<li><b>가로줄·세로칸</b> — 출발점이 놓인 줄과 칸의 수를 모두 후보로 넓혔어요.</li>',
      '<li><b>대각선·같은 끝자리·옆 수</b> — 방향을 따라 이어진 수까지 봤어요.</li>',
      '<li><b>겹친 수</b> — 서로 다른 근거 두 개 이상이 같은 수를 가리키면 그 수의 힘이 세져요(금색 점).</li>',
      '<li><b>균형 필터</b> — 6수가 홀짝·번호대·간격 조건을 통과해야 최종으로 남아요. 안 맞으면 다시 골라요.</li>',
      '<li><b>뺀 번호</b> — 직접 뺀 번호는 후보에서 완전히 빠져요.</li>'
    ].join('');
    return `<section class="reason-step">${head}
      ${paperInner(ctx)}
      <ul class="notice-list reason-rules">${rows}</ul>
      ${fold('전문 용어로 보기', '전문 용어 포함', calcInner(ctx, fortune, saju))}
    </section>`;
  }

  function reasonEmptyHTML() {
    return `<div class="card reason-empty">
      <p class="re-lead">먼저 <b>꿈</b>이나 <b>꿈 없이</b> 탭에서 번호를 뽑아 주세요.</p>
      <p class="micro">뽑고 나면 왜 이 번호가 나왔는지, 이 페이지에서 하나씩 풀어 드려요.</p>
      <div class="re-actions">
        <button type="button" class="ghost-btn js-go-tab" data-tab="dream">꿈 탭으로</button>
        <button type="button" class="ghost-btn js-go-tab" data-tab="nodream">꿈 없이 탭으로</button>
      </div>
    </div>`;
  }

  function bindReasonActions(scope) {
    $$('.js-go-tab', scope).forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $$('.js-open-birth', scope).forEach((b) => b.addEventListener('click', () => {
      switchTab('dream');
      const fb = $('#fold-birth');
      if (fb) fb.open = true;
      setTimeout(() => { const el = $('#birth-date'); if (el) el.focus(); }, 260);
    }));
  }

  function renderReasonPage() {
    const box = $('#reason-body');
    if (!box) return;
    const R = STATE.reason;
    if (!R || !R.combos || !R.combos.length) {
      box.innerHTML = reasonEmptyHTML();
      bindReasonActions(box);
      return;
    }
    const pick = new Set(R.combos[0].nums);
    box.innerHTML = renderReasonSummary(R.ctx, R.fortune, R.combos)
      + renderReasonStep1(R.ctx, pick)
      + renderReasonStep2(R.ctx, R.fortune, R.saju, pick)
      + renderReasonStep3(R.ctx, R.combos)
      + renderReasonStep4(R.ctx, R.fortune, R.saju);
    bindReasonActions(box);
  }

  /* =========================================================
     10. 상태 · 저장
     ========================================================= */
  const META = { next_round: 1251, next_draw_date: '2026-11-21', next_draw_note: '토요일 20:35 추첨' };
  const STORE_KEY = 'mongpick.v1';
  const STATE = {
    birth: { y: null, m: null, d: null, hour: null },
    people: [],
    excluded: new Set(),
    saju: null,
    fortune: null,
    last: null,
    ndMode: 'sign',
    data: null,
    reason: null      /* 마지막으로 뽑은 조합의 배경 설명 재료(메모리에만 둔다) */
  };

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        birth: STATE.birth, people: STATE.people,
        excluded: Array.from(STATE.excluded), last: STATE.last
      }));
    } catch (e) { /* 저장 실패는 무시 */ }
  }
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      if (s.birth) STATE.birth = Object.assign(STATE.birth, s.birth);
      if (s.people) STATE.people = s.people;
      if (s.excluded) STATE.excluded = new Set(s.excluded);
      if (s.last) STATE.last = s.last;
    } catch (e) { /* ignore */ }
  }

  /* =========================================================
     11. 입력 UI
     ========================================================= */
  const SHICHEN = [
    ['자시 (23:00~01:00)', 0], ['축시 (01:00~03:00)', 1], ['인시 (03:00~05:00)', 3],
    ['묘시 (05:00~07:00)', 5], ['진시 (07:00~09:00)', 7], ['사시 (09:00~11:00)', 9],
    ['오시 (11:00~13:00)', 11], ['미시 (13:00~15:00)', 13], ['신시 (15:00~17:00)', 15],
    ['유시 (17:00~19:00)', 17], ['술시 (19:00~21:00)', 19], ['해시 (21:00~23:00)', 21]
  ];

  function buildShichenSelect(sel, value) {
    sel.innerHTML = '<option value="">태어난 시간 모름</option>' +
      SHICHEN.map(([label, h]) => `<option value="${h}">${label}</option>`).join('');
    if (value != null) sel.value = String(value);
  }

  function buildExcludeGrid() {
    const grid = $('#exclude-grid');
    let html = '';
    for (let n = 1; n <= 45; n++) html += `<button type="button" class="mini-cell" data-n="${n}" aria-pressed="false" aria-label="${n}번 제외">${n}</button>`;
    grid.innerHTML = html;
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.mini-cell');
      if (!b) return;
      const n = Number(b.dataset.n);
      if (STATE.excluded.has(n)) { STATE.excluded.delete(n); b.classList.remove('is-excluded'); b.setAttribute('aria-pressed', 'false'); }
      else { STATE.excluded.add(n); b.classList.add('is-excluded'); b.setAttribute('aria-pressed', 'true'); }
      syncExcludeNote();
      saveState();
    });
  }
  function syncExcludeNote() {
    const note = $('#exclude-note');
    const arr = Array.from(STATE.excluded).sort((a, b) => a - b);
    if (note) note.textContent = arr.length
      ? `${arr.slice(0, 5).join('·')}${arr.length > 5 ? ' 외 ' + (arr.length - 5) + '개' : ''} 빼기`
      : '선택';
    $$('#exclude-grid .mini-cell').forEach((b) => {
      const on = STATE.excluded.has(Number(b.dataset.n));
      b.classList.toggle('is-excluded', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function personRow(p, idx) {
    const opts = (v, max, unit) => {
      let s = `<option value="">${unit}</option>`;
      for (let i = 1; i <= max; i++) s += `<option value="${i}"${String(v) === String(i) ? ' selected' : ''}>${i}</option>`;
      return s;
    };
    return `<div class="person-row" data-idx="${idx}">
      <input type="text" class="p-name" maxlength="8" placeholder="관계/이름" value="${esc(p.name || '')}" />
      <select class="p-month" aria-label="태어난 달">${opts(p.month, 12, '월')}</select>
      <select class="p-day" aria-label="태어난 날">${opts(p.day, 31, '일')}</select>
      <button type="button" class="person-del" aria-label="삭제">×</button>
    </div>`;
  }

  function renderPeople() {
    const box = $('#people');
    box.innerHTML = STATE.people.map((p, i) => personRow(p, i)).join('');
  }

  function readPeople() {
    const rows = $$('#people .person-row');
    STATE.people = rows.map((r) => ({
      name: $('.p-name', r).value.trim(),
      month: Number($('.p-month', r).value) || null,
      day: Number($('.p-day', r).value) || null
    })).filter((p) => p.month || p.day);
  }

  function setBirthFromInput() {
    const raw = $('#birth-date').value.replace(/[^\d]/g, '');
    let y = null, m = null, d = null;
    if (raw.length === 8) {
      y = Number(raw.slice(0, 4)); m = Number(raw.slice(4, 6)); d = Number(raw.slice(6, 8));
      if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) { y = m = d = null; }
      else {
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) { y = m = d = null; }
      }
    }
    STATE.birth.y = y; STATE.birth.m = m; STATE.birth.d = d;
    const hourVal = $('#birth-hour').value;
    STATE.birth.hour = hourVal === '' ? null : Number(hourVal);
    updateBirthHint();
    saveState();
  }

  function setBirthNote(txt) {
    const n = $('#birth-note');
    if (n) n.textContent = txt || '선택 · 안 넣어도 돼요';
  }

  function updateBirthHint() {
    const hint = $('#birth-hint');
    const b = STATE.birth;
    const hourVal = $('#birth-hour').value;
    const hourTxt = hourVal === '' ? '시간 모름' : ($('#birth-hour').selectedOptions[0] || {}).textContent;
    const rawDigits = ($('#birth-date').value || '').replace(/[^\d]/g, '');
    if (!b.d) {
      hint.innerHTML = rawDigits.length >= 8
        ? '<span class="warn-text">1900~2100년 사이의 실제 날짜를 넣어 주세요.</span>'
        : '예) 1990-09-11 — 넣으면 내 기운까지 맞춰 뽑아요.';
      setBirthNote('');
      return;
    }
    const g = computeNatal();
    hint.innerHTML = `생일 숫자 <b>${b.m ? b.m + '·' : ''}${b.d}</b> · ${hourTxt}${g ? ` · <b>${g.dayGanji}일</b> 태어남` : ''}`;
    setBirthNote(`${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} 넣음`);
    const bp = $('#balance-birth');
    if (bp) bp.textContent = `생일 ${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}${hourVal === '' ? ' (시간 모름)' : ' ' + hourTxt} 기준으로 뽑아요.`;
  }

  function computeNatal() {
    const b = STATE.birth;
    if (!b.y || !b.m || !b.d) return null;
    return SAJU.natal({ y: b.y, m: b.m, d: b.d, hour: b.hour == null ? null : b.hour });
  }

  function buildSajuContext() {
    const today = SAJU.today();
    const natal = computeNatal();
    return { today, natal };
  }

  /* =========================================================
     12. 실행
     ========================================================= */
  function runDream() {
    const text = ($('#dream-input').value || '').trim();
    if (!text) { toast('꿈 내용을 먼저 적어 주세요'); $('#dream-input').focus(); return; }
    readPeople();
    const saju = buildSajuContext();
    STATE.saju = saju;
    const tone = toneOf(text);
    STATE.tone = tone;
    const fortune = dreamFortune(text, saju, 'dream');
    const ctx = analyze(text, {
      birth: STATE.birth.d ? { month: STATE.birth.m, day: STATE.birth.d } : null,
      people: STATE.people,
      excluded: Array.from(STATE.excluded),
      mode: 'dream',
      saju, fortune
    });
    const seed = hash32(text + '|' + JSON.stringify(STATE.birth) + '|' + STATE.people.map((p) => p.name + p.month + p.day).join(',') + '|' + Array.from(STATE.excluded).sort().join(','));
    const combos = buildCombos(ctx, seed, { count: 5 });

    const out = $('#dream-result');
    const saved = combos.length ? rememberTicket({ mode: 'dream', text, combos }) : null;
    out.innerHTML = combos.length
      ? renderTop(ctx, fortune, combos) + renderReasonCta() + renderSaveNote(saved) +
        renderVibe(fortune, saju, 'dream') + renderRest(ctx, combos)
      : renderNoCombo();
    STATE.reason = combos.length ? { ctx, fortune, combos, saju, mode: 'dream' } : null;
    renderReasonPage();

    STATE.last = {
      ts: Date.now(), round: META.next_round, dream: text.slice(0, 80),
      combos: combos.map((c) => ({ label: plainStrat(c.strat), nums: c.nums }))
    };
    saveState();
    renderBoard();
    bindResultActions(out);
    const foot = $('.input-foot');
    if (foot) foot.hidden = true;
    setTimeout(() => out.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function runSign() {
    const text = ($('#sign-input').value || '').trim();
    if (!text) { toast('오늘 본 것을 먼저 적어 주세요'); $('#sign-input').focus(); return; }
    readPeople();
    const saju = buildSajuContext();
    STATE.saju = saju;
    const tone = toneOf(text);
    STATE.tone = tone;
    const fortune = dreamFortune(text, saju, 'sign');
    const ctx = analyze(text, {
      birth: STATE.birth.d ? { month: STATE.birth.m, day: STATE.birth.d } : null,
      people: STATE.people,
      excluded: Array.from(STATE.excluded),
      mode: 'sign',
      saju, fortune
    });
    const seed = hash32('sign|' + text + '|' + JSON.stringify(STATE.birth));
    const combos = buildCombos(ctx, seed, { count: 5 });
    const out = $('#nodream-result');
    const saved = combos.length ? rememberTicket({ mode: 'sign', text, combos }) : null;
    out.innerHTML = combos.length
      ? renderTop(ctx, fortune, combos) + renderReasonCta() + renderSaveNote(saved) +
        renderVibe(fortune, saju, 'sign') + renderRest(ctx, combos)
      : renderNoCombo();
    STATE.reason = combos.length ? { ctx, fortune, combos, saju, mode: 'sign' } : null;
    renderReasonPage();
    STATE.last = { ts: Date.now(), round: META.next_round, dream: text.slice(0, 80), combos: combos.map((c) => ({ label: plainStrat(c.strat), nums: c.nums })) };
    saveState();
    renderBoard();
    bindResultActions(out);
    setTimeout(() => out.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function runBalance() {
    const saju = buildSajuContext();
    STATE.saju = saju;
    if (!saju.natal) {
      toast('생일을 먼저 넣어 주세요');
      switchTab('dream');
      const fb = $('#fold-birth');
      if (fb) fb.open = true;
      $('#birth-date').focus();
      return;
    }
    const ctx = analyze('', {
      birth: STATE.birth.d ? { month: STATE.birth.m, day: STATE.birth.d } : null,
      people: STATE.people,
      excluded: Array.from(STATE.excluded),
      mode: 'balance',
      saju
    });
    const seed = hash32('bal|' + JSON.stringify(STATE.birth) + '|' + Array.from(STATE.excluded).sort().join(','));
    const combos = buildCombos(ctx, seed, { count: 5, minAC: 8, strict: true });
    const out = $('#nodream-result');
    const saved = combos.length ? rememberTicket({ mode: 'balance', text: '생일만으로', combos }) : null;
    out.innerHTML = combos.length
      ? renderTop(ctx, null, combos) + renderReasonCta() + renderSaveNote(saved) +
        renderVibe(null, saju, 'balance') + renderRest(ctx, combos)
      : renderNoCombo();
    STATE.reason = combos.length ? { ctx, fortune: null, combos, saju, mode: 'balance' } : null;
    renderReasonPage();
    STATE.last = { ts: Date.now(), round: META.next_round, dream: '꿈 없이 · 생일', combos: combos.map((c) => ({ label: plainStrat(c.strat), nums: c.nums })) };
    saveState();
    renderBoard();
    bindResultActions(out);
    setTimeout(() => out.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function bindResultActions(scope) {
    $$('.js-copy', scope).forEach((b) => {
      b.addEventListener('click', async () => {
        const ok = await copyText(b.dataset.copy || '');
        if (ok) { b.classList.add('is-done'); toast('복사했습니다'); setTimeout(() => b.classList.remove('is-done'), 1400); }
        else toast('복사에 실패했습니다');
      });
    });
    $$('.js-share', scope).forEach((b) => {
      b.addEventListener('click', async () => {
        const text = b.dataset.copy || '';
        if (navigator.share) {
          try { await navigator.share({ title: '몽픽 추천 조합', text }); return; } catch (e) { /* 취소 */ }
        }
        const ok = await copyText(text);
        toast(ok ? '공유 대신 복사했습니다' : '공유에 실패했습니다');
      });
    });
    $$('.js-reason', scope).forEach((b) => b.addEventListener('click', () => switchTab('reason')));
    $$('.js-check-ticket', scope).forEach((b) => b.addEventListener('click', () => openTicketCheck()));
  }

  /* =========================================================
     13. 주간 복기 보드
     ========================================================= */
  const SAMPLE_BOARD = [
    { label: '가장 많이 겹친 수', nums: [3, 10, 16, 19, 34, 36] },
    { label: '근거가 겹친 수', nums: [5, 6, 9, 17, 29, 41] },
    { label: '끝자리 같은 수', nums: [2, 12, 22, 27, 32, 37] },
    { label: '생일 줄에서', nums: [4, 11, 18, 25, 33, 44] },
    { label: '골고루 섞은 수', nums: [1, 8, 15, 24, 30, 42] }
  ];

  function renderBoard() {
    const board = $('#board');
    if (!board) return;
    const last = STATE.last;
    const rows = last && last.combos && last.combos.length ? last.combos : SAMPLE_BOARD;
    const isSample = !(last && last.combos && last.combos.length);
    const round = Number((last && last.round) || META.next_round);
    const draw = DRAWS.map[String(round)] || null;
    const status = $('#board-status');
    if (status) status.textContent = isSample ? '예시 · 미추첨' : (draw ? '추첨 완료' : '미추첨');
    const head = $('#board-round');
    if (head) {
      head.textContent = draw
        ? `${round}회 · 당첨번호 ${draw.numbers.join(' · ')} + ${draw.bonus}`
        : `${round}회 · ${META.next_draw_date}(${'일월화수목금토'[new Date(META.next_draw_date + 'T00:00:00+09:00').getDay()]}) 20:35 추첨`;
    }

    let html = '';
    rows.forEach((c, i) => {
      const scored = draw ? scoreCombo(c.nums, draw) : null;
      const tail = scored
        ? `${scored.hits.length}개 적중${scored.bonus ? ' + 보너스' : ''} · <b>${scored.label}</b>`
        : `${round}회 결과 <b>미추첨</b>`;
      const balls = c.nums.map((n) => numballHTML(n,
        draw && draw.numbers.indexOf(n) >= 0 ? 'is-hit' : (draw && n === draw.bonus ? 'is-bonus' : ''))).join('');
      html += `<div class="board-row${scored && scored.rank ? ' is-win' : ''}" data-row="${i}">
        <div class="board-row-top"><span class="b-label">${i + 1}번째 · ${esc(c.label)}</span>
          <span class="b-result">${tail}</span></div>
        <div class="board-balls">${balls}</div>
      </div>`;
    });
    if (isSample) {
      html += `<p class="micro">아직 이 기기에서 뽑은 조합이 없어 <b>예시</b>로 채웠어요. 번호를 뽑으면 여기에 자동으로 쌓여요.</p>`;
    } else {
      html += `<p class="micro">마지막 실행: ${new Date(last.ts).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}${last.dream ? ' · ' + esc(last.dream) : ''}</p>`;
    }
    board.innerHTML = html;
  }

  function runCheck() {
    const input = $('#drawn-input');
    if (!input) return;
    const nums = (input.value.match(/\d{1,2}/g) || []).map(Number).filter((n) => n >= 1 && n <= 45);
    if (nums.length < 7) { toast('당첨번호 6개 + 보너스 1개를 넣어 주세요'); return; }
    const main = nums.slice(0, 6), bonus = nums[6];
    const rows = $$('#board .board-row');
    if (!rows.length) { toast('먼저 조합을 뽑아 주세요'); return; }
    rows.forEach((row, i) => {
      const combo = (STATE.last && STATE.last.combos[i]) ? STATE.last.combos[i].nums : SAMPLE_BOARD[i].nums;
      const hit = combo.filter((n) => main.includes(n)).length;
      const hasBonus = combo.includes(bonus);
      let rank = '낙첨';
      if (hit === 6) rank = '1등';
      else if (hit === 5 && hasBonus) rank = '2등';
      else if (hit === 5) rank = '3등';
      else if (hit === 4) rank = '4등';
      else if (hit === 3) rank = '5등';
      const cell = $('.b-result', row);
      if (cell) cell.innerHTML = `${hit}개 적중${hasBonus ? ' + 보너스' : ''} · <b>${rank}</b>`;
      row.classList.toggle('is-hit', hit >= 3);
    });
    toast('자체 채점했습니다 (참고용)');
  }

  /* =========================================================
     13-b. 번호함 — 자동 저장 · 자동 당첨 확인
        · 번호를 뽑으면 이 기기(localStorage)에 회차·날짜·꿈 요약·5조합을 저장
        · 결과가 나온 회차는 서버 함수(api/lotto, 있으면) → 정적 결과 파일(lotto-results.json)
          순서로 당첨번호를 받아 6개+보너스를 1:1로 채점
     ========================================================= */
  const TICKET_KEY = 'mongpick_tickets_v1';
  const DRAWS_KEY = 'mongpick_draws_v1';
  const TICKET_MAX = 30;
  const DRAWS = { map: {}, file: null };
  /* dream_data.json이 알려 준 기준 회차(1251회 · 2026-11-21) — 날짜로 현재 회차를 다시 센다 */
  const ROUND_ANCHOR = { round: META.next_round, date: META.next_draw_date };
  const WEEK_MS = 7 * 86400000;
  const MODE_WORD = { dream: '꿈', sign: '오늘 본 것', balance: '생일만으로' };

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeStore(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 저장 실패는 무시 */ }
  }

  /* 회차 → 추첨 시각(토요일 20:35 KST) */
  function drawTimeOf(round) {
    const base = new Date(ROUND_ANCHOR.date + 'T20:35:00+09:00').getTime();
    return base + (Number(round) - ROUND_ANCHOR.round) * WEEK_MS;
  }
  function drawDateOf(round) {
    const d = new Date(drawTimeOf(round) + 9 * 3600 * 1000);
    const p = (v) => String(v).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  function currentRoundInfo() {
    const now = Date.now();
    let round = ROUND_ANCHOR.round;
    let t = drawTimeOf(round);
    let guard = 0;
    while (now >= t && guard++ < 520) { round += 1; t = drawTimeOf(round); }
    return { round, drawAt: t, date: drawDateOf(round) };
  }
  function syncRoundMeta() {
    const info = currentRoundInfo();
    META.next_round = info.round;
    META.next_draw_date = info.date;
    const chip = $('#round-chip');
    if (chip) {
      const day = '일월화수목금토'[new Date(info.date + 'T00:00:00+09:00').getDay()];
      chip.innerHTML = `<span class="round-num">${info.round}회</span><span class="round-date">${info.date.slice(5).replace('-', '/')} ${day}</span>`;
    }
  }

  /* ---------- 저장된 번호함 ---------- */
  function loadTickets() {
    const s = readStore(TICKET_KEY);
    const list = (s && Array.isArray(s.tickets)) ? s.tickets : [];
    return list.filter((t) => t && t.round && Array.isArray(t.combos) && t.combos.length);
  }
  function saveTickets(list) {
    writeStore(TICKET_KEY, { v: 1, tickets: list.slice(0, TICKET_MAX) });
  }
  function rememberTicket(o) {
    const round = META.next_round;
    const text = String(o.text || '').slice(0, 60);
    const sig = [round, o.mode, text, o.combos.map((c) => c.nums.join('-')).join('|')].join('~');
    const list = loadTickets();
    const found = list.filter((t) => t.sig === sig)[0] || null;
    const entry = {
      sig, round, drawDate: META.next_draw_date, mode: o.mode, text,
      combos: o.combos.map((c) => ({ label: plainStrat(c.strat), nums: c.nums.slice() })),
      savedAt: Date.now()
    };
    if (found) { entry.savedAt = found.savedAt; list[list.indexOf(found)] = entry; }
    else list.unshift(entry);
    saveTickets(list);
    renderTickets();
    entry.duplicate = !!found;
    return entry;
  }

  /* ---------- 당첨번호 가져오기 ---------- */
  function normalizeDraw(j) {
    if (!j) return null;
    const src = j.draw || j;
    const round = Number(src.round || src.drwNo || 0);
    let numbers = Array.isArray(src.numbers) ? src.numbers.map(Number)
      : [src.drwtNo1, src.drwtNo2, src.drwtNo3, src.drwtNo4, src.drwtNo5, src.drwtNo6].map(Number);
    numbers = numbers.filter((n) => n >= 1 && n <= 45);
    const bonus = Number(src.bonus || src.bnusNo || 0);
    const date = String(src.date || src.drwNoDate || '');
    if (!round || numbers.length !== 6) return null;
    return { round, date, numbers: uniq(numbers).sort((a, b) => a - b), bonus };
  }

  /* 서버 함수가 있는 배포(Vercel 등)에서만 /api/lotto를 부른다.
     GitHub Pages 같은 정적 호스팅에서는 404가 콘솔에 남으므로 파일 조회만 한다. */
  function apiOn() {
    if (typeof window.MONGPICK_FORCE_API === 'boolean') return window.MONGPICK_FORCE_API;
    if (location.protocol === 'file:') return false;
    const h = String(location.hostname || '').toLowerCase();
    if (/(^|\.)github\.io$/.test(h)) return false;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return false;
    return true;
  }
  function apiBase() {
    const b = (typeof window.MONGPICK_API_BASE === 'string') ? window.MONGPICK_API_BASE : '';
    return b ? b.replace(/\/+$/, '') + '/' : '';
  }
  async function liveDraw(round) {
    if (!apiOn()) return null;
    try {
      const res = await fetch(apiBase() + 'api/lotto?drwNo=' + round, { cache: 'no-store' });
      if (!res.ok) return null;
      return normalizeDraw(await res.json());
    } catch (e) { return null; }
  }
  async function resultsFile(force) {
    if (DRAWS.file && !force) return DRAWS.file;
    try {
      const res = await fetch('lotto-results.json', force ? { cache: 'no-store' } : undefined);
      if (res.ok) {
        const j = await res.json();
        DRAWS.file = j;
        const draws = (j && j.draws) || {};
        Object.keys(draws).forEach((k) => {
          const d = normalizeDraw(draws[k]);
          if (d) DRAWS.map[String(d.round)] = d;
        });
        writeStore(DRAWS_KEY, { v: 1, at: Date.now(), draws: DRAWS.map });
        return j;
      }
    } catch (e) { /* 오프라인이면 아래 캐시로 */ }
    if (!DRAWS.file) {
      const c = readStore(DRAWS_KEY);
      if (c && c.draws) {
        DRAWS.map = Object.assign({}, c.draws, DRAWS.map);
        DRAWS.file = { draws: c.draws, cached: true };
      }
    }
    return DRAWS.file;
  }
  async function drawFor(round) {
    const key = String(round);
    if (DRAWS.map[key]) return DRAWS.map[key];
    const live = await liveDraw(round);
    if (live) { DRAWS.map[key] = live; return live; }
    return null;
  }

  /* ---------- 채점 ---------- */
  function scoreCombo(nums, draw) {
    const hits = nums.filter((n) => draw.numbers.indexOf(n) >= 0);
    const bonus = nums.indexOf(draw.bonus) >= 0;
    let rank = 0;
    if (hits.length === 6) rank = 1;
    else if (hits.length === 5 && bonus) rank = 2;
    else if (hits.length === 5) rank = 3;
    else if (hits.length === 4) rank = 4;
    else if (hits.length === 3) rank = 5;
    return { hits, bonus, rank, label: rank ? `${rank}등` : '낙첨' };
  }

  /* ---------- 번호함 렌더 ---------- */
  function ticketComboHTML(c, draw, idx) {
    const scored = draw ? scoreCombo(c.nums, draw) : null;
    const balls = c.nums.map((n) => {
      let cls = '';
      if (draw) {
        if (draw.numbers.indexOf(n) >= 0) cls = 'is-hit';
        else if (n === draw.bonus) cls = 'is-bonus';
      }
      return numballHTML(n, cls);
    }).join('');
    const tail = scored
      ? `<span class="tc-rank${scored.rank ? ' is-win' : ''}">${scored.hits.length}개 맞음 · ${scored.label}</span>`
      : `<span class="tc-rank is-wait">${esc(c.label || '')}</span>`;
    return `<div class="tc-row"><span class="tc-no">${idx + 1}</span>
      <span class="tc-balls">${balls}</span>${tail}</div>`;
  }
  function ticketItemHTML(t, draw) {
    const when = new Date(t.savedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    return `<div class="tb-item">
      <p class="tb-meta">${esc(MODE_WORD[t.mode] || '꿈')} · ${esc(t.text || '내 조합')} <span class="tb-when">${when}</span></p>
      ${t.combos.map((c, i) => ticketComboHTML(c, draw, i)).join('')}
    </div>`;
  }
  function ticketBlockHTML(round, items) {
    const draw = DRAWS.map[String(round)] || null;
    const head = draw
      ? `<div class="tb-head"><span class="tb-round">${round}회</span>
          <span class="tb-state is-drawn">당첨번호 ${draw.numbers.join(' · ')} + ${draw.bonus}</span></div>`
      : `<p class="tb-wait">${round}회 · 토요일 20:35 추첨 후 자동 확인돼요</p>`;
    return `<div class="ticket-block" data-round="${round}" data-drawn="${draw ? '1' : '0'}">
      ${head}${items.map((t) => ticketItemHTML(t, draw)).join('')}</div>`;
  }
  function renderTickets() {
    const box = $('#ticket-list');
    if (!box) return;
    const list = loadTickets();
    if (!list.length) {
      box.innerHTML = '<p class="micro tb-empty">아직 저장된 조합이 없어요. 번호를 뽑으면 이 기기에 자동으로 쌓여요.</p>';
      return;
    }
    const byRound = {};
    list.forEach((t) => {
      const k = String(Number(t.round));
      (byRound[k] = byRound[k] || []).push(t);
    });
    const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a).slice(0, 3);
    box.innerHTML = rounds.map((r) => ticketBlockHTML(r, byRound[String(r)])).join('');
  }

  /* 저장된 회차를 자동 확인 — 앱 시작·안내 탭 진입·`당첨 확인하기` 때 부른다 */
  async function refreshTickets(opts) {
    const force = !!(opts && opts.force);
    const list = loadTickets();
    await resultsFile(force);
    const rounds = uniq(list.map((t) => Number(t.round))).filter(Boolean);
    let got = false;
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      if (DRAWS.map[String(r)]) continue;
      if (await drawFor(r)) got = true;   /* 서버 함수가 있으면 실시간, 없으면 결과 파일에 이미 반영 */
    }
    if (got) writeStore(DRAWS_KEY, { v: 1, at: Date.now(), draws: DRAWS.map });
    renderTickets();
    renderBoard();
    return DRAWS.map;
  }

  function renderSaveNote(ticket) {
    return `<div class="save-note" data-round="${ticket.round}">
      <span class="sn-line">${ticket.round}회 내 번호함에 자동 저장됨</span>
      <button type="button" class="ghost-btn js-check-ticket">당첨 확인하기</button>
    </div>`;
  }

  function openTicketCheck() {
    switchTab('trust');
    refreshTickets({ force: true }).then(() => {
      const card = $('#ticket-card');
      setTimeout(() => {
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('번호함을 확인했어요');
      }, 160);
    });
  }

  /* =========================================================
     14. 탭 · 초기화
     ========================================================= */
  function switchTab(name) {
    $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'panel-' + name));
    $$('.tabbar .tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'nodream') updateBirthHint();
    if (name === 'reason') renderReasonPage();
    if (name === 'trust') { renderTickets(); refreshTickets(); }
  }

  function renderPrinciples() {
    const box = $('#principles');
    if (!box || !D.raw) return;
    box.innerHTML = D.raw.principles.map((p, i) => `
      <details class="pr-item"${i === 0 ? ' open' : ''}>
        <summary><span class="pr-name">${esc(p.name)}</span><span class="pr-tag">${esc(p.tag)}</span></summary>
        <div class="pr-body">${esc(p.desc)}
          <div class="pr-ex">${p.examples.map((e) => `<div><b>${esc(e.word)}</b><span>${esc(e.num.join('·'))} — ${esc(e.why)}</span></div>`).join('')}</div>
        </div>
      </details>`).join('');
  }

  function renderSajuGuards() {
    const box = $('#saju-guards');
    const pack = D.raw && D.raw.saju;
    if (!box || !pack) return;
    const items = [];
    items.push('<li><b>꿈은 꿈일 뿐</b> — 좋고 나쁨은 앞날의 예고가 아니라 오늘 마음이 쏠린 곳을 보여 주는 신호예요.</li>');
    items.push('<li><b>띠로 풀지 않아요</b> — 같은 꿈이라도 내 기운 분포에 따라 다르게 읽어요.</li>');
    items.push('<li><b>같은 꿈, 다른 결론</b> — 내 사주에 그 기운이 얇으면 채워 주는 꿈, 넘치면 덜어 주는 꿈으로 갈려요.</li>');
    items.push(`<li>${esc(pack.notice || '')}</li>`);
    box.innerHTML = items.join('');
  }

  async function init() {
    try {
      const res = await fetch('dream_data.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();
      STATE.data = raw;
      if (raw.meta) {
        META.next_round = raw.meta.next_round;
        META.next_draw_date = raw.meta.next_draw_date;
        META.next_draw_note = raw.meta.next_draw_note;
      }
      buildIndices(raw);
      renderPrinciples();
      renderSajuGuards();
    } catch (e) {
      $('#dream-result').innerHTML = `<div class="card note-card">데이터(dream_data.json)를 불러오지 못했습니다. <b>로컬 파일로 열었다면 웹 서버로 열어 주세요</b> (같은 폴더에서 <code>python3 -m http.server</code>).<br><span class="muted-line">${esc(e.message)}</span></div>`;
      return;
    }

    buildExcludeGrid();
    buildShichenSelect($('#birth-hour'), null);
    syncRoundMeta();
    loadState();

    if (STATE.birth.y) {
      $('#birth-date').value = `${STATE.birth.y}-${String(STATE.birth.m).padStart(2, '0')}-${String(STATE.birth.d).padStart(2, '0')}`;
    }
    if (STATE.birth.hour != null) $('#birth-hour').value = String(STATE.birth.hour);
    renderPeople();
    syncExcludeNote();
    updateBirthHint();
    renderBoard();

    renderTickets();
    refreshTickets().then(() => renderBoard());

    /* 이벤트 */
    $$('.tabbar .tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    $('#dream-input').addEventListener('input', (e) => {
      $('#char-count').textContent = e.target.value.length;
    });
    $$('#example-chips .chip').forEach((b) => b.addEventListener('click', () => {
      $('#dream-input').value = b.dataset.example;
      $('#char-count').textContent = b.dataset.example.length;
      $('#dream-input').focus();
    }));

    $('#birth-date').addEventListener('input', (e) => {
      const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 8);
      let out = digits;
      if (digits.length > 4) out = digits.slice(0, 4) + '-' + digits.slice(4);
      if (digits.length > 6) out = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6);
      e.target.value = out;
      setBirthFromInput();
    });
    $('#birth-hour').addEventListener('change', setBirthFromInput);

    $('#add-person').addEventListener('click', () => {
      if (STATE.people.length >= 3) { toast('최대 3명까지 넣을 수 있습니다'); return; }
      readPeople();
      STATE.people.push({ name: '', month: null, day: null });
      renderPeople();
      const rows = $$('#people .person-row');
      const lastRow = rows[rows.length - 1];
      if (lastRow) $('.p-name', lastRow).focus();
    });
    $('#people').addEventListener('click', (e) => {
      if (!e.target.classList.contains('person-del')) return;
      const row = e.target.closest('.person-row');
      readPeople();
      STATE.people.splice(Number(row.dataset.idx), 1);
      renderPeople();
      saveState();
    });
    $('#people').addEventListener('change', () => { readPeople(); saveState(); });

    $('#run-dream').addEventListener('click', runDream);
    $('#run-sign').addEventListener('click', runSign);
    $('#run-balance').addEventListener('click', runBalance);

    $$('#sign-chips .chip').forEach((b) => b.addEventListener('click', () => {
      $('#sign-input').value = b.dataset.example;
      $('#sign-input').focus();
    }));

    $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      STATE.ndMode = b.dataset.nmode;
      $$('.seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
      $('#sign-panel').hidden = STATE.ndMode !== 'sign';
      $('#balance-panel').hidden = STATE.ndMode !== 'balance';
      updateBirthHint();
    }));

    $('#run-check').addEventListener('click', runCheck);
    const tc = $('#run-ticket-check');
    if (tc) tc.addEventListener('click', () => {
      refreshTickets({ force: true }).then(() => toast('당첨 결과를 새로 받았어요'));
    });
  }

  /* 테스트·디버그용 공개 핸들 (읽기 전용으로 쓰세요) */
  window.MongPick = {
    state: STATE, meta: META, data: D, saju: SAJU,
    analyze, buildCombos, dreamFortune, statsOf, acValue,
    runDream, runSign, runBalance,
    tickets: {
      load: loadTickets, save: saveTickets, remember: rememberTicket,
      refresh: refreshTickets, render: renderTickets, score: scoreCombo,
      draws: DRAWS, drawTime: drawTimeOf, drawDate: drawDateOf,
      current: currentRoundInfo, apiOn
    },
    mulsang: mulsangOf, toneOf, elemLabel, dreamElemProfile, matchRule, natalElemState,
    renderTop, renderVibe, renderRest, renderWhy, renderPaperCard, renderSajuCard, renderCalc, renderBoard,
    renderReasonPage, renderReasonCta, renderReasonSummary, renderReasonStep1, renderReasonStep2,
    renderReasonStep3, renderReasonStep4, briefSources, paperInner, calcInner, elemBarsHTML
  };

  document.addEventListener('DOMContentLoaded', init);
})();
