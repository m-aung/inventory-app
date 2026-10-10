import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountDeletionHandler,
  type AccountServices,
} from "../supabase/functions/delete-account/handler";
let services: AccountServices;
beforeEach(() => {
  services = {
    authenticate: vi.fn(async () => ({
      id: "verified-user",
      email: "user@example.com",
    })),
    verifyPassword: vi.fn(async () => true),
    hasOwnedShared: vi.fn(async () => false),
    deleteUser: vi.fn(async () => {}),
  };
});
function request(
  body: unknown = { password: "correct-password" },
  headers: Record<string, string> = {},
) {
  return new Request("https://example.com/delete-account", {
    method: "POST",
    headers: {
      authorization: "Bearer valid",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
describe("account deletion endpoint", () => {
  it("deletes only the authenticated identity, ignoring a body user ID", async () => {
    const result = await accountDeletionHandler(
      services,
      [],
    )(request({ password: "correct-password", userId: "victim" }));
    expect(result.status).toBe(200);
    expect(services.deleteUser).toHaveBeenCalledWith("verified-user");
  });
  it("rejects invalid bearer tokens before touching data", async () => {
    services.authenticate = vi.fn(async () => null);
    expect((await accountDeletionHandler(services, [])(request())).status).toBe(
      401,
    );
    expect(services.deleteUser).not.toHaveBeenCalled();
  });
  it("requires password reauthentication", async () => {
    services.verifyPassword = vi.fn(async () => false);
    expect((await accountDeletionHandler(services, [])(request())).status).toBe(
      403,
    );
    expect(services.deleteUser).not.toHaveBeenCalled();
  });
  it("blocks owners of shared inventories", async () => {
    services.hasOwnedShared = vi.fn(async () => true);
    expect((await accountDeletionHandler(services, [])(request())).status).toBe(
      409,
    );
    expect(services.deleteUser).not.toHaveBeenCalled();
  });
  it("does not claim success on a backend failure", async () => {
    services.deleteUser = vi.fn(async () => {
      throw new Error("secret details");
    });
    const result = await accountDeletionHandler(services, [])(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("secret details");
  });
  it("rejects unapproved browser origins", async () => {
    expect(
      (
        await accountDeletionHandler(services, ["http://localhost:8081"])(
          request(undefined, { origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    expect(services.authenticate).not.toHaveBeenCalled();
  });
  it("rejects missing passwords", async () => {
    expect(
      (await accountDeletionHandler(services, [])(request({}))).status,
    ).toBe(400);
    expect(services.deleteUser).not.toHaveBeenCalled();
  });
});
