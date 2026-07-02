-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "accounts" (
    "id" BIGSERIAL NOT NULL,
    "wx_unionid" VARCHAR(128),
    "primary_wx_openid" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "open_corpid" VARCHAR(128) NOT NULL,
    "auth_status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_identities" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "open_userid" VARCHAR(128),
    "name" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "member_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_identity_bindings" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "member_identity_id" BIGINT NOT NULL,
    "bind_source" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_identity_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_preferences" (
    "account_id" BIGINT NOT NULL,
    "default_member_identity_id" BIGINT,
    "last_member_identity_id" BIGINT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_preferences_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "member_identity_id" BIGINT NOT NULL,
    "public_id" VARCHAR(32) NOT NULL,
    "card_type" VARCHAR(32) NOT NULL DEFAULT 'primary',
    "slug" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(128),
    "title" VARCHAR(128),
    "email_encrypted" TEXT,
    "phone_encrypted" TEXT,
    "privacy_json" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_card_directory" (
    "public_id" VARCHAR(32) NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "card_id" BIGINT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "card_updated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_card_directory_pkey" PRIMARY KEY ("public_id")
);

-- CreateTable
CREATE TABLE "visitor_accounts" (
    "id" BIGSERIAL NOT NULL,
    "appid" VARCHAR(64) NOT NULL,
    "wx_openid" VARCHAR(128),
    "wx_unionid" VARCHAR(128),
    "nickname" VARCHAR(128),
    "avatar" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visitor_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_visits" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "card_id" BIGINT NOT NULL,
    "member_identity_id" BIGINT NOT NULL,
    "visitor_account_id" BIGINT,
    "share_id" VARCHAR(64),
    "visit_id" VARCHAR(64),
    "anon_id" VARCHAR(64),
    "trust_level" VARCHAR(32) NOT NULL DEFAULT 'anonymous_client',
    "channel" VARCHAR(64),
    "user_agent" TEXT,
    "ip_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_actions" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "card_id" BIGINT NOT NULL,
    "member_identity_id" BIGINT NOT NULL,
    "visitor_account_id" BIGINT,
    "action_type" VARCHAR(64) NOT NULL,
    "share_id" VARCHAR(64),
    "visit_id" VARCHAR(64),
    "trust_level" VARCHAR(32) NOT NULL DEFAULT 'anonymous_client',
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_shares" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "card_id" BIGINT NOT NULL,
    "member_identity_id" BIGINT NOT NULL,
    "public_share_id" VARCHAR(64) NOT NULL,
    "parent_share_id" VARCHAR(64),
    "issuer_type" VARCHAR(16) NOT NULL DEFAULT 'member',
    "issuer_visitor_account_id" BIGINT,
    "depth" SMALLINT NOT NULL DEFAULT 0,
    "channel" VARCHAR(64),
    "scene" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uk_accounts_unionid" ON "accounts"("wx_unionid");

-- CreateIndex
CREATE UNIQUE INDEX "uk_tenants_open_corpid" ON "tenants"("open_corpid");

-- CreateIndex
CREATE INDEX "idx_member_tenant" ON "member_identities"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_mi_tenant_id" ON "member_identities"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_member_open_userid" ON "member_identities"("tenant_id", "open_userid");

-- CreateIndex
CREATE INDEX "idx_binding_account" ON "account_identity_bindings"("account_id");

-- CreateIndex
CREATE INDEX "idx_binding_tenant" ON "account_identity_bindings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_account_identity" ON "account_identity_bindings"("account_id", "member_identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_cards_public_id" ON "cards"("public_id");

-- CreateIndex
CREATE INDEX "idx_cards_tenant" ON "cards"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_cards_tenant_id" ON "cards"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idx_public_card_directory_tenant" ON "public_card_directory"("tenant_id", "card_id");

-- CreateIndex
CREATE INDEX "idx_visitor_unionid" ON "visitor_accounts"("wx_unionid");

-- CreateIndex
CREATE UNIQUE INDEX "uk_visitor_app_openid" ON "visitor_accounts"("appid", "wx_openid");

-- CreateIndex
CREATE UNIQUE INDEX "uk_visit_id" ON "card_visits"("visit_id");

-- CreateIndex
CREATE INDEX "idx_visit_card" ON "card_visits"("tenant_id", "card_id");

-- CreateIndex
CREATE INDEX "idx_visit_share" ON "card_visits"("tenant_id", "share_id");

-- CreateIndex
CREATE INDEX "idx_visit_created" ON "card_visits"("created_at");

-- CreateIndex
CREATE INDEX "idx_action_card" ON "card_actions"("tenant_id", "card_id");

-- CreateIndex
CREATE INDEX "idx_action_type" ON "card_actions"("tenant_id", "action_type");

-- CreateIndex
CREATE UNIQUE INDEX "uk_action_idem" ON "card_actions"("visit_id", "action_type");

-- CreateIndex
CREATE UNIQUE INDEX "uk_public_share_id" ON "card_shares"("public_share_id");

-- CreateIndex
CREATE INDEX "idx_share_card" ON "card_shares"("tenant_id", "card_id");

-- CreateIndex
CREATE INDEX "idx_share_member" ON "card_shares"("tenant_id", "member_identity_id");

-- AddForeignKey
ALTER TABLE "member_identities" ADD CONSTRAINT "member_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_identity_bindings" ADD CONSTRAINT "account_identity_bindings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_identity_bindings" ADD CONSTRAINT "account_identity_bindings_member_identity_id_fkey" FOREIGN KEY ("member_identity_id") REFERENCES "member_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenant_id_member_identity_id_fkey" FOREIGN KEY ("tenant_id", "member_identity_id") REFERENCES "member_identities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_visits" ADD CONSTRAINT "card_visits_tenant_id_card_id_fkey" FOREIGN KEY ("tenant_id", "card_id") REFERENCES "cards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_actions" ADD CONSTRAINT "card_actions_tenant_id_card_id_fkey" FOREIGN KEY ("tenant_id", "card_id") REFERENCES "cards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_shares" ADD CONSTRAINT "card_shares_tenant_id_card_id_fkey" FOREIGN KEY ("tenant_id", "card_id") REFERENCES "cards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

