DuBridge.run=async(requests,timeoutMs)=>{
  const ctx=DuBridge.context(timeoutMs),results=[];
  for(let index=0;index<requests.length;index++){
    const request=requests[index],r={index,method:request.method,success:false,complete:false,pages:0,items:[]};
    try{
      if(Date.now()>=ctx.deadline)DuBridge.raise('TIME_LIMIT');
      if(!Object.prototype.hasOwnProperty.call(DuBridge.methods,request.method))DuBridge.raise('UNSUPPORTED_METHOD');
      await DuBridge.methods[request.method](ctx,request.params,r);
    }catch(e){DuBridge.stop(r,e.bridgeCode||'INVALID_RESPONSE');}
    r.count=r.items.length;results.push(r);
  }
  return {success:results.every(r=>r.success&&r.complete),results};
};
