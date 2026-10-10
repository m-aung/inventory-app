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
