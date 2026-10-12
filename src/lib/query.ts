import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: 1,
      refetchOnWindowFocus: "always",
      networkMode: "always",
    },
    mutations: { retry: false, networkMode: "always" },
  },
});
