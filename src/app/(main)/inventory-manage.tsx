import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { queryClient } from "../../lib/query";
import { emailSchema, inventoryNameSchema } from "../../lib/validation";
import { useAuth } from "../../lib/auth";
import { useWorkspace } from "../../features/workspace";
import { useFeedback } from "../../components/feedback";
import {
  Button,
  Field,
  Loading,
  Notice,
  Screen,
  styles,
} from "../../components/ui";
export default function ManageInventory() {
  const { inventory: id } = useLocalSearchParams<{ inventory: string }>();
  const { inventories, refresh, loading } = useWorkspace();
  const { session } = useAuth();
  const { confirm, toast } = useFeedback();
  const inventory = inventories.find((i) => i.id === id);
  const owner = inventory?.owner_id === session?.user.id;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const people = useQuery({
    queryKey: ["people", session?.user.id, id],
    queryFn: () => api.people(id),
    enabled: !!inventory,
  });
  const invites = useQuery({
    queryKey: ["ownerInvites", session?.user.id, id],
    queryFn: () => api.ownerInvites(id),
    enabled: !!owner,
  });
  const mutation = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
  });
  async function action(fn: () => Promise<unknown>, message: string) {
    if (mutation.isPending) return false;
    setError("");
    try {
      await mutation.mutateAsync(fn);
      await refresh();
      await people.refetch();
      if (owner) await invites.refetch();
      toast(message);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }
  async function invite() {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (await action(() => api.invite(id, parsed.data), "Invitation created"))
      setEmail("");
  }
  async function rename() {
    const parsed = inventoryNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (
      await action(
        () => api.renameInventory(id, parsed.data),
        "Inventory renamed",
      )
    )
      setName("");
  }
  async function leaveOrDelete() {
    if (
      mutation.isPending ||
      !(await confirm({
        title: owner ? "Delete shared inventory?" : "Leave this inventory?",
        message: owner
          ? "All items and memberships in this inventory will be permanently deleted for everyone."
          : "You’ll lose access. The inventory and its items will remain for other members.",
        action: owner ? "Delete inventory" : "Leave inventory",
        danger: true,
      }))
    )
      return;
    setError("");
    try {
      await mutation.mutateAsync(() =>
        owner
          ? api.deleteInventory(id)
          : api.removeMember(id, session!.user.id),
      );
      queryClient.removeQueries({ queryKey: ["items"] });
      queryClient.removeQueries({ queryKey: ["item"] });
      queryClient.removeQueries({ queryKey: ["people"] });
      queryClient.removeQueries({ queryKey: ["ownerInvites"] });
      await refresh();
      toast(owner ? "Inventory deleted" : "You left the inventory");
      router.dismissTo("/inventories");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (loading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!inventory || inventory.kind !== "shared")
    return (
      <Screen title="Inventory unavailable">
        <Button
          title="Your inventories"
          onPress={() => router.replace("/inventories")}
        />
      </Screen>
    );
  return (
    <Screen
      title={inventory.name}
      subtitle={
        owner
          ? "You own this shared inventory."
          : "You’re a member of this shared inventory."
      }
    >
      {error ? <Notice text={error} /> : null}
      {owner && (
        <View style={styles.card}>
          <Text style={styles.label}>Rename inventory</Text>
          <Field
            label="New name"
            value={name}
            onChangeText={setName}
            editable={!mutation.isPending}
            maxLength={80}
            placeholder={inventory.name}
          />
          <Button
            title="Save name"
            busy={mutation.isPending}
            onPress={rename}
          />
        </View>
      )}
      <Text accessibilityRole="header" style={[styles.title, { fontSize: 22 }]}>
        Members
      </Text>
      {people.isPending ? (
        <Loading />
      ) : people.isError ? (
        <Notice text="Couldn’t load members." />
      ) : (
        people.data?.map((person) => (
          <View key={person.user_id} style={styles.card}>
            <Text style={styles.body}>{person.email}</Text>
            <Text style={styles.small}>
              {person.is_owner ? "Owner" : "Member"}
            </Text>
            {owner && !person.is_owner && (
              <Button
                secondary
                title="Remove member"
                disabled={mutation.isPending}
                onPress={async () => {
                  if (
                    await confirm({
                      title: "Remove member?",
                      message: `${person.email} will lose access to this inventory.`,
                      action: "Remove",
                      danger: true,
                    })
                  )
                    await action(
                      () => api.removeMember(id, person.user_id),
                      "Member removed",
                    );
                }}
              />
            )}
          </View>
        ))
      )}
      {owner && (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Invite by email</Text>
            <Text style={styles.small}>
              The invitation appears in this person’s app when they sign in with
              this verified email. It expires in 7 days.
            </Text>
            <Field
              label="Member email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!mutation.isPending}
            />
            <Button
              title="Create invitation"
              busy={mutation.isPending}
              onPress={invite}
            />
          </View>
          <Text
            accessibilityRole="header"
            style={[styles.title, { fontSize: 22 }]}
          >
            Pending invitations
          </Text>
          {invites.isError ? (
            <Notice text="Couldn’t load pending invitations." />
          ) : invites.data?.length ? (
            invites.data.map((i) => (
              <View key={i.id} style={styles.card}>
                <Text style={styles.body}>{i.email}</Text>
                <Text style={styles.small}>
                  {new Date(i.expires_at) < new Date()
                    ? "Expired — invite again to renew"
                    : `Expires ${new Date(i.expires_at).toLocaleDateString()}`}
                </Text>
                <Button
                  secondary
                  title="Revoke invitation"
                  disabled={mutation.isPending}
                  onPress={() =>
                    void action(() => api.revoke(i.id), "Invitation revoked")
                  }
                />
              </View>
            ))
          ) : (
            <Text style={styles.subtitle}>No pending invitations.</Text>
          )}
        </>
      )}
      <Button
        title={
          mutation.isPending
            ? "Working…"
            : owner
              ? "Delete shared inventory"
              : "Leave inventory"
        }
        danger
        busy={mutation.isPending}
        onPress={leaveOrDelete}
      />
    </Screen>
  );
}
