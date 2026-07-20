const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");

Page({
  data:{token:"",displayName:"",submitting:false,result:"",error:""},
  onLoad(options){this.setData({token:String(options&&(options.token||options.scene)||"")});},
  onNameInput(event){this.setData({displayName:event.detail.value});},
  async submit(){
    const displayName=String(this.data.displayName||"").trim();
    if(!this.data.token){this.setData({error:"加入码缺失或已失效，请联系企业管理员重新获取。"});return;}
    if(!displayName){this.setData({error:"请输入真实姓名，管理员将据此审核。"});return;}
    this.setData({submitting:true,error:""});
    try{
      await ensureSession();
      await request("/local-enterprises/join-requests",{method:"POST",data:{join_token:this.data.token,display_name:displayName}});
      this.setData({result:"申请已提交，请等待企业管理员审核。"});
    }catch(error){this.setData({error:error&&error.message?error.message:"提交失败，请稍后重试。"});}
    finally{this.setData({submitting:false});}
  }
});
