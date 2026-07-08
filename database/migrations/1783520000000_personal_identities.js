exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(32) NOT NULL DEFAULT 'enterprise';

    CREATE UNIQUE INDEX IF NOT EXISTS uk_accounts_primary_wx_openid
      ON accounts(primary_wx_openid)
      WHERE primary_wx_openid IS NOT NULL;
  `);
};

exports.down = () => {
  throw new Error("personal identities migration cannot be safely reversed automatically.");
};
