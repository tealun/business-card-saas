const {ensureSession}=require("../../utils/auth");
const {request}=require("../../utils/api");

Page({
  data:{token:"",loading:true,error:"",success:"",tenants:[]},
  onLoad(options){const token=String(options&&(options.scene||options.token)||"");this.setData({token});this.prepare();},
  async prepare(){
    if(!this.data.token){this.setData({loading:false,error:"登录二维码缺少有效凭据，请返回网页刷新二维码。"});return;}
    try{await ensureSession({force:true});const result=await this.confirm();if(result.requires_selection)this.setData({loading:false,tenants:result.tenants||[]});else this.setData({loading:false,success:`已确认登录 ${result.tenant_name||"企业后台"}，请返回电脑继续。`});}
    catch(error){this.setData({loading:false,error:this.formatError(error)});}
  },
  confirm(tenantId){return request("/local-enterprises/admin-scan/confirm",{method:"POST",data:{challenge_token:this.data.token,...(tenantId?{tenant_id:String(tenantId)}:{})}});},
  async choose(event){this.setData({loading:true,error:""});try{const result=await this.confirm(event.currentTarget.dataset.id);this.setData({loading:false,tenants:[],success:`已确认登录 ${result.tenant_name||"企业后台"}，请返回电脑继续。`});}catch(error){this.setData({loading:false,error:this.formatError(error)});}},
  formatError(error){
    const message=error&&error.message?error.message:"确认登录失败";
    if(/不是本地企业管理员|not.*local enterprise administrator/i.test(message)){
      return "当前微信账号还不是该本地企业管理员。请使用企业 Owner/管理员的微信扫码，或先在后台生成认领码完成企业管理员认领。";
    }
    if(/invalid or expired|无效|过期|expired/i.test(message)){
      return "登录二维码已失效，请返回电脑端刷新二维码后重新扫码。";
    }
    return message;
  }
});
