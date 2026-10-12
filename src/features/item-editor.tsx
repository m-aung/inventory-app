import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { useSections, SectionChoice, sectionsFailureMessage } from "./sections";
import { ConflictNotice } from "../components/conflict-notice";

export function ItemEditor({
  inventory,
  initial: liveInitial,
  defaultSection,
}: {
  inventory: string;
  initial?: Item;
  defaultSection?: string;
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
  const [section, setSection] = useState(
    initial?.section_id ?? defaultSection ?? "",
  );
  const [choosingSection, setChoosingSection] = useState(false);
  const sections = useSections(inventory);
  const selectedSection = sections.data?.find((s) => s.id === section);
  const [id] = useState(() => initial?.id ?? Crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [conflict, setConflict] = useState(false);
  const [attempted, setAttempted] = useState<{
    amount: string;
    unit: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const nameInput = useRef<TextInput>(null);
  const quantityInput = useRef<TextInput>(null);
  const { confirm, toast } = useFeedback();
  const navigation = useNavigation();
  const exit = useRef(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const payload = JSON.stringify([
        id,
        initial?.version ?? null,
        values,
        section,
      ]);
      if (request.current?.payload !== payload)
        request.current = { payload, id: Crypto.randomUUID() };
      return api.saveItem(
        id,
        inventory,
        itemSchema.parse(values),
        initial?.version ?? null,
        section || null,
        request.current.id,
      );
    },
  });
  const dirty =
    JSON.stringify(values) !== JSON.stringify(initialValues) ||
    section !== (initial?.section_id ?? defaultSection ?? "");
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
    if (
      mutation.isPending ||
      conflict ||
      sections.isPending ||
      sections.isError
    )
      return;
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
    setAttempted({ amount: values.quantity, unit: values.unit });
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
                Math.max(
                  0,
                  Math.round(
                    (Number(values.quantity.replace(",", ".")) - 1) * 1000,
                  ) / 1000,
                ),
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
      <Text style={styles.label}>Section</Text>
      <Button
        title={
          section
            ? (selectedSection?.name ?? "Section unavailable — choose another")
            : "Unsorted"
        }
        secondary
        disabled={mutation.isPending || conflict}
        onPress={() => setChoosingSection(true)}
      />
      {sections.isError && (
        <>
          <Notice text={sectionsFailureMessage(sections.setupRequired)} />
          <Button
            title="Retry sections"
            secondary
            onPress={() => void sections.refetch()}
          />
        </>
      )}
      {!!section && sections.isSuccess && !selectedSection && (
        <Notice text="This section was removed. Choose another section or Unsorted. Your draft is still here." />
      )}
      <Modal
        visible={choosingSection}
        presentationStyle="fullScreen"
        animationType="slide"
        onRequestClose={() => setChoosingSection(false)}
      >
        <Screen
          title="Choose section"
          back={false}
          action={
            <Button
              title="Done"
              secondary
              onPress={() => setChoosingSection(false)}
            />
          }
        >
          <SectionChoice
            name="Unsorted"
            selected={!section}
            onPress={() => {
              setSection("");
              setChoosingSection(false);
            }}
          />
          {sections.data?.map((s) => (
            <SectionChoice
              key={s.id}
              name={s.name}
              color={s.color}
              selected={s.id === section}
              onPress={() => {
                setSection(s.id);
                setChoosingSection(false);
              }}
            />
          ))}
        </Screen>
      </Modal>
      {conflict && attempted ? (
        <ConflictNotice amount={attempted.amount} unit={attempted.unit} />
      ) : problem ? (
        <Notice text={problem} />
      ) : null}
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
          disabled={
            sections.isPending ||
            sections.isError ||
            (!!section && sections.isSuccess && !selectedSection)
          }
          onPress={save}
        />
      )}
    </Screen>
  );
}
