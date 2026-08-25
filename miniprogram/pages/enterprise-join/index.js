const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");

Page({
  data:{token:"",displayName:"",submitting:false,result:"",error:"",loading:true,previewReady:false,notificationAccepted:false,company:{name:"企业",shortName:"",initial:"企",logoUrl:"",websiteUrl:"",address:"",publicId:"",notificationTemplateId:""}},
  /**
   * 初始化企业加入页，从扫码参数中读取加入 token。
   */
  onLoad(options){const token=String(options&&(options.token||options.scene)||"");this.setData({token});this.loadPreview();},
  async loadPreview(){
    if(!this.data.token){this.setData({loading:false,previewReady:false,error:"加入码缺失或已失效，请联系企业管理员重新获取。"});return;}
    this.setData({loading:true,error:""});
    try{await ensureSession();const company=await request(`/local-enterprises/join-preview/${encodeURIComponent(this.data.token)}`);company.initial=String(company.shortName||company.name||"企").slice(0,1);this.setData({company,loading:false,previewReady:true});}
    catch(error){this.setData({loading:false,previewReady:false,error:error&&error.message?error.message:"邀请信息加载失败，请联系企业管理员。"});}
  },
  /**
   * 更新申请人姓名草稿。
   */
  onNameInput(event){this.setData({displayName:event.detail.value,error:this.data.previewReady?"":this.data.error});},
  /**
   * 提交加入企业申请。
   * 需要先登录当前微信身份，再把加入 token 和申请姓名交给后端等待管理员审核。
   */
  async submit(){
    const displayName=String(this.data.displayName||"").trim();
    if(!this.data.token){this.setData({error:"加入码缺失或已失效，请联系企业管理员重新获取。"});return;}
    if(!displayName){this.setData({error:"请输入真实姓名，管理员将据此审核。"});return;}
    this.setData({submitting:true,error:""});
    try{
      const notificationAccepted=await this.requestReviewNotification();
      await ensureSession();
      await request("/local-enterprises/join-requests",{method:"POST",data:{join_token:this.data.token,display_name:displayName,notification_template_id:notificationAccepted?this.data.company.notificationTemplateId:undefined}});
      this.setData({result:"申请已提交",notificationAccepted});
    }catch(error){this.setData({error:error&&error.message?error.message:"提交失败，请稍后重试。"});}
    finally{this.setData({submitting:false});}
  },
  async requestReviewNotification(){
    const templateId=this.data.company.notificationTemplateId;
    if(!templateId||!wx.requestSubscribeMessage)return false;
    try{const result=await new Promise((resolve,reject)=>wx.requestSubscribeMessage({tmplIds:[templateId],success:resolve,fail:reject}));return result&&result[templateId]==="accept";}catch(_error){return false;}
  },
  goHome(){wx.switchTab({url:"/pages/employee/index",fail(){}});},
  openCompany(){const publicId=this.data.company.publicId;if(!publicId){wx.showToast({title:"企业主页暂未发布",icon:"none"});return;}wx.navigateTo({url:`/pages/public/card?card=${encodeURIComponent(publicId)}&company=1`});},
  withdraw(){this.setData({result:""});}
});
