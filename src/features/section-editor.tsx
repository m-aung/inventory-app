import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
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
import type { Section } from "../lib/types";
import { sectionColors, sectionSchema } from "../lib/validation";
import { refreshSectionItems } from "./sections";

export function SectionEditor({
  inventory,
  id: requestedId,
  initial: live,
}: {
  inventory: string;
  id?: string;
  initial?: Section;
}) {
  const [initial, setInitial] = useState(live);
  const [id] = useState(() => requestedId ?? Crypto.randomUUID());
  const [name, setName] = useState(live?.name ?? "");
  const [color, setColor] = useState(live?.color ?? sectionColors[0].value);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const exit = useRef(false);
  const locked = useRef(false);
  const { confirm, toast } = useFeedback();
  const navigation = useNavigation();
  const dirty =
    name !== (initial?.name ?? "") ||
    color !== (initial?.color ?? sectionColors[0].value);
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty || saved) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, saved]);
  usePreventRemove(dirty && !saved, ({ data }) => {
    if (exit.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (busy) return;
    void confirm({
      title: "Discard changes?",
      message: "Your unsaved section changes will be lost.",
      action: "Discard",
      danger: true,
    }).then((yes) => {
      if (yes) {
        exit.current = true;
        navigation.dispatch(data.action);
      }
    });
  });
  async function save() {
    if (locked.current || conflict) return;
    const values = sectionSchema.safeParse({ name, color });
    if (!values.success) {
      setProblem(values.error.issues[0].message);
      return;
    }
    locked.current = true;
    setBusy(true);
    setProblem("");
    try {
      await api.saveSection(
        id,
        inventory,
        values.data.name,
        values.data.color,
        initial?.version ?? null,
      );
      exit.current = true;
      setSaved(true);
      await refreshSectionItems();
      toast(initial ? "Section updated" : "Section added");
      router.back();
    } catch (e) {
      setConflict((e as { code?: string }).code === "40001");
      setProblem(
        (e as { code?: string }).code === "23505"
          ? "A section with this name already exists."
          : errorMessage(e),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!initial || locked.current || conflict) return;
    if (
      !(await confirm({
        title: `Remove ${initial.name}?`,
        message:
          "Its items will move to Unsorted for everyone. No items or quantities will be deleted.",
        action: "Remove section",
        danger: true,
      }))
    )
      return;
    locked.current = true;
    setBusy(true);
    try {
      await api.deleteSection(initial);
      exit.current = true;
      setSaved(true);
      await refreshSectionItems();
      toast("Section removed. Items moved to Unsorted.");
      router.back();
    } catch (e) {
      setConflict((e as { code?: string }).code === "40001");
      setProblem(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (locked.current) return;
    if (
      !(await confirm({
        title: "Reload section?",
        message: "Your unsaved name and color will be discarded.",
        action: "Reload",
      }))
    )
      return;
    locked.current = true;
    setBusy(true);
    try {
      const fresh = (await api.sections(inventory)).find((s) => s.id === id);
      if (!fresh) {
        exit.current = true;
        setSaved(true);
        await refreshSectionItems();
        toast("This section was removed. Its items are in Unsorted.");
        router.back();
        return;
      }
      setInitial(fresh);
      setName(fresh.name);
      setColor(fresh.color);
      setConflict(false);
      setProblem("");
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (requestedId && !initial)
    return (
      <Screen title="Section unavailable">
        <Notice text="This section was removed. Its items are in Unsorted." />
      </Screen>
    );
  return (
    <Screen
      title={initial ? "Manage section" : "Add section"}
      subtitle="Only the inventory owner can change section names and colors."
    >
      <Field
        label="Section name"
        value={name}
        maxLength={80}
        editable={!busy && !conflict}
        onChangeText={setName}
      />
      <Text style={styles.label}>Section color</Text>
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        {sectionColors.map((c) => (
          <Pressable
            key={c.value}
            accessibilityRole="button"
            accessibilityLabel={`Color ${c.name}`}
            accessibilityState={{
              selected: color === c.value,
              disabled: busy || conflict,
            }}
            disabled={busy || conflict}
            onPress={() => setColor(c.value)}
            style={{
              padding: 12,
              minHeight: 48,
              borderRadius: 12,
              backgroundColor: colors.card,
              borderWidth: color === c.value ? 2 : 1,
              borderColor: color === c.value ? colors.ink : colors.line,
            }}
          >
            <View style={styles.row}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: c.value,
                }}
              />
              <Text style={styles.body}>
                {c.name}
                {color === c.value ? " ✓" : ""}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {conflict ? (
        <Notice
          text={`Someone changed or removed this section before your change was saved. Your name “${name}” and selected color are still here. Reload replaces this draft.`}
        />
      ) : (
        !!problem && <Notice text={problem} />
      )}
      {conflict ? (
        <Button
          title="Reload section"
          secondary
          busy={busy}
          onPress={() => void reload()}
        />
      ) : (
        <Button title="Save section" busy={busy} onPress={() => void save()} />
      )}
      {initial && (
        <Button
          title="Remove section"
          danger
          disabled={busy || conflict}
          onPress={() => void remove()}
        />
      )}
    </Screen>
  );
}
