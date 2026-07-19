import { BadGatewayException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
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

export interface FetchPreAuthCodeRequest {
  suiteAccessToken: string;
}

export interface FetchPreAuthCodeResponse {
  preAuthCode: string;
  expiresIn: number;
}

export interface SetSessionInfoRequest {
  suiteAccessToken: string;
  preAuthCode: string;
  authType: 0 | 1;
  appIds?: Array<string | number>;
}

export interface FetchPermanentCodeResponse {
  openCorpid: string;
  corpName: string;
  permanentCode: string;
  agentId: string | null;
  authInfo: unknown;
}

export interface FetchAuthorizationInfoRequest {
  suiteAccessToken: string;
  openCorpid: string;
  permanentCode: string;
}

export interface FetchAuthorizationInfoResponse {
  openCorpid: string;
  corpName: string;
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
  title?: string | null;
  mobile?: string | null;
  email?: string | null;
}

export interface FetchContactUserIdsResponse {
  users: WecomContactUserIdentity[];
  nextCursor: string | null;
}

export interface FetchDepartmentUsersRequest {
  accessToken: string;
  departmentId?: string | number;
  fetchChild?: boolean;
}

export interface FetchContactUserDetailRequest {
  accessToken: string;
  userid: string;
}

export interface FetchThirdPartyUserInfoResponse {
  openCorpid: string;
  userid: string | null;
  openUserid: string;
  userTicket: string | null;
  expiresIn: number;
}

export interface FetchCorpAdminListRequest {
  suiteAccessToken: string;
  openCorpid: string;
  agentId: string;
}

export interface WecomCorpAdminIdentity {
  userid: string | null;
  openUserid: string | null;
  authType: 0 | 1;
}

export interface FetchCorpAdminListResponse {
  admins: WecomCorpAdminIdentity[];
}

export interface FetchThirdPartyUserDetailResponse {
  openCorpid: string | null;
  openUserid: string | null;
  avatarUrl: string | null;
  qrCodeUrl: string | null;
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

type WecomAuthorizationInfoPayload = WecomPermanentCodePayload;

interface WecomPreAuthCodePayload {
  errcode?: number;
  errmsg?: string;
  pre_auth_code?: string;
  expires_in?: number;
}

interface WecomSetSessionInfoPayload {
  errcode?: number;
  errmsg?: string;
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
  position?: string;
  mobile?: string;
  email?: string;
}

interface WecomContactUserListPayload {
  errcode?: number;
  errmsg?: string;
  next_cursor?: string;
  dept_user?: WecomContactUserPayload[];
  userlist?: WecomContactUserPayload[];
}

interface WecomDepartmentUserListPayload {
  errcode?: number;
  errmsg?: string;
  userlist?: WecomContactUserPayload[];
}

type WecomContactUserDetailPayload = WecomContactUserPayload & {
  errcode?: number;
  errmsg?: string;
};

interface WecomThirdPartyUserInfoPayload {
  errcode?: number;
  errmsg?: string;
  CorpId?: string;
  corpid?: string;
  UserId?: string;
  userid?: string;
  open_userid?: string;
  user_ticket?: string;
  expires_in?: number;
}

interface WecomCorpAdminListPayload {
  errcode?: number;
  errmsg?: string;
  admin?: Array<{
    userid?: string;
    open_userid?: string;
    auth_type?: number;
  }>;
}

interface WecomThirdPartyUserDetailPayload {
  errcode?: number;
  errmsg?: string;
  corpid?: string;
  userid?: string;
  open_userid?: string;
  avatar?: string;
  qr_code?: string;
}

const WECOM_API_FORBIDDEN = 48002;
const WECOM_API_NO_PRIVILEGE = 60011;

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

  async fetchPreAuthCode(request: FetchPreAuthCodeRequest): Promise<FetchPreAuthCodeResponse> {
    const payload = await this.getJson<WecomPreAuthCodePayload>(
      "get_pre_auth_code",
      `/cgi-bin/service/get_pre_auth_code?suite_access_token=${encodeURIComponent(request.suiteAccessToken)}`
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(
        `WeCom get_pre_auth_code failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim()
      );
    }
    if (!payload.pre_auth_code || !payload.expires_in || payload.expires_in <= 0) {
      throw new BadGatewayException("WeCom get_pre_auth_code returned invalid payload");
    }
    return {
      preAuthCode: payload.pre_auth_code,
      expiresIn: payload.expires_in
    };
  }

  async fetchAuthorizationInfo(request: FetchAuthorizationInfoRequest): Promise<FetchAuthorizationInfoResponse> {
    const payload = await this.postJson<WecomAuthorizationInfoPayload>(
      "get_auth_info",
      `/cgi-bin/service/get_auth_info?suite_access_token=${encodeURIComponent(request.suiteAccessToken)}`,
      {
        auth_corpid: request.openCorpid,
        permanent_code: request.permanentCode
      }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom get_auth_info failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }
    const openCorpid = payload.auth_corp_info?.corpid;
    if (!openCorpid || openCorpid !== request.openCorpid) {
      throw new BadGatewayException("WeCom get_auth_info returned invalid corp identity");
    }
    return {
      openCorpid,
      corpName: payload.auth_corp_info?.corp_name?.trim() || openCorpid,
      agentId: payload.auth_info?.agent?.[0]?.agentid?.toString() ?? null,
      authInfo: payload.auth_info ?? null
    };
  }

  async setSessionInfo(request: SetSessionInfoRequest): Promise<void> {
    const sessionInfo: { auth_type: 0 | 1; appid?: Array<string | number> } = {
      auth_type: request.authType
    };
    if (request.appIds?.length) {
      sessionInfo.appid = request.appIds.map(normalizeAppId);
    }
    const payload = await this.postJson<WecomSetSessionInfoPayload>(
      "set_session_info",
      `/cgi-bin/service/set_session_info?suite_access_token=${encodeURIComponent(request.suiteAccessToken)}`,
      {
        pre_auth_code: request.preAuthCode,
        session_info: sessionInfo
      }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(
        `WeCom set_session_info failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim()
      );
    }
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
      if (isWecomPermissionDenied(payload.errcode)) {
        throw new ForbiddenException(
          "企业微信未授权通讯录成员 ID 读取接口（user/list_id），请确认服务商后台已开启通讯录单个信息只读、企业已用管理员授权模式重新授权，且应用可见范围包含目标成员。"
        );
      }
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

  async fetchDepartmentUsers(request: FetchDepartmentUsersRequest): Promise<WecomContactUserIdentity[]> {
    const search = new URLSearchParams({
      access_token: request.accessToken,
      department_id: String(request.departmentId ?? 1),
      fetch_child: request.fetchChild === false ? "0" : "1"
    });
    const payload = await this.getJson<WecomDepartmentUserListPayload>(
      "department user simplelist",
      `/cgi-bin/user/simplelist?${search.toString()}`
    );
    if (payload.errcode && payload.errcode !== 0) {
      if (isWecomPermissionDenied(payload.errcode)) {
        throw new ForbiddenException(
          "企业微信未授权通讯录基本信息读取接口（user/simplelist），请确认服务商后台已开启通讯录基本信息只读、应用可见范围包含目标部门，并让企业重新授权。"
        );
      }
      throw new BadGatewayException(`WeCom user/simplelist failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }

    return (payload.userlist ?? []).map((user) => ({
      userid: normalizeOptionalString(user.userid),
      openUserid: normalizeOptionalString(user.open_userid),
      name: normalizeOptionalString(user.name),
      departmentIds: Array.isArray(user.department) ? user.department.map(String) : [],
      title: normalizeOptionalString(user.position),
      mobile: normalizeOptionalString(user.mobile),
      email: normalizeOptionalString(user.email)
    }));
  }

  async fetchContactUserDetail(request: FetchContactUserDetailRequest): Promise<WecomContactUserIdentity> {
    const search = new URLSearchParams({
      access_token: request.accessToken,
      userid: request.userid
    });
    const payload = await this.getJson<WecomContactUserDetailPayload>("contact user get", `/cgi-bin/user/get?${search.toString()}`);
    if (payload.errcode && payload.errcode !== 0) {
      if (isWecomPermissionDenied(payload.errcode)) {
        throw new ForbiddenException(
          "企业微信未授权通讯录成员详情接口（user/get），请确认服务商后台已开启通讯录单个信息只读、企业已用管理员授权模式重新授权，且应用可见范围包含目标成员。"
        );
      }
      throw new BadGatewayException(`WeCom user/get failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }

    return {
      userid: normalizeOptionalString(payload.userid) ?? request.userid,
      openUserid: normalizeOptionalString(payload.open_userid),
      name: normalizeOptionalString(payload.name),
      departmentIds: Array.isArray(payload.department) ? payload.department.map(String) : [],
      title: normalizeOptionalString(payload.position),
      mobile: normalizeOptionalString(payload.mobile),
      email: normalizeOptionalString(payload.email)
    };
  }

  async fetchThirdPartyUserInfo(
    suiteAccessToken: string,
    code: string,
    options: { requireUserTicket?: boolean } = {}
  ): Promise<FetchThirdPartyUserInfoResponse> {
    const payload = await this.getJson<WecomThirdPartyUserInfoPayload>(
      "getuserinfo3rd",
      `/cgi-bin/service/auth/getuserinfo3rd?code=${encodeURIComponent(code)}&suite_access_token=${encodeURIComponent(suiteAccessToken)}`
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom getuserinfo3rd failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }
    const openCorpid = (payload.CorpId ?? payload.corpid)?.trim();
    const userid = (payload.UserId ?? payload.userid)?.trim() || null;
    const openUserid = (payload.open_userid ?? userid ?? "").trim();
    const userTicket = payload.user_ticket?.trim() || null;
    if (!openCorpid || !openUserid || (options.requireUserTicket !== false && !userTicket)) {
      throw new BadGatewayException("WeCom getuserinfo3rd did not return member-sensitive authorization");
    }
    return { openCorpid, userid, openUserid, userTicket, expiresIn: payload.expires_in ?? 0 };
  }

  async fetchCorpAdminList(request: FetchCorpAdminListRequest): Promise<FetchCorpAdminListResponse> {
    const payload = await this.postJson<WecomCorpAdminListPayload>(
      "get_admin_list",
      `/cgi-bin/service/get_admin_list?suite_access_token=${encodeURIComponent(request.suiteAccessToken)}`,
      {
        auth_corpid: request.openCorpid,
        agentid: request.agentId
      }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom get_admin_list failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }
    return {
      admins: (payload.admin ?? [])
        .map((admin) => ({
          userid: normalizeOptionalString(admin.userid),
          openUserid: normalizeOptionalString(admin.open_userid),
          authType: admin.auth_type === 1 ? (1 as const) : (0 as const)
        }))
        .filter((admin) => admin.userid || admin.openUserid)
    };
  }

  async fetchThirdPartyUserDetail(
    suiteAccessToken: string,
    userTicket: string
  ): Promise<FetchThirdPartyUserDetailResponse> {
    const payload = await this.postJson<WecomThirdPartyUserDetailPayload>(
      "getuserdetail3rd",
      `/cgi-bin/service/getuserdetail3rd?suite_access_token=${encodeURIComponent(suiteAccessToken)}`,
      { user_ticket: userTicket }
    );
    if (payload.errcode && payload.errcode !== 0) {
      throw new BadGatewayException(`WeCom getuserdetail3rd failed: ${payload.errcode} ${payload.errmsg ?? ""}`.trim());
    }
    return {
      openCorpid: payload.corpid?.trim() || null,
      openUserid: (payload.open_userid ?? payload.userid)?.trim() || null,
      avatarUrl: secureImageUrl(payload.avatar),
      qrCodeUrl: secureImageUrl(payload.qr_code)
    };
  }

  private async getJson<T>(operation: string, path: string): Promise<T> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.config.httpTimeoutMs);
    try {
      const response = await fetch(`${this.config.apiBaseUrl}${path}`, { signal: abort.signal });
      if (!response.ok) {
        throw new ServiceUnavailableException(`WeCom ${operation} HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(`WeCom ${operation} request failed`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson<T>(operation: string, path: string, body: unknown): Promise<T> {
    const maxRetries = 3;
    const baseDelayMs = 200;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), this.config.httpTimeoutMs);
      try {
        const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify(body)
        });
        clearTimeout(timeout);

        if (response.ok) {
          try {
            return (await response.json()) as T;
          } catch {
            throw new BadGatewayException(`WeCom ${operation} returned invalid JSON`);
          }
        }

        const errorBody = await safeReadErrorBody(response);
        const errorDetail = formatWecomErrorBody(errorBody);
        const errorMessage = `WeCom ${operation} HTTP ${response.status}${errorDetail ? `: ${errorDetail}` : ""}`;
        if (!isRetryableStatus(response.status)) {
          throw new ServiceUnavailableException(errorMessage);
        }
        lastError = new ServiceUnavailableException(errorMessage);
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof BadGatewayException || (error instanceof ServiceUnavailableException && !isRetryableError(error))) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < maxRetries - 1) {
        await delay(baseDelayMs * 2 ** attempt);
      }
    }

    throw new ServiceUnavailableException(`WeCom ${operation} request failed after ${maxRetries} attempts: ${lastError?.message}`);
  }
}

async function safeReadErrorBody(response: Response): Promise<string | null> {
  try {
    const text = await response.clone().text();
    return text.length > 200 ? `${text.slice(0, 200)}...` : text;
  } catch {
    return null;
  }
}

function formatWecomErrorBody(body: string | null): string | null {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.errcode === "number" || typeof parsed.errcode === "string") {
      return `${parsed.errcode} ${parsed.errmsg ?? ""}`.trim();
    }
  } catch {
    // fall through to raw body
  }
  return body;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

function isRetryableError(error: Error): boolean {
  // Do not retry client errors (4xx) or malformed responses.
  if (error instanceof BadGatewayException) {
    return false;
  }
  return !error.message.includes("HTTP 4");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isWecomPermissionDenied(errcode: number): boolean {
  return errcode === WECOM_API_FORBIDDEN || errcode === WECOM_API_NO_PRIVILEGE;
}

function normalizeAppId(value: string | number): string | number {
  if (typeof value === "number") {
    return value;
  }
  const normalized = value.trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}

function secureImageUrl(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
