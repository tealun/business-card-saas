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
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/cgi-bin/stable_token");
    expect(fetchMock.mock.calls[0]![1]).toEqual(expect.objectContaining({method:"POST"}));
    expect(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).toContain('"force_refresh":false');
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

  it("refreshes the stable token once when WeChat rejects a cached token",async()=>{
    const fetchMock=jest.spyOn(global,"fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:"stale-token",expires_in:7200}),{headers:{"content-type":"application/json"}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({errcode:40001,errmsg:"access_token is invalid or not latest"}),{headers:{"content-type":"application/json"}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:"fresh-token",expires_in:7200}),{headers:{"content-type":"application/json"}}))
      .mockResolvedValueOnce(new Response(Uint8Array.from([7,8,9]),{headers:{"content-type":"image/png"}}));
    const service=new WechatJoinQrService({wechatMiniProgramAppId:"app-id",wechatMiniProgramSecret:"secret"} as never);

    await expect(service.generate("join_token")).resolves.toBe("data:image/png;base64,BwgJ");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String((fetchMock.mock.calls[2]![1] as RequestInit).body)).toContain('"force_refresh":true');
    expect(String(fetchMock.mock.calls[3]![0])).toContain("access_token=fresh-token");
  });

  it("shares one stable-token request across concurrent code generations",async()=>{
    let resolveToken:(response:Response)=>void=()=>undefined;
    const tokenResponse=new Promise<Response>((resolve)=>{resolveToken=resolve;});
    const fetchMock=jest.spyOn(global,"fetch")
      .mockImplementationOnce(()=>tokenResponse)
      .mockImplementation(async()=>new Response(Uint8Array.from([1]),{headers:{"content-type":"image/png"}}));
    const service=new WechatJoinQrService({wechatMiniProgramAppId:"app-id",wechatMiniProgramSecret:"secret"} as never);

    const first=service.generate("join_one");
    const second=service.generate("join_two");
    resolveToken(new Response(JSON.stringify({access_token:"shared-token",expires_in:7200}),{headers:{"content-type":"application/json"}}));
    await expect(Promise.all([first,second])).resolves.toEqual(["data:image/png;base64,AQ==","data:image/png;base64,AQ=="]);
    expect(fetchMock.mock.calls.filter(([url])=>String(url).includes("stable_token"))).toHaveLength(1);
  });
});
