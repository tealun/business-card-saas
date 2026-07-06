import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { WecomConfigService } from "./wecom-config.service.js";

export interface FetchSuiteTokenRequest {
  suiteId: string;
  suiteSecret: string;
  suiteTicket: string;
}

export interface FetchSuiteTokenResponse {
  suiteAccessToken: string;
  expiresIn: number;
}

export interface FetchPermanentCodeRequest {
  suiteAccessToken: string;
  authCode: string;
}

export interface FetchPermanentCodeResponse {
  openCorpid: string;
  corpName: string;
  permanentCode: string;
  agentId: string | null;
  authInfo: unknown;
}

export interface FetchCorpTokenRequest {
  suiteAccessToken: string;
  openCorpid: string;
  permanentCode: string;
}

export interface FetchCorpTokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface FetchMiniProgramSessionRequest {
  suiteAccessToken: string;
  jsCode: string;
}

export interface FetchMiniProgramSessionResponse {
  openCorpid: string;
  openUserid: string;
  sessionKey: string | null;
}

export interface FetchContactUserIdsRequest {
  accessToken: string;
  cursor?: string | null;
  limit?: number;
}

export interface WecomContactUserIdentity {
  userid: string | null;
  openUserid: string | null;
  name: string | null;
  departmentIds: string[];
}

export interface FetchContactUserIdsResponse {
  users: WecomContactUserIdentity[];
  nextCursor: string | null;
}

interface WecomSuiteTokenPayload {
  errcode?: number;
  errmsg?: string;
  suite_access_token?: string;
  expires_in?: number;
}

interface WecomPermanentCodePayload {
  errcode?: number;
  errmsg?: string;
  permanent_code?: string;
  auth_corp_info?: {
    corpid?: string;
    corp_name?: string;
  };
  auth_info?: {
    agent?: Array<{
      agentid?: number | string;
    }>;
  };
}

interface WecomCorpTokenPayload {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

interface WecomMiniProgramSessionPayload {
  errcode?: number;
  errmsg?: string;
  corpid?: string;
  open_corpid?: string;
  userid?: string;
  open_userid?: string;
  session_key?: string;
}

interface WecomContactUserPayload {
  userid?: string;
  open_userid?: string;
  name?: string;
  department?: Array<string | number>;
}

interface WecomContactUserListPayload {
  errcode?: number;
  errmsg?: string;
  next_cursor?: string;
  dept_user?: WecomContactUserPayload[];
  userlist?: WecomContactUserPayload[];
}

@Injectable()
export class WecomApiClientService {
  constructor(private readonly config: WecomConfigService) {}

  async fetchSuiteAccessToken(request: FetchSuiteTokenRequest): Promise<FetchSuiteTokenResponse> {
    const payload = await this.postJson<WecomSuiteTokenPayload>("get_suite_token", "/cgi-bin/service/get_suite_token", {
      suite_id: request.suiteId,
      suite_secret: request.suiteSecret,
      suite_ticket: request.suiteTicket
    });
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom get_suite_token failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }
    if (!payload.suite_access_token || !payload.expires_in || payload.expires_in <= 0) {
      throw new BadGatewayException("WeCom get_suite_token returned invalid payload");
    }

    return {
      suiteAccessToken: payload.suite_access_token,
      expiresIn: payload.expires_in
    };
  }

  async fetchPermanentCode(request: FetchPermanentCodeRequest): Promise<FetchPermanentCodeResponse> {
    const payload = await this.postJson<WecomPermanentCodePayload>(
      "get_permanent_code",
      `/cgi-bin/service/get_permanent_code?suite_access_token=${encodeURIComponent(request.suiteAccessToken)}`,
      { auth_code: request.authCode }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(
        `WeCom get_permanent_code failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim()
      );
    }

    const openCorpid = payload.auth_corp_info?.corpid;
    const corpName = payload.auth_corp_info?.corp_name;
    if (!openCorpid || !corpName || !payload.permanent_code) {
      throw new BadGatewayException("WeCom get_permanent_code returned invalid payload");
    }

    const agentId = payload.auth_info?.agent?.[0]?.agentid;
    return {
      openCorpid,
      corpName,
      permanentCode: payload.permanent_code,
      agentId: agentId === undefined ? null : String(agentId),
      authInfo: payload.auth_info ?? null
    };
  }

  async fetchCorpAccessToken(request: FetchCorpTokenRequest): Promise<FetchCorpTokenResponse> {
    const payload = await this.postJson<WecomCorpTokenPayload>(
      "get_corp_token",
      `/cgi-bin/service/get_corp_token?suite_access_token=${encodeURIComponent(request.suiteAccessToken)}`,
      {
        auth_corpid: request.openCorpid,
        permanent_code: request.permanentCode
      }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom get_corp_token failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }
    if (!payload.access_token || !payload.expires_in || payload.expires_in <= 0) {
      throw new BadGatewayException("WeCom get_corp_token returned invalid payload");
    }
    return {
      accessToken: payload.access_token,
      expiresIn: payload.expires_in
    };
  }

  async fetchMiniProgramSession(request: FetchMiniProgramSessionRequest): Promise<FetchMiniProgramSessionResponse> {
    const payload = await this.postJson<WecomMiniProgramSessionPayload>(
      "miniprogram jscode2session",
      `/cgi-bin/service/miniprogram/jscode2session?suite_access_token=${encodeURIComponent(request.suiteAccessToken)}`,
      {
        js_code: request.jsCode,
        grant_type: "authorization_code"
      }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(
        `WeCom miniprogram jscode2session failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim()
      );
    }

    const openCorpid = payload.open_corpid ?? payload.corpid;
    const openUserid = payload.open_userid ?? payload.userid;
    if (!openCorpid || !openUserid) {
      throw new BadGatewayException("WeCom miniprogram jscode2session returned invalid payload");
    }

    return {
      openCorpid,
      openUserid,
      sessionKey: payload.session_key ?? null
    };
  }

  async fetchContactUserIds(request: FetchContactUserIdsRequest): Promise<FetchContactUserIdsResponse> {
    const payload = await this.postJson<WecomContactUserListPayload>(
      "contact user list_id",
      `/cgi-bin/user/list_id?access_token=${encodeURIComponent(request.accessToken)}`,
      {
        cursor: request.cursor ?? "",
        limit: request.limit ?? 1000
      }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom user/list_id failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }

    const rawUsers = payload.dept_user ?? payload.userlist ?? [];
    return {
      users: rawUsers.map((user) => ({
        userid: normalizeOptionalString(user.userid),
        openUserid: normalizeOptionalString(user.open_userid),
        name: normalizeOptionalString(user.name),
        departmentIds: Array.isArray(user.department) ? user.department.map(String) : []
      })),
      nextCursor: normalizeOptionalString(payload.next_cursor)
    };
  }

  private async postJson<T>(operation: string, path: string, body: unknown): Promise<T> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.config.httpTimeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify(body)
      });
    } catch {
      throw new ServiceUnavailableException(`WeCom ${operation} request failed`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(`WeCom ${operation} HTTP ${response.status}`);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new BadGatewayException(`WeCom ${operation} returned invalid JSON`);
    }
  }
}

function normalizeOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
