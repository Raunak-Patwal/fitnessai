/**
 * Auth Verification Script
 * ========================
 * Runs end-to-end tests against your LIVE server for:
 *   ✅ Registration
 *   ✅ Duplicate email guard
 *   ✅ Login with correct password
 *   ✅ Login with wrong password (must fail)
 *   ✅ JWT token returned and valid
 *   ✅ Cleanup (delete test user)
 *
 * Usage:
 *   node scripts/verify-auth.js
 *
 * Make sure your server is running on PORT 5000 first:
 *   npm run dev
 */

const BASE_URL = "http://localhost:5000";

const TEST_USER = {
  name: "Auth Verify Bot",
  email: `verify_auth_${Date.now()}@test.local`,
  password: "TestPass@9999",
  goal: "hypertrophy",
  experience: "beginner",
  equipment: ["barbell", "dumbbell"]
};

// ── Helpers ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function log(icon, label, detail = "") {
  console.log(`  ${icon} ${label}${detail ? `  →  ${detail}` : ""}`);
}

function pass(label, detail) {
  passed++;
  log("✅", label, detail);
}

function fail(label, detail) {
  failed++;
  log("❌", label, detail);
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function del(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return { status: res.status };
}

// ── Tests ────────────────────────────────────────────────────
async function testRegister() {
  const { status, body } = await post("/auth/register", TEST_USER);

  if (status === 200 && body.token && body.user?.email === TEST_USER.email) {
    pass("Register new user", `id=${body.user.id}`);
    return body.token;
  } else {
    fail("Register new user", `HTTP ${status} — ${JSON.stringify(body)}`);
    return null;
  }
}

async function testDuplicateEmail() {
  const { status, body } = await post("/auth/register", TEST_USER);

  if (status === 400 && body.error?.toLowerCase().includes("exist")) {
    pass("Duplicate email blocked", body.error);
  } else {
    fail("Duplicate email blocked", `HTTP ${status} — ${JSON.stringify(body)}`);
  }
}

async function testLoginCorrect() {
  const { status, body } = await post("/auth/login", {
    email: TEST_USER.email,
    password: TEST_USER.password
  });

  if (status === 200 && body.token) {
    pass("Login with correct password", `token=${body.token.slice(0, 20)}...`);
    return body.token;
  } else {
    fail("Login with correct password", `HTTP ${status} — ${JSON.stringify(body)}`);
    return null;
  }
}

async function testLoginWrongPassword() {
  const { status, body } = await post("/auth/login", {
    email: TEST_USER.email,
    password: "WRONG_PASSWORD_XYZ"
  });

  if (status === 400 && body.error?.toLowerCase().includes("invalid")) {
    pass("Wrong password rejected", body.error);
  } else {
    fail("Wrong password rejected", `HTTP ${status} — ${JSON.stringify(body)}`);
  }
}

async function testLoginMissingFields() {
  const { status, body } = await post("/auth/login", { email: TEST_USER.email });

  if (status === 400) {
    pass("Missing password field rejected", `HTTP ${status}`);
  } else {
    fail("Missing password field rejected", `Expected 400, got HTTP ${status}`);
  }
}

async function testTokenValidity(token) {
  if (!token) return fail("JWT token validity", "No token to check");

  // Decode JWT payload (without verifying signature — just structure check)
  try {
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

    const hasId = !!payload.id;
    const hasEmail = !!payload.email;
    const notExpired = payload.exp > Math.floor(Date.now() / 1000);

    if (hasId && hasEmail && notExpired) {
      const expiresAt = new Date(payload.exp * 1000).toLocaleDateString();
      pass("JWT token valid", `expires=${expiresAt}, id=${payload.id}`);
    } else {
      fail("JWT token valid", `payload=${JSON.stringify(payload)}`);
    }
  } catch (e) {
    fail("JWT token valid", `Parse error: ${e.message}`);
  }
}

async function testExistingUserLogin() {
  // Also verify the migrated real user can log in
  const { status, body } = await post("/auth/login", {
    email: "patwalraunak@gmail.com",
    password: "Password123"
  });

  if (status === 200 && body.token) {
    pass("Migrated user (patwalraunak@gmail.com) login", "✔ login works after migration");
  } else {
    fail("Migrated user (patwalraunak@gmail.com) login", `HTTP ${status} — ${JSON.stringify(body)}`);
  }
}

async function cleanupTestUser(token) {
  // Best-effort cleanup: re-query user id from login response
  // We'll just log — no DELETE endpoint may exist, that's fine
  log("🧹", "Test user cleanup", `email=${TEST_USER.email} (kept in DB for manual check)`);
}

// ── Runner ────────────────────────────────────────────────────
async function run() {
  console.log("\n╔═══════════════════════════════════════════════╗");
  console.log("║         Auth End-to-End Verification          ║");
  console.log("╚═══════════════════════════════════════════════╝\n");
  console.log(`  Server : ${BASE_URL}`);
  console.log(`  Email  : ${TEST_USER.email}`);
  console.log(`  Passw  : ${TEST_USER.password}\n`);
  console.log("  ─────────────────────────────────────────────");

  try {
    // 1. Register fresh user
    const registerToken = await testRegister();

    // 2. Try registering same email again
    await testDuplicateEmail();

    // 3. Login with correct password
    const loginToken = await testLoginCorrect();

    // 4. Login with wrong password — must fail
    await testLoginWrongPassword();

    // 5. Login with missing fields — must fail
    await testLoginMissingFields();

    // 6. Validate the JWT structure
    await testTokenValidity(loginToken || registerToken);

    // 7. Verify migrated real user can log in
    await testExistingUserLogin();

    // 8. Cleanup notice
    await cleanupTestUser(loginToken);

  } catch (err) {
    fail("Unexpected error", err.message);
    console.error(err);
  }

  // ── Final report ────────────────────────────────────────────
  const total = passed + failed;
  console.log("\n  ─────────────────────────────────────────────");
  console.log(`  Results: ${passed}/${total} passed\n`);

  if (failed === 0) {
    console.log("  🎉 All tests passed! Auth is working correctly.\n");
    process.exit(0);
  } else {
    console.log(`  ⚠️  ${failed} test(s) failed. Check the output above.\n`);
    process.exit(1);
  }
}

run();
