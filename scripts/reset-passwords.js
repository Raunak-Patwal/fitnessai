/**
 * Password Reset Migration Script
 * ================================
 * Fixes double-hashed passwords caused by the previous bug where
 * routes manually hashed + Mongoose pre-save hook hashed again.
 *
 * Usage:
 *   node scripts/reset-passwords.js                         # reset all to "Password123"
 *   node scripts/reset-passwords.js --password MyNewPass     # reset all to custom password
 *   node scripts/reset-passwords.js --email user@example.com # reset one user only
 *   node scripts/reset-passwords.js --dry-run                # preview without changing anything
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

// ── Parse CLI args ──────────────────────────────────────────
const args = process.argv.slice(2);
function getFlag(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}

const NEW_PASSWORD = getFlag("password") || "Password123";
const TARGET_EMAIL = getFlag("email");
const DRY_RUN = args.includes("--dry-run");

// ── Main ────────────────────────────────────────────────────
async function main() {
  await connectDB();

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Password Reset Migration Script        ║");
  console.log("╚══════════════════════════════════════════╝\n");

  if (DRY_RUN) {
    console.log("  ⚠️  DRY RUN MODE — no changes will be saved\n");
  }

  // Build query
  const query = TARGET_EMAIL
    ? { email: TARGET_EMAIL.toLowerCase().trim() }
    : {};

  const users = await User.find(query).select("name email password");

  if (users.length === 0) {
    console.log("  No users found matching the criteria.\n");
    process.exit(0);
  }

  console.log(`  Found ${users.length} user(s) to reset:\n`);
  console.log("  ┌─────────────────────────────────┬──────────────────────────────────┐");
  console.log("  │ Name                            │ Email                            │");
  console.log("  ├─────────────────────────────────┼──────────────────────────────────┤");

  for (const u of users) {
    const name = (u.name || "—").padEnd(31);
    const email = (u.email || "—").padEnd(32);
    console.log(`  │ ${name} │ ${email} │`);
  }

  console.log("  └─────────────────────────────────┴──────────────────────────────────┘\n");

  if (DRY_RUN) {
    console.log("  Dry run complete — exiting without changes.\n");
    process.exit(0);
  }

  // Reset passwords one-by-one via .save() so the pre-save hook hashes correctly
  let success = 0;
  let failed = 0;

  for (const user of users) {
    try {
      user.password = NEW_PASSWORD; // plain text — pre-save hook will hash it
      await user.save();
      success++;
      console.log(`  ✅ ${user.email} — password reset`);
    } catch (err) {
      failed++;
      console.error(`  ❌ ${user.email} — FAILED: ${err.message}`);
    }
  }

  console.log(`\n  ─── Results ───`);
  console.log(`  ✅ Success: ${success}`);
  if (failed) console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  🔑 New password: "${NEW_PASSWORD}"`);
  console.log(`\n  Done. Users can now log in with the new password.\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
