import { Fragment, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { api, errorMessage } from "../lib/api";
import { queryClient } from "../lib/query";
import type { Item } from "../lib/types";
import { itemSchema } from "../lib/validation";
import { useFeedback } from "../components/feedback";
import { Button, colors, Field, Notice, styles } from "../components/ui";
import { ConflictNotice } from "../components/conflict-notice";
import * as Crypto from "expo-crypto";

export function QuantityControls({
  item,
  markOnly = false,
  onDraftChange,
}: {
  item: Item;
  markOnly?: boolean;
  onDraftChange?: (item: Item, editing: boolean) => void;
}) {
  const { session } = useAuth();
  const { toast } = useFeedback();
  const locked = useRef(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [attempted, setAttempted] = useState("");
  const [draft, setDraft] = useState<{ item: Item; quantity: string } | null>(
    null,
  );
  const quantity = Number(item.quantity);
  const listKey = ["items", session?.user.id, item.inventory_id];
  const detailKey = ["item", session?.user.id, item.inventory_id, item.id];

  async function save(source: Item, value: string) {
    if (locked.current || conflict) return;
    const result = itemSchema.shape.quantity.safeParse(value);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setAttempted(value);
    const payload = JSON.stringify([
      source.id,
      source.version,
      source.name,
      value,
      source.unit,
      source.notes,
      source.section_id ?? null,
    ]);
    if (request.current?.payload !== payload)
      request.current = { payload, id: Crypto.randomUUID() };
    try {
      const saved = await api.saveItem(
        source.id,
        source.inventory_id,
        itemSchema.parse({
          name: source.name,
          quantity: value,
          unit: source.unit,
          notes: source.notes ?? "",
        }),
        source.version,
        source.section_id ?? null,
        request.current.id,
      );
      // Cancel older reads before installing the server-confirmed version.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);
      queryClient.setQueryData<Item[]>(listKey, (items) =>
        items?.map((entry) =>
          entry.id === saved.id && entry.version <= saved.version
            ? saved
            : entry,
        ),
      );
      queryClient.setQueryData<Item>(detailKey, (entry) =>
        !entry || entry.version <= saved.version ? saved : entry,
      );
      setDraft(null);
      onDraftChange?.(source, false);
      toast(
        result.data === 0 ? "Item marked out of stock" : "Quantity updated",
      );
    } catch (e) {
      setConflict((e as { code?: string }).code === "40001");
      setError(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function reload() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const fresh = await api.item(item.id, item.inventory_id);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);
      queryClient.setQueryData<Item[]>(listKey, (items) =>
        items?.map((entry) => (entry.id === fresh.id ? fresh : entry)),
      );
      queryClient.setQueryData(detailKey, fresh);
      setDraft(null);
      onDraftChange?.(item, false);
      setConflict(false);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const disabled = busy || conflict;
  const step = (delta: number) =>
    String(
      Math.min(
        999999,
        Math.max(0, Math.round(quantity * 1000) + delta * 1000) / 1000,
      ),
    );
  return (
    <View style={{ gap: 12 }}>
      {markOnly ? (
        <Button
          title="Mark out of stock"
          secondary
          disabled={disabled || quantity === 0}
          busy={busy}
          onPress={() => void save(item, "0")}
        />
      ) : (
        <View
          style={[
            styles.row,
            {
              alignSelf: "flex-end",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: 0,
              backgroundColor: colors.pale,
              borderRadius: 16,
            },
          ]}
        >
          {([-1, 1] as const).map((delta) => (
            <Fragment key={delta}>
              {delta === 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Set ${item.name} quantity`}
                  disabled={disabled}
                  accessibilityState={{ disabled }}
                  onPress={() => {
                    setError("");
                    setDraft({ item, quantity: String(quantity) });
                    onDraftChange?.(item, true);
                  }}
                  style={{
                    minHeight: 48,
                    justifyContent: "center",
                    paddingHorizontal: 8,
                    flexShrink: 1,
                  }}
                >
                  <Text
                    style={[
                      styles.body,
                      {
                        fontWeight: "600",
                        fontSize: 22,
                        textAlign: "center",
                        fontVariant: ["tabular-nums"],
                      },
                    ]}
                  >
                    {quantity.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                  </Text>
                  <Text style={[styles.small, { textAlign: "center" }]}>
                    {item.unit} · tap to set
                  </Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${delta < 0 ? "Decrease" : "Increase"} ${item.name} quantity`}
                accessibilityState={{
                  disabled:
                    disabled ||
                    !!draft ||
                    (delta < 0 ? quantity === 0 : quantity === 999999),
                  busy,
                }}
                disabled={
                  disabled ||
                  !!draft ||
                  (delta < 0 ? quantity === 0 : quantity === 999999)
                }
                onPress={() => void save(item, step(delta))}
                style={({ pressed }) => ({
                  width: 48,
                  minHeight: 48,
                  borderRadius: 16,
                  backgroundColor: colors.pale,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity:
                    disabled ||
                    !!draft ||
                    (delta < 0 ? quantity === 0 : quantity === 999999)
                      ? 0.5
                      : pressed
                        ? 0.8
                        : 1,
                })}
              >
                <Text
                  style={[styles.body, { fontSize: 24, color: colors.teal }]}
                >
                  {delta < 0 ? "−" : "＋"}
                </Text>
              </Pressable>
            </Fragment>
          ))}
        </View>
      )}
      {draft && (
        <View style={{ gap: 12 }}>
          <Field
            label={`Quantity for ${item.name}`}
            value={draft.quantity}
            keyboardType="decimal-pad"
            editable={!disabled}
            onChangeText={(value) => setDraft({ ...draft, quantity: value })}
          />
          <Text style={styles.small}>
            Enter 0 to mark out of stock. + and − change the amount by 1{" "}
            {item.unit}.
          </Text>
          <Button
            title="Save quantity"
            busy={busy}
            disabled={conflict}
            onPress={() => void save(draft.item, draft.quantity)}
          />
          <Button
            title="Cancel quantity edit"
            secondary
            disabled={busy}
            onPress={() => {
              setDraft(null);
              onDraftChange?.(item, false);
              if (!conflict) setError("");
            }}
          />
        </View>
      )}
      {busy && (
        <Text accessibilityLiveRegion="polite" style={styles.small}>
          Saving quantity…
        </Text>
      )}
      {conflict ? (
        <ConflictNotice
          amount={attempted}
          unit={draft?.item.unit ?? item.unit}
        />
      ) : (
        !!error && <Notice text={error} />
      )}
      {conflict && (
        <Button
          title="Reload quantity"
          secondary
          busy={busy}
          onPress={() => void reload()}
        />
      )}
      {conflict && draft && (
        <Text style={styles.small}>
          Reload discards the amount you entered.
        </Text>
      )}
    </View>
  );
}
