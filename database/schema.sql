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
    "permanent_code_encrypted" TEXT,
    "agent_id" VARCHAR(64),
    "auth_scope_json" JSONB,
    "authorized_at" TIMESTAMPTZ(6),
    "corp_access_token_encrypted" TEXT,
    "corp_access_token_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wecom_suite_state" (
    "suite_id" VARCHAR(128) NOT NULL,
    "suite_ticket_encrypted" TEXT,
    "suite_ticket_updated_at" TIMESTAMPTZ(6),
    "suite_access_token_encrypted" TEXT,
    "suite_access_token_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wecom_suite_state_pkey" PRIMARY KEY ("suite_id")
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
CREATE TABLE "templates" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "scope" VARCHAR(32) NOT NULL DEFAULT 'tenant',
    "department_id" BIGINT,
    "background_url" TEXT,
    "logo_url" TEXT,
    "color_scheme_json" JSONB,
    "layout_json" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "admin_claim_tokens" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_claim_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(128),
    "logo_url" TEXT,
    "website_url" TEXT,
    "address" TEXT,
    "intro_json" JSONB,
    "certification_json" JSONB,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_videos" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "video_url" TEXT NOT NULL,
    "cover_url" TEXT,
    "duration_seconds" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_honors" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_honors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_honor_images" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "honor_id" BIGINT NOT NULL,
    "image_url" TEXT NOT NULL,
    "title" VARCHAR(255),
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_honor_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_style_overrides" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "card_id" BIGINT NOT NULL,
    "template_id" BIGINT,
    "background_url" TEXT,
    "color_scheme_json" JSONB,
    "layout_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "card_style_overrides_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "uk_templates_tenant_id" ON "templates"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idx_templates_tenant_scope" ON "templates"("tenant_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "uk_tpl_default_active" ON "templates"("tenant_id") WHERE "is_default" = true AND "deleted_at" IS NULL;

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

-- CreateIndex
CREATE INDEX "idx_tenant_admin_tenant" ON "tenant_admins"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_tenant_admin_user" ON "tenant_admins"("tenant_id", "open_userid");

-- CreateIndex
CREATE INDEX "idx_admin_claim_tenant" ON "admin_claim_tokens"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_admin_claim_token" ON "admin_claim_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uk_company_profiles_tenant_id" ON "company_profiles"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idx_company_profiles_tenant" ON "company_profiles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_company_profiles_active" ON "company_profiles"("tenant_id") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "idx_company_videos_tenant_sort" ON "company_videos"("tenant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uk_company_honors_tenant_id" ON "company_honors"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idx_company_honors_tenant_sort" ON "company_honors"("tenant_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_company_honor_images_honor_sort" ON "company_honor_images"("tenant_id", "honor_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_card_style_overrides_card" ON "card_style_overrides"("tenant_id", "card_id");

-- CreateIndex
CREATE INDEX "idx_card_style_overrides_template" ON "card_style_overrides"("tenant_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "uk_card_style_override_active" ON "card_style_overrides"("tenant_id", "card_id") WHERE "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "member_identities" ADD CONSTRAINT "member_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_identity_bindings" ADD CONSTRAINT "account_identity_bindings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_identity_bindings" ADD CONSTRAINT "account_identity_bindings_member_identity_id_fkey" FOREIGN KEY ("member_identity_id") REFERENCES "member_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "tenant_admins" ADD CONSTRAINT "tenant_admins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_admins" ADD CONSTRAINT "tenant_admins_tenant_id_member_identity_id_fkey" FOREIGN KEY ("tenant_id", "member_identity_id") REFERENCES "member_identities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_claim_tokens" ADD CONSTRAINT "admin_claim_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_videos" ADD CONSTRAINT "company_videos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_honors" ADD CONSTRAINT "company_honors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_honor_images" ADD CONSTRAINT "company_honor_images_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_honor_images" ADD CONSTRAINT "company_honor_images_tenant_id_honor_id_fkey" FOREIGN KEY ("tenant_id", "honor_id") REFERENCES "company_honors"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_style_overrides" ADD CONSTRAINT "card_style_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_style_overrides" ADD CONSTRAINT "card_style_overrides_tenant_id_card_id_fkey" FOREIGN KEY ("tenant_id", "card_id") REFERENCES "cards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_style_overrides" ADD CONSTRAINT "card_style_overrides_tenant_id_template_id_fkey" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

