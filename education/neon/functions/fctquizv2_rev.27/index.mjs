// FCT education quiz generation — Neon Function, rev.27
// Credentials are injected by Neon; never expose them to GitHub Pages.
const site='https://fjfnkh8fnj-a11y.github.io';
const headers={
 'Access-Control-Allow-Origin':site,
 'Access-Control-Allow-Headers':'authorization,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Vary':'Origin',
 'Cache-Control':'no-store'
};
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});}
function cleanJSON(raw){
 const src=String(raw||'').trim().replace(/^\u0060{3}(?:json)?/i,'').replace(/\u0060{3}$/,'').trim();
 try{return JSON.parse(src)}catch{
  const a=src.indexOf('{'),b=src.lastIndexOf('}');
  if(a<0||b<a)throw Error('AI 응답이 유효한 JSON이 아닙니다.');
  return JSON.parse(src.slice(a,b+1));
 }
}
function validate(items){
 if(!Array.isArray(items)||items.length!==5)throw Error('AI가 5개 문항을 생성하지 못했습니다.');
 return items.map((q,i)=>{
  const prompt=String(q.prompt||'').trim();
  const choices=Array.isArray(q.choices)?q.choices.map(x=>String(x||'').trim()):[];
  const answer=Number(q.answer);
  const explanation=String(q.explanation||'').trim();
  if(prompt.length<10||prompt.length>500||choices.length!==4||choices.some(x=>!x||x.length>350)
    ||new Set(choices).size!==4||!Number.isInteger(answer)||answer<0||answer>3
    ||explanation.length<8||explanation.length>900)throw Error('문항 '+(i+1)+'의 형식을 확인할 수 없습니다.');
  return {prompt,choices,answer,explanation};
 });
}
export default {
 async fetch(request){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  // Public health check exposes no credentials or training data.
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname.replace(/\/$/,'')==='/health')
   return response({ok:true,service:'fct-education-quiz',revision:27});
  const origin=request.headers.get('origin');
  if(origin!==site)return response({error:'허용되지 않은 접속 경로입니다.'},403);
  if(request.method!=='POST')return response({error:'POST 요청만 지원합니다.'},405);
  const token=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(token))return response({error:'관리자 인증이 필요합니다.'},401);
  try{
   // Verify the signed user JWT and administrator role using existing RLS.
   const api='https://ep-winter-bonus-azfs5ym3.apirest.c-3.ap-southeast-1.aws.neon.tech/fct_edu_app/rest/v1';
   if(!api)throw Error('서버 데이터 API가 구성되지 않았습니다.');
   const authRes=await fetch(api.replace(/\/$/,'')+'/rpc/edu_is_admin',{
    method:'POST',headers:{authorization:token,'content-type':'application/json'},body:'{}'
   });
   if(!authRes.ok){
    console.error('[quiz] admin-check rejected HTTP '+authRes.status);
    return response({error:'관리자 인증 확인 실패 (서버 상태 '+authRes.status+'). 다시 로그인해 주세요.',stage:'auth',upstream_status:authRes.status},authRes.status===404?503:403);
   }
   if(await authRes.json()!==true)return response({error:'관리자 권한이 필요합니다.'},403);
   const raw=await request.text();
   if(raw.length>26000)return response({error:'입력내용이 너무 깁니다.'},413);
   const data=JSON.parse(raw||'{}');
   const title=String(data.title||'').trim().slice(0,200);
   const content=String(data.content||'').trim().slice(0,16000);
   if(title.length<2)return response({error:'교육 주제를 2자 이상 입력해 주세요.'},400);
   const gateway=process.env.NEON_AI_GATEWAY_BASE_URL;
   const key=process.env.NEON_AI_GATEWAY_TOKEN;
   if(!gateway||!key)return response({error:'AI 생성 서버 연결이 준비되지 않았습니다.'},503);
   const instructions=[
    '당신은 대한민국 제조업 현장 안전보건교육 평가문항 작성자입니다.',
    '제공된 교육내용을 최우선 근거로 객관식 문항 5개를 한국어로 생성하십시오.',
    '교육내용이 충분하면 반드시 내용의 구체적인 위험요인, 예방조치, 작업순서, 응급대응을 평가하십시오.',
    '내용이 짧거나 제목만 있으면 해당 주제의 일반적이고 검증 가능한 기초 안전 원칙을 중심으로 문제를 내되, 교육영상에서 확인했다는 말은 하지 마십시오.',
    '제공하지 않은 구체적인 법 조항·시행일·벌금·수치·회사 내규·장소를 지어내지 마십시오.',
    '선택지 4개 중 정답 하나만 명확하도록 만드세요. 오답도 현실적인 현장 상황이어야 합니다.',
    '정답 위치는 다양하게 배치하세요. 해설은 왜 정답인지 간결하게 쓰세요.',
    '교육내용을 무시한 일반 안전문항으로 문항 수를 채우지 마세요.',
    '오직 JSON 객체 {\"questions\":[{\"prompt\":\"...\",\"choices\":[\"...\",\"...\",\"...\",\"...\"],\"answer\":0,\"explanation\":\"...\"}]}만 출력하십시오.',
    'answer는 0부터 3까지 숫자로, questions는 반드시 5개입니다.'
   ].join('\n');
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),45000);
   const requestBody=JSON.stringify({
    model:'gpt-5-mini',
    messages:[{role:'system',content:instructions},
     {role:'user',content:'교육 주제: '+title+'\n교육내용:\n'+(content||'(교육내용 없음: 주제 기반 기초문항만 작성)')}],
    max_completion_tokens:3000
   });
   const gatewayRoot=gateway.replace(/\/$/,'');
   const callAI=path=>fetch(gatewayRoot+path,{
    method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
    body:requestBody,signal:controller.signal
   });
   let ai;
   try{
    ai=await callAI('/v1/chat/completions');
    if(ai.status===404){
     // Neon documents this alias as a supported alternative.
     console.error('[quiz] gateway short-path 404; trying official long-path alias');
     ai=await callAI('/ai-gateway/mlflow/v1/chat/completions');
    }
   }finally{clearTimeout(timer);}
   if(!ai.ok){
    console.error('[quiz] AI gateway HTTP '+ai.status);
    const stage=ai.status===404?'gateway-route':ai.status===401||ai.status===403?'gateway-auth':'gateway-model';
    return response({
     error:ai.status===404?'AI 연결 경로를 찾을 수 없습니다. 관리자에게 서버 연결 점검을 알려 주세요.'
       :ai.status===401||ai.status===403?'AI 서버 인증이 만료되었거나 권한이 없습니다.'
       :'AI 문항 생성 서버가 응답하지 않았습니다. 다시 시도해 주세요.',
     stage,upstream_status:ai.status
    },503);
   }
   const body=await ai.json();
   const output=body?.choices?.[0]?.message?.content;
   const questions=validate(cleanJSON(output)?.questions);
   return response({questions,source:content?'교육내용 기반 AI 초안':'교육 주제 기반 AI 초안',model:'gpt-5-mini'});
  }catch(error){
   return response({error:error?.name==='AbortError'?'AI 응답시간이 초과되었습니다. 다시 시도해 주세요.':String(error?.message||'문항 생성에 실패했습니다.').slice(0,300)},503);
  }
 }
};