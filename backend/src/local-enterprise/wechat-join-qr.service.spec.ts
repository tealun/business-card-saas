import { ServiceUnavailableException } from "@nestjs/common";
import { WechatJoinQrService } from "./wechat-join-qr.service.js";

describe("WechatJoinQrService",()=>{
  afterEach(()=>jest.restoreAllMocks());

  it("returns a data URL from the official Mini Program code API",async()=>{
    const fetchMock=jest.spyOn(global,"fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:"wx-token",expires_in:7200}),{headers:{"content-type":"application/json"}}))
      .mockResolvedValueOnce(new Response(Uint8Array.from([1,2,3]),{headers:{"content-type":"image/png"}}));
    const service=new WechatJoinQrService({wechatMiniProgramAppId:"app-id",wechatMiniProgramSecret:"secret"} as never);
    await expect(service.generate("join_123456789012345678901234567")).resolves.toBe("data:image/png;base64,AQID");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const qrCall=fetchMock.mock.calls[1]!;
    expect(String(qrCall[0])).toContain("getwxacodeunlimit");
    expect(String((qrCall[1] as RequestInit).body)).toContain('"page":"pages/enterprise-join/index"');
  });

  it("returns a data URL from the official Mini Program path code API",async()=>{
    const fetchMock=jest.spyOn(global,"fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:"wx-token",expires_in:7200}),{headers:{"content-type":"application/json"}}))
      .mockResolvedValueOnce(new Response(Uint8Array.from([4,5,6]),{headers:{"content-type":"image/png"}}));
    const service=new WechatJoinQrService({wechatMiniProgramAppId:"app-id",wechatMiniProgramSecret:"secret"} as never);
    await expect(service.generatePath("/pages/public/card?card=pub_1&share=shr_1")).resolves.toBe("data:image/png;base64,BAUG");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const qrCall=fetchMock.mock.calls[1]!;
    expect(String(qrCall[0])).toContain("wxa/getwxacode?");
    expect(String((qrCall[1] as RequestInit).body)).toContain('"path":"pages/public/card?card=pub_1&share=shr_1"');
  });

  it("fails fast when Mini Program credentials are absent",async()=>{
    const fetchMock=jest.spyOn(global,"fetch");
    const service=new WechatJoinQrService({wechatMiniProgramAppId:"",wechatMiniProgramSecret:""} as never);
    await expect(service.generate("join_token")).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
