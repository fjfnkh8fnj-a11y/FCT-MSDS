import { CATALOG } from './legal-catalog.mjs';
import { undisclosedComponent, excludedComponent, validCas } from './material-values.mjs?v=VER13_rev.22';
export { excludedComponent, additiveWithoutCas, undisclosedComponent, normalizeComponents, requiredFields, valuesOf, effectiveDocument, confirmValues } from './material-values.mjs?v=VER13_rev.22';
export const REGULATION_LABELS={chemical:['인체급성유해성물질','인체만성유해성물질','생태유해성물질','사고대비물질'],osh:['관리대상 유해물질','특별관리물질','작업환경측정 대상','특수건강진단 대상']};
// 법령 판정은 시행일과 구성성분의 CAS/함량을 기준으로 수행한다.
// 출처가 확인되지 않는 조항은 자동 확정하지 않는다.
export const CHECKED_ON = '2026-09-29';
export const SOURCE = {
  chemical: '화학물질안전원고시 제2026-5호 (2026-07-01 시행)',
  accident: '화학물질안전원고시 제2026-2호 (2026-03-10 시행)',
  osh: '산업안전보건기준에 관한 규칙 별표 12',
  dangerous: '위험물안전관리법 시행령 별표 1',
};
const rule = (cas, group, label, threshold, source, detail = '') => ({
  id: `${source}:${cas}:${group}:${label}`, cas, group, label, threshold,
  effective_date: source === SOURCE.chemical ? '2026-07-01' : source === SOURCE.accident ? '2026-03-10' : '2022-10-18',
  source, detail,
});
const chemical = {
  '67-56-1': [10], '7647-01-0': [10], '7664-39-3': [1], '7664-93-9': [10],
  '7803-57-8': [1, 0.1, 2.5], '75-59-2': [1], '84-74-2': [null, 0.3, 25],
  '872-50-4': [null, 0.3], '10043-35-3': [null, 0.3], '90-30-2': [null, null, 25],
  '2634-33-5': [1, null, 25], '1317-38-0': [null, null, 1], '999-97-3': [10],
};
const accident = {
  '67-56-1': 85, '78-93-3': 25, '108-88-3': 85,
  '7647-01-0': 10, '7664-39-3': 1, '7664-93-9': 10,
};
// 별표 12: 성분의 1% 이상, 특별관리물질의 개별 0.3%/0.1% 기준.
const osh = {
  '67-56-1': [1], '78-93-3': [1], '108-88-3': [1], '67-63-0': [1],
  '67-64-1': [1], '84-74-2': [0.3, 0.3], '7803-57-8': [0.1, 0.1],
  '7647-01-0': [1], '7664-39-3': [1], '7664-38-2': [1],
  '7664-93-9': [1], '1344-28-1': [1], '7429-90-5': [1],
  '1302-93-8': [1], '1309-37-1': [1], '7705-08-0': [1], '7758-94-3': [1],
  '7758-99-8': [1], '13462-88-9': [1], '124594-15-6': [1],
  '1309-48-4': [1], '13463-67-7': [1], '1308-38-9': [1],
};
// 별표 12의 집합명 조항을 현재 등록된 화합물의 CAS에 연결한다.
// 불용성 니켈/6가 크롬의 특별관리 조건을 모든 화합물로 확대하지 않는다.
const compoundGroups = {
  '1317-38-0':'구리 및 그 화합물', '7758-99-8':'구리 및 그 화합물',
  '1344-28-1':'알루미늄 및 그 화합물', '1302-93-8':'알루미늄 및 그 화합물',
  '1309-37-1':'철 및 그 화합물', '7705-08-0':'철 및 그 화합물', '7758-94-3':'철 및 그 화합물',
  '13462-88-9':'니켈 및 그 무기화합물', '124594-15-6':'니켈 및 그 무기화합물',
  '1308-38-9':'크롬 및 그 화합물',
};
const compoundRules = Object.entries(compoundGroups).map(([cas, family]) => ({
  ...rule(cas,'osh','관리대상 유해물질',1,SOURCE.osh,`별표 12 제2호: ${family} · 혼합물 중량비율 1% 이상`),
  source_url:'https://www.law.go.kr/LSW/flDownload.do?bylClsCd=110201&flSeq=154464361&gubun=',
  mapping_basis:family, verified_on:'2026-10-01',
}));
export const DEFAULT_RULES = [...CATALOG.rules, ...compoundRules];
export const LEGAL_SOURCES = CATALOG.sources;
export const todayKorea = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export function contentRange(value) {
  const raw = String(value || '').replace(/,/g, '.').replace(/％/g, '%').trim().replace(/^(.*?)\s*(이상|이하|미만|초과)$/, '$2 $1');
  const numbers = [...raw.matchAll(/\d+(?:\.\d+)?/g)].map(x => Number(x[0]));
  if (!numbers.length || numbers.some(x => x > 100) || /영업비밀|secret/i.test(raw)) return null;
  if (numbers.length > 1) return { min: Math.min(...numbers), max: Math.max(...numbers),
    minInclusive: !/^(?:>|초과)/.test(raw) || /^>=/.test(raw), maxInclusive: !/<\s*\d/.test(raw) };
  if (/^(?:<=|≤|이하)/.test(raw)) return { min: 0, max: numbers[0], maxInclusive: true };
  if (/^(?:<|미만)/.test(raw)) return { min: 0, max: numbers[0], maxInclusive: false };
  if (/^(?:>=|≥|이상)/.test(raw)) return { min: numbers[0], max: 100, minInclusive: true };
  if (/^(?:>|초과)/.test(raw)) return { min: numbers[0], max: 100, minInclusive: false };
  return { min: numbers[0], max: numbers[0], maxInclusive: true };
}
export function compare(range, threshold) {
  if (!range || typeof threshold !== 'number') return 'review';
  if (range.min >= threshold) return 'applicable';
  if (range.max < threshold || range.max === threshold && range.maxInclusive === false) return 'not-applicable';
  return 'review';
}
export function activeRules(rules, on = todayKorea()) {
  const cached = activeRuleCache.get(rules);
  if (cached?.on === on) return cached.rows;
  const byKey = new Map();
  for (const r of rules) {
    if (!r.effective_date || r.effective_date > on || r.superseded_at && r.superseded_at <= on) continue;
    const key = `${r.cas}|${r.group}|${r.label}`;
    const previous = byKey.get(key);
    if (!previous || previous.effective_date <= r.effective_date) byKey.set(key,r);
  }
  const rows = [...byKey.values()];
  activeRuleCache.set(rules, {on, rows});
  return rows;
}
const activeRuleCache = new WeakMap();
const indexedRuleCache = new WeakMap();
function rulesByCas(rules, on) {
  const cached = indexedRuleCache.get(rules);
  if (cached?.on === on) return cached.index;
  const index = new Map();
  for (const row of activeRules(rules, on)) {
    if (!index.has(row.cas)) index.set(row.cas, []);
    index.get(row.cas).push(row);
  }
  indexedRuleCache.set(rules, {on, index});
  return index;
}
export function assess(components, rules, { on = todayKorea(), physicalState = '', ph = null } = {}) {
  const index = rulesByCas(rules, on), decisions = [], validations=[];
  for (const [componentIndex,component] of (components || []).entries()) {
    const range=contentRange(component.content), applicableRules=excludedComponent(component)?[]:index.get(String(component.cas || '').trim()) || [];
    const current=applicableRules.map(criterion=>{
      let status=compare(range,Number(criterion.threshold));
      if(status==='review' && range)status='applicable';
      if(criterion.detail?.includes('pH 2.0') && status==='applicable' && !(ph!==null && Number(ph)<=2))status='review';
      return {...criterion,status,componentIndex,content:component.content || '',component_name:component.name || ''};
    });
    decisions.push(...current);
    for(const [label,selected] of Object.entries(component.regulation_selections || {})) {
      if(typeof selected!=='boolean' || !Object.values(REGULATION_LABELS).flat().includes(label))continue;
      const criterion=current.find(d=>d.label===label);
      if(!criterion) {if(selected)validations.push({componentIndex,label,unresolved:true,message:'선택한 규제 항목의 법령 근거 확인 필요'});continue;}
      if(criterion.status==='review')continue;
      if(selected!==(criterion.status==='applicable'))validations.push({componentIndex,label,unresolved:false,message:criterion.status==='applicable'?'선택한 해당없음과 다릅니다. 성분·함량 기준상 해당입니다.':'선택한 해당과 다릅니다. 성분·함량 기준상 해당없음입니다.'});
    }
  }
  const regulations={chemical:[],osh:[],dangerous:[]};
  decisions.filter(d=>d.status==='applicable').forEach(d=>{if(!regulations[d.group].includes(d.label))regulations[d.group].push(d.label);});
  return {decisions,regulations,validations,review:validations.some(v=>v.unresolved)||decisions.some(d=>d.status==='review')||(components || []).some(c=>!excludedComponent(c)&&(!c.name||!contentRange(c.content)||!validCas(c.cas))),undisclosed:(components || []).some(undisclosedComponent),physicalState};
}
export function diffProduct(before, after) {
  const map = cs => new Map((cs || []).map(c => [String(c.cas || c.name).trim(), c]));
  const a = map(before.components), b = map(after.components);
  const componentChanges = [...new Set([...a.keys(), ...b.keys()])].filter(k => !a.has(k) || !b.has(k));
  const contentChanges = [...a.keys()].filter(k => b.has(k) && String(a.get(k).content).trim() !== String(b.get(k).content).trim());
  const labels = x => ['chemical', 'osh', 'dangerous'].flatMap(g => (x?.regulations?.[g] || []).map(s => g + ':' + s)).sort();
  const oldLabels = new Set(labels(before)), newLabels = new Set(labels(after));
  const regulationChanges = [...new Set([...oldLabels, ...newLabels])].filter(x => oldLabels.has(x) !== newLabels.has(x));
  return { componentChanges, contentChanges, regulationChanges,
    summary: `성분 변경 ${componentChanges.length}건 / 함량 변경 ${contentChanges.length}건 / 법적규제 변경 ${regulationChanges.length}건` };
}

