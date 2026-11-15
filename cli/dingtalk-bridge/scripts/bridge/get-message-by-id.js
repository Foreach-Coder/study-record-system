'use strict';
const request=JSON.parse(__DU_REQUEST_JSON_STRING__);
const cef=Process.getModuleByName('libcef.dll');
const cefEnd=cef.base.add(cef.size);
function inCef(p){try{return p.compare(cef.base)>=0&&p.compare(cefEnd)<0;}catch(e){return false;}}
const keep=[];
let completed=false;
let finalValue=null;

function utf8Base64(text){
  const binary=unescape(encodeURIComponent(text));
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out='';
  for(let i=0;i<binary.length;i+=3){
    const a=binary.charCodeAt(i),b=i+1<binary.length?binary.charCodeAt(i+1):0,c=i+2<binary.length?binary.charCodeAt(i+2):0;
    const n=(a<<16)|(b<<8)|c;
    out+=chars[(n>>>18)&63]+chars[(n>>>12)&63]+(i+1<binary.length?chars[(n>>>6)&63]:'=')+(i+2<binary.length?chars[n&63]:'=');
  }
  return out;
}
function writeResult(){console.log('DU_BRIDGE_RESULT:'+utf8Base64(JSON.stringify(finalValue)));}
function emit(value){if(completed)return;completed=true;finalValue=value;cleanup();}
function callback(fn,ret,args){const value=new NativeCallback(fn,ret,args);keep.push(value);return value;}
function refObject(size){
  const p=Memory.alloc(size);p.writeByteArray(new Uint8Array(size));p.writeU64(size);let refs=1;
  p.add(8).writePointer(callback(()=>{refs++;},'void',['pointer']));
  p.add(16).writePointer(callback(()=>{refs--;return refs===0?1:0;},'int',['pointer']));
  p.add(24).writePointer(callback(()=>refs===1?1:0,'int',['pointer']));
  p.add(32).writePointer(callback(()=>refs>0?1:0,'int',['pointer']));keep.push(p);return p;
}
function release(p){if(p&&!p.isNull())new NativeFunction(p.add(16).readPointer(),'int',['pointer'])(p);}
const getBrowser=new NativeFunction(cef.getExportByName('cef_browser_host_get_browser_by_identifier'),'pointer',['int']);
const postTask=new NativeFunction(cef.getExportByName('cef_post_task'),'int',['int','pointer']);
function ui(fn){
  const task=refObject(48);task.add(40).writePointer(callback(fn,'void',['pointer']));
  const accepted=postTask(0,task);release(task);return accepted;
}
const entries=[];const candidates=new Map();let pending=0;let selected=false;let discoveryComplete=false;
// CEF retains the DevTools connection between CLI attachments. Never reuse a
// fixed request id while a previous request can still be known to that agent.
const requestBase=1+Math.floor(Math.random()*4000000)*512;
const messageRequestId=requestBase+257;
let cleanupStarted=false;
function cleanup(){
  if(cleanupStarted)return;cleanupStarted=true;
  ui(()=>{
    for(const e of entries){release(e.registration);release(e.host);release(e.browser);}
    release(observer);
    setTimeout(writeResult,0);
  });
}
function execute(entry,id,expression){
  const body=JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}});
  const raw=Memory.allocUtf8String(body);keep.push(raw);
  return new NativeFunction(entry.host.add(272).readPointer(),'int',['pointer','pointer','uint64'])(entry.host,raw,unescape(encodeURIComponent(body)).length);
}
const observer=refObject(80);
observer.add(40).writePointer(callback(()=>0,'int',['pointer','pointer','pointer','uint64']));
observer.add(48).writePointer(callback((self,browser,id,success,result,length)=>{
  try{
    const protocol=JSON.parse(result.readUtf8String(Number(length)));
    if(id===messageRequestId){
      const value=protocol&&protocol.result&&protocol.result.value;
      if(!success||typeof value!=='string')return emit({success:false,error:{code:'GET_MESSAGE_FAILED'}});
      return emit(JSON.parse(value));
    }
    const entry=candidates.get(id);if(!entry)return;candidates.delete(id);
    pending--;
    const raw=protocol&&protocol.result&&protocol.result.value;
    let available=false;try{available=JSON.parse(raw).available===true}catch(e){}
    if(available&&!selected){
      selected=true;
      const cid=JSON.stringify(request.cid),mid=JSON.stringify(request.messageId);
      // readExpression is assembled from shipped reader modules, never a CLI input.
      const expression=request.readExpression||`new Promise(resolve=>dingtalk.message.getMessageById(${cid},${mid},(err,message)=>resolve(JSON.stringify(err?{success:false,error:{code:'NATIVE_ERROR'}}:{success:true,message}))))`;
      if(!execute(entry,messageRequestId,expression))emit({success:false,error:{code:'DISPATCH_FAILED'}});
    }else if(discoveryComplete&&pending===0&&!selected)emit({success:false,error:{code:'BRIDGE_PAGE_NOT_FOUND',browserIds:entries.map(e=>e.browserId)}});
  }catch(e){emit({success:false,error:{code:'INVALID_CEF_RESULT'}});}
},'void',['pointer','pointer','int','int','pointer','uint64']));
observer.add(56).writePointer(callback(()=>{},'void',['pointer','pointer','pointer','pointer','uint64']));
observer.add(64).writePointer(callback(()=>{},'void',['pointer','pointer']));
observer.add(72).writePointer(callback(()=>{},'void',['pointer','pointer']));

