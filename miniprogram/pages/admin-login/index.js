const {ensureSession}=require("../../utils/auth");
const {request}=require("../../utils/api");

Page({
  data:{token:"",state:"loading",error:"",tenants:[],selectedTenant:null,device:"电脑浏览器",location:"未知地点",ip:"",requestTime:"",remaining:"--:--",submitting:false},
  onLoad(options){const token=String(options&&(options.scene||options.token)||"");this.setData({token});this.prepare();},
  onUnload(){this.stopCountdown();},
  async prepare(){if(!this.data.token){this.fail("登录二维码缺少有效凭据，请返回网页刷新二维码。");return;}try{await ensureSession({force:true});const result=await this.confirm();const tenants=(result.tenants||[]).map((item)=>({...item,initial:String(item.tenant_name||"企").slice(0,1),roleLabel:roleLabel(item.role),lastLoginText:formatLastLogin(item.last_login_at)}));this.setData({state:"confirm",error:"",tenants,selectedTenant:tenants[0]||null,device:result.device||"电脑浏览器",location:result.location||"未知地点",ip:result.ip||"",requestTime:formatClock(result.created_at)});this.startCountdown(result.expires_at);}catch(error){this.fail(this.formatError(error));}},
  confirm(tenantId,decision="approve"){return request("/local-enterprises/admin-scan/confirm",{method:"POST",data:{challenge_token:this.data.token,decision,...(tenantId?{tenant_id:String(tenantId)}:{})}});},
  selectTenant(event){const selected=this.data.tenants.find((item)=>String(item.tenant_id)===String(event.currentTarget.dataset.id));if(selected)this.setData({selectedTenant:selected});},
  async confirmSelected(){if(!this.data.selectedTenant||this.data.submitting)return;this.setData({submitting:true,error:""});try{const result=await this.confirm(this.data.selectedTenant.tenant_id);this.stopCountdown();this.setData({state:"success",submitting:false,selectedTenant:{...this.data.selectedTenant,tenant_name:result.tenant_name||this.data.selectedTenant.tenant_name},requestTime:formatClock(new Date())});}catch(error){this.setData({submitting:false,error:this.formatError(error)});}},
  rejectLogin(){wx.showModal({title:"拒绝本次登录？",content:"电脑端将无法使用这次扫码请求登录企业后台。",confirmText:"拒绝登录",confirmColor:"#d92d20",success:async(result)=>{if(!result.confirm)return;try{await this.confirm(null,"reject");wx.showToast({title:"已拒绝本次登录",icon:"none"});this.goHome();}catch(error){this.setData({error:this.formatError(error)});}}});},
  exitDesktop(){wx.showModal({title:"退出电脑端登录？",content:"如果电脑端尚未进入后台，本次授权会立即撤销。",confirmText:"确认退出",confirmColor:"#d92d20",success:async(result)=>{if(!result.confirm)return;try{await this.confirm(null,"reject");wx.showToast({title:"已退出电脑端登录",icon:"success"});this.goHome();}catch(_error){this.setData({error:"电脑端已进入后台，请在电脑端退出账号。"});}}});},
  goHome(){wx.switchTab({url:"/pages/employee/index",fail(){}});},
  startCountdown(expiresAt){this.stopCountdown();const tick=()=>{const seconds=Math.max(0,Math.ceil((new Date(expiresAt).getTime()-Date.now())/1000));this.setData({remaining:`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`});if(!seconds){this.stopCountdown();this.fail("登录二维码已失效，请返回电脑端刷新二维码后重新扫码。");}};tick();this.countdownTimer=setInterval(tick,1000);},
  stopCountdown(){if(this.countdownTimer){clearInterval(this.countdownTimer);this.countdownTimer=null;}},
  fail(error){this.stopCountdown();this.setData({state:"error",error,submitting:false});},
  formatError(error){const message=error&&error.message?error.message:"确认登录失败";if(/不是本地企业管理员|not.*local enterprise administrator/i.test(message))return "当前微信账号不是企业管理员，请更换管理员微信扫码。";if(/invalid|expired|无效|过期/i.test(message))return "登录二维码已失效，请返回电脑端刷新二维码后重新扫码。";return message;}
});

function roleLabel(role){return ({owner:"超级管理员",admin:"管理员",operator:"运营管理员",auditor:"审计员"})[role]||"管理员";}
function formatClock(value){const date=value?new Date(value):new Date();return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;}
function formatLastLogin(value){if(!value)return "首次登录";const date=new Date(value);return `上次登录 ${date.getMonth()+1}月${date.getDate()}日`;}
