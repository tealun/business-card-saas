const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");

Page({
  data:{token:"",displayName:"",submitting:false,result:"",error:""},
  /**
   * 初始化企业加入页，从扫码参数中读取加入 token。
   */
  onLoad(options){this.setData({token:String(options&&(options.token||options.scene)||"")});},
  /**
   * 更新申请人姓名草稿。
   */
  onNameInput(event){this.setData({displayName:event.detail.value});},
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
      await ensureSession();
      await request("/local-enterprises/join-requests",{method:"POST",data:{join_token:this.data.token,display_name:displayName}});
      this.setData({result:"申请已提交，请等待企业管理员审核。"});
    }catch(error){this.setData({error:error&&error.message?error.message:"提交失败，请稍后重试。"});}
    finally{this.setData({submitting:false});}
  }
});
