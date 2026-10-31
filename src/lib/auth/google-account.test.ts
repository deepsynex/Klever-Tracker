import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/graphql/mock", () => ({ MOCK_USER: { email: "admin@demo.test" } }));
const env = { mock: false, serviceEmail: "svc@klever.test", servicePassword: "secret" };
vi.mock("@/lib/env", () => ({ env }));
const kleverRequest = vi.fn();
const kleverFetch = vi.fn();
vi.mock("@/lib/graphql/klever", () => ({
  kleverRequest: (...args: unknown[]) => kleverRequest(...args),
  kleverFetch: (...args: unknown[]) => kleverFetch(...args),
}));

const ok = (data: unknown) => ({ ok: true, data });
const login = (token: string) => ok({ login: { token, user: { id: "9", name: "Svc", email: "svc@klever.test" } } });
const page = (emails: string[], lastPage = 1) =>
  ok({ users: { data: emails.map((email) => ({ email })), paginatorInfo: { lastPage } } });

async function load() {
  vi.resetModules();
  return (await import("./google-account")).findKleverUserByEmail;
}

describe("findKleverUserByEmail", () => {
  beforeEach(() => {
    kleverRequest.mockReset();
    Object.assign(env, { mock: false, serviceEmail: "svc@klever.test", servicePassword: "secret" });
  });

  it("finds an email case-insensitively across pages", async () => {
    const find = await load();
    kleverRequest
      .mockResolvedValueOnce(login("t1"))
      .mockResolvedValueOnce(page(["a@x.com"], 2))
      .mockResolvedValueOnce(page(["Driver@Fleet.ae"], 2));
    expect(await find(" driver@fleet.AE ")).toBe("found");
    expect(kleverRequest.mock.calls[2][1]).toEqual({ first: 200, page: 2 });
    expect(kleverRequest.mock.calls[2][2]).toEqual({ token: "t1" });
  });

  it("reports not_found when no page has the email", async () => {
    const find = await load();
    kleverRequest.mockResolvedValueOnce(login("t1")).mockResolvedValueOnce(page(["a@x.com"]));
    expect(await find("b@x.com")).toBe("not_found");
  });

  it("signs the service account in once and reuses the token", async () => {
    const find = await load();
    kleverRequest.mockResolvedValueOnce(login("t1")).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([]));
    await find("a@x.com");
    await find("b@x.com");
    expect(kleverRequest).toHaveBeenCalledTimes(3);
  });

  it("signs in again when the stored token was revoked", async () => {
    const find = await load();
    kleverRequest
      .mockResolvedValueOnce(login("old"))
      .mockResolvedValueOnce({ ok: false, error: { kind: "unauthenticated", message: "Unauthenticated." } })
      .mockResolvedValueOnce(login("new"))
      .mockResolvedValueOnce(page(["a@x.com"]));
    expect(await find("a@x.com")).toBe("found");
    expect(kleverRequest.mock.calls[3][2]).toEqual({ token: "new" });
  });

  it("is unavailable without a service account or when the API fails", async () => {
    let find = await load();
    env.serviceEmail = "";
    expect(await find("a@x.com")).toBe("unavailable");
    expect(kleverRequest).not.toHaveBeenCalled();

    env.serviceEmail = "svc@klever.test";
    find = await load();
    kleverRequest
      .mockResolvedValueOnce(login("t1"))
      .mockResolvedValueOnce({ ok: false, error: { kind: "api_locked", message: "Locked" } });
    expect(await find("a@x.com")).toBe("unavailable");
  });

  it("matches the demo user in mock mode without calling the API", async () => {
    const find = await load();
    env.mock = true;
    expect(await find("ADMIN@demo.test")).toBe("found");
    expect(await find("other@demo.test")).toBe("not_found");
    expect(kleverRequest).not.toHaveBeenCalled();
  });
});

describe("loginWithGoogle", () => {
  const reply = (payload: unknown) => ({ status: 200, text: JSON.stringify(payload), contentType: "application/json" });
  const user = { id: "7", name: "Deep Patel", email: "deep@x.com" };

  beforeEach(() => kleverFetch.mockReset());

  it("returns Klever's token and user, sending only the ID token", async () => {
    const { loginWithGoogle } = await import("./google-account");
    kleverFetch.mockResolvedValueOnce(reply({ data: { loginWithGoogle: { token: "kt-1", user } } }));
    expect(await loginWithGoogle("id.tok.en")).toEqual({ kind: "ok", token: "kt-1", user });
    const [body, token] = kleverFetch.mock.calls[0];
    expect(JSON.parse(body).variables).toEqual({ idToken: "id.tok.en" });
    expect(token).toBeUndefined();
  });

  it("maps an unknown or inactive user to not_registered", async () => {
    const { loginWithGoogle } = await import("./google-account");
    kleverFetch
      .mockResolvedValueOnce(
        reply({ errors: [{ message: "Not registered.", extensions: { reason: "not_registered" } }] }),
      )
      .mockResolvedValueOnce(reply({ errors: [{ message: "Invalid credentials." }] }));
    expect(await loginWithGoogle("t")).toEqual({ kind: "not_registered" });
    expect(await loginWithGoogle("t")).toEqual({ kind: "not_registered" });
  });

  it("reports unsupported while the backend lacks the mutation", async () => {
    const { loginWithGoogle } = await import("./google-account");
    kleverFetch.mockResolvedValueOnce(
      reply({ errors: [{ message: 'Cannot query field "loginWithGoogle" on type "Mutation".' }] }),
    );
    expect(await loginWithGoogle("t")).toEqual({ kind: "unsupported" });
  });

  it("treats other failures as errors", async () => {
    const { loginWithGoogle } = await import("./google-account");
    kleverFetch
      .mockResolvedValueOnce(reply({ errors: [{ message: "Invalid Google token." }] }))
      .mockResolvedValueOnce({ status: 0, text: "", contentType: null });
    expect(await loginWithGoogle("t")).toEqual({ kind: "error" });
    expect(await loginWithGoogle("t")).toEqual({ kind: "error" });
  });
});
