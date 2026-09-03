import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/serveur")(  {
  head: () => ({
    meta: [
      { title: "Tables — La Vida Food" },
      {
        name: "description",
        content:
          "Gestion des tables La Vida Food.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/tables" });
  },
  component: () => null,
});
