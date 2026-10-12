import { expect, test, type Page } from "@playwright/test";
import type { Section } from "../../src/lib/types";
const userId = "11111111-1111-4111-8111-111111111111";
const inventoryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sharedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type MockItem = {
  section_id?: string | null;
  last_mutation_id?: string | null;
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
    member?: boolean;
    failedSectionSave?: boolean;
    lostSaveResponse?: boolean;
    failedSections?: "schema" | "transient";
  } = {},
) {
  const items: MockItem[] = [];
  const sections: Section[] = [];
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
      owner_id: options.member
        ? "22222222-2222-4222-8222-222222222222"
        : userId,
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
  let sectionFailed = false;
  let responseLost = false;
  let sectionsFailing = options.failedSections;
  let sectionReads = 0;
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
        if (name === "save_section" || name === "delete_section") {
          if (
            inventories.find((i) => i.id === p.p_inventory)?.owner_id !== userId
          ) {
            await reply({ message: "Only the owner", code: "42501" }, 403);
            return;
          }
          if (options.failedSectionSave && !sectionFailed) {
            sectionFailed = true;
            await reply({ message: "Temporary failure", code: "500" }, 503);
            return;
          }
          const found = sections.find((s) => s.id === p.p_id);
          if (
            p.p_version !== null &&
            (!found || found.version !== p.p_version)
          ) {
            await reply({ message: "Section changed", code: "40001" }, 409);
            return;
          }
          if (name === "delete_section") {
            const index = sections.findIndex((s) => s.id === p.p_id);
            if (index >= 0) sections.splice(index, 1);
            items
              .filter(
                (i) =>
                  i.inventory_id === p.p_inventory && i.section_id === p.p_id,
              )
              .forEach((i) => {
                i.section_id = null;
                i.version++;
              });
            await reply(null);
            return;
          }
          if (
            sections.some(
              (s) =>
                s.id !== p.p_id &&
                s.inventory_id === p.p_inventory &&
                s.name.toLowerCase() === p.p_name.toLowerCase(),
            )
          ) {
            await reply(
              { message: "Duplicate section name", code: "23505" },
              409,
            );
            return;
          }
          const value: Section = {
            id: p.p_id,
            inventory_id: p.p_inventory,
            name: p.p_name,
            color: p.p_color,
            version: (found?.version ?? 0) + 1,
            created_at: found?.created_at ?? new Date().toISOString(),
          };
          if (found) Object.assign(found, value);
          else sections.push(value);
          await reply(value);
          return;
        }
        if (name === "save_item" || name === "save_item_with_section") {
          if (options.failedSave && !failed) {
            failed = true;
            await reply({ message: "Temporary failure", code: "500" }, 503);
            return;
          }
          const found = items.find((i) => i.id === p.p_id);
          const exactRetry =
            found &&
            p.p_version !== null &&
            found.version === p.p_version + 1 &&
            p.p_request &&
            found.last_mutation_id === p.p_request &&
            found.name === p.p_name &&
            found.quantity === p.p_quantity &&
            found.unit === p.p_unit &&
            found.notes === p.p_notes &&
            found.section_id === p.p_section;
          if (exactRetry) {
            await reply(found);
            return;
          }
          if (
            (options.conflict && p.p_version !== null) ||
            (found && p.p_version !== found.version)
          ) {
            await reply({ message: "This item changed", code: "40001" }, 409);
            return;
          }
          const value = {
            id: p.p_id,
            inventory_id: p.p_inventory,
            name: p.p_name,
            quantity: p.p_quantity,
            unit: p.p_unit,
            notes: p.p_notes,
            section_id:
              name === "save_item_with_section"
                ? p.p_section
                : (found?.section_id ?? null),
            last_mutation_id: p.p_request ?? null,
            version: (found?.version ?? 0) + 1,
            created_at: found?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (found) Object.assign(found, value);
          else items.push(value);
          if (options.lostSaveResponse && !responseLost) {
            responseLost = true;
            await reply(
              { message: "Response lost after commit", code: "500" },
              503,
            );
            return;
          }
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
      if (url.pathname.endsWith("/inventory_sections")) {
        sectionReads++;
        if (sectionsFailing) {
          await reply(
            {
              code: sectionsFailing === "schema" ? "PGRST205" : "500",
              message: "Sections unavailable",
            },
            sectionsFailing === "schema" ? 404 : 503,
          );
          return;
        }
        const inv = url.searchParams.get("inventory_id")?.replace("eq.", "");
        await reply(sections.filter((s) => !inv || s.inventory_id === inv));
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
    sections,
    sectionReadCount: () => sectionReads,
    restoreSections: () => {
      sectionsFailing = undefined;
    },
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
    page.getByRole("heading", { name: "Items", exact: true }),
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

function seedQuantity(items: MockItem[], quantity = 2) {
  items.push({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    inventory_id: inventoryId,
    name: "Milk",
    quantity,
    unit: "bottles",
    notes: "Keep this note",
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

function seedSection(sections: Section[], inventory = inventoryId) {
  sections.push({
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    inventory_id: inventory,
    name: "Supplies",
    color: "#377CCC",
    version: 1,
    created_at: new Date().toISOString(),
  });
}

test("missing sections backend shows one stable notice and recovers after setup", async ({
  page,
}) => {
  test.setTimeout(90000);
  const state = await backend(page, { failedSections: "schema" });
  await signIn(page);
  const notice = page.getByText(
    "Sections aren’t available on the server yet. Please try again after the app setup is completed.",
    { exact: true },
  );
  await expect(notice).toBeVisible();
  expect(state.sectionReadCount()).toBe(1);
  // Cover more than one polling interval: structural failures must not be retried
  // in the background, nor cause the error banner to disappear and reappear.
  await page.waitForTimeout(17000);
  await expect(notice).toBeVisible();
  expect(state.sectionReadCount()).toBe(1);
  state.restoreSections();
  await page
    .getByRole("button", { name: "Open sections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Section All items", exact: true })
    .click();
  await expect(notice).toHaveCount(0);
});

test("transient section failure stays visible during a pending refetch", async ({
  page,
}) => {
  test.setTimeout(90000);
  await backend(page, { failedSections: "transient" });
  await signIn(page);
  const notice = page.getByText(
    "Couldn’t refresh sections. Your last loaded sections are kept. Pull to refresh to try again.",
    { exact: true },
  );
  await expect(notice).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/rest/v1/inventory_sections?**", async (route) => {
    started();
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
  await pending;
  await expect(notice).toBeVisible();
  release();
  await expect(notice).toHaveCount(0);
});

test("owner creates colored sections, assigns items and safely removes sections", async ({
  page,
}) => {
  const state = await backend(page);
  seedQuantity(state.items);
  await signIn(page);
  await page
    .getByRole("button", { name: "Open sections", exact: true })
    .click();
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Section name", exact: true })
    .fill("Supplies");
  await page.getByRole("button", { name: "Color Purple", exact: true }).click();
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await page
    .getByRole("button", { name: "Section Supplies", exact: true })
    .click();
  await expect(page.getByText("0 in this view", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "＋ Add item", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Supplies", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("Tape");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tape, 1 pcs", exact: true }),
  ).toBeVisible();
  const tape = state.items.find((i) => i.name === "Tape")!;
  expect(tape.section_id).toBe(state.sections[0].id);
  await page
    .getByRole("button", { name: "Open sections", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/sections-picker.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Manage Supplies", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Section name", exact: true })
    .fill("Equipment");
  await page.getByRole("button", { name: "Color Rose", exact: true }).click();
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage Equipment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove section", exact: true })
    .click();
  await expect(
    page.getByText(
      "Its items will move to Unsorted for everyone. No items or quantities will be deleted.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.sections).toHaveLength(1);
  await page
    .getByRole("button", { name: "Remove section", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove section", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Section Unsorted", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tape, 1 pcs", exact: true }),
  ).toBeVisible();
  expect(state.items.find((i) => i.id === tape.id)).toMatchObject({
    section_id: null,
    quantity: 1,
    version: 2,
  });
});

test("shared member assigns items but cannot manage sections", async ({
  page,
}) => {
  const state = await backend(page, { shared: true, member: true });
  seedSection(state.sections, sharedId);
  seedQuantity(state.items);
  state.items[0].inventory_id = sharedId;
  await signIn(page);
  await page
    .getByRole("button", { name: "My inventory ▾", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Family/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Open sections", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add section", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage Supplies", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Section All items", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Milk, 2 bottles", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page.getByRole("button", { name: "Unsorted", exact: true }).click();
  await page
    .getByRole("button", { name: "Section Supplies", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(state.items[0].section_id).toBe(state.sections[0].id);
  await page.goto(
    `/section-edit?inventory=${sharedId}&id=${state.sections[0].id}`,
  );
  await expect(
    page.getByText("Only the inventory owner can manage sections."),
  ).toBeVisible();
});

test("section save failure and remote conflict retain the original draft until explicit reload", async ({
  page,
}) => {
  const state = await backend(page, { failedSectionSave: true });
  seedSection(state.sections);
  await signIn(page);
  await page
    .getByRole("button", { name: "Open sections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage Supplies", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Section name", exact: true });
  await name.fill("My draft");
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await expect(name).toHaveValue("My draft");
  await expect(
    page.getByText(
      "Couldn’t complete this request. Check your connection and try again.",
    ),
  ).toBeVisible();
  state.sections[0].name = "Remote name";
  state.sections[0].version = 2;
  await page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/inventory_sections"),
  );
  await expect(name).toHaveValue("My draft");
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await expect(
    page.getByText(
      /Someone changed or removed this section before your change was saved/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reload section", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(name).toHaveValue("My draft");
  await page
    .getByRole("button", { name: "Reload section", exact: true })
    .click();
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(name).toHaveValue("Remote name");
});

test("remotely removed selected section falls back to All items and keeps an exact-amount draft", async ({
  page,
}) => {
  const state = await backend(page);
  seedSection(state.sections);
  seedQuantity(state.items);
  state.items[0].section_id = state.sections[0].id;
  await signIn(page);
  await page
    .getByRole("button", { name: "Open sections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Section Supplies", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set Milk quantity", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Quantity for Milk",
    exact: true,
  });
  await field.fill("4");
  state.sections.splice(0);
  state.items[0].section_id = null;
  state.items[0].version++;
  await page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/inventory_sections"),
  );
  await expect(
    page.getByRole("button", { name: "Open sections", exact: true }),
  ).toContainText("All items");
  await expect(field).toHaveValue("4");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByText("Your attempted amount: 4 bottles"),
  ).toBeVisible();
  expect(state.items[0].quantity).toBe(2);
});

test("remote reassignment does not hide an unsaved quantity draft", async ({
  page,
}) => {
  const state = await backend(page);
  seedSection(state.sections);
  seedQuantity(state.items);
  state.items[0].section_id = state.sections[0].id;
  await signIn(page);
  await page
    .getByRole("button", { name: "Open sections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Section Supplies", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set Milk quantity", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Quantity for Milk",
    exact: true,
  });
  await field.fill("4");
  state.items[0].section_id = null;
  state.items[0].version++;
  await page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/items"),
  );
  await expect(field).toHaveValue("4");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByText("Your attempted amount: 4 bottles"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reload quantity", exact: true })
    .click();
  await expect(page.getByText("No items match your search")).toBeVisible();
  expect(state.items[0].quantity).toBe(2);
});

test("a lost response retries the same request without saving twice", async ({
  page,
}) => {
  const state = await backend(page, { lostSaveResponse: true });
  seedQuantity(state.items);
  await signIn(page);
  await page
    .getByRole("button", { name: "Set Milk quantity", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Quantity for Milk",
    exact: true,
  });
  await field.fill("0.5");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByText(
      "Couldn’t complete this request. Check your connection and try again.",
    ),
  ).toBeVisible();
  const request = state.items[0].last_mutation_id;
  expect(request).toBeTruthy();
  expect(state.items[0].version).toBe(2);
  await expect(field).toHaveValue("0.5");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Milk, 0.5 bottles", exact: true }),
  ).toBeVisible();
  expect(state.items[0].version).toBe(2);
  expect(state.items[0].last_mutation_id).toBe(request);
  await page
    .getByRole("button", { name: "Increase Milk quantity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Milk, 1.5 bottles", exact: true }),
  ).toBeVisible();
  expect(state.items[0].last_mutation_id).not.toBe(request);
});

test("section-only draft triggers discard confirmation and survives cancellation", async ({
  page,
}) => {
  const state = await backend(page);
  seedSection(state.sections);
  seedQuantity(state.items);
  await signIn(page);
  await page
    .getByRole("button", { name: "Milk, 2 bottles", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page.getByRole("button", { name: "Unsorted", exact: true }).click();
  await page
    .getByRole("button", { name: "Section Supplies", exact: true })
    .click();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Discard changes?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Supplies", exact: true }),
  ).toBeVisible();
  expect(state.items[0].section_id).toBeUndefined();
});

test("overview counts records across units and remains usable on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const state = await backend(page);
  seedQuantity(state.items, 999998.999);
  state.items[0].name =
    "Rechargeable batteries for the shared equipment cupboard";
  state.items.push({
    ...state.items[0],
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    name: "Tape",
    quantity: 0,
    unit: "pcs",
  });
  await signIn(page);
  await expect(page.getByTestId("inventory-total")).toHaveText("2");
  await expect(page.getByTestId("inventory-available")).toHaveText("1");
  await expect(page.getByTestId("inventory-out-of-stock")).toHaveText("1");
  await page.getByRole("button", { name: "Available", exact: true }).click();
  await expect(page.getByTestId("inventory-total")).toHaveText("2");
  const increase = page.getByRole("button", {
    name: `Increase ${state.items[0].name} quantity`,
    exact: true,
  });
  await increase.scrollIntoViewIfNeeded();
  const bounds = await increase.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: "test-results/finance-ui-narrow.png",
    fullPage: true,
  });
});

test("dashboard quantity controls preserve fractions, stock filters, and item identity", async ({
  page,
}) => {
  const state = await backend(page);
  seedQuantity(state.items, 1.001);
  await signIn(page);
  const decrease = page.getByRole("button", {
    name: "Decrease Milk quantity",
    exact: true,
  });
  await decrease.click();
  await expect(
    page.getByRole("button", { name: "Milk, 0.001 bottles", exact: true }),
  ).toBeVisible();
  await decrease.click();
  await expect(
    page.getByRole("button", {
      name: "Milk, 0 bottles, out of stock",
      exact: true,
    }),
  ).toBeVisible();
  await expect(decrease).toBeDisabled();
  await page.getByRole("button", { name: "Out of stock", exact: true }).click();
  await page
    .getByRole("button", { name: "Increase Milk quantity", exact: true })
    .click();
  await expect(page.getByText("No items match your search")).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page
    .getByRole("button", { name: "Set Milk quantity", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Quantity for Milk",
    exact: true,
  });
  await field.fill("999999.001");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(page.getByText("Quantity cannot exceed 999,999.")).toBeVisible();
  await field.fill("0,5");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Milk, 0.5 bottles", exact: true }),
  ).toBeVisible();
  expect(state.items[0]).toMatchObject({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    quantity: 0.5,
    notes: "Keep this note",
    version: 5,
  });
  await page
    .getByRole("button", { name: "Milk, 0.5 bottles", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark out of stock", exact: true })
    .click();
  await expect(
    page.getByText("Out of stock", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark out of stock", exact: true }),
  ).toBeDisabled();
});

test("failed dashboard quantity save retains the draft and retries safely", async ({
  page,
}) => {
  const state = await backend(page, { failedSave: true });
  seedQuantity(state.items);
  await signIn(page);
  await page
    .getByRole("button", { name: "Set Milk quantity", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Quantity for Milk",
    exact: true,
  });
  await field.fill("0.25");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByText(
      "Couldn’t complete this request. Check your connection and try again.",
    ),
  ).toBeVisible();
  await expect(field).toHaveValue("0.25");
  expect(state.items[0].quantity).toBe(2);
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Milk, 0.25 bottles", exact: true }),
  ).toBeVisible();
});

test("dashboard conflict retains draft and requires explicit reload", async ({
  page,
}) => {
  const state = await backend(page);
  seedQuantity(state.items);
  await signIn(page);
  await page
    .getByRole("button", { name: "Set Milk quantity", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Quantity for Milk",
    exact: true,
  });
  await field.fill("4");
  state.items[0].quantity = 7;
  state.items[0].version = 2;
  // Polling must preserve the draft and its original version.
  await page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/items"),
  );
  await expect(field).toHaveValue("4");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(
    page.getByText("Someone updated this item before your change was saved."),
  ).toBeVisible();
  await expect(field).toHaveValue("4");
  await expect(
    page.getByRole("button", { name: "Save quantity", exact: true }),
  ).toBeDisabled();
  expect(state.items[0].quantity).toBe(7);
  await page
    .getByRole("button", { name: "Reload quantity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Milk, 7 bottles", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Increase Milk quantity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Milk, 8 bottles", exact: true }),
  ).toBeVisible();
});

test("rapid dashboard taps cannot overlap saves and maximum quantity disables increase", async ({
  page,
}) => {
  const state = await backend(page);
  seedQuantity(state.items, 999998);
  await signIn(page);
  let writes = 0;
  await page.route("**/rest/v1/rpc/save_item_with_section", async (route) => {
    writes++;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fallback();
  });
  const increase = page.getByRole("button", {
    name: "Increase Milk quantity",
    exact: true,
  });
  await increase.dblclick();
  await expect(increase).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Milk, 999999 bottles", exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});

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
    page.getByText("Someone updated this item before your change was saved."),
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

for (const quantity of ["1.001", "1,001"]) {
  test(`decrements ${quantity} to a valid quantity and saves it`, async ({
    page,
  }) => {
    const state = await backend(page);
    await signIn(page);
    await page
      .getByRole("button", { name: "＋ Add item", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Item name", exact: true })
      .fill("Fraction");
    const field = page.getByRole("textbox", { name: "Quantity", exact: true });
    await field.fill(quantity);
    await page.getByRole("button", { name: "−", exact: true }).click();
    await expect(field).toHaveValue("0.001");
    await page.getByRole("button", { name: "Save item", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Fraction, 0.001 pcs", exact: true }),
    ).toBeVisible();
    expect(state.items[0].quantity).toBe(0.001);
  });
}
for (const code of ["user_not_found", "session_not_found"]) {
  test(`clears a restored session after ${code} and permits a new sign-in`, async ({
    page,
  }) => {
    await backend(page);
    await signIn(page);
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({
        status: 404,
        headers: { "x-supabase-api-version": "2024-01-01" },
        contentType: "application/json",
        body: JSON.stringify({ code, message: "No longer available" }),
      }),
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("sb-nxjfbnuavolnpziwpbjb-auth-token"),
      ),
    ).toBeNull();
    await page.unroute("**/auth/v1/user");
    await signIn(page);
    await expect(page.getByText("Your inventory starts here")).toBeVisible();
  });
}
test("retains the session during a temporary verification failure and recovers on retry", async ({
  page,
}) => {
  await backend(page);
  await signIn(page);
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Temporary outage" }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Couldn’t verify your session",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("sb-nxjfbnuavolnpziwpbjb-auth-token"),
    ),
  ).not.toBeNull();
  await page.unroute("**/auth/v1/user");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Your inventory starts here")).toBeVisible();
});
test("allows returning to sign-in from a session verification failure", async ({
  page,
}) => {
  await backend(page);
  await signIn(page);
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "unexpected_error",
        message: "Unknown error",
      }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Couldn’t verify your session",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("sb-nxjfbnuavolnpziwpbjb-auth-token"),
    ),
  ).toBeNull();
});
