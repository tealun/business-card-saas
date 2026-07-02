-- Owner bootstrap tables.

CREATE TABLE "tenant_admins" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "member_identity_id" BIGINT,
    "open_userid" VARCHAR(128),
    "role" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_claim_tokens" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_claim_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_tenant_admin_tenant" ON "tenant_admins"("tenant_id");

CREATE UNIQUE INDEX "uk_tenant_admin_user" ON "tenant_admins"("tenant_id", "open_userid");

CREATE INDEX "idx_admin_claim_tenant" ON "admin_claim_tokens"("tenant_id");

CREATE UNIQUE INDEX "uk_admin_claim_token" ON "admin_claim_tokens"("token_hash");

ALTER TABLE "tenant_admins" ADD CONSTRAINT "tenant_admins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_admins" ADD CONSTRAINT "tenant_admins_tenant_id_member_identity_id_fkey" FOREIGN KEY ("tenant_id", "member_identity_id") REFERENCES "member_identities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_claim_tokens" ADD CONSTRAINT "admin_claim_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
