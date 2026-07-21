// Vercel Edge Middleware — password-protects the whole site (including /api routes)
// with the browser's native Basic Auth login prompt.
//
// Requires two environment variables set in the Vercel project settings:
//   SITE_USER      — the login username
//   SITE_PASSWORD  — the login password
//
// This runs before every request, so nothing (pages, assets, or the API) is
// reachable without the correct credentials.

export const config = {
  matcher: "/(.*)",
};

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="SP Intelligence"',
    },
  });
}

export default function middleware(request) {
  const expectedUser = process.env.SITE_USER;
  const expectedPass = process.env.SITE_PASSWORD;

  // If credentials aren't configured yet, fail closed (block access) rather
  // than silently letting everyone in.
  if (!expectedUser || !expectedPass) {
    return unauthorized();
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  const encoded = authHeader.slice(6);
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch (e) {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");
  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (user === expectedUser && pass === expectedPass) {
    return; // credentials OK — let the request through
  }

  return unauthorized();
}
