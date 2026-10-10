import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { usePreventRemove } from "expo-router/react-navigation";
import { router, useNavigation } from "expo-router";
import * as Crypto from "expo-crypto";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  colors,
  Field,
  Notice,
  Screen,
  styles,
} from "../components/ui";
import { useFeedback } from "../components/feedback";
import { api, errorMessage } from "../lib/api";
import { queryClient } from "../lib/query";
import { itemSchema, units, type ItemDraft } from "../lib/validation";
import type { Item } from "../lib/types";

export function ItemEditor({
  inventory,
  initial: liveInitial,
}: {
  inventory: string;
  initial?: Item;
}) {
  // Capture the original version. Background refreshes must never erase a draft
  // or silently change the version against which it will be saved.
  const [initial] = useState(liveInitial);
  const initialValues: ItemDraft = {
    name: initial?.name ?? "",
    quantity: String(initial?.quantity ?? 1),
    unit: (initial?.unit as ItemDraft["unit"]) ?? "pcs",
    notes: initial?.notes ?? "",
  };
  const [values, setValues] = useState(initialValues);
  const [id] = useState(() => initial?.id ?? Crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const nameInput = useRef<TextInput>(null);
  const quantityInput = useRef<TextInput>(null);
  const { confirm, toast } = useFeedback();
  const navigation = useNavigation();
  const exit = useRef(false);
  const mutation = useMutation({
    mutationFn: () =>
      api.saveItem(
        id,
        inventory,
        itemSchema.parse(values),
        initial?.version ?? null,
      ),
  });
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty || saved) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, saved]);
  usePreventRemove(dirty && !saved, ({ data }) => {
    if (exit.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (mutation.isPending) return;
    void confirm({
      title: "Discard changes?",
      message: "Your unsaved changes will be lost.",
      action: "Discard",
      danger: true,
    }).then((yes) => {
      if (yes) {
        exit.current = true;
        navigation.dispatch(data.action);
      }
    });
  });
  function change(key: keyof ItemDraft, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }
  function validateField(key: keyof ItemDraft) {
    const result = itemSchema.shape[key].safeParse(values[key]);
    setErrors((e) => ({
      ...e,
      [key]: result.success ? "" : result.error.issues[0].message,
    }));
  }
  async function save() {
    if (mutation.isPending || conflict) return;
    const result = itemSchema.safeParse(values);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues)
        next[String(issue.path[0])] = issue.message;
      setErrors(next);
      if (next.name) nameInput.current?.focus();
      else if (next.quantity) quantityInput.current?.focus();
      return;
    }
    setProblem("");
    try {
      await mutation.mutateAsync();
      exit.current = true;
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["item"] });
      toast(initial ? "Item updated" : "Item added");
      router.back();
    } catch (e) {
      setConflict((e as { code?: string }).code === "40001");
      setProblem(errorMessage(e));
    }
  }
  return (
    <Screen title={initial ? "Edit item" : "Add item"}>
      <Field
        inputRef={nameInput}
        label="Item name"
        value={values.name}
        onChangeText={(v) => change("name", v)}
        onBlur={() => validateField("name")}
        maxLength={100}
        editable={!mutation.isPending}
        error={errors.name}
        placeholder="e.g. Milk"
      />
      <Field
        inputRef={quantityInput}
        label="Quantity"
        value={values.quantity}
        onChangeText={(v) => change("quantity", v)}
        onBlur={() => validateField("quantity")}
        keyboardType="decimal-pad"
        editable={!mutation.isPending}
        error={errors.quantity}
      />
      <View style={styles.row}>
        <Button
          title="−"
          secondary
          disabled={
            mutation.isPending || Number(values.quantity.replace(",", ".")) < 1
          }
          onPress={() =>
            change(
              "quantity",
              String(
                Math.max(0, Number(values.quantity.replace(",", ".")) - 1),
              ),
            )
          }
        />
        <Button
          title="＋"
          secondary
          disabled={
            mutation.isPending ||
            Number(values.quantity.replace(",", ".")) >= 999999
          }
          onPress={() =>
            change(
              "quantity",
              String(
                Math.min(
                  999999,
                  Math.round(
                    (Number(values.quantity.replace(",", ".")) + 1) * 1000,
                  ) / 1000,
                ),
              ),
            )
          }
        />
        <Text style={styles.small}>Or enter a number above.</Text>
      </View>
      <Text style={styles.label}>Unit</Text>
      <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
        {units.map((u) => (
          <Pressable
            key={u}
            accessibilityRole="button"
            accessibilityLabel={`Unit ${u}`}
            accessibilityState={{
              selected: values.unit === u,
              disabled: mutation.isPending,
            }}
            disabled={mutation.isPending}
            onPress={() => change("unit", u)}
            style={{
              minHeight: 44,
              paddingHorizontal: 16,
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: values.unit === u ? colors.teal : colors.line,
            }}
          >
            <Text style={{ color: values.unit === u ? "#fff" : colors.ink }}>
              {u}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Notes (optional)"
        value={values.notes}
        onChangeText={(v) => change("notes", v)}
        multiline
        maxLength={500}
        error={errors.notes}
        editable={!mutation.isPending}
        style={{ minHeight: 120, textAlignVertical: "top" }}
        placeholder="Add any notes…"
      />
      <Text style={styles.small}>{values.notes.length}/500</Text>
      {problem ? <Notice text={problem} /> : null}
      {conflict ? (
        <Button
          title="Reload item"
          onPress={async () => {
            if (
              await confirm({
                title: "Reload item?",
                message: "Your unsaved changes will be discarded.",
                action: "Reload",
              })
            ) {
              exit.current = true;
              await queryClient.invalidateQueries({ queryKey: ["item"] });
              router.replace({
                pathname: "/item/[id]",
                params: { id, inventory },
              });
            }
          }}
        />
      ) : (
        <Button
          title={
            mutation.isPending
              ? "Saving…"
              : initial
                ? "Save changes"
                : "Save item"
          }
          busy={mutation.isPending}
          onPress={save}
        />
      )}
    </Screen>
  );
}
