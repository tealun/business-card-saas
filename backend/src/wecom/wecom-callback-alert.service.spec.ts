import { WecomCallbackAlertService } from "./wecom-callback-alert.service.js";
import type { WecomConfigService } from "./wecom-config.service.js";

describe("WecomCallbackAlertService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("skips dead-letter alerts when no webhook is configured", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WecomCallbackAlertService(config({ webhookUrl: null }));

    await expect(service.notifyDeadLetter(alertInput())).resolves.toEqual({
      sent: false,
      status: null,
      skipped: true
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a redacted dead-letter alert payload to the configured webhook", async () => {
    const fetchMock = jest.fn(async () => new Response("ok", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WecomCallbackAlertService(
      config({ webhookUrl: "https://ops.example.com/wecom-alerts", webhookToken: "alert-token" })
    );

    await expect(service.notifyDeadLetter(alertInput())).resolves.toEqual({
      sent: true,
      status: 200,
      skipped: false
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(url).toBe("https://ops.example.com/wecom-alerts");
    expect(init.headers).toMatchObject({
      authorization: "Bearer alert-token",
      "content-type": "application/json"
    });
    expect(JSON.parse(String(init.body))).toEqual({
      type: "wecom_callback_dead_letter",
      source: "data",
      event_key_hash: "708ea4def782618c6f50836c045f386f823faedd792430c8cbfb282eaf593797",
      retry_count: 5,
      error_type: "Error"
    });
    expect(String(init.body)).not.toContain("cipher");
    expect(String(init.body)).not.toContain("perm");
    expect(String(init.body)).not.toContain("event-001");
  });

  it("omits the authorization header when no webhook token is configured", async () => {
    const fetchMock = jest.fn(async () => new Response("ok", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WecomCallbackAlertService(config({ webhookUrl: "https://ops.example.com/wecom-alerts" }));

    await expect(service.notifyDeadLetter(alertInput())).resolves.toEqual({
      sent: true,
      status: 200,
      skipped: false
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [, init] = calls[0]!;
    expect(init.headers).not.toHaveProperty("authorization");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
  });
});

function config(input: { webhookUrl: string | null; webhookToken?: string | null }): WecomConfigService {
  return {
    callbackAlertWebhookUrl: input.webhookUrl,
    callbackAlertWebhookToken: input.webhookToken ?? null,
    httpTimeoutMs: 5000
  } as WecomConfigService;
}

function alertInput() {
  return {
    source: "data" as const,
    eventKey: "event-001",
    tenantId: "tenant-001",
    eventType: "change_contact",
    changeType: "update_user",
    retryCount: 5,
    errorType: "Error"
  };
}
