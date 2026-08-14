const $ = (id) => document.getElementById(id);
const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate = v => { if(!v) return '—'; const [y,m,d]=String(v).split('-'); return d&&m&&y ? `${d}/${m}/${y}` : v; };
const uid = (p='id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
const today = () => new Date().toISOString().slice(0,10);
const roleLabel = r => ({admin:'Administrador',office:'Atendimento / Escritório',technician:'Técnico'})[r] || r || 'Usuário';

let sb = null;
let currentUser = null;
let currentProfile = null;
let requests = [];
let visits = [];
let scheduleHistory = [];
let editingRequest = null;
let activeVisit = null;
let toastTimer;
let syncBusy = false;


const MEDIA_BUCKET='veracist-media';
const LARGE_FILE_THRESHOLD=6*1024*1024;
let cloudMediaRows=[];

// ---------- Helpers globais de interface ----------
// Mantidos fora da camada de mídia para que autenticação, modais, status e ações
// continuem funcionais independentemente do backend de arquivos.
function showToast(msg){
  const t=$('toast');
  if(!t) return;
  t.textContent=msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.add('hidden'),3000);
}
function closeModal(){
  const root=$('modalRoot');
  if(root) root.innerHTML='';
}
window.closeModal=closeModal;
function isOffice(){ return ['admin','office'].includes(currentProfile?.role); }
function isAdmin(){ return currentProfile?.role==='admin'; }
function setCloudState(text,kind=''){
  const el=$('cloudState');
  if(!el) return;
  el.textContent=text;
  el.className=`cloud-chip ${kind}`.trim();
}
function setBusy(btn,busy,label){
  if(!btn) return;
  if(busy){
    btn.dataset.oldText=btn.textContent;
    btn.disabled=true;
    btn.textContent=label||'Aguarde...';
  }else{
    btn.disabled=false;
    btn.textContent=btn.dataset.oldText||btn.textContent;
  }
}


