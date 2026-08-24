import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/serveur")({
  component: ServeurPage,
});

function ServeurPage() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold">Interface Serveur</h1>
      <p className="mt-4 text-muted-foreground">Espace pour les serveurs (en construction)</p>
    </div>
  );
}
