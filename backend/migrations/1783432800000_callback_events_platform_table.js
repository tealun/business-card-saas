exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE callback_events DISABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_callback_events ON callback_events;
  `);
};

exports.down = () => {
  throw new Error("callback_events platform-table migration cannot be safely reversed automatically.");
};
