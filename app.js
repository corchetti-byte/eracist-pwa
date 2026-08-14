const $ = (id) => document.getElementById(id);
const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate = v => { if(!v) return '—'; const [y,m,d]=String(v).split('-'); return d&&m&&y ? `${d}/${m}/${y}` : v; };
const uid = (p='id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
const today = () => new Date().toISOString().slice(0,10);
const KEYS = { requests:'veracist_requests_v3', visits:'veracist_visits_v3' };
let requests = load(KEYS.requests, []);
let visits = load(KEYS.visits, []);
let editingRequest = null;
let activeVisit = null;
let toastTimer;

function load(k, fallback){ try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } }
function persist(){ localStorage.setItem(KEYS.requests, JSON.stringify(requests)); localStorage.setItem(KEYS.visits, JSON.stringify(visits)); }
function showToast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'),2600); }
function closeModal(){ $('modalRoot').innerHTML=''; }
window.closeModal = closeModal;

// ---------- IndexedDB media ----------
const MEDIA_DB='veracist_media_v2', MEDIA_STORE='files';
function mediaDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(MEDIA_DB,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(MEDIA_STORE)) req.result.createObjectStore(MEDIA_STORE,{keyPath:'id'}); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function storeFile(file){
  const db=await mediaDB(); const ref={id:uid('media'),name:file.name,type:file.type.startsWith('video')?'video':'image',mime:file.type||'application/octet-stream',size:file.size};
  await new Promise((resolve,reject)=>{ const tx=db.transaction(MEDIA_STORE,'readwrite'); tx.objectStore(MEDIA_STORE).put({...ref,blob:file,createdAt:new Date().toISOString()}); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); });
  db.close(); return ref;
}
async function getStoredFile(id){
  const db=await mediaDB();
  const rec=await new Promise((resolve,reject)=>{ const tx=db.transaction(MEDIA_STORE,'readonly'); const q=tx.objectStore(MEDIA_STORE).get(id); q.onsuccess=()=>resolve(q.result); q.onerror=()=>reject(q.error); });
  db.close(); return rec || null;
}
async function removeStoredFile(id){
  const db=await mediaDB(); await new Promise((resolve,reject)=>{ const tx=db.transaction(MEDIA_STORE,'readwrite'); tx.objectStore(MEDIA_STORE).delete(id); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); db.close();
}
function blobToDataURL(blob){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(blob); }); }
async function mediaSource(ref, dataURL=false){ const rec=await getStoredFile(ref.id); if(!rec?.blob) return null; return dataURL ? blobToDataURL(rec.blob) : URL.createObjectURL(rec.blob); }

async function renderEditableMedia(container, refs, onRemove){
  container.innerHTML='';
  if(!refs.length){ container.innerHTML='<div class="media-empty">Nenhuma foto ou vídeo anexado.</div>'; return; }
  for(const ref of refs){
    const card=document.createElement('div'); card.className='media-card';
    const src=await mediaSource(ref,false);
    if(src && ref.type==='image') card.innerHTML=`<img src="${src}" alt="${esc(ref.name)}"><button type="button" class="media-remove" aria-label="Remover">×</button><div class="media-name">${esc(ref.name)}</div>`;
    else if(src && ref.type==='video') card.innerHTML=`<video src="${src}" controls playsinline preload="metadata"></video><button type="button" class="media-remove" aria-label="Remover">×</button><div class="media-name">${esc(ref.name)}</div>`;
    else card.innerHTML=`<div class="file-fallback">Arquivo indisponível<br>${esc(ref.name)}</div><button type="button" class="media-remove">×</button><div class="media-name">${esc(ref.name)}</div>`;
    card.querySelector('.media-remove').onclick=async()=>{ const idx=refs.findIndex(x=>x.id===ref.id); if(idx>=0) refs.splice(idx,1); await removeStoredFile(ref.id).catch(()=>{}); onRemove?.(); renderEditableMedia(container,refs,onRemove); };
    container.appendChild(card);
  }
}
async function attachFiles(input, refs, listEl){
  const chosen=[...input.files]; input.value='';
  const room=Math.max(0,15-refs.length); if(!room){ showToast('Limite de 15 arquivos por ocorrência.'); return; }
  const files=chosen.slice(0,room); if(chosen.length>room) showToast(`Somente ${room} arquivo(s) foram adicionados para respeitar o limite de 15.`);
  input.disabled=true;
  try{ for(const f of files){ refs.push(await storeFile(f)); } await renderEditableMedia(listEl,refs); showToast(`${files.length} arquivo(s) anexado(s).`); }
  catch(e){ console.error(e); showToast('Não foi possível armazenar um dos arquivos.'); }
  finally{ input.disabled=false; }
}

