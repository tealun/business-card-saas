import { WecomCallbackEventRepository } from "./wecom-callback-event.repository.js";

describe("WecomCallbackEventRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("skips callback events already marked done", async () => {
    const repository = new WecomCallbackEventRepository();

    const first = await repository.beginProcessing(eventInput("event-001"));
    await repository.markDone("event-001", "tenant-001");
    const duplicate = await repository.beginProcessing(eventInput("event-001"));

    expect(first).toEqual({ shouldProcess: true, status: "processing", retryCount: 0 });
    expect(duplicate).toEqual({ shouldProcess: false, status: "done", retryCount: 0 });
  });

  it("allows failed callback events to be retried", async () => {
    const repository = new WecomCallbackEventRepository();

    await repository.beginProcessing(eventInput("event-002"));
    await repository.markFailed("event-002", new Error("temporary failure"), "tenant-001");
    const retry = await repository.beginProcessing(eventInput("event-002"));

    expect(retry).toEqual({ shouldProcess: true, status: "processing", retryCount: 1 });
  });
});

function eventInput(eventKey: string) {
  return {
    source: "data" as const,
    eventKey,
    tenantId: "tenant-001",
    eventType: "change_contact",
    changeType: "update_user",
    payloadEncrypted: "cipher"
  };
}
