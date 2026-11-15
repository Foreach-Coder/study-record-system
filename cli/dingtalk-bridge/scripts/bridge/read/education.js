DuBridge.schoolScope=(value,p,allowSchoolWide=false)=>{
  if(value.corpId&&String(value.corpId)!==p.corpId)DuBridge.raise('IDENTITY_MISMATCH');
  const specified=id=>id!=null&&String(id)!==''&&String(id)!=='0';
  for(const field of ['classId','studentId']){
    if(!p[field])continue;
    if(!specified(value[field])){if(allowSchoolWide)continue;return false;}
    if(String(value[field])!==p[field])return false;
  }
  return true;
};
DuBridge.requireRole=async(ctx,p,expected)=>{
  const role=await ctx.role(p.corpId);
  if(role.userRole!==expected&&role[expected]!==true)DuBridge.raise('ROLE_MISMATCH');
  return role;
};
DuBridge.methods.getEducationRoles=async(ctx,p,r)=>{
  r.orgRole=await ctx.role(p.corpId);
  r.classRoles=DuBridge.array(await ctx.rpc('/r/Adaptor/EClassI/getClassRoles',[p.corpId,Number(p.classId)]));
  return DuBridge.done(r);
};
DuBridge.educationList=async(ctx,p,r,notice)=>{
  const role=notice?'guardian':p.role;
  await DuBridge.requireRole(ctx,p,role);
  const path=notice?'/r/Adaptor/OrgNoticeQueryI/findNoticeByFamilyUserId':
    '/r/Adaptor/OrgEduQueryI/'+(role==='guardian'?'findHomeworkByFamilyUserId':'findHomeworkByTeacher');
  const field=notice?'list':'homeworkDTOList',seen=new Set();
  let page=1,cursor=null;r.filteredCount=0;
  for(let attempt=0;attempt<p.pageLimit;attempt++){
    r.continuation={page,cursor};
    const body={corpId:p.corpId,status:p.status,page,pageSize:5,userRole:role};
    if(!notice){body.classId=Number(p.classId);body.cursor=cursor;}
    else if(p.status==='UN_HAVE_DONE')body.classId=Number(p.classId);
    const value=await ctx.rpc(path,[body]);r.pages++;
    if(!value||typeof value!=='object'||!Number.isInteger(value.page)||value.page<0)DuBridge.raise('INVALID_RESPONSE');
    if(value[field]==null&&value.page!==0)DuBridge.raise('INVALID_RESPONSE');
    if(!notice&&typeof value.hasMore!=='boolean')DuBridge.raise('INVALID_RESPONSE');
    const values=value[field]==null?[]:DuBridge.array(value[field]);let added=0;
    for(const item of values){
      const id=DuBridge.id(item.id),key=id+':'+(item.classId??'')+':'+(item.studentId??'');
      if(seen.has(key))continue;
      const inScope=DuBridge.schoolScope(item,p,notice);
      if(inScope)DuBridge.append(r,item,p.maxItems);else r.filteredCount++;
      seen.add(key);added++;
    }
    if(values.length===0||(!notice&&value.hasMore===false)||(notice&&values.length<5))return DuBridge.done(r,'server_exhausted');
    if(added===0)return DuBridge.stop(r,'CURSOR_STALLED');
    if(!Number.isInteger(value.page)||value.page!==page)DuBridge.raise('INVALID_PAGE');
    page=value.page+1;cursor=value.cursor??null;
  }
  return DuBridge.stop(r,'PAGE_LIMIT',{page,cursor});
};
DuBridge.methods.listHomework=(ctx,p,r)=>DuBridge.educationList(ctx,p,r,false);
DuBridge.methods.listNotices=(ctx,p,r)=>DuBridge.educationList(ctx,p,r,true);
DuBridge.educationDetail=async(ctx,p,r,notice)=>{
  const key=notice?'noticeId':'hwId',id=notice?p.noticeId:p.homeworkId;
  const path=notice?'/r/Adaptor/OrgNoticeQueryI/findNoticeV2':'/r/Adaptor/OrgEduQueryI/findHomeworkV2';
  const value=await ctx.rpc(path,[{corpId:p.corpId,[key]:id}]);
  if(!value||String(value.id)!==id||!DuBridge.schoolScope(value,p,notice))DuBridge.raise('IDENTITY_MISMATCH');
  r[notice?'notice':'homework']=value;return DuBridge.done(r);
};
DuBridge.methods.getHomework=(ctx,p,r)=>DuBridge.educationDetail(ctx,p,r,false);
DuBridge.methods.getNotice=(ctx,p,r)=>DuBridge.educationDetail(ctx,p,r,true);
