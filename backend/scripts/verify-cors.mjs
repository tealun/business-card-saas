const backendOrigin = process.env.BACKEND_PUBLIC_ORIGIN || process.argv[2];
const adminOrigin = process.env.ADMIN_PUBLIC_ORIGIN || process.argv[3];
const method = (process.env.CORS_CHECK_METHOD || "PATCH").toUpperCase();
const path = process.env.CORS_CHECK_PATH || "/api/v1/admin/platform/tenants/1";
const requestedHeaders = process.env.CORS_CHECK_HEADERS || "authorization, content-type";

if (!backendOrigin || !adminOrigin) {
  console.error("Usage: node scripts/verify-cors.mjs <backend-origin> <admin-origin>");
  console.error("Or set BACKEND_PUBLIC_ORIGIN and ADMIN_PUBLIC_ORIGIN.");
  process.exitCode = 1;
} else {
  try {
    await verifyCors();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`CORS preflight request failed: ${message}`);
    process.exitCode = 1;
  }
}

async function verifyCors() {
  const url = new URL(path, backendOrigin);
  const response = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: adminOrigin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": requestedHeaders
    }
  });

  const allowOrigin = response.headers.get("access-control-allow-origin") || "";
  const allowMethods = response.headers.get("access-control-allow-methods") || "";
  const allowHeaders = response.headers.get("access-control-allow-headers") || "";
  const methods = allowMethods.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  const headers = allowHeaders.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);

  const failures = [];
  if (response.status < 200 || response.status >= 300) {
    failures.push(`expected 2xx OPTIONS response, got ${response.status}`);
  }
  if (allowOrigin !== adminOrigin && allowOrigin !== "*") {
    failures.push(`expected access-control-allow-origin to allow ${adminOrigin}, got "${allowOrigin}"`);
  }
  if (!methods.includes(method)) {
    failures.push(`expected access-control-allow-methods to include ${method}, got "${allowMethods}"`);
  }
  for (const header of requestedHeaders.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)) {
    if (!headers.includes(header)) {
      failures.push(`expected access-control-allow-headers to include ${header}, got "${allowHeaders}"`);
    }
  }

  if (failures.length) {
    console.error(`CORS preflight failed for ${url.href}`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`CORS preflight ok: ${adminOrigin} may ${method} ${url.href}`);
}
