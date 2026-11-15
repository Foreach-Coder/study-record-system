DuBridge.message = (value,cid,mid) => {
  if(!value||!value.baseMessage)DuBridge.raise('MESSAGE_NOT_FOUND');
  const base=value.baseMessage;
  if(String(base.conversationId)!==cid||(mid&&String(base.messageId)!==mid))DuBridge.raise('IDENTITY_MISMATCH');
  DuBridge.id(base.messageId);return value;
};
DuBridge.methods.getMessageById=async(ctx,p,r)=>{
  r.message=DuBridge.message(await ctx.call('message','getMessageById',[p.cid,p.messageId]),p.cid,p.messageId);
  return DuBridge.done(r);
};
DuBridge.methods.getMessagesById=async(ctx,p,r)=>{
  r.missingIds=[];r.failures=[];
  for(const mid of new Set(p.messageIds)){
    try{DuBridge.append(r,DuBridge.message(await ctx.call('message','getMessageById',[p.cid,mid]),p.cid,mid),p.maxItems);}
    catch(e){r.missingIds.push(mid);r.failures.push({messageId:mid,code:e.bridgeCode||'INVALID_RESPONSE'});}
  }
  return r.missingIds.length?DuBridge.stop(r,'PARTIAL_MESSAGES'):DuBridge.done(r);
};
DuBridge.methods.getConversation=async(ctx,p,r)=>{
  const value=await ctx.call('conversation','getBaseConversation',[p.cid]);
  if(!value||String(value.conversationId)!==p.cid)DuBridge.raise('IDENTITY_MISMATCH');
  r.conversation=value;return DuBridge.done(r);
};
DuBridge.methods.searchGroups=async(ctx,p,r)=>{
  const seen=new Set();let offset=0;
  for(let page=0;page<p.pageLimit;page++){
    r.continuation={offset};
    const values=DuBridge.array(await ctx.call('search','searchGroup',[p.query,offset,p.pageSize,{}]));r.pages++;
    let added=0;
    for(const value of values){const id=DuBridge.id(value.conversationId);if(seen.has(id))continue;DuBridge.append(r,value,p.maxItems);seen.add(id);added++;}
    if(values.length===0||values.length<p.pageSize)return DuBridge.done(r,'client_exhausted');
    if(added===0)return DuBridge.stop(r,'CURSOR_STALLED');
    offset+=values.length;
  }
  return DuBridge.stop(r,'PAGE_LIMIT',{offset});
};
DuBridge.methods.listMessages=async(ctx,p,r)=>{
  r.scope='client-visible-history';r.serverHistoryVerified=false;
  if(p.startMs===p.endMs)return DuBridge.done(r,'empty_interval');
  const seen=new Set();let cursor=p.endMs,size=p.pageSize;
  for(let page=0;page<p.pageLimit;page++){
    r.continuation={cursor:String(cursor),pageSize:size};
    const values=DuBridge.array(await ctx.call('message','listMessage',[p.cid,String(cursor),size,false,{isFirstPull:false}]));r.pages++;
    // Validate the entire page before exposing any message from it.
    let previous=Infinity;
    for(const m of values){DuBridge.message(m,p.cid);const time=DuBridge.time(m.baseMessage.createdAt);if(time>cursor||time>previous)DuBridge.raise('INVALID_MESSAGE_ORDER');previous=time;}
    if(values.length===0)return DuBridge.done(r,'client_exhausted');
    for(const m of values){
      const id=String(m.baseMessage.messageId),time=Number(m.baseMessage.createdAt);
      if(time>=p.startMs&&time<p.endMs&&!seen.has(id)){DuBridge.append(r,m,p.maxItems);seen.add(id);}
    }
    const oldest=Number(values[values.length-1].baseMessage.createdAt);
    if(oldest<p.startMs)return DuBridge.done(r,'crossed_start');
    if(values.length<size)return DuBridge.done(r,'client_exhausted');
    if(oldest===cursor){
      if(size>=500)return DuBridge.stop(r,'CURSOR_STALLED');
      size=Math.min(500,size*2);
    }else{cursor=oldest;size=p.pageSize;}
  }
  return DuBridge.stop(r,'PAGE_LIMIT',{cursor:String(cursor),pageSize:size});
};
