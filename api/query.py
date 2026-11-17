import os,json,time,hashlib,urllib.request
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from api.safety import validate, repair_preserves_intent

def request_json(url,body,token):
    req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=18) as r:return json.load(r)

def reserve(ip):
    url=os.environ.get('UPSTASH_REDIS_REST_URL',''); token=os.environ.get('UPSTASH_REDIS_REST_TOKEN','');salt=os.environ.get('QUOTA_SALT','')
    if not url.startswith('https://') or not token or len(salt)<32:raise ValueError('站点额度服务尚未配置，请联系站点管理员')
    ident=hashlib.sha256((salt+ip).encode()).hexdigest()
    # Atomic admission across all function instances; failures still count.
    script="""for i=1,3 do if tonumber(redis.call('GET',KEYS[i]) or '0')>=tonumber(ARGV[i]) then return 0 end end
    for i=1,3 do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('EXPIRE',KEYS[i],ARGV[i+3]) end end return 1"""
    keys=['zhishu:minute:'+ident+':'+str(int(time.time()/60)), 'zhishu:day:'+ident+':'+time.strftime('%Y%m%d',time.gmtime()),'zhishu:month:'+time.strftime('%Y%m',time.gmtime())]
    result=request_json(url,['EVAL',script,'3',*keys,'5','30',str(int(os.environ.get('MONTHLY_CALL_LIMIT','1000'))),'120','172800','2764800'],token)
    if result.get('result')!=1:raise ValueError('当前调用额度已用完，请稍后再试；仍可手写 SQL 分析')

def process(data,ip):
    if data.get('mode')=='validate':return {'sql':validate(data.get('sql',''))}
    q=data.get('question','');schema=data.get('schema',[])
    if not isinstance(q,str) or not 1<=len(q)<=2000 or not isinstance(schema,list) or not 1<=len(schema)<=200:raise ValueError('问题或字段数量超出限制')
    clean=[]
    for c in schema:
        if not isinstance(c,dict) or not isinstance(c.get('name'),str) or not 1<=len(c['name'])<=200 or c.get('type') not in ['VARCHAR','DOUBLE','BIGINT','DATE','BOOLEAN','DECIMAL(18,2)']:raise ValueError('字段格式无效')
        clean.append({'name':c['name'],'type':c['type']})
    key=os.environ.get('DEEPSEEK_API_KEY');model=os.environ.get('DEEPSEEK_MODEL')
    if not key or not model:raise ValueError('自然语言服务尚未配置；可以先使用 SQL 编辑器体验本地分析')
    reserve(ip)
    payload={'question':q,'schema':clean}
    repair=data.get('repair')
    if repair:
        if repair.get('code') not in ['BINDER','PARSER']:raise ValueError('该错误不支持自动修复')
        payload['repair']={'sql':validate(repair.get('sql','')),'code':repair['code']}
    result=request_json('https://api.deepseek.com/chat/completions',{'model':model,'messages':[{'role':'system','content':Path(__file__).with_name('prompt.txt').read_text()},{'role':'user','content':json.dumps(payload,ensure_ascii=False)}],'response_format':{'type':'json_object'},'max_tokens':2500,'stream':False},key)
    plan=json.loads(result['choices'][0]['message']['content'])
    if plan.get('action') not in ['QUERY','CLARIFY','REFUSE']:raise ValueError('模型返回格式异常，请重试')
    if not isinstance(plan.get('message'),str) or len(plan['message'])>1000:raise ValueError('模型返回格式异常')
    if plan['action']=='QUERY':
        plan['sql']=validate(plan.get('sql',''))
        if repair and not repair_preserves_intent(repair['sql'],plan['sql'],[c['name'] for c in clean]):raise ValueError('无法在保持原意的前提下修复，请修改问题')
    else:plan['sql']=None
    return plan

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=60000:raise ValueError('请求过大或为空')
            data=json.loads(self.rfile.read(n)); result=process(data,self.headers.get('x-vercel-forwarded-for','local').split(',')[0]); status=200
        except ValueError as e: result={'error':str(e)};status=400
        except Exception:result={'error':'服务暂时不可用，请稍后再试'};status=503
        raw=json.dumps(result,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
