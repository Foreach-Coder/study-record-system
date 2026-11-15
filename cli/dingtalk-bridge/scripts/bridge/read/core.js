// These files execute in the selected DingTalk CEF page, not in Node.js.
const DuBridge = {methods:Object.create(null)};
DuBridge.raise = code => {const e=new Error(code);e.bridgeCode=code;throw e;};
DuBridge.array = value => {if(!Array.isArray(value))DuBridge.raise('INVALID_RESPONSE');return value;};
DuBridge.id = value => {if(!/^[0-9]{1,32}$/.test(String(value)))DuBridge.raise('INVALID_RESPONSE');return String(value);};
DuBridge.time = value => {const n=Number(value);if(!Number.isSafeInteger(n)||n<0)DuBridge.raise('INVALID_RESPONSE');return n;};
DuBridge.stop = (r,code,continuation) => {r.success=false;r.complete=false;r.error={code};if(continuation)r.continuation=continuation;return r;};
DuBridge.done = (r,reason) => {r.success=true;r.complete=true;if(reason)r.reason=reason;return r;};
DuBridge.append = (r,item,maxItems) => {if(r.items.length>=maxItems)DuBridge.raise('ITEM_LIMIT');r.items.push(item);};
DuBridge.context = timeoutMs => {
  const deadline=Date.now()+timeoutMs,roles=new Map();
  const call=(namespace,method,args)=>new Promise((resolve,reject)=>{
    const remaining=deadline-Date.now();
    const error=code=>{const e=new Error(code);e.bridgeCode=code;return e;};
    if(remaining<=0)return reject(error('TIME_LIMIT'));
    let settled=false;
    const timer=setTimeout(()=>{settled=true;reject(error(remaining<=8000?'TIME_LIMIT':'NATIVE_TIMEOUT'));},Math.min(remaining,8000));
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(err)reject(error('NATIVE_ERROR'));else resolve(value);};
    try{
      if(!dingtalk[namespace]||typeof dingtalk[namespace][method]!=='function'){clearTimeout(timer);settled=true;return reject(error('UNSUPPORTED_CLIENT_METHOD'));}
      dingtalk[namespace][method](...args,finish);
    }catch(e){finish(true);}
  });
  const rpc=async(path,body)=>{
    let value=await call('net','rpc',[path,{},JSON.stringify(body)]);
    if(typeof value==='string'){try{value=JSON.parse(value);}catch(e){DuBridge.raise('INVALID_RESPONSE');}}
    if(!value||value.success!==true)DuBridge.raise('BUSINESS_ERROR');
    if(value.result==null)DuBridge.raise('INVALID_RESPONSE');
    return value.result;
  };
  const role=async corpId=>{
    if(!roles.has(corpId))roles.set(corpId,await rpc('/r/Adaptor/OrgEduQueryI/findOrgRole',[corpId]));
    return roles.get(corpId);
  };
  return {deadline,call,rpc,role};
};
