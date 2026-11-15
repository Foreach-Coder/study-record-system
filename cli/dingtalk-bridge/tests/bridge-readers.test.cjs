// Developer-only Node tests; production execution is inside DingTalk CEF.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function reader(native){
  const ctx=vm.createContext({dingtalk:native,setTimeout,clearTimeout,Date});
  for(const name of ['core','messages','education','todos','dispatch']){
    const file=path.join(__dirname,'../scripts/bridge/read',name+'.js');
    if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  }
  assert.equal(vm.runInContext('typeof DuBridge!=="undefined"&&typeof DuBridge.run',ctx),'function','batch reader has not been implemented');
  return async requests=>JSON.parse(JSON.stringify(await vm.runInContext('DuBridge.run',ctx)(requests,10000)));
}
const msg=(id,time,cid='123')=>({baseMessage:{messageId:id,conversationId:cid,createdAt:String(time),content:{attachments:[{extension:{payloadV2:'{"text":"完整正文"}'}}]}}});
const list=(extra={})=>({method:'listMessages',params:{cid:'123',startMs:100,endMs:200,pageSize:2,pageLimit:20,maxItems:50,...extra}});
test('inclusive pages deduplicate, preserve full messages and exclude end boundary',async()=>{
  const pages=[[msg('4',200),msg('3',180)],[msg('3',180),msg('2',120)],[msg('2',120),msg('1',90)]];
  const run=reader({message:{listMessage(cid,cursor,size,forward,options,cb){cb(null,pages.shift());}}});
  const r=(await run([list()])).results[0];
  assert.equal(r.success,true);assert.equal(r.complete,true);
  assert.deepEqual(r.items.map(m=>m.baseMessage.messageId),['3','2']);
  assert.equal(r.items[0].baseMessage.content.attachments[0].extension.payloadV2,'{"text":"完整正文"}');
  assert.equal(r.serverHistoryVerified,false);
});
test('same timestamp overflow widens the window without skipping a millisecond',async()=>{
  const cursors=[];
  const run=reader({message:{listMessage(cid,cursor,size,f,o,cb){cursors.push(cursor);cb(null,size===2?[msg('3',150),msg('2',150)]:[msg('3',150),msg('2',150),msg('1',150),msg('0',90)]);}}});
  const r=(await run([list()])).results[0];
  assert.equal(r.complete,true);assert.deepEqual(r.items.map(m=>m.baseMessage.messageId),['3','2','1']);
  assert.ok(!cursors.includes('149'));
});
test('page budget and an RPC failure keep partial items and never claim completion',async()=>{
  let count=0;
  const run=reader({message:{listMessage(cid,cursor,size,f,o,cb){count++;if(count===1)cb(null,[msg('3',180),msg('2',150)]);else cb({message:'SYNTHETIC_SECRET'},null);}}});
  const limited=(await run([list({pageLimit:1})])).results[0];
  assert.equal(limited.complete,false);assert.equal(limited.error.code,'PAGE_LIMIT');assert.equal(limited.items.length,2);
  count=0;const failed=(await run([list()])).results[0];
  assert.equal(failed.complete,false);assert.equal(failed.items.length,2);assert.ok(!JSON.stringify(failed).includes('SYNTHETIC_SECRET'));
});
test('foreign conversation responses and malformed pages fail closed',async()=>{
  const run=reader({message:{listMessage(cid,cursor,size,f,o,cb){cb(null,[msg('1',150,'999')]);}}});
  const r=(await run([list()])).results[0];assert.equal(r.complete,false);assert.equal(r.error.code,'IDENTITY_MISMATCH');assert.equal(r.items.length,0);
});
test('batch continues after a missing message and deduplicates requested message IDs',async()=>{
  const calls=[];
  const run=reader({message:{getMessageById(cid,id,cb){calls.push(id);if(id==='8')cb(null,null);else cb(null,msg(id,150));}}});
  const result=await run([{method:'getMessagesById',params:{cid:'123',messageIds:['8','9','9'],maxItems:10}},{method:'getMessageById',params:{cid:'123',messageId:'7'}}]);
  assert.equal(result.success,false);assert.equal(result.results[0].complete,false);
  assert.deepEqual(result.results[0].items.map(m=>m.baseMessage.messageId),['9']);assert.deepEqual(result.results[0].missingIds,['8']);
  assert.equal(result.results[1].message.baseMessage.messageId,'7');assert.deepEqual(calls,['8','9','7']);
});
function eduNative(pages,role='guardian'){
  return {net:{rpc(uri,headers,body,cb){
    const args=JSON.parse(body);
    if(uri.endsWith('/findOrgRole'))return cb(null,JSON.stringify({success:true,result:{userRole:role,guardian:role==='guardian',teacher:role==='teacher'}}));
    const p=args[0];assert.equal(p.corpId,'ding-school');
    if(uri.includes('findHomeworkByFamilyUserId'))assert.equal(p.userRole,'guardian');
    const result=pages.shift();cb(null,JSON.stringify({success:true,result}));
  }}};
}
const homework=(id,student='42')=>({id,corpId:'ding-school',classId:'12',studentId:student,hwTitle:'作业',hwContent:'多项要求\n完整内容',endTime:200});
const hwRequest={method:'listHomework',params:{corpId:'ding-school',classId:'12',studentId:'42',role:'guardian',status:'ALL',pageLimit:10,maxItems:100}};
test('education paging deduplicates records, filters children and accepts the actual null terminal page',async()=>{
  const run=reader(eduNative([{homeworkDTOList:[homework(1),homework(1),homework(2,'99')],page:1,hasMore:true},{homeworkDTOList:[homework(3)],page:2,hasMore:true},{homeworkDTOList:null,page:0,hasMore:false}]));
  const r=(await run([hwRequest])).results[0];assert.equal(r.success,true);assert.equal(r.complete,true);assert.deepEqual(r.items.map(h=>h.id),[1,3]);assert.equal(r.items[0].hwContent,'多项要求\n完整内容');
});
test('education pagination that repeats a full page is incomplete',async()=>{
  const run=reader(eduNative([{homeworkDTOList:[homework(1)],page:1,hasMore:true},{homeworkDTOList:[homework(1)],page:2,hasMore:true}]));
  const r=(await run([hwRequest])).results[0];assert.equal(r.success,false);assert.equal(r.error.code,'CURSOR_STALLED');assert.equal(r.items.length,1);
});
test('wrong education role refuses the list instead of silently using another identity',async()=>{
  const r=(await reader(eduNative([],'teacher'))([hwRequest])).results[0];assert.equal(r.success,false);assert.equal(r.error.code,'ROLE_MISMATCH');
});
test('notice paging keeps school-wide notices and filters a different class',async()=>{
  const notices=[{id:1,classId:'12',studentId:'42'},{id:2},{id:3,classId:'99'},{id:4,classId:'12',studentId:'99'},{id:5,classId:'12',studentId:'42'}];
  const run=reader(eduNative([{list:notices,page:1},{list:null,page:0}]));
  const r=(await run([{method:'listNotices',params:{corpId:'ding-school',classId:'12',studentId:'42',status:'ALL',pageLimit:10,maxItems:100}}])).results[0];
  assert.equal(r.complete,true);assert.deepEqual(r.items.map(n=>n.id),[1,2,5]);
});
test('group todo board failure preserves successful board data and rejects false completion',async()=>{
  const run=reader({ding:{getBoardList(cid,cb){cb(null,[{cid,boardId:'1'},{cid,boardId:'2'}]);},listTasksByBoardId(board,cid,cursor,size,cb){if(board==='2')cb({code:500},null);else cb(null,[{dingId:'10',createAt:'120'}]);}}});
  const r=(await run([{method:'listGroupTodos',params:{cid:'123',pageLimit:10,maxItems:100}}])).results[0];assert.equal(r.success,false);assert.equal(r.complete,false);assert.equal(r.items.length,1);assert.equal(r.boards.length,2);
});
test('duplicate search pages stop with retained groups instead of looping',async()=>{
  const run=reader({search:{searchGroup(q,offset,size,options,cb){cb(null,[{conversationId:'1'},{conversationId:'1'}]);}}});
  const r=(await run([{method:'searchGroups',params:{query:'群',pageSize:2,pageLimit:10,maxItems:100}}])).results[0];assert.equal(r.complete,false);assert.equal(r.error.code,'CURSOR_STALLED');assert.equal(r.items.length,1);
});
test('malformed success payload is not mistaken for an empty education list',async()=>{
  const r=(await reader(eduNative([{}]))([hwRequest])).results[0];
  assert.equal(r.success,false);assert.equal(r.complete,false);assert.equal(r.error.code,'INVALID_RESPONSE');
});
test('exact item budget returns partial data and replay position without dropping the page silently',async()=>{
  const run=reader({message:{listMessage(cid,cursor,size,f,o,cb){cb(null,[msg('3',180),msg('2',150)]);}}});
  const r=(await run([list({maxItems:1})])).results[0];
  assert.equal(r.complete,false);assert.equal(r.error.code,'ITEM_LIMIT');assert.deepEqual(r.items.map(m=>m.baseMessage.messageId),['3']);assert.equal(r.continuation.cursor,'200');
});
test('teacher history uses the verified teacher endpoint without a guardian student scope',async()=>{
  const native={net:{rpc(uri,h,body,cb){
    if(uri.endsWith('/findOrgRole'))return cb(null,JSON.stringify({success:true,result:{userRole:'teacher'}}));
    assert.equal(uri,'/r/Adaptor/OrgEduQueryI/findHomeworkByTeacher');
    const p=JSON.parse(body)[0];assert.equal(p.userRole,'teacher');assert.equal(p.classId,12);
    cb(null,JSON.stringify({success:true,result:{homeworkDTOList:[homework(5)],page:1,hasMore:false}}));
  }}};
  const r=(await reader(native)([{method:'listHomework',params:{corpId:'ding-school',classId:'12',role:'teacher',status:'ALL',pageLimit:10,maxItems:50}}])).results[0];
  assert.equal(r.complete,true);assert.equal(r.items[0].id,5);
});
test('detail identity mismatch cannot escape as a successful homework response',async()=>{
  const r=(await reader(eduNative([homework(5,'99')]))([{method:'getHomework',params:{corpId:'ding-school',classId:'12',studentId:'42',homeworkId:'5'}}])).results[0];
  assert.equal(r.success,false);assert.equal(r.error.code,'IDENTITY_MISMATCH');assert.equal(r.homework,undefined);
});
test('zero overall time budget yields explicit results for every unread operation',async()=>{
  const ctx=vm.createContext({dingtalk:{},setTimeout,clearTimeout,Date});
  for(const name of ['core','messages','education','todos','dispatch'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/bridge/read',name+'.js'),'utf8'),ctx);
  const r=await vm.runInContext('DuBridge.run',ctx)([list(),list()],0);
  assert.equal(r.success,false);assert.equal(r.results.length,2);assert.ok(r.results.every(x=>x.error.code==='TIME_LIMIT'&&!x.complete));
});
test('todo pagination removes the inclusive anchor while preserving each board membership',async()=>{
  const tasks=Array.from({length:50},(_,i)=>({dingId:String(i+1),createAt:String(200-i)}));
  const run=reader({ding:{
    getBoardList(cid,cb){cb(null,[{cid,boardId:'1'},{cid,boardId:'2'}]);},
    listTasksByBoardId(board,cid,cursor,size,cb){
      if(board==='2')return cb(null,[{dingId:'51',createAt:'149'}]);
      cb(null,cursor==='0'?tasks:[tasks[49],{dingId:'51',createAt:'149'}]);
    }
  }});
  const r=(await run([{method:'listGroupTodos',params:{cid:'123',pageLimit:10,maxItems:100}}])).results[0];
  assert.equal(r.complete,true);assert.equal(r.items.length,51);assert.equal(r.pages,3);
  assert.equal(r.boards[0].taskIds.length,51);assert.deepEqual(r.boards[1].taskIds,['51']);
});
