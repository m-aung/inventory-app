import { Text } from "react-native";
import { Screen, styles } from "../components/ui";
export default function Privacy() {
  return (
    <Screen title="About your data">
      <Text style={styles.body}>
        Your email identifies your account. Inventory names, item names,
        quantities, units, and optional notes are stored in the app’s database.
      </Text>
      <Text style={styles.body}>
        Your private inventory is visible only to you. Items in shared
        inventories are visible to their owner and members. Your email is
        visible to people in the same shared inventory.
      </Text>
      <Text style={styles.body}>
        You can remove items and delete your account from Settings. Delete any
        shared inventories you own first; leaving someone else’s inventory
        removes your access without deleting its items.
      </Text>
      <Text style={styles.body}>
        Avoid putting sensitive personal information in item names or notes.
      </Text>
    </Screen>
  );
}