function fileKind(file){
  const mime=(file?.type||'').toLowerCase();
  if(mime.startsWith('image/')) return 'image';
  if(mime.startsWith('video/')) return 'video';
  return 'other';
}
function fileExt(name='',mime=''){
  const m=String(name).match(/\.([A-Za-z0-9]{1,10})$/);
  if(m) return '.'+m[1].toLowerCase();
  const byMime={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/heic':'.heic','image/heif':'.heif','video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm'};
  return byMime[mime]||'';
}
function cloudRefFromRow(row){
  return {
    id:row.id,
    name:row.file_name,
    type:row.file_type,
    mime:row.mime_type||'application/octet-stream',
    size:Number(row.size_bytes||0),
    storagePath:row.storage_path,
    cloud:true
  };
}
function cloudMediaRefs(occurrenceId,stage='request'){
  const dbStage=stage==='execution'?'execucao':'solicitacao';
  return cloudMediaRows.filter(m=>m.occurrence_id===occurrenceId&&m.stage===dbStage).map(cloudRefFromRow);
}
function pendingMediaRef(file){
  return {id:uid('pending'),name:file.name||'arquivo',type:fileKind(file),mime:file.type||'application/octet-stream',size:file.size||0,_file:file,pending:true};
}
async function getSignedUrl(path,expires=3600){
  if(!path||!sb) return '';
  const {data,error}=await sb.storage.from(MEDIA_BUCKET).createSignedUrl(path,expires);
  if(error) throw error;
  return data?.signedUrl||data?.signedURL||'';
}
async function mediaSource(ref){
  if(ref?._file) return URL.createObjectURL(ref._file);
  if(!ref?.storagePath) return '';
  if(ref._signedUrl && ref._signedUntil>Date.now()+60000) return ref._signedUrl;
  ref._signedUrl=await getSignedUrl(ref.storagePath,3600);
  ref._signedUntil=Date.now()+55*60*1000;
  return ref._signedUrl;
}
async function deleteCloudMediaRef(ref){
  if(!ref?.cloud) return;
  if(ref.storagePath){
    const {error}=await sb.storage.from(MEDIA_BUCKET).remove([ref.storagePath]);
    if(error) throw error;
  }
  const {error}=await sb.from('media_files').delete().eq('id',ref.id);
  if(error) throw error;
  cloudMediaRows=cloudMediaRows.filter(x=>x.id!==ref.id);
}
async function deleteMediaForOccurrence(occurrenceId){
  const rows=cloudMediaRows.filter(x=>x.occurrence_id===occurrenceId);
  if(rows.length){
    const paths=rows.map(x=>x.storage_path).filter(Boolean);
    if(paths.length){
      const {error}=await sb.storage.from(MEDIA_BUCKET).remove(paths);
      if(error) throw error;
    }
    const {error}=await sb.from('media_files').delete().eq('occurrence_id',occurrenceId);
    if(error) throw error;
    cloudMediaRows=cloudMediaRows.filter(x=>x.occurrence_id!==occurrenceId);
  }
}
async function renderEditableMedia(container,refs,onRemove){
  container.innerHTML='';
  if(!refs.length){container.innerHTML='<div class="media-empty">Nenhuma foto ou vídeo anexado.</div>';return;}
  for(const ref of refs){
    const card=document.createElement('div'); card.className='media-card';
    let src='';
    try{src=await mediaSource(ref);}catch(e){console.error(e);}
    if(src&&ref.type==='image') card.innerHTML=`<img src="${src}" alt="${esc(ref.name)}"><button type="button" class="media-remove" aria-label="Remover">×</button><div class="media-name">${ref.pending?'<span class="media-cloud-state">aguardando envio</span> ':''}${esc(ref.name)}</div>`;
    else if(src&&ref.type==='video') card.innerHTML=`<video src="${src}" controls playsinline preload="metadata"></video><button type="button" class="media-remove" aria-label="Remover">×</button><div class="media-name">${ref.pending?'<span class="media-cloud-state">aguardando envio</span> ':''}${esc(ref.name)}</div>`;
    else card.innerHTML=`<div class="file-fallback">${ref.cloud?'Não foi possível carregar da nuvem':'Arquivo aguardando envio'}<br>${esc(ref.name)}</div><button type="button" class="media-remove">×</button><div class="media-name">${esc(ref.name)}</div>`;
    card.querySelector('.media-remove').onclick=async()=>{
      if(ref.cloud && !confirm(`Remover "${ref.name}" definitivamente da nuvem?`)) return;
      try{
        if(ref.cloud) await deleteCloudMediaRef(ref);
        const idx=refs.findIndex(x=>x.id===ref.id); if(idx>=0) refs.splice(idx,1);
        onRemove?.(); await renderEditableMedia(container,refs,onRemove);
        showToast(ref.cloud?'Arquivo removido da nuvem.':'Arquivo removido.');
      }catch(e){console.error(e);showToast(`Não foi possível remover: ${e.message}`);}
    };
    container.appendChild(card);
  }
}
async function attachFiles(input,refs,listEl){
  const chosen=[...input.files]; input.value='';
  const room=Math.max(0,15-refs.length);
  if(!room){showToast('Limite de 15 arquivos por ocorrência.');return;}
  const files=chosen.slice(0,room);
  for(const file of files){
    if(!file.type.startsWith('image/')&&!file.type.startsWith('video/')){
      showToast(`Arquivo ignorado: ${file.name}. Use imagem ou vídeo.`);
      continue;
    }
    refs.push(pendingMediaRef(file));
  }
  await renderEditableMedia(listEl,refs);
  if(files.length) showToast(`${files.length} arquivo(s) pronto(s) para envio ao salvar.`);
}
async function renderReadOnlyMedia(container,refs){
  container.innerHTML='';
  if(!refs.length){container.innerHTML='<div class="media-empty">Nenhuma mídia anexada.</div>';return;}
  for(const ref of refs){
    const card=document.createElement('div');card.className='media-card';
    let src='';
    try{src=await mediaSource(ref);}catch(e){console.error(e);}
    if(src&&ref.type==='image') card.innerHTML=`<img src="${src}" alt="${esc(ref.name)}"><div class="media-name">${esc(ref.name)}</div>`;
    else if(src&&ref.type==='video') card.innerHTML=`<video src="${src}" controls playsinline preload="metadata"></video><div class="media-name">${esc(ref.name)}</div>`;
    else card.innerHTML=`<div class="file-fallback">Arquivo indisponível<br>${esc(ref.name)}</div>`;
    container.appendChild(card);
  }
}
async function standardUpload(path,file){
  const {error}=await sb.storage.from(MEDIA_BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',cacheControl:'3600',upsert:false});
  if(error) throw error;
}
async function resumableUpload(path,file){
  if(!window.tus?.Upload) return standardUpload(path,file);
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token) throw new Error('Sessão expirada. Entre novamente.');
  const projectId=new URL(window.VERACIST_CONFIG.supabaseUrl).hostname.split('.')[0];
  return new Promise((resolve,reject)=>{
    const upload=new window.tus.Upload(file,{
      endpoint:`https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays:[0,3000,5000,10000,20000],
      headers:{authorization:`Bearer ${session.access_token}`},
      uploadDataDuringCreation:true,
      removeFingerprintOnSuccess:true,
      metadata:{bucketName:MEDIA_BUCKET,objectName:path,contentType:file.type||'application/octet-stream',cacheControl:'3600'},
      chunkSize:6*1024*1024,
      onError:error=>reject(error),
      onProgress:(done,total)=>{const pct=total?Math.round(done/total*100):0;setCloudState(`Enviando mídia ${pct}%`,'syncing');},
      onSuccess:()=>resolve()
    });
    upload.findPreviousUploads().then(previous=>{
      if(previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(reject);
  });
}
async function uploadOneMedia(file,ctx){
  const ext=fileExt(file.name,file.type);
  const objectId=(crypto.randomUUID?.()||uid('file')).replace(/[^a-zA-Z0-9-]/g,'');
  const base=ctx.stage==='execution'
    ? `visits/${ctx.visitId}/occurrences/${ctx.occurrenceId}/execution`
    : `requests/${ctx.serviceRequestId}/occurrences/${ctx.occurrenceId}/request`;
  const path=`${base}/${Date.now()}-${objectId}${ext}`;
  if(file.size>LARGE_FILE_THRESHOLD) await resumableUpload(path,file); else await standardUpload(path,file);
  const payload={
    service_request_id:ctx.serviceRequestId||null,
    occurrence_id:ctx.occurrenceId||null,
    visit_id:ctx.visitId||null,
    visit_occurrence_id:ctx.visitOccurrenceId||null,
    stage:ctx.stage==='execution'?'execucao':'solicitacao',
    file_type:fileKind(file),
    file_name:file.name||`arquivo${ext}`,
    mime_type:file.type||'application/octet-stream',
    storage_path:path,
    size_bytes:file.size||null,
    created_by:currentUser?.id||null
  };
  const {data,error}=await sb.from('media_files').insert(payload).select().single();
  if(error){
    await sb.storage.from(MEDIA_BUCKET).remove([path]).catch(()=>{});
    throw error;
  }
  cloudMediaRows.push(data);
  return cloudRefFromRow(data);
}
async function uploadPendingMedia(refs,ctx){
  const out=[];
  for(const ref of refs){
    if(!ref?._file){out.push(ref);continue;}
    const uploaded=await uploadOneMedia(ref._file,ctx);
    out.push(uploaded);
  }
  refs.splice(0,refs.length,...out);
  setCloudState('Sincronizado','ok');
  return refs;
}
async function dataUrlToBlob(dataUrl){
  const r=await fetch(dataUrl); return r.blob();
}
async function saveVisitSignature({visitId,kind,dataUrl,oldPath,dirty}){
  if(!dirty) return oldPath||null;
  if(!dataUrl){
    if(oldPath) await sb.storage.from(MEDIA_BUCKET).remove([oldPath]).catch(()=>{});
    return null;
  }
  const blob=await dataUrlToBlob(dataUrl);
  const path=`visits/${visitId}/signatures/${kind}-${Date.now()}-${crypto.randomUUID?.()||uid('sig')}.png`;
  await standardUpload(path,new File([blob],`${kind}.png`,{type:'image/png'}));
  if(oldPath&&oldPath!==path) await sb.storage.from(MEDIA_BUCKET).remove([oldPath]).catch(()=>{});
  return path;
}

// ---------- Supabase / autenticação ----------
function initSupabase(){
  const cfg=window.VERACIST_CONFIG||{};
  if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient)throw new Error('Configuração Supabase incompleta ou biblioteca indisponível.');
  sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}
function showLogin(message=''){
  currentUser=null;currentProfile=null;requests=[];visits=[];
  $('authScreen').classList.remove('hidden');$('app').classList.add('hidden');$('authMessage').textContent=message;
  $('loginPassword').value='';setCloudState('Desconectado');
}
async function enterApp(user){
  currentUser=user;
  const {data,error}=await sb.from('profiles').select('id,full_name,role,active').eq('id',user.id).single();
  if(error||!data){showLogin('O usuário existe no Auth, mas o perfil do VerAcist não pôde ser carregado. Confira o schema Cloud 1.1.');return;}
  if(!data.active){await sb.auth.signOut();showLogin('Este usuário está desativado.');return;}
  currentProfile=data;
  $('authScreen').classList.add('hidden');$('app').classList.remove('hidden');
  $('userName').textContent=data.full_name||user.email;$('userRole').textContent=roleLabel(data.role);
  document.querySelectorAll('[data-office-only]').forEach(el=>el.classList.toggle('hidden',!isOffice()));
  await loadCloudData();go('home',false);
}
async function bootstrap(){
  try{
    initSupabase();
    const {data:{session},error}=await sb.auth.getSession();
    if(error) throw error;
    if(session?.user) await enterApp(session.user); else showLogin();
    sb.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||!session){showLogin();}
      else if(['SIGNED_IN','USER_UPDATED','TOKEN_REFRESHED'].includes(event)&&session.user&&!currentUser){setTimeout(()=>enterApp(session.user),0);}
    });
  }catch(e){
    console.error('Falha ao iniciar o VerAcist:',e);
    const msg=$('authMessage');
    if(msg) msg.textContent=`Falha ao iniciar o VerAcist: ${e.message||'erro desconhecido'}`;
  }
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=$('loginBtn');setBusy(btn,true,'Entrando...');$('authMessage').textContent='';
  try{const {error}=await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});if(error)throw error;}catch(err){console.error(err);$('authMessage').textContent='Não foi possível entrar. Confira e-mail e senha.';}finally{setBusy(btn,false);}
});
$('logoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();});
$('syncBtn').addEventListener('click',()=>loadCloudData());

async function loadCloudData({silent=false}={}){
  if(!sb||!currentUser||syncBusy)return;syncBusy=true;if(!silent)setCloudState('Sincronizando','syncing');
  try{
    const [rq,oc,vq,vo,sh,mf]=await Promise.all([
      sb.from('service_requests').select('*').order('created_at',{ascending:false}),
      sb.from('occurrences').select('*').order('sequence_no',{ascending:true}),
      sb.from('visits').select('*').order('created_at',{ascending:false}),
      sb.from('visit_occurrences').select('*'),
      sb.from('visit_schedule_history').select('*').order('created_at',{ascending:false}),
      sb.from('media_files').select('*').order('created_at',{ascending:true})
    ]);
    for(const r of [rq,oc,vq,vo,sh,mf])if(r.error)throw r.error;
    cloudMediaRows=mf.data||[];
    requests=(rq.data||[]).map(row=>{
      const occs=(oc.data||[]).filter(o=>o.service_request_id===row.id).map(o=>({
        id:o.id,sequence:o.sequence_no,environment:o.environment||'',description:o.description||'',materials:o.materials_needed||'',factoryOrder:o.factory_order||'',finishDate:o.finish_date||'',notes:o.notes||'',media:cloudMediaRefs(o.id,'request')
      }));
      return {id:row.id,number:row.number,date:row.request_date,requestedBy:row.requested_by||'',type:row.service_type||'',filledBy:row.filled_by_name||'',classif:row.classification||'',client:row.client_name||'',contract:row.contract||'',phone:row.phone||'',address:row.installation_address||'',city:row.city||'',uf:row.uf||'',status:row.status,scheduleDate:row.schedule_date||'',scheduleTime:(row.schedule_time||'').slice(0,5),technician:row.technician_name||'',cancelReason:row.cancel_reason||'',version:row.version,occurrences:occs,createdAt:row.created_at,updatedAt:row.updated_at};
    });
    visits=(vq.data||[]).map(row=>{
      const req=requests.find(r=>r.id===row.service_request_id);
      const voccs=(vo.data||[]).filter(x=>x.visit_id===row.id).map(vr=>{const o=req?.occurrences.find(x=>x.id===vr.occurrence_id)||{};return {...o,visitOccurrenceId:vr.id,result:vr.result||'',reason:vr.reason||'',executionNotes:vr.execution_notes||'',executionMedia:cloudMediaRefs(vr.occurrence_id,'execution')};});
      return {id:row.id,number:row.number,requestId:row.service_request_id,requestNumber:req?.number||'—',status:row.status,scheduleDate:row.schedule_date||'',scheduleTime:(row.schedule_time||'').slice(0,5),technician:row.technician_name||'',client:req?.client||'',contract:req?.contract||'',address:[req?.address,req?.city,req?.uf].filter(Boolean).join(' · '),phone:req?.phone||'',entry:(row.entry_time||'').slice(0,5),exit:(row.exit_time||'').slice(0,5),kmStart:row.km_start??'',kmEnd:row.km_end??'',notes:row.notes||'',inspectorSignaturePath:row.inspector_signature_path||'',clientSignaturePath:row.client_signature_path||'',inspectorSignature:'',clientSignature:'',occurrences:voccs,version:row.version,createdAt:row.created_at};
    });
    await Promise.all(visits.map(async v=>{
      try{if(v.inspectorSignaturePath)v.inspectorSignature=await getSignedUrl(v.inspectorSignaturePath,3600);}catch(e){console.warn('Assinatura vistoriador',e);}
      try{if(v.clientSignaturePath)v.clientSignature=await getSignedUrl(v.clientSignaturePath,3600);}catch(e){console.warn('Assinatura cliente',e);}
    }));
    scheduleHistory=sh.data||[];
    renderRequests();renderVisits();setCloudState('Sincronizado','ok');
  }catch(err){console.error(err);setCloudState('Erro de sincronização','error');showToast(`Falha ao sincronizar: ${err.message||'erro desconhecido'}`);}finally{syncBusy=false;}
}

// ---------- Navegação ----------
async function go(name,refresh=true){
  if(refresh&&['requests','visits'].includes(name)&&currentUser)await loadCloudData({silent:true});
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));const p=$(`page-${name}`);if(p)p.classList.add('active');window.scrollTo({top:0,behavior:'instant'});if(name==='requests')renderRequests();if(name==='visits')renderVisits();
}
window.go=go;
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)go(b.dataset.go);if(e.target.closest('[data-new-request]'))newRequest();});
$('requestSearch').addEventListener('input',renderRequests);$('visitSearch').addEventListener('input',renderVisits);
function statusClass(s){return ({'Cadastrada':'registered','Agendada':'scheduled','Cancelada':'cancelled','Em atendimento':'progress','Com pendências':'pending','Finalizada':'final'})[s]||'registered';}

// ---------- Solicitações ----------
function statusSelector(r){
  if(!isOffice()||['Com pendências','Finalizada'].includes(r.status))return '<span class="sub">'+(['Com pendências','Finalizada'].includes(r.status)?'Definido pela visita':'Somente consulta')+'</span>';
  let opts='';
  if(r.status==='Cadastrada')opts='<option value="Agendada">Agendada</option><option value="Cancelada">Cancelada</option>';
  else if(r.status==='Agendada')opts='<option value="Agendada">Editar agendamento</option><option value="Cancelada">Cancelada</option>';
  else if(r.status==='Cancelada')opts='<option value="Cadastrada">Reabrir como cadastrada</option><option value="Agendada">Agendar</option>';
  return `<select class="status-control" onchange="changeStatus('${r.id}',this.value);this.value=''"><option value="">Alterar...</option>${opts}</select>`;
}
function renderRequests(){
  const q=($('requestSearch').value||'').trim().toLowerCase();const rows=requests.filter(r=>[r.number,r.client,r.contract].join(' ').toLowerCase().includes(q));$('requestCount').textContent=`${rows.length} solicitação(ões) compartilhada(s) na nuvem`;
  $('requestsBody').innerHTML=rows.map(r=>`<tr><td><span class="num">${esc(r.number)}</span><span class="sub">Contrato ${esc(r.contract||'—')}</span></td><td><span class="client">${esc(r.client||'—')}</span><span class="sub">${esc(r.city||'')}${r.uf?'/'+esc(r.uf):''}</span></td><td>${fmtDate(r.date)}</td><td>${r.occurrences.length}</td><td><span class="pill ${statusClass(r.status)}">${esc(r.status)}</span></td><td>${statusSelector(r)}</td><td><div class="row-actions"><button class="btn outline small" onclick="viewRequest('${r.id}')">Visualizar</button>${isOffice()?`<button class="btn light small" onclick="editRequest('${r.id}')">Editar</button>`:''}<button class="btn outline small" onclick="printRequest('${r.id}')">PDF</button></div></td></tr>`).join('')||'<tr><td colspan="7" style="padding:38px;text-align:center;color:#888">Nenhuma solicitação encontrada.</td></tr>';
}
window.changeStatus=changeStatus;window.viewRequest=viewRequest;window.editRequest=editRequest;window.printRequest=printRequest;
async function changeStatus(id,status){
  if(!status||!isOffice())return;const r=requests.find(x=>x.id===id);if(!r)return;if(status==='Agendada')return openScheduleModal(r);if(status==='Cancelada')return openCancelModal(r);
  try{const {error}=await sb.from('service_requests').update({status:'Cadastrada',cancel_reason:null}).eq('id',id);if(error)throw error;await loadCloudData();showToast('Solicitação reaberta como cadastrada.');}catch(e){showToast(e.message);}
}
function openScheduleModal(r){$('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal" style="max-width:620px"><div class="modal-top"><strong>Confirmar agendamento</strong><button class="btn light small" onclick="closeModal()">Fechar</button></div><div class="detail-doc"><div class="cloud-info">Ao confirmar, o Supabase criará ou atualizará automaticamente a Visita Técnica vinculada.</div><div class="grid3"><label class="field">Data agendamento<input id="schedDate" type="date" value="${esc(r.scheduleDate||'')}"></label><label class="field">Horário<input id="schedTime" type="time" value="${esc(r.scheduleTime||'')}"></label><label class="field">Técnico<input id="schedTech" value="${esc(r.technician||'')}"></label></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button id="confirmScheduleBtn" class="btn dark" onclick="confirmSchedule('${r.id}')">Confirmar agendamento</button></div></div></div></div>`;}
window.confirmSchedule=async function(id){
  const date=$('schedDate').value,time=$('schedTime').value,tech=$('schedTech').value.trim();if(!date||!time||!tech){showToast('Informe data, horário e técnico.');return;}const btn=$('confirmScheduleBtn');setBusy(btn,true,'Confirmando...');
  try{const {error}=await sb.from('service_requests').update({status:'Agendada',schedule_date:date,schedule_time:time,technician_name:tech,cancel_reason:null}).eq('id',id);if(error)throw error;closeModal();await loadCloudData();showToast('Agendamento confirmado. A Visita Técnica foi criada/atualizada automaticamente.');}catch(e){console.error(e);showToast(e.message);}finally{setBusy(btn,false);}
};
function openCancelModal(r){$('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal" style="max-width:620px"><div class="modal-top"><strong>Cancelar solicitação</strong><button class="btn light small" onclick="closeModal()">Fechar</button></div><div class="detail-doc"><label class="field">Motivo do cancelamento<textarea id="cancelReason">${esc(r.cancelReason||'')}</textarea></label><div style="display:flex;justify-content:flex-end;margin-top:16px"><button id="confirmCancelBtn" class="btn danger" onclick="confirmCancel('${r.id}')">Confirmar cancelamento</button></div></div></div></div>`;}
window.confirmCancel=async function(id){const reason=$('cancelReason').value.trim();const btn=$('confirmCancelBtn');setBusy(btn,true,'Cancelando...');try{const {error}=await sb.from('service_requests').update({status:'Cancelada',cancel_reason:reason}).eq('id',id);if(error)throw error;closeModal();await loadCloudData();showToast('Solicitação cancelada.');}catch(e){showToast(e.message);}finally{setBusy(btn,false);}};

// ---------- Formulário de solicitação ----------
$('addOccurrenceBtn').addEventListener('click',()=>addOccurrence());$('saveDraftBtn').addEventListener('click',()=>saveRequest(true));$('saveRequestBtn').addEventListener('click',()=>saveRequest(false));
function newRequest(){if(!isOffice()){showToast('Seu perfil possui acesso somente para consulta/execução de visitas.');return;}editingRequest=null;$('requestForm').reset();$('occurrences').innerHTML='';$('rfNumber').value='Gerado automaticamente ao salvar';$('requestFormNumber').textContent='Novo registro';$('rfDate').value=today();$('rfFilledBy').value=currentProfile?.full_name||'';addOccurrence();go('requestForm',false);}
function addOccurrence(data={}){
  const el=document.createElement('div');el.className='occurrence';el.dataset.dbId=data.id||'';el._media=[...(data.media||[])];
  el.innerHTML=`<div class="occ-head"><strong></strong><button class="btn outline small remove-occ" type="button">Remover</button></div><div class="occ-body"><div class="grid2"><label class="field">Ambiente<input data-o="environment" value="${esc(data.environment||'')}" placeholder="Descreva o ambiente"></label><label class="field">Pedido Fábrica<input data-o="factoryOrder" value="${esc(data.factoryOrder||'')}"></label><label class="field span2">Descrição da ocorrência<textarea data-o="description">${esc(data.description||'')}</textarea></label><label class="field span2">Materiais necessários<textarea data-o="materials">${esc(data.materials||'')}</textarea></label><label class="field">Data Finalização<input data-o="finishDate" type="date" value="${esc(data.finishDate||'')}"></label><label class="field">Observação<input data-o="notes" value="${esc(data.notes||'')}"></label><div class="field span2"><span>Fotografia / vídeo</span><div class="media-box"><div class="media-picker"><input class="occ-file-input" type="file" accept="image/*,video/*" multiple></div><div class="media-hint">Cloud 1.2: fotos e vídeos serão enviados ao Storage privado ao salvar. Arquivos maiores utilizam upload retomável.</div><div class="media-list"></div></div></div></div></div>`;
  el.querySelector('.remove-occ').onclick=()=>{el.remove();renumberOccurrences();};const input=el.querySelector('.occ-file-input'),list=el.querySelector('.media-list');input.onchange=()=>attachFiles(input,el._media,list);renderEditableMedia(list,el._media);$('occurrences').appendChild(el);renumberOccurrences();
}
function renumberOccurrences(){[...document.querySelectorAll('#occurrences .occurrence')].forEach((el,i)=>el.querySelector('.occ-head strong').textContent=`Ocorrência ${String(i+1).padStart(2,'0')}`);}
function collectOccurrences(){return [...document.querySelectorAll('#occurrences .occurrence')].map((el,i)=>{const o={id:el.dataset.dbId||'',sequence:i+1,media:[...(el._media||[])]};el.querySelectorAll('[data-o]').forEach(x=>o[x.dataset.o]=x.value);return o;});}
function collectRequest(){return {date:$('rfDate').value||today(),requestedBy:$('rfRequestedBy').value.trim(),type:$('rfType').value.trim(),filledBy:$('rfFilledBy').value.trim(),classif:$('rfClass').value,client:$('rfClient').value.trim(),contract:$('rfContract').value.trim(),phone:$('rfPhone').value.trim(),address:$('rfAddress').value.trim(),city:$('rfCity').value.trim(),uf:$('rfUF').value.trim().toUpperCase(),scheduleDate:$('rfScheduleDate').value||null,scheduleTime:$('rfScheduleTime').value||null,technician:$('rfTechnician').value.trim()||null,occurrences:collectOccurrences()};}
async function syncOccurrences(requestId,formOccurrences,existing=[]){
  const keep=new Set(formOccurrences.filter(o=>o.id).map(o=>o.id));
  for(const old of existing){
    if(!keep.has(old.id)){
      await deleteMediaForOccurrence(old.id);
      const {error}=await sb.from('occurrences').delete().eq('id',old.id);if(error)throw error;
    }
  }
  for(const o of formOccurrences){
    const payload={service_request_id:requestId,sequence_no:o.sequence,environment:o.environment||null,description:o.description||null,materials_needed:o.materials||null,factory_order:o.factoryOrder||null,finish_date:o.finishDate||null,notes:o.notes||null};
    let row;
    if(o.id){const res=await sb.from('occurrences').update(payload).eq('id',o.id).select().single();if(res.error)throw res.error;row=res.data;}
    else{const res=await sb.from('occurrences').insert(payload).select().single();if(res.error)throw res.error;row=res.data;}
    await uploadPendingMedia(o.media||[],{serviceRequestId:requestId,occurrenceId:row.id,stage:'request'});
  }
}
async function saveRequest(draft){
  if(!isOffice())return;const btn=draft?$('saveDraftBtn'):$('saveRequestBtn');setBusy(btn,true,'Salvando...');const form=collectRequest();const old=requests.find(x=>x.id===editingRequest);
  try{
    const payload={request_date:form.date,requested_by:form.requestedBy||null,service_type:form.type||null,filled_by_name:form.filledBy||null,classification:form.classif||null,client_name:form.client||null,contract:form.contract||null,phone:form.phone||null,installation_address:form.address||null,city:form.city||null,uf:form.uf||null,schedule_date:form.scheduleDate,schedule_time:form.scheduleTime,technician_name:form.technician};
    let row;
    if(editingRequest){const res=await sb.from('service_requests').update(payload).eq('id',editingRequest).select().single();if(res.error)throw res.error;row=res.data;}else{const res=await sb.from('service_requests').insert({...payload,status:'Cadastrada'}).select().single();if(res.error)throw res.error;row=res.data;}
    await syncOccurrences(row.id,form.occurrences,old?.occurrences||[]);editingRequest=null;await loadCloudData();go('requests',false);showToast(draft?'Rascunho salvo na nuvem.':'Solicitação salva na nuvem.');
  }catch(e){console.error(e);showToast(`Não foi possível salvar: ${e.message}`);}finally{setBusy(btn,false);}
}
function editRequest(id){if(!isOffice())return;const r=requests.find(x=>x.id===id);if(!r)return;editingRequest=id;$('requestForm').reset();$('occurrences').innerHTML='';const map={rfNumber:'number',rfDate:'date',rfRequestedBy:'requestedBy',rfType:'type',rfFilledBy:'filledBy',rfClient:'client',rfContract:'contract',rfPhone:'phone',rfAddress:'address',rfCity:'city',rfUF:'uf',rfScheduleDate:'scheduleDate',rfScheduleTime:'scheduleTime',rfTechnician:'technician'};Object.entries(map).forEach(([a,b])=>$(a).value=r[b]||'');$('rfClass').value=r.classif||'';$('requestFormNumber').textContent=r.number;(r.occurrences||[]).forEach(addOccurrence);if(!r.occurrences.length)addOccurrence();go('requestForm',false);}

// ---------- Visitas ----------
function renderVisits(){
  const q=($('visitSearch').value||'').trim().toLowerCase();const rows=visits.filter(v=>[v.number,v.requestNumber,v.client,v.technician].join(' ').toLowerCase().includes(q));$('visitCount').textContent=`${rows.length} visita(s) compartilhada(s) na nuvem`;
  $('visitsBody').innerHTML=rows.map(v=>`<tr><td><span class="num">${esc(v.number)}</span></td><td><span class="client">${esc(v.client||'—')}</span><span class="sub">Contrato ${esc(v.contract||'—')}</span></td><td>${esc(v.requestNumber)}</td><td>${fmtDate(v.scheduleDate)}<span class="sub">${esc(v.scheduleTime||'—')}</span></td><td>${esc(v.technician||'—')}</td><td><span class="pill ${statusClass(v.status)}">${esc(v.status)}</span></td><td><div class="row-actions">${v.status==='Com pendências'&&isOffice()?`<button class="btn light small" onclick="rescheduleVisit('${v.id}')">Reagendar</button>`:''}${v.status!=='Finalizada'?`<button class="btn dark small" onclick="performVisit('${v.id}')">${v.status==='Com pendências'?'Retomar Visita':'Realizar Visita'}</button>`:''}<button class="btn outline small" onclick="viewVisit('${v.id}')">Visualizar</button><button class="btn outline small" onclick="printVisitById('${v.id}')">PDF</button></div></td></tr>`).join('')||'<tr><td colspan="7" style="padding:38px;text-align:center;color:#888">Nenhuma visita encontrada.</td></tr>';
}
window.performVisit=performVisit;window.viewVisit=viewVisit;window.printVisitById=printVisitById;window.rescheduleVisit=rescheduleVisit;
function rescheduleVisit(id){const v=visits.find(x=>x.id===id);if(!v||!isOffice())return;$('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal" style="max-width:620px"><div class="modal-top"><strong>Reagendar visita com pendências</strong><button class="btn light small" onclick="closeModal()">Fechar</button></div><div class="detail-doc"><div class="grid3"><label class="field">Nova data<input id="rsDate" type="date" value="${esc(v.scheduleDate||'')}"></label><label class="field">Horário<input id="rsTime" type="time" value="${esc(v.scheduleTime||'')}"></label><label class="field">Técnico<input id="rsTech" value="${esc(v.technician||'')}"></label><label class="field span3">Motivo / orientação para retorno<textarea id="rsReason">Reagendamento para tratamento de pendências</textarea></label></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button id="confirmRescheduleBtn" class="btn dark" onclick="confirmReschedule('${v.id}')">Salvar reagendamento</button></div></div></div></div>`;}
window.confirmReschedule=async function(id){const date=$('rsDate').value,time=$('rsTime').value,tech=$('rsTech').value.trim(),reason=$('rsReason').value.trim();if(!date||!time||!tech){showToast('Informe data, horário e técnico.');return;}const btn=$('confirmRescheduleBtn');setBusy(btn,true,'Salvando...');try{const {error}=await sb.rpc('reschedule_visit',{p_visit_id:id,p_schedule_date:date,p_schedule_time:time,p_technician_name:tech,p_reason:reason||'Reagendamento para tratamento de pendências'});if(error)throw error;closeModal();await loadCloudData();showToast('Visita reagendada e histórico preservado.');}catch(e){showToast(e.message);}finally{setBusy(btn,false);}};

async function performVisit(id){const v=visits.find(x=>x.id===id);if(!v||v.status==='Finalizada')return;try{if(['Agendada','Com pendências'].includes(v.status)){const {error}=await sb.rpc('start_visit',{p_visit_id:id});if(error)throw error;await loadCloudData({silent:true});}activeVisit=id;fillVisit(visits.find(x=>x.id===id)||v);go('visitForm',false);}catch(e){showToast(e.message);}}
function fillVisit(v){$('visitTitle').textContent=v.number;$('visitOrigin').textContent=`Originada automaticamente da solicitação ${v.requestNumber}`;$('vfClient').textContent=v.client||'—';$('vfContract').textContent=v.contract||'—';$('vfSchedule').textContent=`${fmtDate(v.scheduleDate)} · ${v.scheduleTime||'—'}`;$('vfTechnician').textContent=v.technician||'—';$('vfAddress').value=v.address||'';$('vfEntry').value=v.entry||'';$('vfExit').value=v.exit||'';$('vfKmStart').value=v.kmStart??'';$('vfKmEnd').value=v.kmEnd??'';$('vfNotes').value=v.notes||'';$('visitOccurrences').innerHTML='';(v.occurrences||[]).forEach((o,i)=>addVisitOccurrence(o,i));inspectorPad.clear();clientPad.clear();inspectorPad.load(v.inspectorSignature);clientPad.load(v.clientSignature);updateVisitOutcomePreview();}
function addVisitOccurrence(o,i){
  const el=document.createElement('div');el.className='occurrence';el.dataset.occurrenceId=o.id;el.dataset.visitOccurrenceId=o.visitOccurrenceId;el._executionMedia=[...(o.executionMedia||[])];
  el.innerHTML=`<div class="occ-head"><strong>Ocorrência ${String(i+1).padStart(2,'0')} — ${esc(o.environment||'Ambiente não informado')}</strong><span class="tag">Herdada</span></div><div class="occ-body"><div class="grid2"><label class="field span2">Descrição da ocorrência<textarea readonly>${esc(o.description||'')}</textarea></label><label class="field span2">Materiais previstos<textarea readonly>${esc(o.materials||'')}</textarea></label><label class="field">Pedido Fábrica<input readonly value="${esc(o.factoryOrder||'')}"></label><label class="field">Observação original<input readonly value="${esc(o.notes||'')}"></label><div class="field span2"><span>Fotos/vídeos anexados na solicitação</span><div class="media-box"><div class="media-list original-media"></div></div></div></div><div class="resolution"><div class="resolution-grid"><label class="field">Resultado desta ocorrência<select class="result-select"><option value="">Selecionar...</option><option value="Resolvido" ${o.result==='Resolvido'?'selected':''}>Resolvido</option><option value="Não resolvido" ${o.result==='Não resolvido'?'selected':''}>Não resolvido</option></select></label><label class="field reason-field ${o.result==='Não resolvido'?'':'hidden'}">Motivo / pendência<textarea class="reason-text">${esc(o.reason||'')}</textarea></label></div><div class="field" style="margin-top:12px"><span>Novas fotos/vídeos após execução</span><div class="media-box"><div class="media-picker"><input class="execution-input" type="file" accept="image/*,video/*" multiple></div><div class="media-hint">Cloud 1.2: novos registros serão enviados ao Storage privado e ficarão disponíveis em todos os aparelhos.</div><div class="media-list execution-list"></div></div></div></div></div>`;
  const result=el.querySelector('.result-select');result.onchange=()=>{el.querySelector('.reason-field').classList.toggle('hidden',result.value!=='Não resolvido');updateVisitOutcomePreview();};const exInput=el.querySelector('.execution-input'),exList=el.querySelector('.execution-list');exInput.onchange=()=>attachFiles(exInput,el._executionMedia,exList);renderEditableMedia(exList,el._executionMedia);renderReadOnlyMedia(el.querySelector('.original-media'),o.media||[]);$('visitOccurrences').appendChild(el);
}
function collectVisitOccurrences(v){return [...document.querySelectorAll('#visitOccurrences .occurrence')].map((el,i)=>({...v.occurrences[i],visitOccurrenceId:el.dataset.visitOccurrenceId,result:el.querySelector('.result-select').value,reason:el.querySelector('.reason-text')?.value||'',executionMedia:[...(el._executionMedia||[])]}));}
function updateVisitOutcomePreview(){const vals=[...document.querySelectorAll('.result-select')].map(x=>x.value);const pending=!vals.length||vals.some(v=>v!=='Resolvido');$('vfOutcomeTitle').textContent=pending?'Status previsto: Com pendências':'Status previsto: Finalizada';$('vfOutcomeText').textContent=pending?'Existe ocorrência não resolvida ou ainda sem avaliação. Ao salvar, o banco propagará “Com pendências” para visita e solicitação.':'Todas as ocorrências estão resolvidas. Ao salvar, o banco marcará visita e solicitação como “Finalizada”.';}
$('saveVisitBtn').addEventListener('click',saveVisit);$('printActiveVisitBtn').addEventListener('click',()=>{if(activeVisit)viewVisit(activeVisit);});
async function saveVisit(){
  const v=visits.find(x=>x.id===activeVisit);if(!v)return;const btn=$('saveVisitBtn');setBusy(btn,true,'Salvando...');const occs=collectVisitOccurrences(v);
  try{
    const {error:visitError}=await sb.from('visits').update({entry_time:$('vfEntry').value||null,exit_time:$('vfExit').value||null,km_start:$('vfKmStart').value===''?null:Number($('vfKmStart').value),km_end:$('vfKmEnd').value===''?null:Number($('vfKmEnd').value),notes:$('vfNotes').value.trim()||null}).eq('id',v.id);if(visitError)throw visitError;
    for(const o of occs){
      const {error}=await sb.from('visit_occurrences').update({result:o.result||null,reason:o.reason||null}).eq('id',o.visitOccurrenceId);if(error)throw error;
      await uploadPendingMedia(o.executionMedia||[],{serviceRequestId:v.requestId,occurrenceId:o.id,visitId:v.id,visitOccurrenceId:o.visitOccurrenceId,stage:'execution'});
    }
    const inspectorPath=await saveVisitSignature({visitId:v.id,kind:'inspector',dataUrl:inspectorPad.export(),oldPath:v.inspectorSignaturePath,dirty:inspectorPad.isDirty()});
    const clientPath=await saveVisitSignature({visitId:v.id,kind:'client',dataUrl:clientPad.export(),oldPath:v.clientSignaturePath,dirty:clientPad.isDirty()});
    if(inspectorPad.isDirty()||clientPad.isDirty()){
      const {error:sigError}=await sb.from('visits').update({inspector_signature_path:inspectorPath,client_signature_path:clientPath}).eq('id',v.id);
      if(sigError)throw sigError;
      inspectorPad.markClean();clientPad.markClean();
    }
    const {error:statusError}=await sb.rpc('recalculate_visit_status',{p_visit_id:v.id});if(statusError)throw statusError;
    activeVisit=null;await loadCloudData();const saved=visits.find(x=>x.id===v.id);go('visits',false);showToast(`Visita salva e sincronizada como “${saved?.status||'atualizada'}”.`);
  }catch(e){console.error(e);setCloudState('Erro de sincronização','error');showToast(`Não foi possível salvar a visita: ${e.message}`);}finally{setBusy(btn,false);}
}

// ---------- Assinaturas em nuvem — Cloud 1.2 ----------
function signaturePad(canvas){
  const ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#171717';let drawing=false,last=null,hasInk=false,dirty=false;
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)}};
  canvas.addEventListener('pointerdown',e=>{drawing=true;last=point(e);hasInk=true;dirty=true;canvas.setPointerCapture?.(e.pointerId);e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault();});
  const end=e=>{drawing=false;last=null;e?.preventDefault?.();};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',e=>{if(e.buttons===0)end(e)});
  return {
    clear(){ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;dirty=true;},
    export(){return hasInk?canvas.toDataURL('image/png'):'';},
    load(data){ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;dirty=false;if(!data)return;const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);hasInk=true;dirty=false;};img.src=data;},
    isDirty(){return dirty;},
    markClean(){dirty=false;}
  };
}
const inspectorPad=signaturePad($('inspectorSignature')),clientPad=signaturePad($('clientSignature'));document.querySelectorAll('[data-clear-sign]').forEach(b=>b.onclick=()=> (b.dataset.clearSign==='inspector'?inspectorPad:clientPad).clear());

// ---------- Visualização completa / PDF ----------
async function mediaHtml(refs,{print=false}={}){
  if(!refs?.length)return '<div class="detail-text">Nenhuma mídia anexada.</div>';
  const parts=[];
  for(const ref of refs){
    let src='';
    try{src=await mediaSource(ref);}catch(e){console.error(e);}
    if(ref.type==='image'&&src) parts.push(`<img src="${src}" alt="${esc(ref.name)}">`);
    else if(ref.type==='video'&&src&&!print) parts.push(`<video src="${src}" controls playsinline preload="metadata"></video>`);
    else if(ref.type==='video') parts.push(`<div class="detail-video-file"><strong>Vídeo:</strong><br>${esc(ref.name)}</div>`);
    else parts.push(`<div class="detail-video-file">${esc(ref.name)}</div>`);
  }
  return `<div class="detail-media">${parts.join('')}</div>`;
}
function item(label,value){return `<div class="detail-item"><small>${esc(label)}</small><span>${esc(value||'—')}</span></div>`;}
async function requestDetailHtml(r,print=false){
  let occ='';for(let i=0;i<r.occurrences.length;i++){const o=r.occurrences[i];const relatedVisit=visits.find(v=>v.requestId===r.id);const vr=relatedVisit?.occurrences.find(x=>x.id===o.id);occ+=`<div class="detail-occ"><div class="detail-occ-title">Ocorrência ${String(i+1).padStart(2,'0')} · ${esc(o.environment||'Ambiente não informado')}</div><div class="detail-grid">${item('Pedido Fábrica',o.factoryOrder)}${item('Data finalização',fmtDate(o.finishDate))}${item('Resultado',vr?.result||'—')}</div><div class="detail-text"><strong>Descrição</strong><br>${esc(o.description||'—')}</div><div class="detail-text" style="margin-top:8px"><strong>Materiais necessários</strong><br>${esc(o.materials||'—')}</div><div class="detail-text" style="margin-top:8px"><strong>Observação</strong><br>${esc(o.notes||'—')}</div>${vr?.reason?`<div class="detail-text" style="margin-top:8px"><strong>Motivo / pendência</strong><br>${esc(vr.reason)}</div>`:''}<div style="margin-top:10px"><strong style="font-size:10px">Fotos / vídeos da solicitação</strong>${await mediaHtml(o.media,{print})}</div>${vr?.executionMedia?.length?`<div style="margin-top:10px"><strong style="font-size:10px">Registros da execução</strong>${await mediaHtml(vr.executionMedia,{print})}</div>`:''}</div>`;}
  return `<article class="detail-doc"><div class="detail-doc-head"><div><img class="detail-doc-logo" src="assets/veraci-logo-black.png" alt="Veraci"><p class="eyebrow" style="margin-top:14px">SOLICITAÇÃO DE ASSISTÊNCIA TÉCNICA</p><h2>${esc(r.client||'Solicitação')}</h2></div><div class="detail-doc-number"><strong>${esc(r.number)}</strong><br>${fmtDate(r.date)}<br><span class="pill ${statusClass(r.status)}" style="margin-top:8px">${esc(r.status)}</span></div></div><div class="detail-grid">${item('Solicitado por',r.requestedBy)}${item('Preenchido por',r.filledBy)}${item('Tipo de atendimento',r.type)}${item('Ocorrência',r.classif)}${item('Contrato',r.contract)}${item('Telefone',r.phone)}${item('Endereço',r.address)}${item('Cidade',r.city)}${item('UF',r.uf)}</div><section class="detail-section"><h3>Agendamento</h3><div class="detail-grid">${item('Data da visita',fmtDate(r.scheduleDate))}${item('Horário',r.scheduleTime)}${item('Técnico responsável',r.technician)}</div>${r.cancelReason?`<div class="detail-text"><strong>Motivo do cancelamento:</strong> ${esc(r.cancelReason)}</div>`:''}</section><section class="detail-section"><h3>Ocorrências</h3>${occ||'<div class="detail-text">Nenhuma ocorrência cadastrada.</div>'}</section></article>`;
}
async function visitDetailHtml(v,print=false){
  let occ='';for(let i=0;i<v.occurrences.length;i++){const o=v.occurrences[i];occ+=`<div class="detail-occ"><div class="detail-occ-title">Ocorrência ${String(i+1).padStart(2,'0')} · ${esc(o.environment||'Ambiente não informado')}</div><div class="detail-grid">${item('Pedido Fábrica',o.factoryOrder)}${item('Resultado',o.result||'Pendente')}${item('Motivo / pendência',o.reason||'—')}</div><div class="detail-text"><strong>Descrição</strong><br>${esc(o.description||'—')}</div><div class="detail-text" style="margin-top:8px"><strong>Materiais previstos</strong><br>${esc(o.materials||'—')}</div><div style="margin-top:10px"><strong style="font-size:10px">Fotos / vídeos da solicitação</strong>${await mediaHtml(o.media,{print})}</div><div style="margin-top:10px"><strong style="font-size:10px">Fotos / vídeos após execução</strong>${await mediaHtml(o.executionMedia,{print})}</div></div>`;}
  const history=scheduleHistory.filter(h=>h.visit_id===v.id);const histHtml=history.length?`<section class="detail-section"><h3>Histórico de agendamentos</h3>${history.map(h=>`<div class="detail-item" style="margin-bottom:7px"><small>${fmtDate(h.schedule_date)} · ${(h.schedule_time||'').slice(0,5)} · ${esc(h.technician_name)}</small><span>${esc(h.reason||'Agendamento')}</span></div>`).join('')}</section>`:'';
  const signatures=`<section class="detail-section"><h3>Assinaturas</h3><div class="signature-images"><div>${v.inspectorSignature?`<img src="${v.inspectorSignature}" alt="Assinatura do vistoriador">`:'<div style="height:120px"></div>'}<span>Vistoriador · assinatura armazenada em nuvem</span></div><div>${v.clientSignature?`<img src="${v.clientSignature}" alt="Assinatura do cliente">`:'<div style="height:120px"></div>'}<span>Cliente · assinatura armazenada em nuvem</span></div></div></section>`;
  return `<article class="detail-doc"><div class="detail-doc-head"><div><img class="detail-doc-logo" src="assets/veraci-logo-black.png" alt="Veraci"><p class="eyebrow" style="margin-top:14px">ORDEM DE VISITA TÉCNICA</p><h2>${esc(v.client||'Visita Técnica')}</h2></div><div class="detail-doc-number"><strong>${esc(v.number)}</strong><br>Solicitação ${esc(v.requestNumber)}<br><span class="pill ${statusClass(v.status)}" style="margin-top:8px">${esc(v.status)}</span></div></div><div class="detail-grid">${item('Contrato',v.contract)}${item('Agendamento',`${fmtDate(v.scheduleDate)} · ${v.scheduleTime||'—'}`)}${item('Técnico responsável',v.technician)}${item('Endereço',v.address)}${item('Hora de entrada',v.entry)}${item('Hora de saída',v.exit)}${item('KM inicial',v.kmStart)}${item('KM final',v.kmEnd)}${item('Observações',v.notes)}</div><section class="detail-section"><h3>Ocorrências</h3>${occ||'<div class="detail-text">Nenhuma ocorrência.</div>'}</section>${histHtml}${signatures}</article>`;
}
async function viewRequest(id){const r=requests.find(x=>x.id===id);if(!r)return;$('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-top"><img src="assets/veraci-logo-black.png" alt="Veraci"><div class="modal-top-actions">${isOffice()?`<button class="btn light small" onclick="closeModal();editRequest('${r.id}')">Editar</button>`:''}<button class="btn dark small" onclick="printRequest('${r.id}')">Imprimir / PDF</button><button class="btn outline small" onclick="closeModal()">Fechar</button></div></div><div id="modalDetail"><div class="detail-doc">Carregando conteúdo completo...</div></div></div></div>`;$('modalDetail').innerHTML=await requestDetailHtml(r,false);}
async function viewVisit(id){const v=visits.find(x=>x.id===id);if(!v)return;$('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-top"><img src="assets/veraci-logo-black.png" alt="Veraci"><div class="modal-top-actions">${v.status!=='Finalizada'?`<button class="btn light small" onclick="closeModal();performVisit('${v.id}')">${v.status==='Com pendências'?'Retomar':'Realizar'} Visita</button>`:''}<button class="btn dark small" onclick="printVisitById('${v.id}')">Imprimir / PDF</button><button class="btn outline small" onclick="closeModal()">Fechar</button></div></div><div id="modalDetail"><div class="detail-doc">Carregando conteúdo completo...</div></div></div></div>`;$('modalDetail').innerHTML=await visitDetailHtml(v,false);}
async function openPrintWindow(title,builder){const w=window.open('','_blank');if(!w){showToast('Permita pop-ups para gerar o PDF.');return;}w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparando...</title></head><body style="font-family:Arial;padding:30px">Preparando documento...</body></html>');const html=await builder();const css=await fetch('styles.css').then(r=>r.text());const logoAbs=new URL('assets/veraci-logo-black.png',location.href).href;const fixed=html.replaceAll('assets/veraci-logo-black.png',logoAbs);w.document.open();w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>${css}body{background:#fff!important;padding:22px}.detail-doc{max-width:1000px;margin:auto}.pill::before{display:none}@page{size:A4;margin:13mm}</style></head><body>${fixed}<script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})));setTimeout(()=>window.print(),500);});<\/script></body></html>`);w.document.close();}
function printRequest(id){const r=requests.find(x=>x.id===id);if(r)openPrintWindow(r.number,()=>requestDetailHtml(r,true));}
function printVisitById(id){const v=visits.find(x=>x.id===id);if(v)openPrintWindow(v.number,()=>visitDetailHtml(v,true));}

// ---------- Online/offline + atualização ----------
function updateNetwork(){const el=$('networkState');if(!el)return;el.textContent=navigator.onLine?'Online':'Offline';el.classList.toggle('offline',!navigator.onLine);if(navigator.onLine&&currentUser)loadCloudData({silent:true});}
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&currentUser&&navigator.onLine)loadCloudData({silent:true});});updateNetwork();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.error));

bootstrap();