// 수치·CAS가 한 행 안에서 연결되는 명시적 표 형식만 자동 구조화한다.
// 임의의 숫자나 본문 서술을 법령 기준으로 추정하지 않는다.
export function parseLegalText(text, { source = '', effectiveDate = '' } = {}) {
  const compact = String(text || '').replace(/\r/g, '');
  const notice = compact.match(/(?:고시|훈령|예규)\s*제?\s*(\d{4}\s*[-–]\s*\d+)\s*호?/);
  const date = compact.match(/(?:시행일|시행)\s*[:：]?\s*\[?\s*(20\d{2})[.\-년\s]+(\d{1,2})[.\-월\s]+(\d{1,2})/);
  const inferredDate = date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : '';
  const sourceName = source || (compact.match(/(?:인체급성유해성물질.{0,30}지정|사고대비물질.{0,20}지정|관리대상 유해물질의 종류|위험물 및 지정수량)/)?.[0] || '법령명 판독불가');
  const rows = [], unreadable = [];
  let casRows = 0;
  for (const line of compact.split('\n')) {
    const cas = line.match(/\b\d{2,7}-\d{2}-\d\b/),
      percent = line.match(/(?:이를\s*|혼합물(?:질)?\s*(?:중|에)?\s*|함량\s*)?(\d+(?:\.\d+)?)\s*%\s*이상/);
    if (!cas) continue;
    casRows++;
    if (!percent) { unreadable.push(line.trim().slice(0, 180)); continue; }
    const threshold = Number(percent[1]);
    const label = /사고대비/.test(sourceName) ? '사고대비물질' : /관리대상/.test(sourceName) ? '관리대상 유해물질' : '';
    if (!label || !sourceName || !(effectiveDate || inferredDate)) { unreadable.push(line.trim().slice(0, 180)); continue; }
    rows.push(rule(cas[0], label === '사고대비물질' ? 'chemical' : 'osh', label, threshold,
      `${sourceName}${notice ? ' 제' + notice[1].replace(/\s/g, '') + '호' : ''}`));
    rows.at(-1).effective_date = effectiveDate || inferredDate;
  }
  return { sourceName, noticeNumber: notice?.[1]?.replace(/\s/g, '') || '', effectiveDate: effectiveDate || inferredDate,
    rows: [...new Map(rows.map(x => [x.id, x])).values()], unreadable,
    complete: casRows > 0 && unreadable.length === 0 && casRows === rows.length,
    needsSourceData: !sourceName || sourceName === '법령명 판독불가' || !(effectiveDate || inferredDate) };
}

