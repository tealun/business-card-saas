const fs = require("fs");
const path = require("path");

/**
 * Baseline migration: applies the initial schema and RLS policies.
 * New migrations after this point should use incremental ALTER/CREATE
 * statements rather than editing this file.
 */
exports.up = (pgm) => {
  const schemaSql = fs.readFileSync(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf8");
  const rlsSql = fs.readFileSync(path.join(__dirname, "..", "..", "database", "rls.sql"), "utf8");
  pgm.sql(schemaSql);
  pgm.sql(rlsSql);
};

exports.down = () => {
  throw new Error("Baseline migration cannot be safely reversed. Restore from a backup instead.");
};
