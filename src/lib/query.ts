import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: 1,
      refetchOnWindowFocus: true,
      networkMode: "always",
    },
    mutations: { retry: false, networkMode: "always" },
  },
});
