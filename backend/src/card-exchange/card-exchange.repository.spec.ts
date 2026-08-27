import { ForbiddenException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { CardExchangeRepository } from "./card-exchange.repository.js";

const sender: EmployeeSession = {
  accountId: "account-sender",
  tenantId: "tenant-sender",
  memberIdentityId: "identity-sender",
  openUserid: "open-sender",
  publicId: "pub_sender001"
};
const recipient: EmployeeSession = {
  accountId: "owner:pub_receiver01",
  tenantId: "tenant:pub_receiver01",
  memberIdentityId: "identity:pub_receiver01",
  openUserid: "open-recipient",
  publicId: "pub_receiver01"
};
const senderCard = { public_id: "pub_sender001", display_name: "Sender", title: "Sales", company: "A", avatar_url: null };
const recipientCard = { public_id: "pub_receiver01", display_name: "Recipient", title: "Buyer", company: "B", avatar_url: null };

describe("CardExchangeRepository", () => {
  function repository() {
    return new CardExchangeRepository({ isConfigured: () => false } as DatabaseService);
  }

  it("creates one pending request per directed identity pair", async () => {
    const repo = repository();
    const first = await repo.create(sender, senderCard, recipientCard, "visit-1");
    const second = await repo.create(sender, senderCard, recipientCard, "visit-2");
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.request.request_id).toBe(first.request.request_id);
  });

  it("exposes unread incoming requests and marks them read", async () => {
    const repo = repository();
    await repo.create(sender, senderCard, recipientCard, "visit-1");
    await expect(repo.list(recipient)).resolves.toMatchObject({ unread_count: 1, pending_count: 1 });
    await repo.markIncomingRead(recipient);
    await expect(repo.list(recipient)).resolves.toMatchObject({ unread_count: 0, pending_count: 1 });
  });

  it("allows only the recipient identity to accept and is idempotent", async () => {
    const repo = repository();
    const created = await repo.create(sender, senderCard, recipientCard, "visit-1");
    await expect(repo.respond(sender, created.request.request_id, "accepted")).rejects.toBeInstanceOf(ForbiddenException);
    const accepted = await repo.respond(recipient, created.request.request_id, "accepted");
    expect(accepted.request.status).toBe("accepted");
    await expect(repo.respond(recipient, created.request.request_id, "accepted")).resolves.toMatchObject({ idempotent: true });
  });

  it("does not expose a request after switching identities", async () => {
    const repo = repository();
    await repo.create(sender, senderCard, recipientCard, "visit-1");
    const switched = { ...recipient, memberIdentityId: "another-identity" };
    await expect(repo.list(switched)).resolves.toMatchObject({ unread_count: 0, requests: [] });
  });

  it("recovers an existing request when concurrent insertion wins", async () => {
    const queries: string[] = [];
    const row = {
      request_id: "exr-raced",
      sender_account_id: sender.accountId,
      sender_tenant_id: sender.tenantId,
      sender_member_identity_id: sender.memberIdentityId,
      sender_card_snapshot: senderCard,
      recipient_account_id: "account-recipient",
      recipient_tenant_id: "tenant-recipient",
      recipient_member_identity_id: "identity-recipient",
      recipient_card_snapshot: recipientCard,
      source_visit_id: "visit-1",
      status: "pending",
      recipient_read_at: null,
      responded_at: null,
      created_at: new Date()
    };
    let pendingReads = 0;
    const tx = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("FROM cards\n       WHERE public_id")) return { rows: [{ card_id: "card-sender", tenant_id: sender.tenantId, member_identity_id: sender.memberIdentityId }] };
        if (sql.includes("FROM public_card_directory")) return { rows: [{ tenant_id: "tenant-recipient", card_id: "card-recipient" }] };
        if (sql.includes("FROM cards JOIN account_identity_bindings")) return { rows: [{ account_id: "account-recipient", tenant_id: "tenant-recipient", card_id: "card-recipient", member_identity_id: "identity-recipient" }] };
        if (sql.includes("SELECT * FROM card_exchange_requests")) {
          pendingReads += 1;
          return { rows: pendingReads === 1 ? [] : [row] };
        }
        if (sql.includes("INSERT INTO card_exchange_requests")) return { rows: [] };
        return { rows: [] };
      }
    };
    const database = {
      isConfigured: () => true,
      transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)
    } as unknown as DatabaseService;
    const repo = new CardExchangeRepository(database);
    await expect(repo.create(sender, senderCard, recipientCard, "visit-1")).resolves.toMatchObject({ idempotent: true });
    expect(queries.some((sql) => sql.includes("ON CONFLICT") && sql.includes("DO NOTHING"))).toBe(true);
    expect(queries.every((sql) => !sql.includes("bindings.is_default"))).toBe(true);
  });

  it("auto-accepts when the other identity already sent a pending request", async () => {
    const repo = repository();
    await repo.create(sender, senderCard, recipientCard, "visit-1");
    const reverse = await repo.create(recipient, recipientCard, senderCard, "visit-2");
    expect(reverse.auto_accepted).toBe(true);
    expect(reverse.request.status).toBe("accepted");
    await expect(repo.list(sender)).resolves.toMatchObject({ pending_count: 0 });
    await expect(repo.list(recipient)).resolves.toMatchObject({ pending_count: 0 });
  });

  it("enforces a seven-day retry cooldown after ignore", async () => {
    const repo = repository();
    const created = await repo.create(sender, senderCard, recipientCard, "visit-1");
    await repo.respond(recipient, created.request.request_id, "ignored");
    await expect(repo.create(sender, senderCard, recipientCard, "visit-2")).rejects.toThrow("cooling down until");
  });

  it("allows only the sender identity to withdraw a pending request", async () => {
    const repo = repository();
    const created = await repo.create(sender, senderCard, recipientCard, "visit-1");
    await expect(repo.withdraw(recipient, created.request.request_id)).rejects.toThrow("not found");
    const withdrawn = await repo.withdraw(sender, created.request.request_id);
    expect(withdrawn.request.status).toBe("withdrawn");
    await expect(repo.withdraw(sender, created.request.request_id)).resolves.toMatchObject({ idempotent: true });
  });
});
