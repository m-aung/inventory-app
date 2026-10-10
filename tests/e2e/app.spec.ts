import { expect, test, type Page } from "@playwright/test";
const userId = "11111111-1111-4111-8111-111111111111";
const inventoryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sharedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type MockItem = {
  id: string;
  inventory_id: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string;
  version: number;
  created_at: string;
  updated_at: string;
};
async function backend(
  page: Page,
  options: {
    failedSave?: boolean;
    conflict?: boolean;
    initialFailure?: boolean;
    shared?: boolean;
  } = {},
) {
  const items: MockItem[] = [];
  const inventories = [
    {
      id: inventoryId,
      owner_id: userId,
      name: "My inventory",
      kind: "private",
      created_at: new Date().toISOString(),
    },
  ];
  if (options.shared)
    inventories.push({
      id: sharedId,
      owner_id: userId,
      name: "Family",
      kind: "shared",
      created_at: new Date().toISOString(),
    });
  const invites: {
    id: string;
    email: string;
    status: string;
    expires_at: string;
  }[] = [];
  let failed = false;
  let failLoads = !!options.initialFailure;
  const user = {
    id: userId,
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test`;
  await page.route(
    "https://nxjfbnuavolnpziwpbjb.supabase.co/**",
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const reply = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
          headers: { "access-control-allow-origin": "*" },
        });
      if (req.method() === "OPTIONS") {
        await reply({});
        return;
      }
      if (url.pathname.endsWith("/token")) {
        await reply({
          access_token: token,
          refresh_token: "test-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        });
        return;
      }
      if (url.pathname.endsWith("/user")) {
        await reply(user);
        return;
      }
      if (url.pathname.endsWith("/logout")) {
        await reply({});
        return;
      }
      if (url.pathname.endsWith("/recover")) {
        await reply({});
        return;
      }
      if (url.pathname.endsWith("/signup")) {
        await reply({ user, session: null });
        return;
      }
      if (url.pathname.endsWith("/resend")) {
        await reply({});
        return;
      }
      if (url.pathname.endsWith("/delete-account")) {
        await reply({ deleted: true });
        return;
      }
      if (url.pathname.includes("/rpc/")) {
        const name = url.pathname.split("/").pop();
        const p = req.postDataJSON() ?? {};
        if (name === "ensure_private_inventory") {
          await reply(inventories[0]);
          return;
        }
        if (name === "pending_invitations") {
          await reply([]);
          return;
        }
        if (name === "save_item") {
          if (options.failedSave && !failed) {
            failed = true;
            await reply({ message: "Temporary failure", code: "500" }, 503);
            return;
          }
          if (options.conflict && p.p_version !== null) {
            await reply({ message: "This item changed", code: "40001" }, 409);
            return;
          }
          const found = items.find((i) => i.id === p.p_id);
          const value = {
            id: p.p_id,
            inventory_id: p.p_inventory,
            name: p.p_name,
            quantity: p.p_quantity,
            unit: p.p_unit,
            notes: p.p_notes,
            version: (found?.version ?? 0) + 1,
            created_at: found?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (found) Object.assign(found, value);
          else items.push(value);
          await reply(value);
          return;
        }
        if (name === "delete_item") {
          const index = items.findIndex((i) => i.id === p.p_id);
          if (index >= 0) items.splice(index, 1);
          await reply(null);
          return;
        }
        if (name === "create_shared_inventory") {
          const value = {
            id: sharedId,
            owner_id: userId,
            name: p.p_name,
            kind: "shared",
            created_at: new Date().toISOString(),
          };
          inventories.push(value);
          await reply(value);
          return;
        }
        if (name === "rename_inventory") {
          inventories.find((i) => i.id === p.p_inventory)!.name = p.p_name;
          await reply(null);
          return;
        }
        if (name === "inventory_people") {
          await reply([{ user_id: userId, email: user.email, is_owner: true }]);
          return;
        }
        if (name === "invite_member") {
          const invite = {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            email: p.p_email,
            status: "pending",
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          };
          invites.push(invite);
          await reply(invite);
          return;
        }
        if (name === "revoke_invitation") {
          const invite = invites.find((i) => i.id === p.p_invite);
          if (invite) invite.status = "revoked";
          await reply(null);
          return;
        }
        if (name === "delete_shared_inventory") {
          const index = inventories.findIndex((i) => i.id === p.p_inventory);
          if (index >= 0) inventories.splice(index, 1);
          await reply(null);
          return;
        }
      }
      if (url.pathname.endsWith("/inventories")) {
        if (failLoads) {
          await reply({ message: "Connection failed" }, 503);
          return;
        }
        const id = url.searchParams.get("id")?.replace("eq.", "");
        await reply(id ? inventories.filter((i) => i.id === id) : inventories);
        return;
      }
      if (url.pathname.endsWith("/inventory_invites")) {
        await reply(invites.filter((i) => i.status === "pending"));
        return;
      }
      if (url.pathname.endsWith("/items")) {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const inv = url.searchParams.get("inventory_id")?.replace("eq.", "");
        const list = items.filter(
          (i) => (!id || i.id === id) && (!inv || i.inventory_id === inv),
        );
        await reply(
          req.headers().accept?.includes("vnd.pgrst.object") ? list[0] : list,
        );
        return;
      }
      await reply(
        {
          code: "mock_missing_endpoint",
          message: `Unhandled test endpoint ${url.pathname}`,
        },
        500,
      );
    },
  );
  return {
    items,
    inventories,
    restoreConnection: () => {
      failLoads = false;
    },
  };
}
async function signIn(page: Page) {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("test@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your inventory", exact: true }),
  ).toBeVisible();
}
async function addMilk(page: Page) {
  await page.getByRole("button", { name: "＋ Add item", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("Milk");
  await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("2");
  await page.getByRole("button", { name: "Unit bottles", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Notes (optional)", exact: true })
    .fill("For breakfast");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Milk, 2 bottles", exact: true }),
  ).toBeVisible();
}

test("sign-in, create, read, edit, filter, and delete with confirmation", async ({
  page,
}) => {
  const state = await backend(page);
  await signIn(page);
  await expect(page.getByText("Your inventory starts here")).toBeVisible();
  await addMilk(page);
  if (process.env.CAPTURE_UI === "1")
    await page.screenshot({
      path: "docs/dashboard-preview.png",
      fullPage: true,
    });
  await page
    .getByRole("button", { name: "Milk, 2 bottles", exact: true })
    .click();
  await expect(page.getByText("For breakfast", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("0");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Milk, 0 bottles, out of stock",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Available", exact: true }).click();
  await expect(page.getByText("No items match your search")).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search items", exact: true })
    .fill("rice");
  await expect(page.getByText("No items match your search")).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page
    .getByRole("button", { name: "Milk, 0 bottles, out of stock", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete item", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delete Milk?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.items).toHaveLength(1);
  await page.getByRole("button", { name: "Delete item", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete item", exact: true })
    .last()
    .click();
  await expect(page.getByText("Your inventory starts here")).toBeVisible();
  expect(state.items).toHaveLength(0);
});
test("validation, retained values after failure, and retry", async ({
  page,
}) => {
  const state = await backend(page, { failedSave: true });
  await signIn(page);
  await page.getByRole("button", { name: "＋ Add item", exact: true }).click();
  await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("-1");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByText("Enter an item name.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Use zero or a positive number, with up to 3 decimal places.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("Rice");
  await page
    .getByRole("textbox", { name: "Quantity", exact: true })
    .fill("0.125");
  await page.getByRole("button", { name: "Unit kg", exact: true }).click();
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByText(
      "Couldn’t complete this request. Check your connection and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Item name", exact: true }),
  ).toHaveValue("Rice");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rice, 0.125 kg", exact: true }),
  ).toBeVisible();
  expect(state.items).toHaveLength(1);
});
test("protects a dirty draft when navigating back", async ({ page }) => {
  await backend(page);
  await signIn(page);
  await page.getByRole("button", { name: "＋ Add item", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("Draft");
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Discard changes?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Item name", exact: true }),
  ).toHaveValue("Draft");
});
test("reports a concurrent edit and prevents another overwrite attempt", async ({
  page,
}) => {
  await backend(page, { conflict: true });
  await signIn(page);
  await addMilk(page);
  await page
    .getByRole("button", { name: "Milk, 2 bottles", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("3");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("This item changed. Reload it before trying again."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reload item", exact: true }),
  ).toBeVisible();
});
test("creates and manages a shared inventory and email-addressed invitation", async ({
  page,
}) => {
  const state = await backend(page);
  await signIn(page);
  await page
    .getByRole("button", { name: "My inventory ▾", exact: true })
    .click();
  await page
    .getByRole("button", { name: "＋ Create shared inventory", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Inventory name", exact: true })
    .fill("Family");
  await page
    .getByRole("button", { name: "Create inventory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Family", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Member email", exact: true })
    .fill("member@example.com");
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(
    page.getByText("member@example.com", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(
    page
      .getByText("No pending invitations.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "New name", exact: true })
    .fill("Home");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  expect(state.inventories).toHaveLength(2);
});
test("allows retry after an initial connection failure", async ({ page }) => {
  const state = await backend(page, { initialFailure: true });
  await signIn(page);
  await expect(
    page.getByText(
      "Couldn’t load your items. Check your connection and try again.",
    ),
  ).toBeVisible();
  state.restoreConnection();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Your inventory starts here")).toBeVisible();
});
test("signs out and protects inventory routes", async ({ page }) => {
  await backend(page);
  await signIn(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/inventory");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("account deletion requires explicit confirmation and password entry", async ({
  page,
}) => {
  await backend(page);
  await signIn(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete your account?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("test-password-123");
  await page
    .getByRole("button", { name: "Delete account permanently", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("registration validates passwords, requests confirmation, and can resend", async ({
  page,
}) => {
  await backend(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("test@example.com");
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("short");
  await page
    .getByRole("textbox", { name: "Confirm password", exact: true })
    .fill("different");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Passwords don’t match.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("test-password-123");
  await page
    .getByRole("textbox", { name: "Confirm password", exact: true })
    .fill("test-password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your email", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resend confirmation", exact: true })
    .click();
  await expect(
    page.getByText(
      "Confirmation email requested. Check your inbox and spam folder.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("password-reset request gives a non-enumerating confirmation", async ({
  page,
}) => {
  await backend(page);
  await page.goto("/");
  await page
    .getByRole("link", { name: "Forgot password?", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("test@example.com");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByText(
      "If an account exists for this email, we’ve sent a reset link.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("invalid callback link gives a recovery action", async ({ page }) => {
  await backend(page);
  await page.goto("/auth/callback");
  await expect(
    page.getByText(
      "This link is invalid or expired. Request a new email and open it on the original device.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
