import {db,S,$,esc,check,notice,date,badge,all,loadData,stopPlayer,pageHeader,panel,courseById} from './core_rev.12.js';
import {loadYouTube,watchRequirement} from './youtube_rev.14.js';

export function renderEmployee(page){
 if(page==='history')return renderHistory();
 if(page==='lesson')return renderLesson();
 const enrollments=S.enroll.filter(e=>e.staff_id===S.me?.id&&e.status!=='completed');
 let out=pageHeader('수강할 교육','배정된 교육을 확인하고 수강·평가·전자서명을 진행할 수 있습니다.');
 let cards='';
 for(const e of enrollments){
  const c=courseById(e.course_id);
  if(!c||c.status==='archived')continue;
  cards+='<div class="course-card between"><div><p class="small">'+esc(c.education_month)+' · '+esc(c.course_type)+'</p><h3>'+esc(c.title)+'</h3>'+badge(e.status)+'</div><button class="primary" data-employee="open" data-id="'+c.id+'">수강하기</button></div>';
 }
 return out+panel('수강할 교육',cards||'<p class="note">현재 수강할 교육이 없습니다.</p>');
}
function renderHistory(){
 const completed=S.enroll.filter(e=>e.staff_id===S.me?.id&&e.status==='completed')
  .sort((a,b)=>String(b.completed_at||'').localeCompare(String(a.completed_at||'')));
 let rows='';
 for(const e of completed){
  const c=courseById(e.course_id);
  if(!c)continue;
  rows+='<div class="course-card between"><div><p class="small">'+esc(c.education_month)+' · '+esc(c.course_type)+'</p><h3>'+esc(c.title)+'</h3><p>수료일: '+date(e.completed_at)+'</p></div><div class="actions">'+badge(e.status)+'<button class="outline small" data-employee="history-open" data-id="'+c.id+'">수료 내용 보기</button></div></div>';
 }
 return pageHeader('수료한 교육','수료일과 이수 내역을 확인할 수 있습니다.')+panel('수료한 교육',rows||'<p class="note">현재 수료한 교육이 없습니다.</p>');
}
export async function openLesson(courseId){
 stopPlayer();S.courseId=courseId;S.answers={};S.drawn=false;
 let course=courseById(courseId),enrollment=S.enroll.find(e=>e.course_id===courseId&&e.staff_id===S.me?.id);
 if(!course||!enrollment)throw Error('수강 대상 교육이 아닙니다.');
 const r=await Promise.all([
  all('edu_videos','*',q=>q.eq('course_id',courseId).order('sort_order')),
  all('edu_materials','*',q=>q.eq('course_id',courseId)),
  all('edu_questions','*',q=>q.eq('course_id',courseId).order('sort_order')),
  all('edu_attempts','id,score,passed,submitted_at',q=>q.eq('enrollment_id',enrollment.id).order('submitted_at',{ascending:false})),
  all('edu_progress','*',q=>q.eq('enrollment_id',enrollment.id)),
  all('edu_signatures','*',q=>q.eq('enrollment_id',enrollment.id))
 ]);
 S.lesson={course,enrollment,videos:r[0],materials:r[1],questions:r[2],attempts:r[3],progress:r[4],signature:r[5][0],selectedVideo:null};
 S.page='lesson';
}
function renderLesson(){
 let l=S.lesson;
 if(!l)return pageHeader('교육 수강','수강할 교육을 선택해 주세요.');
 let c=l.course,e=l.enrollment;
 let out=pageHeader('교육 수강',c.title);
 out+=panel('교육개요','<p>'+esc(c.description)+'</p><p class="small">'+esc(c.education_month)+' · '+esc(c.course_type)+' · '+c.duration_minutes+'분 교육 · '+watchRequirement(c)+'</p>'+badge(e.status));
 let vids='';
 for(const v of l.videos){
  const progress=l.progress.find(p=>p.video_id===v.id);
  const {percent,text}=watchProgress(progress?.seconds_watched||0,v.duration_seconds);
  vids+='<div class="course-card"><div class="between"><b>'+esc(v.title)+'</b><small id="watch_'+v.id+'">'+text+'</small></div>';
  vids+='<div class="progressbar"><div id="bar_'+v.id+'" style="width:'+percent+'%"></div></div>';
  vids+='<button class="outline small" data-employee="play" data-id="'+v.id+'">영상 재생</button>';
  if(l.selectedVideo===v.id)vids+='<div id="ytVideo" class="player"></div><p class="small">재생 중이며 화면이 활성화된 시간만 일정 간격으로 기록됩니다.</p>';
  vids+='</div>';
 }
 out+=panel('교육영상',vids||'<p>등록된 교육영상이 없습니다.</p>');
 let material='';
 for(const m of l.materials){
  material+='<div class="material"><b>'+esc(m.title)+'</b>';
  if(m.kind==='note')material+='<p style="white-space:pre-wrap">'+esc(m.body_text)+'</p>';
  if(m.kind==='link')material+='<p><a href="'+esc(m.external_url||'#')+'" target="_blank" rel="noopener">교육자료 열기</a></p>';
  if(m.kind==='file')material+='<button class="small outline" data-employee="material" data-id="'+m.id+'">첨부파일 다운로드</button>';
  material+='</div>';
 }
 out+=panel('교육자료',material||'<p>등록된 교육자료가 없습니다.</p>');
 let quiz='';
 for(let i=0;i<l.questions.length;i++){
  let q=l.questions[i];quiz+='<div class="quiz-question"><b>'+(i+1)+'. '+esc(q.prompt)+'</b>';
  for(let j=0;j<q.choices.length;j++){
   quiz+='<label class="quiz-choice"><input type="radio" name="q_'+q.id+'" value="'+j+'" '+(e.status==='completed'?'disabled':'')+'>'+esc(q.choices[j])+'</label>';
  }
  quiz+='</div>';
 }
 let latest=l.attempts[0],history=latest?latest.score+'점 / '+(latest.passed?'합격':'불합격'):'미응시';
 quiz+='<p class="note">최근 평가: '+history+' · 응시 '+l.attempts.length+'/'+c.attempt_limit+'회</p>';
 quiz+='<button class="primary" data-employee="grade" '+(e.status==='completed'||l.attempts.length>=c.attempt_limit||!l.questions.length?'disabled':'')+'>평가 제출·저장</button>';
 out+=panel('평가',quiz);
 let sign;
 if(e.completed_at){
  sign='<p>수료일: '+date(e.completed_at)+'</p>';
  if(l.signature?.signature_data_uri)sign+='<img src="'+l.signature.signature_data_uri+'" alt="전자서명" width="250">';
 }else{
  sign='<p class="small">영상 시청과 평가를 완료한 후 전자서명을 진행해 주세요.</p><canvas id="signatureCanvas" class="signature-pad" width="750" height="200"></canvas><div class="actions" style="margin-top:9px"><button class="outline" data-employee="clear">서명 지우기</button><button class="primary" data-employee="complete">전자서명·수료</button></div>';
 }
 out+=panel('전자서명',sign);
 setTimeout(()=>{prepareCanvas();if(l.selectedVideo)startYoutube().catch(e=>notice(e.message,true));},0);
 return out;
}
let canvas=null,ctx=null,down=false;
function prepareCanvas(){
 canvas=$('signatureCanvas');if(!canvas)return;
 ctx=canvas.getContext('2d');ctx.lineWidth=4;ctx.strokeStyle='#183844';ctx.lineCap='round';ctx.lineJoin='round';
 function point(e){let r=canvas.getBoundingClientRect();return[(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];}
 canvas.onpointerdown=e=>{S.drawn=true;down=true;canvas.setPointerCapture(e.pointerId);let p=point(e);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0]+.2,p[1]+.2);ctx.stroke();};
 canvas.onpointermove=e=>{if(!down)return;let p=point(e);ctx.lineTo(p[0],p[1]);ctx.stroke();};
 canvas.onpointerup=canvas.onpointercancel=()=>down=false;
}
let activeWatch;

