import { describe, expect, it } from "vitest";

const GITHUB_URL = "http://localhost:4000";
const GOOGLE_URL = "http://localhost:4001";
const APPLE_URL = "http://localhost:4002";
const STRIPE_URL = "http://localhost:4003";
const RESEND_URL = "http://localhost:4004";

async function json(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.json() };
}

describe("github emulator", () => {
  it("returns seeded user via token auth", async () => {
    const { status, body } = await json(`${GITHUB_URL}/user`, {
      headers: { Authorization: "token test_token_admin" },
    });
    expect(status).toBe(200);
    expect(body.login).toBe("dev-user");
    expect(body.name).toBe("Dev User");
    expect(body.email).toBe("dev@gmacko.localhost");
  });

  it("returns user data for any bearer token", async () => {
    const { status, body } = await json(`${GITHUB_URL}/user`, {
      headers: { Authorization: "token any_token" },
    });
    expect(status).toBe(200);
    expect(body.login).toBeDefined();
    expect(body.type).toBe("User");
  });

  it("exposes the OAuth authorization endpoint", async () => {
    const res = await fetch(
      `${GITHUB_URL}/login/oauth/authorize?client_id=dev-github-client&redirect_uri=https://gmacko.localhost/api/auth/callback/github&scope=user:email`,
      { redirect: "manual" },
    );
    expect([200, 302]).toContain(res.status);
  });

  it("rejects invalid OAuth client credentials on token exchange", async () => {
    const { body } = await json(`${GITHUB_URL}/login/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "client_id=wrong&client_secret=wrong&code=fake",
    });
    expect(body.error).toBeDefined();
  });
});

describe("google emulator", () => {
  it("serves OIDC discovery document", async () => {
    const { status, body } = await json(
      `${GOOGLE_URL}/.well-known/openid-configuration`,
    );
    expect(status).toBe(200);
    expect(body.issuer).toBe(GOOGLE_URL);
    expect(body.authorization_endpoint).toContain("/o/oauth2/v2/auth");
    expect(body.token_endpoint).toContain("/oauth2/token");
    expect(body.userinfo_endpoint).toContain("/oauth2/v2/userinfo");
    expect(body.jwks_uri).toContain("/oauth2/v3/certs");
  });

  it("serves JWKS endpoint", async () => {
    const { status, body } = await json(`${GOOGLE_URL}/oauth2/v3/certs`);
    expect(status).toBe(200);
    expect(body.keys).toBeDefined();
    expect(Array.isArray(body.keys)).toBe(true);
  });
});

describe("apple emulator", () => {
  it("serves JWKS at /auth/keys", async () => {
    const { status, body } = await json(`${APPLE_URL}/auth/keys`);
    expect(status).toBe(200);
    expect(body.keys).toBeDefined();
    expect(body.keys.length).toBeGreaterThan(0);
    expect(body.keys[0].kty).toBe("RSA");
  });

  it("exposes the authorization endpoint", async () => {
    const res = await fetch(
      `${APPLE_URL}/auth/authorize?client_id=com.gmacko.dev&redirect_uri=https://gmacko.localhost/api/auth/callback/apple&response_type=code&scope=name+email`,
      { redirect: "manual" },
    );
    expect([200, 302]).toContain(res.status);
  });
});

describe("stripe emulator", () => {
  const stripeHeaders = {
    Authorization: "Basic " + btoa("sk_test_fake:"),
  };

  it("returns seeded products", async () => {
    const { status, body } = await json(`${STRIPE_URL}/v1/products`, {
      headers: stripeHeaders,
    });
    expect(status).toBe(200);
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Pro Plan");
    expect(body.data[0].description).toBe("Monthly pro subscription");
    expect(body.data[0].active).toBe(true);
  });

  it("returns seeded prices with correct amounts", async () => {
    const { status, body } = await json(`${STRIPE_URL}/v1/prices`, {
      headers: stripeHeaders,
    });
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].currency).toBe("usd");
    expect(body.data[0].unit_amount).toBe(2000);
  });

  it("creates a customer", async () => {
    const { status, body } = await json(`${STRIPE_URL}/v1/customers`, {
      method: "POST",
      headers: {
        ...stripeHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "email=test@example.com&name=Test+User",
    });
    expect(status).toBe(200);
    expect(body.id).toMatch(/^cus_/);
    expect(body.email).toBe("test@example.com");
  });
});

describe("resend emulator", () => {
  const resendHeaders = {
    Authorization: "Bearer re_test_fake",
    "Content-Type": "application/json",
  };

  it("returns seeded domains", async () => {
    const { status, body } = await json(`${RESEND_URL}/domains`, {
      headers: resendHeaders,
    });
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("gmacko.localhost");
    expect(body.data[0].status).toBe("verified");
  });

  it("sends an email and returns an ID", async () => {
    const { status, body } = await json(`${RESEND_URL}/emails`, {
      method: "POST",
      headers: resendHeaders,
      body: JSON.stringify({
        from: "noreply@gmacko.localhost",
        to: "dev@test.com",
        subject: "Integration test",
        html: "<p>hello from tests</p>",
      }),
    });
    expect(status).toBe(200);
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe("string");
  });
});

describe("postgres emulator", () => {
  it("accepts connections on the wire protocol port", async () => {
    const { createConnection } = await import("node:net");
    const connected = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ port: 5432, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    expect(connected).toBe(true);
  });
});