// ---------- Navigation ----------
function go(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const p=$(`page-${name}`); if(p) p.classList.add('active');
  window.scrollTo({top:0,behavior:'instant'});
  if(name==='requests') renderRequests(); if(name==='visits') renderVisits();
}
window.go=go;
document.addEventListener('click',e=>{ const b=e.target.closest('[data-go]'); if(b) go(b.dataset.go); if(e.target.closest('[data-new-request]')) newRequest(); });
$('requestSearch').addEventListener('input',renderRequests); $('visitSearch').addEventListener('input',renderVisits);

function statusClass(s){ return ({'Cadastrada':'registered','Agendada':'scheduled','Cancelada':'cancelled','Em atendimento':'progress','Com pendências':'pending','Finalizada':'final'})[s]||'registered'; }

// ---------- Seed demo ----------
if(!requests.length){
  requests=[
    {id:'req-demo-1',number:'SAT-20260813-001',date:'2026-08-13',requestedBy:'Comercial',type:'Assistência Técnica',filledBy:'Administrativo',classif:'Assistência Técnica - Pós Montagem',client:'Residência Demo',contract:'VRC-2608-014',phone:'(19) 99999-0000',address:'Rua Exemplo, 180',city:'Campinas',uf:'SP',status:'Cadastrada',scheduleDate:'',scheduleTime:'',technician:'',cancelReason:'',occurrences:[{id:'occ-demo-1',environment:'Cozinha',description:'Regular alinhamento de uma frente e conferir ferragem.',materials:'',factoryOrder:'',finishDate:'',notes:'',media:[]}],createdAt:new Date().toISOString()},
    {id:'req-demo-2',number:'SAT-20260812-002',date:'2026-08-12',requestedBy:'Pós-venda',type:'Vistoria',filledBy:'Administrativo',classif:'Vistoria Pós Montagem',client:'Cliente Agendado',contract:'VRC-2607-092',phone:'',address:'Alameda Modelo, 70',city:'São Paulo',uf:'SP',status:'Agendada',scheduleDate:'2026-08-15',scheduleTime:'09:00',technician:'Rafael Souza',cancelReason:'',occurrences:[{id:'occ-demo-2',environment:'Closet master',description:'Conferir portas, regulagens e acabamento final.',materials:'',factoryOrder:'',finishDate:'',notes:'',media:[]}],createdAt:new Date().toISOString()}
  ];
  visits=[visitFromRequest(requests[1])]; persist();
}