function watchProgress(seconds,duration){
 const percent=duration>0?Math.min(100,Math.floor(seconds*100/duration)):0;
 return {percent,text:duration>0?percent+'% 시청':'영상 길이 미확인'};
}

async function startYoutube(){
 const lesson=S.lesson,host=$('ytVideo');
 const video=lesson?.videos.find(x=>x.id===lesson.selectedVideo);
 if(!video||!host)return;
 const yt=await loadYouTube();
 if(S.lesson!==lesson||!host.isConnected)return;
 let sample, buffered=0, pending=null, saving=null;
 const player=new yt.Player(host,{
  videoId:video.youtube_id,width:'100%',height:'100%',
  playerVars:{playsinline:1,origin:location.origin},
  events:{
   onStateChange:async event=>{
    if(S.player!==event.target)return;
    observe();
    const playing=event.data===yt.PlayerState.PLAYING;
    sample=playing&&!document.hidden?position():null;
    if(!playing){
     if(saving)await saving;
     await save(true,event.data===yt.PlayerState.ENDED);
    }
   },
   onError:()=>notice('교육영상을 재생할 수 없습니다. 관리자에게 문의해 주세요.',true)
  }
 });
 S.player=player;
 activeWatch={player,async flush(){
  observe();
  if(saving)await saving;
  await save(true);
 }};
 function position(){
  const seconds=player.getCurrentTime?.();
  return Number.isFinite(seconds)?{seconds,time:performance.now()}:null;
 }
 function observe(){
  if(S.player!==player||document.hidden){sample=null;return;}
  if(!sample){
   if(player.getPlayerState?.()===yt.PlayerState.PLAYING)sample=position();
   return;
  }
  const next=position();
  if(next){
   const wall=(next.time-sample.time)/1000;
   const delta=next.seconds-sample.seconds;
   const rate=player.getPlaybackRate?.()||1;
   // Reject jumps in the playhead and credit active playback time only.
   if(wall<=3&&delta>0&&delta<=wall*rate+0.35)buffered+=rate>1?Math.min(delta,wall):delta;
  }
  sample=next;
 }
 function save(force=false,ended=false){
  if(lesson.enrollment.status==='completed'||saving)return saving;
  const seconds=ended?Math.round(buffered):Math.floor(buffered+1e-6);
  if(!pending&&seconds>=(force?1:5)){
   const delta=Math.min(seconds,30);
   pending={p_video_id:video.id,p_seconds:delta,p_request_id:crypto.randomUUID()};
   buffered=Math.max(0,buffered-delta);
  }
  if(!pending)return;
  saving=(async()=>{
   try{
    const seconds=check(await db.rpc('edu_watch_tick',pending));
    pending=null;
    const record=lesson.progress.find(p=>p.video_id===video.id);
    if(record)record.seconds_watched=seconds;else lesson.progress.push({video_id:video.id,seconds_watched:seconds});
    if(S.lesson!==lesson)return;
    const {percent,text}=watchProgress(seconds,video.duration_seconds);
    const label=$('watch_'+video.id),bar=$('bar_'+video.id);
    if(label)label.textContent=text;
    if(bar)bar.style.width=percent+'%';
   }catch(e){notice('시청시간 저장 실패: '+e.message,true);}
   finally{saving=null;}
  })();
  return saving;
 }
 S.interval=setInterval(()=>{observe();save();},1000);
}