const versions=Array.from({length:8},(_,i)=>new NativeFunction(cef.getExportByName('cef_version_info'),'int',['int'])(i));
const knownCef=['[133,0,0,1526090,133,0,6943,142]','[133,0,0,1526100,133,0,6943,142]'];
if(knownCef.indexOf(JSON.stringify(versions))<0)emit({success:false,error:{code:'UNSUPPORTED_CEF',versions}});

if(!completed){
  const diag={seen:0,type:[],hostType:[],slot272:[],slot288:[]};
  const accepted=ui(()=>{
    for(let id=1;id<=256;id++){
      const browser=getBrowser(id);if(browser.isNull())continue;
      diag.seen++;
      if(diag.type.length<8)diag.type.push(browser.readU64().toNumber());
      if(browser.readU64().toNumber()!==280){release(browser);continue;}
      const host=new NativeFunction(browser.add(48).readPointer(),'pointer',['pointer'])(browser);
      if(host.isNull()){release(browser);continue;}
      if(diag.hostType.length<8)diag.hostType.push(host.readU64().toNumber());
      if(diag.slot272.length<8)diag.slot272.push(host.add(272).readPointer().toString());
      if(diag.slot288.length<8)diag.slot288.push(host.add(288).readPointer().toString());
      if(host.readU64().toNumber()!==640||!inCef(host.add(272).readPointer())||!inCef(host.add(288).readPointer())){release(host);release(browser);continue;}
      const registration=new NativeFunction(host.add(288).readPointer(),'pointer',['pointer','pointer'])(host,observer);
      const entry={browser,host,registration,browserId:id};entries.push(entry);const requestId=requestBase+id;candidates.set(requestId,entry);pending++;
      if(!execute(entry,requestId,"JSON.stringify({available:location.protocol==='app:'&&location.hostname==='desktop.dingtalk.com'&&typeof dingtalk==='object'&&dingtalk.message&&typeof dingtalk.message.getMessageById==='function'})")){pending--;}
    }
    discoveryComplete=true;
    if(pending===0&&!selected)emit({success:false,error:{code:entries.length?'BRIDGE_PAGE_NOT_FOUND':'NO_CEF_BROWSER',browserIds:entries.map(e=>e.browserId),diag,base:cef.base.add(0x24e5410).toString(),base2:cef.base.add(0x24e5660).toString()}});
  });
  if(!accepted)emit({success:false,error:{code:'UI_DISPATCH_FAILED'}});
  else setTimeout(()=>emit({success:false,error:{code:'TIMEOUT'}}),request.timeoutMs||15000);
}
