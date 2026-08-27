import { CardExchangeService } from "./card-exchange.service.js";

const session = {
  accountId: "account-1",
  tenantId: "tenant-1",
  memberIdentityId: "identity-1",
  openUserid: "open-1",
  publicId: "pub_sender001"
};

const senderCard = {
  public_id: "pub_sender001",
  card: { display_name: "Sender", title: "Sales", company: "A", avatar_url: null }
};
const recipientCard = {
  public_id: "pub_receiver01",
  card: { display_name: "Recipient", title: "Buyer", company: "B", avatar_url: null }
};
const requestItem = {
  request_id: "exr-1",
  direction: "outgoing",
  status: "pending",
  unread: false,
  counterpart: {
    public_id: "pub_receiver01",
    display_name: "Recipient",
    title: "Buyer",
    company: "B",
    avatar_url: null
  },
  created_at: "2026-08-27T00:00:00.000Z",
  responded_at: null
};

describe("CardExchangeService", () => {
  it("returns a successful create result when notification preparation fails", async () => {
    const repository = {
      create: jest.fn().mockResolvedValue({ request: requestItem, idempotent: false, auto_accepted: false }),
      prepareNotification: jest.fn().mockRejectedValue(new Error("notification database unavailable"))
    };
    const service = new CardExchangeService(
      repository as never,
      { findVisit: jest.fn().mockResolvedValue({ visitId: "visit-1" }), findPublicCard: jest.fn()
        .mockResolvedValueOnce(senderCard).mockResolvedValueOnce(recipientCard) } as never,
      { verify: jest.fn().mockReturnValue({ visitId: "visit-1", publicId: "pub_receiver01" }) } as never,
      { wechatCardExchangeTemplateId: "" } as never,
      { sendCardExchangeMessage: jest.fn() } as never
    );

    await expect(service.create(session, {
      recipient_public_id: "pub_receiver01",
      visit_token: "visit-token-with-enough-length"
    })).resolves.toMatchObject({ request: { request_id: "exr-1" } });
  });

  it("returns a successful acceptance when delivery status persistence fails", async () => {
    const accepted = { ...requestItem, direction: "incoming", status: "accepted", responded_at: "2026-08-27T00:01:00.000Z" };
    const repository = {
      respond: jest.fn().mockResolvedValue({ request: accepted, idempotent: false, auto_accepted: false }),
      prepareNotification: jest.fn().mockResolvedValue({
        deliveryId: "1", openid: "openid-1", templateId: "template-1", counterpartName: "Recipient"
      }),
      completeNotification: jest.fn().mockRejectedValue(new Error("delivery update failed"))
    };
    const service = new CardExchangeService(
      repository as never, {} as never, {} as never, {} as never,
      { sendCardExchangeMessage: jest.fn().mockResolvedValue(undefined) } as never
    );

    await expect(service.respond(session, "exr-1", "accepted")).resolves.toMatchObject({
      request: { status: "accepted" }
    });
  });
});
