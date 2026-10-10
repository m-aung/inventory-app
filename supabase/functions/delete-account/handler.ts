type User = { id: string; email: string };
export type AccountServices = {
  authenticate: (token: string) => Promise<User | null>;
  verifyPassword: (user: User, password: string) => Promise<boolean>;
  hasOwnedShared: (userId: string) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<void>;
};
export function accountDeletionHandler(
  services: AccountServices,
  allowedOrigins: string[],
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const cors = {
      "Access-Control-Allow-Origin":
        origin && allowedOrigins.includes(origin) ? origin : "",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    };
    const response = (status: number, body: object) =>
      Response.json(body, { status, headers: cors });
    if (origin && !allowedOrigins.includes(origin))
      return response(403, { code: "origin_denied" });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST")
      return response(405, { code: "method_not_allowed" });
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return response(401, { code: "unauthorized" });
    if (!request.headers.get("content-type")?.includes("application/json"))
      return response(415, { code: "invalid_content_type" });
    try {
      const user = await services.authenticate(token);
      if (!user) return response(401, { code: "unauthorized" });
      const raw = await request.text();
      if (raw.length > 4096)
        return response(413, { code: "request_too_large" });
      let body: { password?: unknown };
      try {
        body = JSON.parse(raw);
      } catch {
        return response(400, { code: "invalid_request" });
      }
      if (
        !body ||
        typeof body.password !== "string" ||
        !body.password ||
        body.password.length > 128
      )
        return response(400, { code: "invalid_request" });
      if (!(await services.verifyPassword(user, body.password)))
        return response(403, { code: "invalid_password" });
      if (await services.hasOwnedShared(user.id))
        return response(409, { code: "owned_shared_inventory" });
      await services.deleteUser(user.id);
      return response(200, { deleted: true });
    } catch {
      return response(503, { code: "deletion_unconfirmed" });
    }
  };
}