// ---------- Requests grid ----------
function renderRequests(){
  const q=($('requestSearch').value||'').trim().toLowerCase();
  const rows=requests.filter(r=>[r.number,r.client,r.contract].join(' ').toLowerCase().includes(q));
  $('requestCount').textContent=`${rows.length} solicitação(ões) cadastrada(s)`;
  $('requestsBody').innerHTML=rows.map(r=>{
    const automatic=['Com pendências','Finalizada'].includes(r.status);
    return `<tr>
      <td><span class="num">${esc(r.number)}</span><span class="sub">Contrato ${esc(r.contract||'—')}</span></td>
      <td><span class="client">${esc(r.client||'—')}</span><span class="sub">${esc(r.city||'')}${r.uf?'/'+esc(r.uf):''}</span></td>
      <td>${fmtDate(r.date)}</td><td>${r.occurrences?.length||0}</td>
      <td><span class="pill ${statusClass(r.status)}">${esc(r.status)}</span></td>
      <td>${automatic?'<span class="sub">Definido pela visita</span>':`<select class="status-control" onchange="changeStatus('${r.id}',this.value);this.value=''"><option value="">Alterar...</option><option value="Cadastrada">Cadastrada</option><option value="Agendada">Agendada</option><option value="Cancelada">Cancelada</option></select>`}</td>
      <td><div class="row-actions"><button class="btn outline small" onclick="viewRequest('${r.id}')">Visualizar</button><button class="btn light small" onclick="editRequest('${r.id}')">Editar</button><button class="btn outline small" onclick="printRequest('${r.id}')">PDF</button></div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="padding:38px;text-align:center;color:#888">Nenhuma solicitação encontrada.</td></tr>';
}
window.changeStatus=changeStatus; window.viewRequest=viewRequest; window.editRequest=editRequest; window.printRequest=printRequest;
function changeStatus(id,status){ if(!status) return; const r=requests.find(x=>x.id===id); if(!r)return; if(status==='Agendada') return openScheduleModal(r); if(status==='Cancelada') return openCancelModal(r); r.status='Cadastrada'; r.cancelReason=''; persist(); renderRequests(); }
function openScheduleModal(r){
  $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal" style="max-width:620px"><div class="modal-top"><strong>Confirmar agendamento</strong><button class="btn light small" onclick="closeModal()">Fechar</button></div><div class="detail-doc"><div class="grid3"><label class="field">Data agendamento<input id="schedDate" type="date" value="${esc(r.scheduleDate||'')}"></label><label class="field">Horário<input id="schedTime" type="time" value="${esc(r.scheduleTime||'')}"></label><label class="field">Técnico<input id="schedTech" value="${esc(r.technician||'')}"></label></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn dark" onclick="confirmSchedule('${r.id}')">Confirmar agendamento</button></div></div></div></div>`;
}
window.confirmSchedule=function(id){ const r=requests.find(x=>x.id===id); r.scheduleDate=$('schedDate').value; r.scheduleTime=$('schedTime').value; r.technician=$('schedTech').value.trim(); if(!r.scheduleDate||!r.scheduleTime||!r.technician){showToast('Informe data, horário e técnico.');return;} r.status='Agendada'; r.cancelReason=''; upsertVisit(r); persist(); closeModal(); renderRequests(); showToast('Agendamento confirmado e visita criada.'); };
function openCancelModal(r){ $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal" style="max-width:620px"><div class="modal-top"><strong>Cancelar solicitação</strong><button class="btn light small" onclick="closeModal()">Fechar</button></div><div class="detail-doc"><label class="field">Motivo do cancelamento<textarea id="cancelReason">${esc(r.cancelReason||'')}</textarea></label><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn danger" onclick="confirmCancel('${r.id}')">Confirmar cancelamento</button></div></div></div></div>`; }
window.confirmCancel=function(id){const r=requests.find(x=>x.id===id);r.status='Cancelada';r.cancelReason=$('cancelReason').value.trim();visits=visits.filter(v=>!(v.requestId===id && ['Agendada','Em atendimento'].includes(v.status)));persist();closeModal();renderRequests();showToast('Solicitação cancelada.');};

// ---------- Request form ----------
$('addOccurrenceBtn').addEventListener('click',()=>addOccurrence()); $('saveDraftBtn').addEventListener('click',()=>saveRequest(true)); $('saveRequestBtn').addEventListener('click',()=>saveRequest(false));
function requestNumber(){ const d=today().replaceAll('-',''); const dayCount=requests.filter(r=>(r.date||'')===today()).length+1; return `SAT-${d}-${String(dayCount).padStart(3,'0')}`; }
function newRequest(){ editingRequest=null; $('requestForm').reset(); $('occurrences').innerHTML=''; const num=requestNumber(); $('rfNumber').value=num; $('requestFormNumber').textContent=num; $('rfDate').value=today(); addOccurrence(); go('requestForm'); }
function addOccurrence(data={}){
  const el=document.createElement('div'); el.className='occurrence'; el.dataset.occurrenceId=data.id||uid('occ'); el._media=[...(data.media||[])];
  el.innerHTML=`<div class="occ-head"><strong></strong><button class="btn outline small remove-occ" type="button">Remover</button></div><div class="occ-body"><div class="grid2">
    <label class="field">Ambiente<input data-o="environment" value="${esc(data.environment||'')}" placeholder="Descreva o ambiente"></label>
    <label class="field">Pedido Fábrica<input data-o="factoryOrder" value="${esc(data.factoryOrder||'')}"></label>
    <label class="field span2">Descrição da ocorrência<textarea data-o="description">${esc(data.description||'')}</textarea></label>
    <label class="field span2">Materiais necessários<textarea data-o="materials">${esc(data.materials||'')}</textarea></label>
    <label class="field">Data Finalização<input data-o="finishDate" type="date" value="${esc(data.finishDate||'')}"></label>
    <label class="field">Observação<input data-o="notes" value="${esc(data.notes||'')}"></label>
    <div class="field span2"><span>Fotografia / vídeo</span><div class="media-box"><div class="media-picker"><input class="occ-file-input" type="file" accept="image/*,video/*" multiple></div><div class="media-hint">Até 15 fotos/vídeos por ocorrência. Você pode tirar foto/vídeo ou selecionar da galeria.</div><div class="media-list"></div></div></div>
  </div></div>`;
  el.querySelector('.remove-occ').onclick=()=>{el.remove();renumberOccurrences();};
  const input=el.querySelector('.occ-file-input'), list=el.querySelector('.media-list'); input.onchange=()=>attachFiles(input,el._media,list); renderEditableMedia(list,el._media); $('occurrences').appendChild(el); renumberOccurrences();
}
function renumberOccurrences(){ [...document.querySelectorAll('#occurrences .occurrence')].forEach((el,i)=>el.querySelector('.occ-head strong').textContent=`Ocorrência ${String(i+1).padStart(2,'0')}`); }
function collectOccurrences(){ return [...document.querySelectorAll('#occurrences .occurrence')].map(el=>{ const o={id:el.dataset.occurrenceId,media:[...(el._media||[])]}; el.querySelectorAll('[data-o]').forEach(x=>o[x.dataset.o]=x.value); return o; }); }
function collectRequest(){
  const old=requests.find(x=>x.id===editingRequest);
  return {id:old?.id||uid('req'),number:$('rfNumber').value,date:$('rfDate').value,requestedBy:$('rfRequestedBy').value.trim(),type:$('rfType').value.trim(),filledBy:$('rfFilledBy').value.trim(),classif:$('rfClass').value,client:$('rfClient').value.trim(),contract:$('rfContract').value.trim(),phone:$('rfPhone').value.trim(),address:$('rfAddress').value.trim(),city:$('rfCity').value.trim(),uf:$('rfUF').value.trim().toUpperCase(),scheduleDate:$('rfScheduleDate').value,scheduleTime:$('rfScheduleTime').value,technician:$('rfTechnician').value.trim(),occurrences:collectOccurrences(),status:old?.status||'Cadastrada',cancelReason:old?.cancelReason||'',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
function saveRequest(draft){ const r=collectRequest(); const idx=requests.findIndex(x=>x.id===r.id); if(!draft && r.scheduleDate&&r.scheduleTime&&r.technician && !['Com pendências','Finalizada'].includes(r.status)){r.status='Agendada';} if(idx>=0) requests[idx]=r; else requests.unshift(r); if(r.status==='Agendada') upsertVisit(r); persist(); editingRequest=null; go('requests'); showToast(draft?'Rascunho salvo.':'Solicitação salva.'); }
function editRequest(id){ const r=requests.find(x=>x.id===id); if(!r)return; editingRequest=id; $('requestForm').reset(); $('occurrences').innerHTML=''; const map={rfNumber:'number',rfDate:'date',rfRequestedBy:'requestedBy',rfType:'type',rfFilledBy:'filledBy',rfClient:'client',rfContract:'contract',rfPhone:'phone',rfAddress:'address',rfCity:'city',rfUF:'uf',rfScheduleDate:'scheduleDate',rfScheduleTime:'scheduleTime',rfTechnician:'technician'}; Object.entries(map).forEach(([a,b])=>$(a).value=r[b]||''); $('rfClass').value=r.classif||''; $('requestFormNumber').textContent=r.number; (r.occurrences||[]).forEach(addOccurrence); if(!(r.occurrences||[]).length)addOccurrence(); go('requestForm'); }

// ---------- Visits ----------
function visitFromRequest(r){ return {id:uid('visit'),number:`VT-${r.number.replace('SAT-','')}`,requestId:r.id,requestNumber:r.number,status:'Agendada',scheduleDate:r.scheduleDate,scheduleTime:r.scheduleTime,technician:r.technician,client:r.client,contract:r.contract,address:[r.address,r.city,r.uf].filter(Boolean).join(' · '),phone:r.phone,entry:'',exit:'',kmStart:'',kmEnd:'',notes:'',inspectorSignature:'',clientSignature:'',occurrences:(r.occurrences||[]).map(o=>({...o,media:[...(o.media||[])],result:'',reason:'',executionMedia:[]})),createdAt:new Date().toISOString()}; }
function upsertVisit(r){ let v=visits.find(x=>x.requestId===r.id && x.status!=='Finalizada'); if(!v){v=visitFromRequest(r);visits.unshift(v);} else {v.scheduleDate=r.scheduleDate;v.scheduleTime=r.scheduleTime;v.technician=r.technician;v.client=r.client;v.contract=r.contract;v.address=[r.address,r.city,r.uf].filter(Boolean).join(' · ');v.occurrences=(r.occurrences||[]).map((o,i)=>({...o,media:[...(o.media||[])],result:v.occurrences?.[i]?.result||'',reason:v.occurrences?.[i]?.reason||'',executionMedia:v.occurrences?.[i]?.executionMedia||[]})); if(v.status!=='Com pendências') v.status='Agendada';} return v; }
function renderVisits(){
  const q=($('visitSearch').value||'').trim().toLowerCase(); const rows=visits.filter(v=>[v.number,v.requestNumber,v.client,v.technician].join(' ').toLowerCase().includes(q)); $('visitCount').textContent=`${rows.length} visita(s) vinculada(s)`;
  $('visitsBody').innerHTML=rows.map(v=>`<tr><td><span class="num">${esc(v.number)}</span></td><td><span class="client">${esc(v.client||'—')}</span><span class="sub">Contrato ${esc(v.contract||'—')}</span></td><td>${esc(v.requestNumber)}</td><td>${fmtDate(v.scheduleDate)}<span class="sub">${esc(v.scheduleTime||'—')}</span></td><td>${esc(v.technician||'—')}</td><td><span class="pill ${statusClass(v.status)}">${esc(v.status)}</span></td><td><div class="row-actions">${v.status==='Com pendências'?`<button class="btn light small" onclick="rescheduleVisit('${v.id}')">Reagendar</button>`:''}${v.status!=='Finalizada'?`<button class="btn dark small" onclick="performVisit('${v.id}')">${v.status==='Com pendências'?'Retomar Visita':'Realizar Visita'}</button>`:''}<button class="btn outline small" onclick="viewVisit('${v.id}')">Visualizar</button><button class="btn outline small" onclick="printVisitById('${v.id}')">PDF</button></div></td></tr>`).join('') || '<tr><td colspan="7" style="padding:38px;text-align:center;color:#888">Nenhuma visita encontrada.</td></tr>';
}
window.performVisit=performVisit; window.viewVisit=viewVisit; window.printVisitById=printVisitById; window.rescheduleVisit=rescheduleVisit;
function rescheduleVisit(id){ const v=visits.find(x=>x.id===id); $('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal" style="max-width:620px"><div class="modal-top"><strong>Reagendar visita</strong><button class="btn light small" onclick="closeModal()">Fechar</button></div><div class="detail-doc"><div class="grid3"><label class="field">Nova data<input id="rsDate" type="date" value="${esc(v.scheduleDate||'')}"></label><label class="field">Horário<input id="rsTime" type="time" value="${esc(v.scheduleTime||'')}"></label><label class="field">Técnico<input id="rsTech" value="${esc(v.technician||'')}"></label></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn dark" onclick="confirmReschedule('${v.id}')">Salvar reagendamento</button></div></div></div></div>`; }
window.confirmReschedule=function(id){const v=visits.find(x=>x.id===id);v.scheduleDate=$('rsDate').value;v.scheduleTime=$('rsTime').value;v.technician=$('rsTech').value.trim();const r=requests.find(x=>x.id===v.requestId);if(r){r.scheduleDate=v.scheduleDate;r.scheduleTime=v.scheduleTime;r.technician=v.technician;r.status='Com pendências';}persist();closeModal();renderVisits();showToast('Visita reagendada.');};

function performVisit(id){ activeVisit=id; const v=visits.find(x=>x.id===id); if(!v)return; if(v.status!=='Com pendências')v.status='Em atendimento'; persist(); fillVisit(v); go('visitForm'); }
function fillVisit(v){ $('visitTitle').textContent=v.number; $('visitOrigin').textContent=`Originada automaticamente da solicitação ${v.requestNumber}`; $('vfClient').textContent=v.client||'—';$('vfContract').textContent=v.contract||'—';$('vfSchedule').textContent=`${fmtDate(v.scheduleDate)} · ${v.scheduleTime||'—'}`;$('vfTechnician').textContent=v.technician||'—';$('vfAddress').value=v.address||'';$('vfEntry').value=v.entry||'';$('vfExit').value=v.exit||'';$('vfKmStart').value=v.kmStart||'';$('vfKmEnd').value=v.kmEnd||'';$('vfNotes').value=v.notes||'';$('visitOccurrences').innerHTML='';(v.occurrences||[]).forEach((o,i)=>addVisitOccurrence(o,i)); inspectorPad.clear(); clientPad.clear(); inspectorPad.load(v.inspectorSignature); clientPad.load(v.clientSignature); updateVisitOutcomePreview(); }
function addVisitOccurrence(o,i){
  const el=document.createElement('div'); el.className='occurrence'; el._executionMedia=[...(o.executionMedia||[])];
  el.innerHTML=`<div class="occ-head"><strong>Ocorrência ${String(i+1).padStart(2,'0')} — ${esc(o.environment||'Ambiente não informado')}</strong><span class="tag">Herdada</span></div><div class="occ-body"><div class="grid2"><label class="field span2">Descrição da ocorrência<textarea readonly>${esc(o.description||'')}</textarea></label><label class="field span2">Materiais previstos<textarea readonly>${esc(o.materials||'')}</textarea></label><label class="field">Pedido Fábrica<input readonly value="${esc(o.factoryOrder||'')}"></label><label class="field">Observação original<input readonly value="${esc(o.notes||'')}"></label><div class="field span2"><span>Fotos/vídeos anexados na solicitação</span><div class="media-box"><div class="media-list original-media"></div></div></div></div><div class="resolution"><div class="resolution-grid"><label class="field">Resultado desta ocorrência<select class="result-select"><option value="">Selecionar...</option><option value="Resolvido" ${o.result==='Resolvido'?'selected':''}>Resolvido</option><option value="Não resolvido" ${o.result==='Não resolvido'?'selected':''}>Não resolvido</option></select></label><label class="field reason-field ${o.result==='Não resolvido'?'':'hidden'}">Motivo / pendência<textarea class="reason-text">${esc(o.reason||'')}</textarea></label></div><div class="field" style="margin-top:12px"><span>Novas fotos/vídeos após execução</span><div class="media-box"><div class="media-picker"><input class="execution-input" type="file" accept="image/*,video/*" multiple></div><div class="media-hint">Registre o resultado executado ou a pendência encontrada.</div><div class="media-list execution-list"></div></div></div></div></div>`;
  const result=el.querySelector('.result-select'); result.onchange=()=>{el.querySelector('.reason-field').classList.toggle('hidden',result.value!=='Não resolvido');updateVisitOutcomePreview();};
  const exInput=el.querySelector('.execution-input'), exList=el.querySelector('.execution-list'); exInput.onchange=()=>attachFiles(exInput,el._executionMedia,exList); renderEditableMedia(exList,el._executionMedia); renderReadOnlyMedia(el.querySelector('.original-media'),o.media||[]); $('visitOccurrences').appendChild(el);
}
async function renderReadOnlyMedia(container,refs){ container.innerHTML=''; if(!refs.length){container.innerHTML='<div class="media-empty">Nenhuma mídia anexada.</div>';return;} for(const ref of refs){const src=await mediaSource(ref,false);const card=document.createElement('div');card.className='media-card';if(src&&ref.type==='image')card.innerHTML=`<img src="${src}" alt="${esc(ref.name)}"><div class="media-name">${esc(ref.name)}</div>`;else if(src&&ref.type==='video')card.innerHTML=`<video src="${src}" controls playsinline preload="metadata"></video><div class="media-name">${esc(ref.name)}</div>`;else card.innerHTML=`<div class="file-fallback">${esc(ref.name)}</div>`;container.appendChild(card);}}
function collectVisitOccurrences(v){ return [...document.querySelectorAll('#visitOccurrences .occurrence')].map((el,i)=>({...v.occurrences[i],result:el.querySelector('.result-select').value,reason:el.querySelector('.reason-text')?.value||'',executionMedia:[...(el._executionMedia||[])]})); }
function updateVisitOutcomePreview(){const vals=[...document.querySelectorAll('.result-select')].map(x=>x.value);const pending=!vals.length||vals.some(v=>v!=='Resolvido');$('vfOutcomeTitle').textContent=pending?'Status previsto: Com pendências':'Status previsto: Finalizada';$('vfOutcomeText').textContent=pending?'Existe ocorrência não resolvida ou ainda sem avaliação. Ao salvar, a visita e a solicitação ficarão “Com pendências”.':'Todas as ocorrências estão resolvidas. Ao salvar, visita e solicitação serão marcadas como “Finalizada”.';}
$('saveVisitBtn').addEventListener('click',saveVisit); $('printActiveVisitBtn').addEventListener('click',()=>{if(activeVisit) viewVisit(activeVisit);});
function saveVisit(){ const v=visits.find(x=>x.id===activeVisit); if(!v)return; v.entry=$('vfEntry').value;v.exit=$('vfExit').value;v.kmStart=$('vfKmStart').value;v.kmEnd=$('vfKmEnd').value;v.notes=$('vfNotes').value;v.occurrences=collectVisitOccurrences(v);v.inspectorSignature=inspectorPad.export();v.clientSignature=clientPad.export();const pending=!v.occurrences.length||v.occurrences.some(o=>o.result!=='Resolvido');v.status=pending?'Com pendências':'Finalizada';const r=requests.find(x=>x.id===v.requestId);if(r){r.status=v.status;r.occurrences=(r.occurrences||[]).map((o,i)=>({...o,result:v.occurrences[i]?.result||'',reason:v.occurrences[i]?.reason||'',executionMedia:v.occurrences[i]?.executionMedia||[]}));if(!pending)r.finalizedAt=new Date().toISOString();}persist();activeVisit=null;go('visits');showToast(`Visita salva como “${v.status}”.`);}

// ---------- Signature pads ----------
function signaturePad(canvas){
  const ctx=canvas.getContext('2d'); ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#171717'; let drawing=false,last=null,hasInk=false;
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)}};
  canvas.addEventListener('pointerdown',e=>{drawing=true;last=point(e);hasInk=true;canvas.setPointerCapture?.(e.pointerId);e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault();});
  const end=e=>{drawing=false;last=null;e?.preventDefault?.();}; canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',e=>{if(e.buttons===0)end(e)});
  return {clear(){ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;},export(){return hasInk?canvas.toDataURL('image/png'):'';},load(data){if(!data)return;const img=new Image();img.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);hasInk=true;};img.src=data;}};
}
const inspectorPad=signaturePad($('inspectorSignature')), clientPad=signaturePad($('clientSignature'));
document.querySelectorAll('[data-clear-sign]').forEach(b=>b.onclick=()=> (b.dataset.clearSign==='inspector'?inspectorPad:clientPad).clear());

