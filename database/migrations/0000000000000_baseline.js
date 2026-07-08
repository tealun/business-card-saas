const fs = require("fs");
const path = require("path");

/**
 * Baseline migration: applies the initial schema and RLS policies.
 * New migrations after this point should use incremental ALTER/CREATE
 * statements rather than editing this file.
 */
exports.up = (pgm) => {
  const schemaSql = readDatabaseSql("schema.sql");
  const rlsSql = readDatabaseSql("rls.sql");
  pgm.sql(schemaSql);
  pgm.sql(rlsSql);
};

exports.down = () => {
  throw new Error("Baseline migration cannot be safely reversed. Restore from a backup instead.");
};

function readDatabaseSql(fileName) {
  const candidates = [
    path.join(__dirname, "..", "..", "database", fileName),
    path.join(__dirname, "..", "database", fileName)
  ];
  const sqlPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sqlPath) {
    throw new Error(`Cannot find database/${fileName}. Checked: ${candidates.join(", ")}`);
  }
  return fs.readFileSync(sqlPath, "utf8");
}
