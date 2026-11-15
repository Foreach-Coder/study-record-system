DuBridge.methods.listGroupTodos=async(ctx,p,r)=>{
  const boards=DuBridge.array(await ctx.call('ding','getBoardList',[p.cid]));
  const boardSeen=new Set(),taskSeen=new Set();r.boards=[];let failed=false;
  for(const board of boards){
    const id=DuBridge.id(board.boardId);
    if(String(board.cid)!==p.cid)DuBridge.raise('IDENTITY_MISMATCH');
    if(boardSeen.has(id))continue;boardSeen.add(id);
    const state={board,success:false,complete:false,pages:0,taskIds:[]};r.boards.push(state);
    let cursor='0';const seen=new Set();
    try{
      while(r.pages<p.pageLimit){
        state.continuation={cursor};
        const tasks=DuBridge.array(await ctx.call('ding','listTasksByBoardId',[id,p.cid,cursor,50]));r.pages++;state.pages++;
        let added=0;
        for(const task of tasks){
          const tid=DuBridge.id(task.dingId??task.id);
          if(task.cid!=null&&String(task.cid)!==p.cid)DuBridge.raise('IDENTITY_MISMATCH');
          if(!taskSeen.has(tid)){DuBridge.append(r,task,p.maxItems);taskSeen.add(tid);}
          if(!seen.has(tid)){seen.add(tid);state.taskIds.push(tid);added++;}
        }
        if(tasks.length<50){DuBridge.done(state);break;}
        if(!added)DuBridge.raise('CURSOR_STALLED');
        const next=String(DuBridge.time(tasks[tasks.length-1].createAt));
        if(next===cursor)DuBridge.raise('CURSOR_STALLED');
        cursor=next;
      }
      if(!state.complete)DuBridge.stop(state,'PAGE_LIMIT',{cursor});
    }catch(e){DuBridge.stop(state,e.bridgeCode||'INVALID_RESPONSE');}
    if(!state.complete)failed=true;
  }
  return failed?DuBridge.stop(r,'PARTIAL_BOARDS'):DuBridge.done(r,'boards_exhausted');
};
