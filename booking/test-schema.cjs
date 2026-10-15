const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const db = new DatabaseSync(":memory:");
const dir = path.join(__dirname, "migrations");
try {
  for (const file of ["0001_booking.sql", "0002_services.sql"]) {
    db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
    console.log("PASS:", file);
  }
  console.log("TABLES:");
  for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()) {
    console.log(" -", row.name);
  }
  console.log("SERVICES:");
  for (const row of db.prepare("SELECT service_type, display_name FROM service_types ORDER BY service_type").all()) {
    console.log(" -", row.service_type, "|", row.display_name);
  }
} catch (error) {
  console.error("SCHEMA TEST FAILED:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}