// FCT 교육관리 rev.28 — AI 서버를 이용할 수 없을 때 교육내용에서 문항을 구성하는 대체 방식.
// 이 함수는 언어모델을 사용하지 않습니다. 원문을 인용하며 교육담당자의 검토가 필요합니다.
const unrelated=[
 '직원 식당의 주간 식단을 선정합니다.',
 '사무실 벽면의 도장 색상을 결정합니다.',
 '회사 홍보용 포스터를 디자인합니다.',
 '고객용 기념품의 포장 모양을 결정합니다.',
 '출퇴근 통근버스의 좌석 배치를 변경합니다.',
 '사내 행사에 사용할 배경음악을 선정합니다.',
 '사무용 가구의 구매 수량을 검토합니다.',
 '영업 홍보 전단지의 글꼴을 선택합니다.',
 '사내 휴게실의 장식품을 배치합니다.'
];
const prompts=[
 '다음 중 이 교육에서 직접 다루는 내용은 무엇입니까?',
 '교육내용에 포함된 주제로 알맞은 것은 무엇입니까?',
 '이번 교육의 주요 학습 내용으로 제시된 것은 무엇입니까?',
 '다음 중 교육에서 확인하도록 안내한 사항은 무엇입니까?',
 '이 교육에 포함된 핵심 항목을 선택해 주세요.'
];
function clean(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/[\t\u00a0]+/g,' ').replace(/\s+/g,' ').trim();}
function conceptsFromContent(content){
 const text=String(content||'')
   .replace(/<[^>]*>/g,' ')
   .replace(/[\u2022\u25cf\u25cb\u2023\u25a0]/g,'\n')
   .replace(/(?:^|\n)\s*\d{1,2}[.)]\s*/g,'\n')
   .replace(/[。!?；;]+/g,'\n');
 const coarse=text.split(/\n+/).map(clean).filter(Boolean);
 const parts=[];
 for(const line of coarse){
  if(line.length>130||line.includes(',')||line.includes('·')){
   const sub=line.split(/\s*[,，、]\s*|\s+[·]\s+|\s+(?:및|또는|그리고|또한)\s+/).map(clean).filter(Boolean);
   if(sub.length>1){parts.push(...sub);continue;}
  }
  parts.push(line);
 }
 const existing=new Set(),out=[];
 for(const raw of parts){
  const val=clean(raw).replace(/^[\s:—–-]+/,'').replace(/[\s.，,;:]+$/,'');
  if(val.length<7||val.length>160)continue;
  const norm=val.replace(/[\s.,·]/g,'').toLowerCase();
  if(existing.has(norm))continue;
  existing.add(norm);out.push(val);
 }
 return out.slice(0,40);
}
export function contentBasedDraft(title,description){
 const content=String(description||'').trim();
 if(content.length<25){
  throw Error('AI 서비스가 현재 사용 불가 상태입니다. 교육내용에 핵심 학습사항을 25자 이상 입력하면 AI 없이도 수정 가능한 평가문제 초안을 만들 수 있습니다.');
 }
 const facts=conceptsFromContent(content);
 if(facts.length<1){
  throw Error('교육내용에서 문제로 만들 항목을 찾지 못했습니다. 교육내용을 문장이나 항목별로 입력해 주세요.');
 }
 const questions=[];
 for(let i=0;i<5;i++){
  const fact=facts[i%facts.length];
  const correct=(fact.length>115?fact.slice(0,112)+'…':fact);
  let wrong=[];
  for(let j=0;j<unrelated.length&&wrong.length<3;j++){
   const v=unrelated[(j+i*3)%unrelated.length];
   if(!content.includes(v)&&!wrong.includes(v)&&v!==correct)wrong.push(v);
  }
  if(wrong.length<3)throw Error('선택지 구성이 불가능합니다. 다시 시도해 주세요.');
  const answer=(i*3+1)%4,choices=wrong.slice();
  choices.splice(answer,0,correct);
  questions.push({
   prompt:prompts[i],
   choices,
   answer,
   explanation:'교육내용에 "'+fact.slice(0,150)+'"가 명시되어 있습니다. 제시된 내용의 정확성과 안전성을 검토해 주세요.'
  });
 }
 return {label:'교육내용에서 추출한 기본 초안 (AI 미사용)',questions,sourceFacts:facts.length};
}
