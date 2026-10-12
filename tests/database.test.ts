import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const eve = "33333333-3333-4333-8333-333333333333";
const item = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let db: PGlite;
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
}
async function privateInventory() {
  return (
    await db.query<{ id: string }>(
      "select (public.ensure_private_inventory()).id",
    )
  ).rows[0].id;
}
async function shared() {
  return (
    await db.query<{ id: string }>(
      "select (public.create_shared_inventory('Family')).id",
    )
  ).rows[0].id;
}
async function save(
  inventory: string,
  quantity = 2,
  version: number | null = null,
) {
  return db.query("select * from public.save_item($1,$2,$3,$4,$5,$6,$7)", [
    item,
    inventory,
    "Milk",
    quantity,
    "bottles",
    "Breakfast",
    version,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.inventories,auth.users cascade;");
  await db.query(
    "insert into auth.users values($1,'alice@example.com',now()),($2,'bob@example.com',now()),($3,'eve@example.com',now())",
    [alice, bob, eve],
  );
  await asUser(alice);
});
afterAll(async () => {
  await db?.close();
});
describe("real PostgreSQL permissions and mutations", () => {
  const sectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  async function section(
    inventory: string,
    name = "Supplies",
    color = "#377CCC",
    version: number | null = null,
    id = sectionId,
  ) {
    return db.query("select * from public.save_section($1,$2,$3,$4,$5)", [
      id,
      inventory,
      name,
      color,
      version,
    ]);
  }
  async function assign(
    inventory: string,
    section: string | null,
    version: number | null = null,
    quantity = 2,
  ) {
    return db.query(
      "select * from public.save_item_with_section($1,$2,'Milk',$3,'bottles','Breakfast',$4,$5)",
      [item, inventory, quantity, version, section],
    );
  }
  async function join(inventory: string) {
    const invite = (
      await db.query<{ id: string }>(
        "select (public.invite_member($1,'bob@example.com')).id",
        [inventory],
      )
    ).rows[0].id;
    await asUser(bob);
    await db.query("select public.respond_to_invitation($1,true)", [invite]);
  }
  it("isolates sections and prohibits base mutations, anonymous execution and unverified access", async () => {
    const inventory = await privateInventory();
    await section(inventory);
    await expect(
      db.query("update inventory_sections set name='Bad'"),
    ).rejects.toThrow("permission denied");
    await expect(db.query("delete from inventory_sections")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      db.query(
        "insert into inventory_sections(id,inventory_id,name,color) values(gen_random_uuid(),$1,'Bad','#377CCC')",
        [inventory],
      ),
    ).rejects.toThrow("permission denied");
    await asUser(bob);
    expect(
      (await db.query("select * from inventory_sections")).rows,
    ).toHaveLength(0);
    await expect(section(inventory)).rejects.toThrow("Only the owner");
    await db.exec("reset role");
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [alice],
    );
    await asUser(alice);
    expect(
      (await db.query("select * from inventory_sections")).rows,
    ).toHaveLength(0);
    await expect(section(inventory)).rejects.toThrow("verified email");
    await db.exec("reset role; set role anon");
    await expect(section(inventory)).rejects.toThrow("permission denied");
    await expect(assign(inventory, null)).rejects.toThrow("permission denied");
    await expect(
      db.query("select public.delete_section($1,$2,1)", [sectionId, inventory]),
    ).rejects.toThrow("permission denied");
  });
  it("validates section names/colors, retries safely and rejects stale structure edits", async () => {
    const inventory = await privateInventory();
    for (const name of ["", "All items", "Unsorted", "x".repeat(81)])
      await expect(section(inventory, name)).rejects.toThrow(
        "check constraint",
      );
    await expect(section(inventory, "Supplies", "#FFFFFF")).rejects.toThrow(
      "check constraint",
    );
    await section(inventory);
    await section(inventory);
    await expect(
      section(
        inventory,
        "supplies",
        "#377CCC",
        null,
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ),
    ).rejects.toThrow("unique constraint");
    await section(inventory, "Tools", "#8D64C8", 1);
    await section(inventory, "Tools", "#8D64C8", 1);
    expect(
      (
        await db.query<{ version: number }>(
          "select version from inventory_sections",
        )
      ).rows[0].version,
    ).toBe(2);
    await expect(section(inventory, "Other", "#377CCC", 1)).rejects.toThrow(
      "changed",
    );
    await expect(
      db.query("select public.delete_section($1,$2,1)", [sectionId, inventory]),
    ).rejects.toThrow("changed");
  });
  it("allows shared members to move items but reserves section management for owners", async () => {
    const inventory = await shared();
    await section(inventory);
    await join(inventory);
    expect(
      (await db.query("select * from inventory_sections")).rows,
    ).toHaveLength(1);
    await expect(section(inventory, "Changed", "#377CCC", 1)).rejects.toThrow(
      "Only the owner",
    );
    await expect(
      db.query("select public.delete_section($1,$2,1)", [sectionId, inventory]),
    ).rejects.toThrow("Only the owner");
    await assign(inventory, sectionId);
    await assign(inventory, null, 1);
    expect(
      (
        await db.query<{ section_id: string | null }>(
          "select section_id from items",
        )
      ).rows[0].section_id,
    ).toBeNull();
    await asUser(alice);
    await db.query("select public.remove_member($1,$2)", [inventory, bob]);
    await asUser(bob);
    expect(
      (await db.query("select * from inventory_sections")).rows,
    ).toHaveLength(0);
    await expect(assign(inventory, sectionId, 2)).rejects.toThrow(
      "access denied",
    );
  });
  it("prevents assignment across inventories and detects conflicting assignment retries", async () => {
    const inventory = await privateInventory(),
      other = await shared();
    await section(other);
    await expect(assign(inventory, sectionId)).rejects.toThrow(
      "section is no longer available",
    );
    await assign(other, sectionId);
    await assign(other, sectionId);
    await assign(other, null, 1);
    await assign(other, null, 1);
    await expect(assign(other, sectionId, 1)).rejects.toThrow("changed");
    const row = (
      await db.query<{ version: number; section_id: string | null }>(
        "select version,section_id from items",
      )
    ).rows[0];
    expect(row).toMatchObject({ version: 2, section_id: null });
  });
  it("removal preserves item data, increments versions and rejects old member drafts", async () => {
    const inventory = await shared();
    await section(inventory);
    await assign(inventory, sectionId);
    await db.query("select public.delete_section($1,$2,1)", [
      sectionId,
      inventory,
    ]);
    await db.query("select public.delete_section($1,$2,1)", [
      sectionId,
      inventory,
    ]);
    const row = (await db.query("select * from items")).rows[0];
    expect(row).toMatchObject({
      id: item,
      section_id: null,
      name: "Milk",
      quantity: "2",
      unit: "bottles",
      notes: "Breakfast",
      version: 2,
    });
    await expect(assign(inventory, sectionId, 1, 3)).rejects.toThrow("changed");
    await expect(save(inventory, 3, 1)).rejects.toThrow("changed");
    await assign(inventory, null, 2, 3);
  });
  it("distinguishes identical concurrent edits from retries of the same request", async () => {
    const inventory = await shared();
    await save(inventory);
    await join(inventory);
    const firstRequest = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const secondRequest = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const update = (request: string) =>
      db.query(
        "select * from public.save_item_with_section($1,$2,'Milk',3,'bottles','Breakfast',1,null,$3)",
        [item, inventory, request],
      );
    await asUser(alice);
    await update(firstRequest);
    await update(firstRequest);
    await asUser(bob);
    await expect(update(secondRequest)).rejects.toThrow("changed");
    expect(
      (await db.query<{ version: number }>("select version from items")).rows[0]
        .version,
    ).toBe(2);
  });
  it("legacy clients preserve section assignments and deletion cascades safely", async () => {
    const inventory = await shared();
    await section(inventory);
    await assign(inventory, sectionId);
    await save(inventory, 3, 1);
    expect(
      (await db.query<{ section_id: string }>("select section_id from items"))
        .rows[0].section_id,
    ).toBe(sectionId);
    await db.query("select public.delete_shared_inventory($1)", [inventory]);
    expect((await db.query("select * from items")).rows).toHaveLength(0);
    expect(
      (await db.query("select * from inventory_sections")).rows,
    ).toHaveLength(0);
  });
  it("creates exactly one private inventory per user", async () => {
    const id = await privateInventory();
    expect(await privateInventory()).toBe(id);
    expect((await db.query("select * from inventories")).rows).toHaveLength(1);
  });
  it("isolates private inventory reads and RPC writes", async () => {
    const inventory = await privateInventory();
    await save(inventory);
    await asUser(bob);
    expect((await db.query("select * from items")).rows).toHaveLength(0);
    expect((await db.query("select * from inventories")).rows).toHaveLength(0);
    await expect(save(inventory)).rejects.toThrow("access denied");
  });
  it("rejects direct table mutations even by the owner", async () => {
    const inventory = await privateInventory();
    await expect(
      db.query(
        "insert into inventories(owner_id,name,kind) values($1,'Bad','shared')",
        [alice],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query(
        "insert into inventory_members(inventory_id,user_id) values($1,$2)",
        [inventory, bob],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query(
        "insert into items(id,inventory_id,name,quantity,unit) values($1,$2,'Bad',1,'pcs')",
        [item, inventory],
      ),
    ).rejects.toThrow("permission denied");
  });
  it("requires verified accounts and rejects anonymous RPC invocation", async () => {
    await db.exec("reset role");
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [alice],
    );
    await asUser(alice);
    await expect(privateInventory()).rejects.toThrow("verified email");
    await db.exec("reset role; set role anon;");
    await expect(privateInventory()).rejects.toThrow("permission denied");
  });
  it("validates quantity, name, units and notes in PostgreSQL", async () => {
    const inventory = await privateInventory();
    for (const quantity of [-1, 1000000, 1.0001])
      await expect(save(inventory, quantity)).rejects.toThrow(
        "check constraint",
      );
    await expect(
      db.query("select * from save_item($1,$2,$3,1,$4,$5,null)", [
        item,
        inventory,
        "   ",
        "pcs",
        "",
      ]),
    ).rejects.toThrow("check constraint");
    await expect(
      db.query("select * from save_item($1,$2,$3,1,$4,$5,null)", [
        item,
        inventory,
        "Test",
        "unknown",
        "",
      ]),
    ).rejects.toThrow("check constraint");
    await expect(
      db.query("select * from save_item($1,$2,$3,1,$4,$5,null)", [
        item,
        inventory,
        "Test",
        "pcs",
        "x".repeat(501),
      ]),
    ).rejects.toThrow("check constraint");
  });
  it("makes create/update retries idempotent and detects conflicting edits", async () => {
    const inventory = await privateInventory();
    await save(inventory);
    await save(inventory);
    expect((await db.query("select * from items")).rows).toHaveLength(1);
    await save(inventory, 3, 1);
    await save(inventory, 3, 1);
    expect(
      (await db.query<{ version: number }>("select version from items")).rows[0]
        .version,
    ).toBe(2);
    await expect(save(inventory, 4, 1)).rejects.toThrow("changed");
    await expect(save(inventory, 5)).rejects.toThrow("different values");
  });
  it("accepts an invitation only for its verified email and permits member CRUD", async () => {
    const inventory = await shared();
    await save(inventory);
    const invite = (
      await db.query<{ id: string }>("select (invite_member($1,$2)).id", [
        inventory,
        " BOB@example.com ",
      ])
    ).rows[0].id;
    await asUser(eve);
    expect(
      (await db.query("select * from pending_invitations()")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select respond_to_invitation($1,true)", [invite]),
    ).rejects.toThrow("unavailable");
    await asUser(bob);
    expect(
      (await db.query("select * from pending_invitations()")).rows,
    ).toHaveLength(1);
    await db.query("select respond_to_invitation($1,true)", [invite]);
    expect((await db.query("select * from items")).rows).toHaveLength(1);
    await save(inventory, 3, 1);
    await expect(
      db.query("select delete_item($1,$2,1)", [item, inventory]),
    ).rejects.toThrow("changed");
    await db.query("select delete_item($1,$2,2)", [item, inventory]);
    expect((await db.query("select * from items")).rows).toHaveLength(0);
  });
  it("reserves membership management and inventory deletion for owners", async () => {
    const inventory = await shared();
    const invite = (
      await db.query<{ id: string }>("select (invite_member($1,$2)).id", [
        inventory,
        "bob@example.com",
      ])
    ).rows[0].id;
    await asUser(bob);
    await db.query("select respond_to_invitation($1,true)", [invite]);
    await expect(
      db.query("select invite_member($1,'eve@example.com')", [inventory]),
    ).rejects.toThrow("owner");
    await expect(
      db.query("select rename_inventory($1,'Other')", [inventory]),
    ).rejects.toThrow("owner");
    await expect(
      db.query("select delete_shared_inventory($1)", [inventory]),
    ).rejects.toThrow("owner");
    await expect(
      db.query("select remove_member($1,$2)", [inventory, eve]),
    ).rejects.toThrow("owner");
  });
  it("revokes access immediately when an owner removes a member", async () => {
    const inventory = await shared();
    await save(inventory);
    const invite = (
      await db.query<{ id: string }>("select (invite_member($1,$2)).id", [
        inventory,
        "bob@example.com",
      ])
    ).rows[0].id;
    await asUser(bob);
    await db.query("select respond_to_invitation($1,true)", [invite]);
    await asUser(alice);
    await db.query("select remove_member($1,$2)", [inventory, bob]);
    await asUser(bob);
    expect((await db.query("select * from items")).rows).toHaveLength(0);
    await expect(save(inventory, 3, 1)).rejects.toThrow("access denied");
  });
  it("does not expose member email addresses to outsiders", async () => {
    const inventory = await shared();
    await asUser(eve);
    await expect(
      db.query("select * from inventory_people($1)", [inventory]),
    ).rejects.toThrow("access denied");
  });
  it("rejects revoked, expired and declined invitations", async () => {
    const inventory = await shared();
    const invite = (
      await db.query<{ id: string }>("select (invite_member($1,$2)).id", [
        inventory,
        "bob@example.com",
      ])
    ).rows[0].id;
    await db.query("select revoke_invitation($1)", [invite]);
    await asUser(bob);
    await expect(
      db.query("select respond_to_invitation($1,true)", [invite]),
    ).rejects.toThrow("expired");
    await asUser(alice);
    const fresh = (
      await db.query<{ id: string }>("select (invite_member($1,$2)).id", [
        inventory,
        "bob@example.com",
      ])
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "update inventory_invites set expires_at=now()-interval '1 hour' where id=$1",
      [fresh],
    );
    await asUser(bob);
    await expect(
      db.query("select respond_to_invitation($1,true)", [fresh]),
    ).rejects.toThrow("expired");
    await asUser(alice);
    await db.query("select invite_member($1,'bob@example.com')", [inventory]);
    await asUser(bob);
    await db.query("select respond_to_invitation($1,false)", [fresh]);
    await expect(
      db.query("select respond_to_invitation($1,true)", [fresh]),
    ).rejects.toThrow("expired");
  });
  it("prevents account deletion from silently removing an owned shared inventory", async () => {
    const inventory = await shared();
    const ownPrivate = await privateInventory();
    await db.exec("reset role");
    await expect(
      db.query("delete from auth.users where id=$1", [alice]),
    ).rejects.toThrow("shared inventories");
    await asUser(alice);
    await db.query("select delete_shared_inventory($1)", [inventory]);
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [alice]);
    expect(
      (await db.query("select * from inventories where id=$1", [ownPrivate]))
        .rows,
    ).toHaveLength(0);
  });
  it("leaving a shared inventory preserves everyone else’s items", async () => {
    const inventory = await shared();
    await save(inventory);
    const invite = (
      await db.query<{ id: string }>("select (invite_member($1,$2)).id", [
        inventory,
        "bob@example.com",
      ])
    ).rows[0].id;
    await asUser(bob);
    await db.query("select respond_to_invitation($1,true)", [invite]);
    await db.query("select remove_member($1,$2)", [inventory, bob]);
    expect((await db.query("select * from items")).rows).toHaveLength(0);
    await asUser(alice);
    expect((await db.query("select * from items")).rows).toHaveLength(1);
  });
});
