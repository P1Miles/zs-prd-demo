import {request as localRequest} from './local.js';

const $=id=>document.getElementById(id);let current=null,result=null,mode='sql',connected=true,busy=false,queryDataset=null,modelEnabled=true;const defaults='SELECT * FROM data LIMIT 100';
function notice(text){const id=$('home').hidden?'work-message':'home-message';$(id).textContent=text;$(id).hidden=!text}
function safe(fn,target){return async()=>{try{await fn()}catch(e){if(target){$(target).textContent=e.message}else notice(e.message)}}}
async function api(path,options={}){return localRequest(path,options)}
function home(){if(busy){notice('查询仍在运行，请等待或取消后再返回。');return}location.hash='';$('home').hidden=false;$('workspace').hidden=true;$('input').focus()}
function work(){$('home').hidden=true;$('workspace').hidden=false;location.hash='analysis';$('result-title').focus()}
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#analysis')&&!busy){$('home').hidden=false;$('workspace').hidden=true}else if(location.hash.startsWith('#analysis')&&(result||busy)){$('home').hidden=true;$('workspace').hidden=false}});
function requireConnection(){return true}
function lock(value){busy=value;['start','rerun','source','open-data','new-analysis'].forEach(id=>$(id).disabled=value);$('cancel').hidden=!value;$('export').disabled=value||!result||result.executed===false;$('loading').hidden=!value}
const drafts={sql:defaults,question:''};function modeSet(next){drafts[mode]=$('input').value;mode=next;['sql','question'].forEach(m=>{$('mode-'+m).classList.toggle('active',m===next);$('mode-'+m).setAttribute('aria-pressed',String(m===next))});$('input').classList.toggle('code',next==='sql');$('input').value=drafts[next];$('input').placeholder=next==='sql'?'写下你的 SQL 查询…':'例如：已完成订单中，各区域销售额是多少？';$('input-hint').textContent=next==='sql'?'只读查询 · 原始数据不会被修改':(modelEnabled?'问题与字段结构发送至 DeepSeek · 原始数据留在浏览器':'问题与字段结构发送至 DeepSeek · 原始数据留在浏览器');$('examples').hidden=next!=='sql'}
function table(container,headers,rows){container.replaceChildren();const t=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');headers.forEach(h=>{const th=document.createElement('th');th.scope='col';th.textContent=h;tr.append(th)});head.append(tr);t.append(head);const body=document.createElement('tbody');rows.forEach(r=>{const tr=document.createElement('tr');r.forEach(v=>{const td=document.createElement('td');td.textContent=v===null?'NULL':v;tr.append(td)});body.append(tr)});t.append(body);container.append(t);if(!rows.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='没有符合条件的记录。你可以调整筛选条件。';container.append(empty)}}
async function refresh(){const rows=await(await api('/datasets')).json();$('datasets').replaceChildren();if(!rows.length){$('datasets').textContent='还没有数据，选择第一份文件吧。';return}rows.forEach(d=>{const row=document.createElement('div');row.className='dataset-item';const b=document.createElement('button');b.textContent=d.name;const label=document.createElement('small');label.textContent=d.state==='READY'?'已就绪 · 点击使用':'待确认字段类型';b.append(label);b.onclick=safe(()=>select(d.id),'data-message');const del=document.createElement('button');del.className='delete';del.textContent='删除';del.onclick=safe(async()=>{if(!confirm('删除“'+d.name+'”及其查询结果？此操作无法撤销。'))return;await api('/datasets/'+d.id,{method:'DELETE'});if(current?.id===d.id){current=null;result=null;$('source').textContent='＋ 选择或上传数据';$('result-content').hidden=true;home()}await refresh()},'data-message');row.append(b,del);$('datasets').append(row)})}
async function openData(){if(busy)return;if(!requireConnection())return;$('data-title').textContent='选择数据';$('data-picker').hidden=false;$('preview').hidden=true;$('data-message').textContent='';$('data-dialog').showModal();await refresh()}
async function select(id){const d=await(await api('/datasets/'+id)).json();if(d.state==='PREVIEW'){preview(d);return}current=d;result=null;$('source').textContent='▤ '+d.name;$('data-dialog').close();$('result-content').hidden=true;home();notice('已选择 '+d.name+'，可以开始分析。')}
function preview(d){$('data-title').textContent='确认字段类型';$('data-picker').hidden=true;$('preview').hidden=false;$('preview').replaceChildren();const p=document.createElement('p');p.textContent='编号保留文本；金额选择金额类型。确认后开始分析。';$('preview').append(p);const fields=document.createElement('div');fields.className='fields';const selects=[];d.headers.forEach((h,i)=>{const field=document.createElement('div');field.className='field';const label=document.createElement('label');label.textContent=h;label.htmlFor='type-'+i;const s=document.createElement('select');s.id=label.htmlFor;[['VARCHAR','文本'],['DECIMAL(18,2)','金额 · 两位小数'],['BIGINT','整数'],['DATE','日期'],['DOUBLE','数值'],['BOOLEAN','布尔值']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;s.append(o)});selects.push(s);field.append(label,s);fields.append(field)});$('preview').append(fields);const scroll=document.createElement('div');scroll.className='scroll';table(scroll,d.headers,d.preview);$('preview').append(scroll);const b=document.createElement('button');b.className='primary';b.style.marginTop='20px';b.textContent='确认并使用这份数据';b.onclick=safe(async()=>{b.disabled=true;try{await api('/datasets/'+d.id+'/confirm',{method:'POST',body:JSON.stringify({types:selects.map(s=>s.value)})});await select(d.id)}finally{b.disabled=false}},'data-message');$('preview').append(b)}
function tab(name){document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$('view-'+b.dataset.tab).hidden=!active})}
async function execute(sql,asQuestion=false,requestedOutputs=selectedOutputs()){if(busy)return;if(!requestedOutputs.length){notice('请至少选择一项结果。');return;}if(!requireConnection())return;if(!current){await openData();return}if(!sql.trim()){notice('请先输入查询。');return}queryDataset=current;work();$('result-title').textContent='正在准备你的结果';$('loading').querySelector('.hint').textContent=requestedOutputs.length===1&&requestedOutputs[0]==='sql'?'生成并静态校验 SQL，不执行查询…':'安全校验后共享一次查询，只生成所选结果…';$('work-message').hidden=true;$('result-meta').textContent=current.name+'　/　只读分析';$('failure').hidden=true;$('result-content').hidden=true;lock(true);const poll=setInterval(async()=>{try{const jobs=await(await api('/jobs')).json();const active=jobs.find(j=>j.dataset===queryDataset?.id&&['QUEUED','RUNNING'].includes(j.state));if(active)$('loading').querySelector('strong').textContent=active.state==='QUEUED'?'正在排队，即将开始分析':'正在分析你的数据';}catch{}},1200);try{const r=await(await api('/datasets/'+queryDataset.id+(asQuestion?'/ask':'/query'),{method:'POST',body:JSON.stringify(asQuestion?{question:sql,outputs:requestedOutputs}:{sql,outputs:requestedOutputs})})).json();if(r.action==='CLARIFY'||r.action==='REFUSE'){lock(false);home();notice(r.message);return}result=r;render(r)}catch(e){notice(e.message);if(result){render(result);notice(e.message+'\n下方保留上一次成功的结果。')}else $('failure').hidden=false}finally{clearInterval(poll);lock(false);queryDataset=null}}
$('brand').onclick=home;$('back').onclick=home;$('new-analysis').onclick=home;$('retry-input').onclick=home;$('open-data').onclick=safe(openData);$('source').onclick=safe(openData);$('mode-question').onclick=()=>modeSet('question');$('mode-sql').onclick=()=>modeSet('sql');document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{$('input').value=b.dataset.example;$('input').focus()});document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('upload').onclick=safe(async()=>{const file=$('file').files[0];if(!file)throw Error('请选择 CSV 或 Excel 文件');if(file.size>10000000)throw Error('文件超过10MB，请拆分后上传');$('upload').disabled=true;$('data-message').textContent='正在读取文件…';try{const form=new FormData();form.append('file',file);const d=await(await api('/datasets',{method:'POST',body:form})).json();$('data-message').textContent='';preview(d);$('file').value=''}finally{$('upload').disabled=false}},'data-message');
$('start').onclick=safe(async()=>{if(mode==='question'&&!modelEnabled){if(!connected){requireConnection();return}notice('模型服务暂未开启，请稍后再试，或使用SQL分析。');return}await execute($('input').value,mode==='question')});$('rerun').onclick=safe(()=>execute($('sql-editor').value,false,result?.executed===false?['sql','table']:(result?.outputs||selectedOutputs())));$('restore').onclick=()=>{if(result){$('sql-editor').value=result.sql;$('draft-note').textContent='已恢复当前结果对应的 SQL。'}};$('sql-editor').oninput=()=>{$('draft-note').textContent='查询已修改，当前结果仍对应上一次执行。重新执行后更新。'};
$('cancel').onclick=safe(async()=>{if(queryDataset){$('cancel').disabled=true;try{await api('/datasets/'+queryDataset.id+'/cancel',{method:'POST'});notice('已请求取消查询。')}finally{$('cancel').disabled=false}}});
$('export').onclick=safe(async()=>{if(!result)return;const blob=await(await api('/results/'+result.id+'/export')).blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='知数_分析结果.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('open-history').onclick=safe(async()=>{if(!requireConnection())return;if(!current){notice('请先选择数据，再查看它的查询历史。');return}$('history-dialog').showModal();$('history-label').textContent=current.name+' · 点击查看保存的结果';$('history-message').textContent='';$('history').textContent='正在读取…';const rows=await(await api('/datasets/'+current.id+'/history')).json();$('history').replaceChildren();if(!rows.length)$('history').textContent='还没有查询记录。';rows.forEach(r=>{const b=document.createElement('button');b.className='history-item';const code=document.createElement('code');code.textContent=r.sql;const date=document.createElement('small');date.textContent=new Date(r.created*1000).toLocaleString('zh-CN');b.append(date,code);b.onclick=safe(async()=>{if(busy)throw Error('请等待当前查询完成。');const saved=await(await api('/results/'+r.id)).json();result=saved;$('history-dialog').close();work();render(saved)},'history-message');$('history').append(b)})},'history-message');
$('input').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')$('start').click()});$('input').value=defaults;modeSet('question');
document.querySelectorAll('[role=tab]').forEach((b,i)=>b.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')].filter(t=>!t.hidden);const target=tabs[(tabs.indexOf(b)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];target.click();target.focus()}}));

(async()=>{try{const status=await(await api('/status')).json();connected=true;modelEnabled=status.model_enabled;$('connection').textContent=modelEnabled?'DeepSeek 已就绪':'本地空间已就绪';$('connection').classList.add('connected');modeSet('question');const rid=location.hash.match(/^#analysis\/([a-f0-9]+)$/)?.[1];if(rid){result=await(await api('/results/'+rid)).json();current=await(await api('/datasets/'+result.dataset_id)).json();$('source').textContent='▤ '+current.name;work();render(result)}}catch{}})();


/* Selected deliverables share one execution. SQL-only drafts never contain computed data. */
function selectedOutputs(){return [...document.querySelectorAll('[name=output]:checked')].map(el=>el.value)}
function updateOutputs(){
 const outputs=selectedOutputs();
 if(outputs.length&&$('home-message').textContent==='请至少选择一项结果。'){ $('home-message').hidden=true; }
 $('start').textContent=outputs.length===1&&outputs[0]==='sql'?'生成 SQL ↗':'开始分析 ↗';
 $('selection-hint').textContent=!outputs.length?'请至少选择一项结果':outputs.length===1&&outputs[0]==='sql'?'只生成语句，不查询数据':'所选结果共享一次查询';
}
function drawChart(r){
 const target=$('view-chart');target.replaceChildren();
 if(r.columns.length===2&&r.rows.length>0&&r.rows.length<=20&&r.rows.every(row=>row[1]!==null&&Number.isFinite(Number(row[1]))&&Number(row[1])>=0)&&/INT|DECIMAL|DOUBLE|FLOAT/.test(r.columns[1].type)){
  const label=document.createElement('p');label.className='hint';label.textContent=r.columns[0].name+' / '+r.columns[1].name;target.append(label);
  const max=Math.max(...r.rows.map(row=>Number(row[1])),1);
  r.rows.forEach(row=>{const wrap=document.createElement('div');wrap.className='bar-row';const name=document.createElement('span');name.textContent=row[0];name.title=String(row[0]);const track=document.createElement('div');track.className='bar-track';const bar=document.createElement('div');bar.className='bar';bar.style.width=100*Number(row[1])/max+'%';track.append(bar);const value=document.createElement('span');value.textContent=row[1];wrap.append(name,track,value);target.append(wrap)});
 }else{
  const empty=document.createElement('div');empty.className='empty';const p=document.createElement('p');p.textContent=r.rows.length?'当前结果不适合条形图。需要类别与非负数值两列，且不超过20类。':'没有符合条件的数据，暂时无法生成图表。';empty.append(p);
  const b=document.createElement('button');b.className='subtle';b.textContent='查看表格';b.onclick=()=>{table($('view-table'),r.columns.map(c=>c.name),r.rows);$('tab-table').hidden=false;tab('table')};empty.append(b);target.append(empty);
 }
}
function render(r){
 history.replaceState(null,'','#analysis/'+r.id);
 const outputs=r.outputs||['sql','table','chart','summary'],executed=r.executed!==false;
 $('result-content').hidden=false;$('failure').hidden=true;
 $('result-title').textContent=executed?'你的分析，已就绪':'SQL 已生成';
 $('result-content').querySelector('.metrics').hidden=!executed;
 $('row-count').textContent=r.rows.length.toLocaleString();$('col-count').textContent=r.columns.length;
 $('data-state').textContent=r.truncated?'已截断至 1,000 行':'未经抽样';
 $('result-notice').textContent=r.notice||(r.truncated?'结果已截断，仅展示返回部分。':!r.rows.length?'没有符合条件的记录。':'结果未经抽样。');
 $('view-summary').textContent=r.summary||'暂无可总结的数据。';
 $('sql-editor').value=r.sql;
 $('draft-note').textContent=executed?'结果对应以下已成功执行的 SQL。':'仅通过静态安全校验，尚未执行。可编辑语句，或执行以查看数据。';
 $('rerun').textContent=executed?'重新执行 ↗':'执行并查看数据 ↗';
 $('export').hidden=!executed;$('export').disabled=!executed;
 $('view-table').replaceChildren();$('view-chart').replaceChildren();
 if(outputs.includes('table'))table($('view-table'),r.columns.map(c=>c.name),r.rows);
 if(outputs.includes('chart'))drawChart(r);
 document.querySelectorAll('[data-tab]').forEach(b=>b.hidden=!outputs.includes(b.dataset.tab));
 $('provenance').textContent=(executed?'数据版本 ':'SQL 草稿 · 数据版本 ')+r.dataset_id+'　·　'+new Date(r.created*1000).toLocaleString('zh-CN');
 tab(['table','chart','summary','sql'].find(k=>outputs.includes(k)));
}
document.querySelectorAll('[name=output]').forEach(el=>el.addEventListener('change',updateOutputs));
updateOutputs();



/* One spring per dialog. No motion on data, tabs, or keyboard-triggered actions. */
(()=>{
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const mobile=matchMedia('(max-width:640px)');
  document.documentElement.dataset.input='keyboard';
  document.addEventListener('pointerdown',()=>document.documentElement.dataset.input='pointer',true);
  document.addEventListener('keydown',()=>document.documentElement.dataset.input='keyboard',true);
  document.querySelectorAll('dialog').forEach(dialog=>{
    const nativeOpen=dialog.showModal.bind(dialog),nativeClose=dialog.close.bind(dialog);
    let y=0,v=0,target=0,raf=0,last=0,closing=false,drag=null,fade=null;
    const stop=()=>{cancelAnimationFrame(raf);raf=0;fade?.cancel();fade=null};
    const paint=()=>{dialog.style.transform=mobile.matches?`translateY(${y}px)`:`translateY(${y}px) scale(${1-Math.min(Math.abs(y)/24,1)*.03})`;};
    const reset=()=>{stop();y=v=target=0;closing=false;drag=null;dialog.style.transform='';dialog.style.opacity='';};
    const finish=()=>{const close=closing;reset();if(close&&dialog.open)nativeClose();};
    const spring=(to,velocity=v)=>{
      stop();target=to;v=velocity;last=performance.now();
      const tick=now=>{
        const dt=Math.min((now-last)/1000,.032);last=now;
        // Shorter close response keeps full-height sheets within a 500ms budget.
        // Drag release keeps light rebound; ordinary presentation has no overshoot.
        const omega=2*Math.PI/(closing ? .22 : .3),zeta=drag?.released ? 0.8 : 1;
        for(let i=0;i<4;i++){v+=(-omega*omega*(y-target)-2*zeta*omega*v)*dt/4;y+=v*dt/4;}
        paint();
        if(Math.abs(y-target)<.1&&Math.abs(v)<1){finish();return;}
        raf=requestAnimationFrame(tick);
      };raf=requestAnimationFrame(tick);
    };
    dialog.showModal=()=>{
      if(dialog.open){if(!closing)return;closing=false;if(reduce.matches||document.documentElement.dataset.input==='keyboard')reset();else spring(0);return;}
      reset();nativeOpen();
      if(document.documentElement.dataset.input==='keyboard')return;
      if(reduce.matches){fade=dialog.animate([{opacity:0},{opacity:1}],{duration:120});return;}
      y=mobile.matches?56:24;paint();spring(0,0);
    };
    dialog.close=(value)=>{reset();nativeClose(value);}; // business completions remain immediate
    const dismiss=()=>{
      if(closing)return;
      if(reduce.matches||document.documentElement.dataset.input==='keyboard'){dialog.close();return;}
      if(mobile.matches){closing=true;spring(dialog.getBoundingClientRect().height+24);}
      else {stop();closing=true;fade=dialog.animate([{opacity:1,transform:dialog.style.transform||'none'},{opacity:0,transform:'translateY(8px) scale(.97)'}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});fade.onfinish=finish;}
    };
    dialog.querySelector('[data-close]')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();dismiss();},true);
    dialog.addEventListener('cancel',()=>reset());
    dialog.addEventListener('close',()=>reset());
    const grip=document.createElement('button');grip.className='sheet-grip';grip.type='button';grip.setAttribute('aria-label','关闭面板，或向下拖动关闭');dialog.prepend(grip);
    let suppressClick=false;
    grip.addEventListener('click',e=>{if(suppressClick){e.preventDefault();suppressClick=false;return;}dismiss();});
    grip.addEventListener('pointerdown',e=>{
      if(!mobile.matches||reduce.matches||!e.isPrimary||e.button!==0||drag&&!drag.released)return;
      e.preventDefault();stop();closing=false;suppressClick=false;
      drag={id:e.pointerId,start:e.clientY,base:y,samples:[{y:e.clientY,t:e.timeStamp}],moved:false,released:false};
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove',e=>{
      if(!drag||drag.released||e.pointerId!==drag.id)return;
      const dy=e.clientY-drag.start;if(!drag.moved&&Math.abs(dy)<10)return;
      drag.moved=true;suppressClick=true;
      const raw=drag.base+dy;y=raw>=0?raw:(raw*120*.55)/(120+.55*Math.abs(raw));paint();
      drag.samples.push({y:e.clientY,t:e.timeStamp});drag.samples=drag.samples.filter(s=>e.timeStamp-s.t<=80);
    });
    const release=(e,cancelled=false)=>{
      if(!drag||drag.released||e.pointerId!==drag.id)return;
      const moved=drag.moved,samples=drag.samples,first=samples[0],lastSample=samples.at(-1);
      const velocity=first&&lastSample&&e.timeStamp-lastSample.t<80?(lastSample.y-first.y)/Math.max(lastSample.t-first.t,1)*1000:0;
      drag.released=true;
      if(!moved){drag=null;spring(0,0);return;}
      const height=dialog.getBoundingClientRect().height;
      const projection=y+(velocity/1000)*.998/(1-.998);
      closing=!cancelled&&y>10&&(y>height*.3||projection>height*.5);
      spring(closing?height+24:0,cancelled?0:velocity);
    };
    grip.addEventListener('pointerup',e=>release(e));
    grip.addEventListener('pointercancel',e=>release(e,true));
    grip.addEventListener('lostpointercapture',e=>release(e,true));
    reduce.addEventListener('change',()=>{if(reduce.matches&&dialog.open)finish();});
    mobile.addEventListener('change',()=>{if(dialog.open){if(closing)finish();else reset();}});
  });
})();


/* Only the trusted same-origin review parent may fill a draft. It never auto-executes analysis. */
(()=>{if(window.parent===window)return;let demoId=null,importing=false;
const tell=message=>parent.postMessage({type:'review-status',message},location.origin);
const ids={input:'input',outputs:'output-options',data:'source',result:'result-content',account:'connection'};
window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent)return;const m=e.data||{};
try{
if(m.type==='review-focus'){const id=ids[m.key];if(!id)return;if(['input','outputs','data'].includes(m.key))home();const el=document.getElementById(id)||document.querySelector('.output-selector');if(el){el.scrollIntoView({block:'center',behavior:'instant'});el.focus?.();el.style.outline='2px solid #b7caff';setTimeout(()=>el.style.outline='',1500)}return}
if(!['review-import-demo','review-example'].includes(m.type))return;
if(busy||importing){tell('当前任务仍在运行，请等待或取消后继续。');return}
const info=await(await fetch('/review-assets/demo.json')).json();
if(m.type==='review-import-demo'){
 if(demoId){try{await api('/datasets/'+demoId);await select(demoId);tell('已切换到本次导入的示范数据，可选择右侧问题。');return}catch{demoId=null}}
 importing=true;tell('正在浏览器内导入360笔示范订单…');
 const blob=await(await fetch('/review-assets/demo-orders.csv')).blob();const form=new FormData();form.append('file',blob,info.name);
 const d=await(await api('/datasets',{method:'POST',body:form})).json();
 try{await api('/datasets/'+d.id+'/confirm',{method:'POST',body:JSON.stringify({types:info.types})})}catch(err){tell('文件已上传但类型确认失败，可在数据管理中重试或删除。');throw err}
 demoId=d.id;await select(d.id);modeSet('question');notice('已导入360笔合成订单。选择右侧问题，或自由提问。');tell('示范数据已就绪。选择一个问题，然后在产品中点击开始分析。');
}else{
 const ex=info.examples.find(x=>x.id===m.id);if(!ex||!['question','sql'].includes(m.mode))return;
 if(!demoId||current?.id!==demoId){tell('请先导入或切换到本次示范数据，避免把示例问题用于其他文件。');return}
 home();modeSet(m.mode);$('input').value=ex[m.mode==='sql'?'sql':'question'];document.querySelectorAll('[name=output]').forEach(c=>c.checked=ex.outputs.includes(c.value));updateOutputs();$('input').focus();notice(m.mode==='sql'?'已填入示例 SQL，请检查后执行。':'已填入问题，请检查输出选项后开始分析。');tell(m.mode==='sql'?'SQL已填入，不调用模型；请在产品中主动执行。':'问题已填入。执行时会调用DeepSeek并计入模型额度。');
}
}catch(err){tell(err.message||'操作失败，请检查数据状态后重试。')}finally{importing=false}
});
for(const [id,key] of [['input','input'],['source','data'],['open-settings','account'],['result-content','result']])document.getElementById(id)?.addEventListener('focusin',()=>parent.postMessage({type:'review-selection',key},location.origin));
parent.postMessage({type:'review-ready'},location.origin);
})();
