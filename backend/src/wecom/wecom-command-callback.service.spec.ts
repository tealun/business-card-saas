import { WecomCommandCallbackService } from "./wecom-command-callback.service.js";

describe("WecomCommandCallbackService", () => {
  it("refreshes an enterprise authorization on change_auth", async () => {
    const { service, authorization, events } = createService(commandXml("change_auth", "<AuthCorpId>corp-001</AuthCorpId>"));

    await expect(service.receive(callbackQuery(), encryptedBody())).resolves.toMatchObject({
      infoType: "change_auth",
      handled: true
    });
    expect(authorization.refreshAuthorization).toHaveBeenCalledWith("corp-001", expect.any(Date));
    expect(events.markDone).toHaveBeenCalledTimes(1);
  });

  it("cancels an enterprise authorization and clears its reusable credentials", async () => {
    const { service, authorization } = createService(commandXml("cancel_auth", "<AuthCorpId>corp-001</AuthCorpId>"));

    await service.receive(callbackQuery(), encryptedBody());

    expect(authorization.cancelAuthorization).toHaveBeenCalledWith("corp-001", expect.any(Date));
  });

  it("acknowledges a persisted duplicate without repeating business processing", async () => {
    const fixture = createService(commandXml("create_auth", "<AuthCode>auth-code-001</AuthCode>"), false);

    await expect(fixture.service.receive(callbackQuery(), encryptedBody())).resolves.toMatchObject({
      infoType: "create_auth",
      handled: true
    });
    expect(fixture.authorization.handleAuthCode).not.toHaveBeenCalled();
  });

  it("marks failed command events so an authenticated platform retry can process them", async () => {
    const fixture = createService(commandXml("create_auth", "<AuthCode>auth-code-001</AuthCode>"));
    fixture.authorization.handleAuthCode.mockRejectedValueOnce(new Error("temporary upstream failure"));

    await expect(fixture.service.receive(callbackQuery(), encryptedBody())).rejects.toThrow("temporary upstream failure");
    expect(fixture.events.markFailed).toHaveBeenCalledTimes(1);
  });
});

function createService(message: string, shouldProcess = true) {
  const crypto = {
    decrypt: jest.fn(() => ({ message, receiveId: "wwsuite001" }))
  };
  const events = {
    beginProcessing: jest.fn(async () => ({ shouldProcess, status: shouldProcess ? "processing" : "done", retryCount: 0 })),
    markDone: jest.fn(async () => undefined),
    markFailed: jest.fn(async () => undefined)
  };
  const authorization = {
    handleAuthCode: jest.fn(async () => undefined),
    refreshAuthorization: jest.fn(async () => undefined),
    cancelAuthorization: jest.fn(async () => true)
  };
  const service = new WecomCommandCallbackService(
    crypto as never,
    { suite: { providerCorpId: "wwprovider001" } } as never,
    events as never,
    { saveSuiteTicket: jest.fn(async () => undefined) } as never,
    authorization as never
  );
  return { service, events, authorization };
}

function commandXml(infoType: string, body: string): string {
  return `<xml><SuiteId>wwsuite001</SuiteId><InfoType>${infoType}</InfoType><TimeStamp>1784110000</TimeStamp>${body}</xml>`;
}

function callbackQuery() {
  return { msgSignature: "signature", timestamp: "1784110000", nonce: "nonce" };
}

function encryptedBody(): string {
  return "<xml><Encrypt>encrypted-payload</Encrypt></xml>";
}
