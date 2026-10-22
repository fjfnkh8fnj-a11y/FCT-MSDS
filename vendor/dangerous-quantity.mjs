// 위험물안전관리법 시행령 별표 1 (현행 2026-07-01), 확인 2026-10-23.
// 품명/수용성이 명확한 경우만 지정수량을 연결한다. 성분 CAS만으로 제품 분류를 추정하지 않는다.
export const DANGEROUS_SOURCE={name:'위험물안전관리법 시행령 별표 1',effective:'2026-07-01',checked:'2026-10-23',url:'https://www.law.go.kr/법령/위험물안전관리법시행령',reference:'https://hits.kfi.or.kr/dgst/main/contents.do?menuNo=700005'};
const format=n=>Number(n).toLocaleString('en-US');
function identify(text) {
  const compact=text.replace(/\s/g,'');
  const non=/비수용성|불용성/.test(compact),soluble=!non&&/수용성/.test(compact);
  if(/제4류/.test(compact)){
    if(/특수인화물/.test(compact))return {name:'제4류 특수인화물',quantity:50,unit:'L'};
    if(/알코올류/.test(compact))return {name:'제4류 알코올류',quantity:400,unit:'L'};
    const petroleum=compact.match(/제([1-4])석유류/);
    if(petroleum){
      const n=Number(petroleum[1]);
      if(n===4)return {name:'제4류 제4석유류',quantity:6000,unit:'L'};
      const name='제4류 제'+n+'석유류';
      if(!non&&!soluble)return {name,reason:'수용성·비수용성 구분 확인 필요'};
      return {name:name+'('+(non?'비수용성액체':'수용성액체')+')',quantity:({1:[200,400],2:[1000,2000],3:[2000,4000]})[n][non?0:1],unit:'L'};
    }
    if(/동식물유류/.test(compact))return {name:'제4류 동식물유류',quantity:10000,unit:'L'};
  }
  if(/제2류/.test(compact)&&/금속분/.test(compact))return {name:'제2류 금속분',quantity:500,unit:'kg'};
  return null;
}
export function dangerousClassifications(values=[]) {
  const text=(Array.isArray(values)?values:[values]).filter(Boolean).join(' · ');
  if(!text)return [];
  const chunks=text.split(/(?=제\s*[1-6]\s*류)/).filter(s=>/제\s*[1-6]\s*류/.test(s));
  if(!chunks.length)return [{label:text,raw:text,quantity:null,reason:'위험물 류·품명 확인 필요'}];
  const results=chunks.map(raw=>{
    raw=raw.replace(/[\/·\s]+$/,'').trim();
    const known=identify(raw);
    const explicit=raw.match(/(?:지정수량\s*[:：]?\s*)?([\d,]+(?:\.\d+)?)\s*(리터|킬로그램|kg|ℓ|L)(?=[)\s·,]|$)/i);
    if(known?.quantity)return {...known,raw,label:known.name+', 지정수량 '+format(known.quantity)+known.unit,source:DANGEROUS_SOURCE.name};
    if(explicit)return {raw,label:raw,quantity:Number(explicit[1].replace(/,/g,'')),unit:/킬로그램|kg/i.test(explicit[2])?'kg':'L',source:'원문 지정수량',...(known?.reason?{reason:known.reason}:{})};
    return {raw,label:(known?.name || raw.replace(/\s*·\s*지정수량 확인 필요$/,'').replace(/[·\s]+$/,''))+' · 지정수량 확인 필요',quantity:null,reason:known?.reason || '류·품명별 법령 기준 확인 필요'};
  });
  return [...new Map(results.map(r=>[r.label,r])).values()];
}
export const completeDangerous=values=>dangerousClassifications(values).map(r=>r.label);
export const dangerousReviewReasons=values=>[...new Set(dangerousClassifications(values).flatMap(r=>r.reason?[r.reason]:[]))];
export function completeDangerousFromMsds(values,text='') {
  const section=text.match(/(?:^|\n)\s*9\s*[.)]\s*물리[\s\S]*?(?=(?:^|\n)\s*10\s*[.)]\s*안정|$)/)?.[0] || '';
  const product=section.split(/구성\s*성분|성분별/)[0];
  const soluble=/(?:수용해도|용해도)\s*[:：]?\s*(?:물에\s*)?(?:완전(?:히)?\s*용해|혼화성|가용성)/.test(product);
  const insoluble=/(?:수용해도|용해도)\s*[:：]?\s*(?:물에\s*)?(?:무시할|불용|녹지)/.test(product);
  const rows=Array.isArray(values)?values:[values];
  const enriched=rows.map(value=>{
    if(/제\s*[1-3]\s*석유류/.test(value)&&!/비?수용성/.test(value)){
      if(soluble)return value+' (수용성액체)';
      if(insoluble)return value+' (비수용성액체)';
    }
    return value;
  });
  const reasons=dangerousReviewReasons(enriched);
  for(const raw of rows){
    if(soluble && /비수용성/.test(raw))reasons.push('MSDS 제15항 비수용성 분류와 제9항 완전 용해가 불일치합니다. 원문 분류·수용성 확인 필요');
    if(insoluble && /수용성/.test(raw)&&!/비수용성/.test(raw))reasons.push('MSDS 제15항 수용성 분류와 제9항 불용성이 불일치합니다. 원문 분류·수용성 확인 필요');
    const n=Number(raw.match(/제\s*([1-4])\s*석유류/)?.[1]);
    const flash=product.match(/인화점\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:℃|°\s*C)/i);
    if(n&&flash){const value=Number(flash[1]),low=[null,-Infinity,21,70,200][n],high=[null,21,70,200,250][n];if(value<low||value>=high)reasons.push('MSDS 제15항 제'+n+'석유류와 제9항 인화점 '+value+'℃가 법령상 범위와 불일치합니다. 원문 분류 확인 필요');}
  }
  return {dangerous:completeDangerous(enriched),dangerous_review_reasons:[...new Set(reasons)]};
}