// ---------- Detail views + PDF ----------
async function mediaHtml(refs,{print=false}={}){
  if(!refs?.length) return '<div class="detail-text">Nenhum arquivo anexado.</div>';
  const parts=[];
  for(const ref of refs){ const rec=await getStoredFile(ref.id); if(!rec?.blob){parts.push(`<div class="detail-video-file">Arquivo não disponível: ${esc(ref.name)}</div>`);continue;} if(ref.type==='image'){const src=print?await blobToDataURL(rec.blob):URL.createObjectURL(rec.blob);parts.push(`<img src="${src}" alt="${esc(ref.name)}">`);} else if(print){parts.push(`<div class="detail-video-file"><strong>Vídeo:</strong><br>${esc(ref.name)}</div>`);} else {const src=URL.createObjectURL(rec.blob);parts.push(`<video src="${src}" controls playsinline preload="metadata"></video>`);} }
  return `<div class="detail-media">${parts.join('')}</div>`;
}
function item(label,value){return `<div class="detail-item"><small>${esc(label)}</small><span>${esc(value||'—')}</span></div>`;}
async function requestDetailHtml(r,print=false){
  let occ=''; for(let i=0;i<(r.occurrences||[]).length;i++){const o=r.occurrences[i];occ+=`<div class="detail-occ"><div class="detail-occ-title">Ocorrência ${String(i+1).padStart(2,'0')} · ${esc(o.environment||'Ambiente não informado')}</div><div class="detail-grid">${item('Pedido Fábrica',o.factoryOrder)}${item('Data finalização',fmtDate(o.finishDate))}${item('Resultado',o.result||'—')}</div><div class="detail-text"><strong>Descrição</strong><br>${esc(o.description||'—')}</div><div class="detail-text" style="margin-top:8px"><strong>Materiais necessários</strong><br>${esc(o.materials||'—')}</div><div class="detail-text" style="margin-top:8px"><strong>Observação</strong><br>${esc(o.notes||'—')}</div>${o.reason?`<div class="detail-text" style="margin-top:8px"><strong>Motivo / pendência</strong><br>${esc(o.reason)}</div>`:''}<div style="margin-top:10px"><strong style="font-size:10px">Fotos / vídeos da solicitação</strong>${await mediaHtml(o.media,{print})}</div>${o.executionMedia?.length?`<div style="margin-top:10px"><strong style="font-size:10px">Registros da execução</strong>${await mediaHtml(o.executionMedia,{print})}</div>`:''}</div>`;}
  return `<article class="detail-doc"><div class="detail-doc-head"><div><img class="detail-doc-logo" src="assets/veraci-logo-black.png" alt="Veraci"><p class="eyebrow" style="margin-top:14px">SOLICITAÇÃO DE ASSISTÊNCIA TÉCNICA</p><h2>${esc(r.client||'Solicitação')}</h2></div><div class="detail-doc-number"><strong>${esc(r.number)}</strong><br>${fmtDate(r.date)}<br><span class="pill ${statusClass(r.status)}" style="margin-top:8px">${esc(r.status)}</span></div></div><div class="detail-grid">${item('Solicitado por',r.requestedBy)}${item('Preenchido por',r.filledBy)}${item('Tipo de atendimento',r.type)}${item('Ocorrência',r.classif)}${item('Contrato',r.contract)}${item('Telefone',r.phone)}${item('Endereço',r.address)}${item('Cidade',r.city)}${item('UF',r.uf)}</div><section class="detail-section"><h3>Agendamento</h3><div class="detail-grid">${item('Data da visita',fmtDate(r.scheduleDate))}${item('Horário',r.scheduleTime)}${item('Técnico responsável',r.technician)}</div>${r.cancelReason?`<div class="detail-text"><strong>Motivo do cancelamento:</strong> ${esc(r.cancelReason)}</div>`:''}</section><section class="detail-section"><h3>Ocorrências</h3>${occ||'<div class="detail-text">Nenhuma ocorrência cadastrada.</div>'}</section></article>`;
}
async function visitDetailHtml(v,print=false){
  let occ='';for(let i=0;i<(v.occurrences||[]).length;i++){const o=v.occurrences[i];occ+=`<div class="detail-occ"><div class="detail-occ-title">Ocorrência ${String(i+1).padStart(2,'0')} · ${esc(o.environment||'Ambiente não informado')}</div><div class="detail-grid">${item('Pedido Fábrica',o.factoryOrder)}${item('Resultado',o.result||'Pendente')}${item('Motivo / pendência',o.reason||'—')}</div><div class="detail-text"><strong>Descrição</strong><br>${esc(o.description||'—')}</div><div class="detail-text" style="margin-top:8px"><strong>Materiais previstos</strong><br>${esc(o.materials||'—')}</div><div style="margin-top:10px"><strong style="font-size:10px">Fotos / vídeos da solicitação</strong>${await mediaHtml(o.media,{print})}</div><div style="margin-top:10px"><strong style="font-size:10px">Fotos / vídeos após execução</strong>${await mediaHtml(o.executionMedia,{print})}</div></div>`;}
  const signatures=`<section class="detail-section"><h3>Assinaturas</h3><div class="signature-images"><div>${v.inspectorSignature?`<img src="${v.inspectorSignature}" alt="Assinatura do vistoriador">`: '<div style="height:120px"></div>'}<span>Vistoriador</span></div><div>${v.clientSignature?`<img src="${v.clientSignature}" alt="Assinatura do cliente">`:'<div style="height:120px"></div>'}<span>Cliente</span></div></div></section>`;
  return `<article class="detail-doc"><div class="detail-doc-head"><div><img class="detail-doc-logo" src="assets/veraci-logo-black.png" alt="Veraci"><p class="eyebrow" style="margin-top:14px">ORDEM DE VISITA TÉCNICA</p><h2>${esc(v.client||'Visita Técnica')}</h2></div><div class="detail-doc-number"><strong>${esc(v.number)}</strong><br>Solicitação ${esc(v.requestNumber)}<br><span class="pill ${statusClass(v.status)}" style="margin-top:8px">${esc(v.status)}</span></div></div><div class="detail-grid">${item('Contrato',v.contract)}${item('Agendamento',`${fmtDate(v.scheduleDate)} · ${v.scheduleTime||'—'}`)}${item('Técnico responsável',v.technician)}${item('Endereço',v.address)}${item('Hora de entrada',v.entry)}${item('Hora de saída',v.exit)}${item('KM inicial',v.kmStart)}${item('KM final',v.kmEnd)}${item('Observações',v.notes)}</div><section class="detail-section"><h3>Ocorrências</h3>${occ||'<div class="detail-text">Nenhuma ocorrência.</div>'}</section>${signatures}</article>`;
}
async function viewRequest(id){const r=requests.find(x=>x.id===id);if(!r)return;$('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-top"><img src="assets/veraci-logo-black.png" alt="Veraci"><div class="modal-top-actions"><button class="btn light small" onclick="closeModal();editRequest('${r.id}')">Editar</button><button class="btn dark small" onclick="printRequest('${r.id}')">Imprimir / PDF</button><button class="btn outline small" onclick="closeModal()">Fechar</button></div></div><div id="modalDetail"><div class="detail-doc">Carregando conteúdo completo...</div></div></div></div>`;$('modalDetail').innerHTML=await requestDetailHtml(r,false);}
async function viewVisit(id){const v=visits.find(x=>x.id===id);if(!v)return;$('modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-top"><img src="assets/veraci-logo-black.png" alt="Veraci"><div class="modal-top-actions">${v.status!=='Finalizada'?`<button class="btn light small" onclick="closeModal();performVisit('${v.id}')">${v.status==='Com pendências'?'Retomar':'Realizar'} Visita</button>`:''}<button class="btn dark small" onclick="printVisitById('${v.id}')">Imprimir / PDF</button><button class="btn outline small" onclick="closeModal()">Fechar</button></div></div><div id="modalDetail"><div class="detail-doc">Carregando conteúdo completo...</div></div></div></div>`;$('modalDetail').innerHTML=await visitDetailHtml(v,false);}
async function openPrintWindow(title, builder){ const w=window.open('','_blank'); if(!w){showToast('Permita pop-ups para gerar o PDF.');return;} w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparando...</title></head><body style="font-family:Arial;padding:30px">Preparando documento...</body></html>'); const html=await builder(); const css=await fetch('styles.css').then(r=>r.text()); const logoAbs=new URL('assets/veraci-logo-black.png',location.href).href; const fixed=html.replaceAll('assets/veraci-logo-black.png',logoAbs); w.document.open();w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>${css}body{background:#fff!important;padding:22px}.detail-doc{max-width:1000px;margin:auto}.pill::before{display:none}@page{size:A4;margin:13mm}</style></head><body>${fixed}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`);w.document.close(); }
function printRequest(id){const r=requests.find(x=>x.id===id);if(r)openPrintWindow(r.number,()=>requestDetailHtml(r,true));}
function printVisitById(id){const v=visits.find(x=>x.id===id);if(v)openPrintWindow(v.number,()=>visitDetailHtml(v,true));}

// ---------- Online/offline + PWA ----------
function updateNetwork(){ $('networkState').textContent=navigator.onLine?'Online':'Offline'; $('networkState').classList.toggle('offline',!navigator.onLine); }
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);updateNetwork();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.error));

renderRequests();renderVisits();
