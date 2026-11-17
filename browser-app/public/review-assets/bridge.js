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
