import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="expense/new" options={{ title: "Nuevo gasto", presentation: "modal" }} />
      <Stack.Screen name="receipt/new" options={{ title: "Nueva factura", presentation: "modal" }} />
    </Stack>
  );
}
