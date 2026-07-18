import { WecomCommandCallbackService } from "./wecom-command-callback.service.js";

describe("WecomCommandCallbackService", () => {
  it("refreshes an enterprise authorization on change_auth", async () => {
    const { service, authorization, events } = createService(commandXml("change_auth", "<AuthCorpId>corp-001</AuthCorpId>"));

    await expect(service.receive(callbackQuery(), encryptedBody())).resolves.toMatchObject({
      infoType: "change_auth",
      handled: true
    });
    await flushDeferredWork();
    expect(authorization.refreshAuthorization).toHaveBeenCalledWith("corp-001", expect.any(Date));
    expect(events.markDone).toHaveBeenCalledTimes(1);
  });

  it("cancels an enterprise authorization and clears its reusable credentials", async () => {
    const { service, authorization } = createService(commandXml("cancel_auth", "<AuthCorpId>corp-001</AuthCorpId>"));

    await service.receive(callbackQuery(), encryptedBody());
    await flushDeferredWork();

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

  it("acknowledges authorization callbacks before asynchronous WeCom API work completes", async () => {
    const fixture = createService(commandXml("create_auth", "<AuthCode>auth-code-001</AuthCode>"));
    let finishAuthorization: (() => void) | undefined;
    fixture.authorization.handleAuthCode.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishAuthorization = () => resolve(undefined);
        })
    );

    await expect(fixture.service.receive(callbackQuery(), encryptedBody())).resolves.toMatchObject({
      infoType: "create_auth",
      handled: true
    });
    expect(fixture.events.markDone).not.toHaveBeenCalled();
    await runImmediateTurn();
    expect(fixture.authorization.handleAuthCode).toHaveBeenCalledWith("auth-code-001", expect.any(Date));

    finishAuthorization?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.events.markDone).toHaveBeenCalledTimes(1);
  });

  it("marks failed asynchronous command events so an authenticated platform retry can process them", async () => {
    const fixture = createService(commandXml("create_auth", "<AuthCode>auth-code-001</AuthCode>"));
    fixture.authorization.handleAuthCode.mockRejectedValueOnce(new Error("temporary upstream failure"));

    await expect(fixture.service.receive(callbackQuery(), encryptedBody())).resolves.toMatchObject({
      infoType: "create_auth",
      handled: true
    });
    await flushDeferredWork();
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

async function flushDeferredWork(): Promise<void> {
  await runImmediateTurn();
  await Promise.resolve();
}

async function runImmediateTurn(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
