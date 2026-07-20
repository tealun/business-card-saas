import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AppConfig } from "../config/app-config.js";

interface AccessTokenPayload { access_token?:string; expires_in?:number; errcode?:number; errmsg?:string; }

@Injectable()
export class WechatJoinQrService {
  private cached:{token:string;expiresAt:number}|null=null;
  constructor(private readonly config:AppConfig){}

  async generate(joinToken:string):Promise<string|null>{
    if(!this.config.wechatMiniProgramAppId||!this.config.wechatMiniProgramSecret) return null;
    const accessToken=await this.accessToken();
    const response=await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({scene:joinToken,page:"pages/enterprise-join/index",check_path:false,env_version:"release",width:430})
    });
    if(!response.ok) throw new ServiceUnavailableException(`WeChat QR HTTP ${response.status}`);
    const contentType=response.headers.get("content-type")||"";
    if(contentType.includes("application/json")){
      const error=await response.json() as AccessTokenPayload;
      throw new BadGatewayException(`WeChat QR failed: ${error.errcode??"unknown"} ${error.errmsg??""}`.trim());
    }
    const bytes=Buffer.from(await response.arrayBuffer());
    return `data:${contentType||"image/png"};base64,${bytes.toString("base64")}`;
  }

  private async accessToken():Promise<string>{
    if(this.cached&&this.cached.expiresAt>Date.now()) return this.cached.token;
    const url=new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type","client_credential");url.searchParams.set("appid",this.config.wechatMiniProgramAppId);url.searchParams.set("secret",this.config.wechatMiniProgramSecret);
    const response=await fetch(url);
    if(!response.ok) throw new ServiceUnavailableException(`WeChat access token HTTP ${response.status}`);
    const payload=await response.json() as AccessTokenPayload;
    if(!payload.access_token) throw new BadGatewayException(`WeChat access token failed: ${payload.errcode??"unknown"} ${payload.errmsg??""}`.trim());
    this.cached={token:payload.access_token,expiresAt:Date.now()+Math.max(60,(payload.expires_in??7200)-300)*1000};
    return payload.access_token;
  }
}
