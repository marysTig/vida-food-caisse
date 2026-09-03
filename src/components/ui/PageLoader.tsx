import { ChefHat } from "lucide-react";

export function PageLoader() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="relative flex flex-col items-center gap-6">
        {/* Cercles animés en arrière-plan */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-32 w-32 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-primary/20" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-24 w-24 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite_200ms] rounded-full bg-primary/30" />
        </div>

        {/* Logo central avec fond */}
        <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-xl shadow-primary/30">
          <ChefHat className="h-10 w-10 animate-bounce text-primary-foreground" />
        </div>

        {/* Texte de chargement */}
        <div className="z-10 flex flex-col items-center gap-2 text-center">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Chargement en cours...</h2>
          <p className="text-sm font-medium text-muted-foreground">Veuillez patienter quelques instants</p>
          
          {/* Barre de progression indéterminée */}
          <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-primary" style={{ animationName: "slide" }}></div>
          </div>
        </div>
      </div>
      
      {/* Animation personnalisée pour la barre */}
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

export function ComponentLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative mb-4 h-12 w-12">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative flex h-full w-full items-center justify-center rounded-full bg-primary/10">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
      <p className="text-sm font-semibold text-muted-foreground animate-pulse">Chargement...</p>
    </div>
  );
}
