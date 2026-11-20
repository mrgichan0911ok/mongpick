// 몽픽 — 회차별 당첨번호 조회 (서버 함수)
// Vercel 같은 서버 실행 환경에 올리면 /api/lotto?drwNo=1250 이 실시간으로 답한다.
// 정적 호스팅(GitHub Pages)에서는 같은 역할을 lotto-results.json이 대신한다.
//
// 응답: { round, draw: { round, date, numbers:[6], bonus } | null, pending: bool }

const ENDPOINT = 'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Referer': 'https://www.dhlottery.co.kr/lt645/result',
  Accept: 'application/json'
};

function toDraw(row) {
  if (!row) return null;
  const round = Number(row.ltEpsd);
  const numbers = [1, 2, 3, 4, 5, 6].map((i) => Number(row['tm' + i + 'WnNo']))
    .filter((n) => n >= 1 && n <= 45);
  const bonus = Number(row.bnsWnNo);
  if (!round || numbers.length !== 6) return null;
  const ymd = String(row.ltRflYmd || '');
  const date = ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : '';
  return { round, date, numbers: numbers.sort((a, b) => a - b), bonus };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const raw = (req.query && (req.query.drwNo || req.query.round)) || '';
  const round = Number(String(raw).replace(/[^0-9]/g, ''));
  if (!round || round < 1 || round > 3000) {
    res.status(400).json({ error: 'drwNo 값이 필요합니다.', round: null, draw: null });
    return;
  }

  try {
    const url = `${ENDPOINT}?srchDir=center&srchLtEpsd=${round}`;
    const upstream = await fetch(url, { headers: HEADERS });
    if (!upstream.ok) throw new Error('upstream HTTP ' + upstream.status);
    const body = await upstream.json();
    const list = (body && body.data && body.data.list) || [];
    const row = list.filter((x) => Number(x.ltEpsd) === round)[0] || null;
    const draw = toDraw(row);
    // 아직 추첨 전이면 draw: null — 앱은 이를 '추첨 후 자동 확인'으로 표시한다
    res.status(200).json({ round, draw, pending: !draw });
  } catch (e) {
    // 실패해도 앱이 콘솔 오류 없이 정적 결과 파일로 넘어가도록 200으로 답한다
    res.status(200).json({ round, draw: null, pending: true, error: String((e && e.message) || e) });
  }
};
