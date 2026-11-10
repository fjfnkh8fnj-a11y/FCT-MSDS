let apiPromise;
const lookups=new WeakMap();

export function loadYouTube(){
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(!apiPromise)apiPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const previous=window.onYouTubeIframeAPIReady;
  const finish=error=>{
   clearTimeout(timeout);
   window.onYouTubeIframeAPIReady=previous;
   if(error){script.remove();apiPromise=null;reject(error);}
   else resolve(window.YT);
  };
  const timeout=setTimeout(()=>finish(Error('YouTube 연결이 지연되고 있습니다.')),9000);
  window.onYouTubeIframeAPIReady=()=>{finish();previous?.();};
  script.src='https://www.youtube.com/iframe_api';
  script.onerror=()=>finish(Error('YouTube에 연결할 수 없습니다.'));
  document.head.append(script);
 });
 return apiPromise;
}

export function youtubeId(input){
 if(/^[A-Za-z0-9_-]{11}$/.test(input))return input;
 try{
  const url=new URL(input);
  if(!['https:','http:'].includes(url.protocol))return null;
  let id;
  if(url.hostname==='youtu.be')id=url.pathname.split('/')[1];
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)){
   id=url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
 }catch{return null;}
}

export function videoFields(optional){
 return `<label class="wide">YouTube 영상 주소${optional?' (선택)':''}
  <input name="video_url" placeholder="https://youtu.be/…" ${optional?'':'required'}>
 </label>
 <div class="wide formgrid" data-video-length hidden>
  <label>영상 길이(분)<input name="video_minutes" type="number" min="0" max="1440"></label>
  <label>영상 길이(초)<input name="video_seconds" type="number" min="0" max="59"></label>
  <p class="note wide" data-video-status aria-live="polite"></p>
  <div class="wide" data-video-preview hidden></div>
 </div>`;
}

export function videoFromForm(form,title){
 const fields=form.elements,url=fields.video_url.value.trim();
 if(!url)return null;
 const id=youtubeId(url);
 if(!id)throw Error('올바른 YouTube 영상 주소를 입력해 주세요.');
 const seconds=Number(fields.video_minutes.value)*60+Number(fields.video_seconds.value);
 if(!Number.isInteger(seconds)||seconds<1||seconds>86400){
  throw Error('영상 길이를 확인한 뒤 등록해 주세요. 자동 확인이 어려우면 분과 초를 직접 입력해 주세요.');
 }
 return {youtube_id:id,title,duration_seconds:seconds};
}

export function watchRequirement(course){
 const percent=course.required_watch_percent;
 if(percent==null)return '필수 시청 '+course.required_watch_minutes+'분';
 return percent?'영상별 '+percent+'% 이상 시청':'필수 시청 기준 없음';
}

export function syncVideoForm(form,field){
 const f=form.elements;
 const url=f.video_url.value.trim(),id=youtubeId(url);
 const area=form.querySelector('[data-video-length]');
 const status=form.querySelector('[data-video-status]');
 const preview=form.querySelector('[data-video-preview]');
 const previous=lookups.get(form);
 if(field==='video_minutes'||field==='video_seconds'){
  if(previous)previous.manual=true;
  return;
 }
 const key=id||url;
 if(previous?.key===key)return;
 previous?.dispose();
 area.hidden=!url;
 f.video_minutes.value='';
 f.video_seconds.value='';
 if(!url){lookups.delete(form);return;}
 if(!id){lookups.delete(form);status.textContent='올바른 YouTube 영상 주소를 입력해 주세요.';return;}

 let player, timer, start, disposed=false;
 const lookup={key,manual:false,dispose(){
  if(disposed)return;
  disposed=true;clearInterval(timer);clearTimeout(start);player?.destroy();
  preview.replaceChildren();preview.hidden=true;
 }};
 lookups.set(form,lookup);
 status.textContent='YouTube에서 영상 길이를 확인하고 있습니다.';
 function duration(){
  if(disposed||!form.isConnected){lookup.dispose();return;}
  const seconds=Math.round(player?.getDuration?.()||0);
  if(seconds<1||seconds>86400)return;
  if(!lookup.manual){
   f.video_minutes.value=Math.floor(seconds/60);
   f.video_seconds.value=seconds%60;
   status.textContent='영상 길이를 자동으로 입력했습니다.';
  }else status.textContent='직접 입력한 영상 길이를 사용합니다.';
  lookup.dispose();
 }
 function failed(message){
  status.textContent=message+' 영상 길이를 직접 입력할 수 있습니다.';
 }
 start=setTimeout(async()=>{
  try{
   const yt=await loadYouTube();
   if(disposed||!form.isConnected)return;
   const host=document.createElement('div');
   preview.replaceChildren(host);
   preview.hidden=false;
   player=new yt.Player(host,{
    width:String(Math.min(320,preview.clientWidth)),height:'200',
    playerVars:{playsinline:1,origin:location.origin},
    events:{
     onReady:e=>{if(!disposed)e.target.cueVideoById(id);},
     onStateChange:()=>duration(),
     onError:()=>{if(!disposed){failed('YouTube에서 영상 정보를 확인할 수 없습니다.');lookup.dispose();}}
    }
   });
   let checks=0;
   timer=setInterval(()=>{
    duration();
    if(++checks===16&&!disposed){
     clearInterval(timer);
     failed('영상 길이가 표시되지 않으면 미리보기의 재생 버튼을 눌러 주세요.');
    }
   },500);
  }catch(e){if(!disposed&&form.isConnected){failed(e.message);lookup.dispose();}}
 },300);
}

