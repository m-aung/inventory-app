import { Text, View } from "react-native";
import { Notice, styles } from "./ui";

export function ConflictNotice({
  amount,
  unit,
}: {
  amount: string;
  unit: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Notice text="Someone updated this item before your change was saved." />
      <Text style={styles.body}>
        Your attempted amount: {amount} {unit}
      </Text>
      <Text style={styles.small}>
        Your change was not saved. Reload replaces your unsaved changes with the
        latest item.
      </Text>
    </View>
  );
}