export async function employeeAction(button){
 let a=button.dataset.employee,id=button.dataset.id;
 if(a==='open'||a==='history-open'){await openLesson(id);return 'lesson';}
 if(a==='play'){if(S.player&&activeWatch?.player===S.player)await activeWatch.flush();stopPlayer();S.lesson.selectedVideo=id;return 'lesson';}
 if(a==='material'){
  const file=S.lesson.materials.find(x=>x.id===id);
  if(!file?.file_data_uri)throw Error('첨부자료가 없습니다.');
  let link=document.createElement('a');link.href=file.file_data_uri;link.download=file.body_text||file.title;link.click();return null;
 }
 if(a==='grade'){
  if(S.lesson.questions.some(q=>!Number.isInteger(S.answers[q.id])))throw Error('모든 평가문제에 답변해 주세요.');
  let r=check(await db.rpc('edu_submit_quiz',{p_course_id:S.courseId,p_answers:S.answers,p_request_id:crypto.randomUUID()}));
  await loadData();await openLesson(S.courseId);notice('평가 결과가 저장되었습니다. '+r[0].score+'점 ('+(r[0].passed?'합격':'불합격')+')');return 'lesson';
 }
 if(a==='clear'){if(ctx&&canvas){ctx.clearRect(0,0,canvas.width,canvas.height);S.drawn=false;}return null;}
 if(a==='complete'){
  if(!S.drawn||!canvas)throw Error('전자서명을 작성해 주세요.');
  let sign=canvas.toDataURL('image/png');
  if(sign.length>245000)throw Error('서명 이미지 용량이 너무 큽니다.');
  if(S.player&&activeWatch?.player===S.player)await activeWatch.flush();
  check(await db.rpc('edu_complete_course',{p_course_id:S.courseId,p_signature_data:sign,p_request_id:crypto.randomUUID()}));
  await loadData();S.lesson=null;notice('교육 수료와 전자서명이 저장되었습니다. 수료한 교육에서 확인할 수 있습니다.');return 'history';
 }
 return null;
}
