import { useState } from "react";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { useGlobalSupplementsCRUD, type GlobalSupplement } from "@/lib/globalSupplementsStore";

export function GlobalSupplementsManager() {
  const { supplements, loading, addSupplement, updateSupplement, deleteSupplement } = useGlobalSupplementsCRUD();

  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const handleAdd = async () => {
    if (!newLabel.trim() || !newPrice.trim()) return;
    try {
      await addSupplement(newLabel.trim(), parseFloat(newPrice));
      setNewLabel("");
      setNewPrice("");
      setIsAdding(false);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'ajout du supplément.");
    }
  };

  const startEdit = (s: GlobalSupplement) => {
    setEditingId(s.id);
    setEditLabel(s.label);
    setEditPrice(s.price.toString());
  };

  const handleUpdate = async () => {
    if (!editingId || !editLabel.trim() || !editPrice.trim()) return;
    try {
      await updateSupplement(editingId, {
        label: editLabel.trim(),
        price: parseFloat(editPrice),
      });
      setEditingId(null);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la mise à jour.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        Chargement des suppléments...
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-muted/20 p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Suppléments de Commande
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gérez les suppléments globaux qui s'appliquent à l'ensemble de la commande (ex: Emballage, Livraison).
            </p>
          </div>
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Nouveau
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Formulaire d'ajout */}
          {isAdding && (
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Nom du supplément (ex: Emballage)"
                className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="Prix (DA)"
                  className="h-10 w-32 rounded-md border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-sm font-semibold text-muted-foreground">DA</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!newLabel.trim() || !newPrice.trim()}
                  className="grid h-10 w-10 place-items-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="grid h-10 w-10 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Liste des suppléments */}
          <div className="grid gap-3">
            {supplements.length === 0 && !isAdding ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Aucun supplément configuré.
                </p>
              </div>
            ) : (
              supplements.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30"
                >
                  {editingId === s.id ? (
                    <div className="flex flex-1 items-center gap-4">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="h-9 w-24 rounded-md border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
                        />
                        <span className="text-sm font-semibold text-muted-foreground">DA</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleUpdate}
                          className="grid h-9 w-9 place-items-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Plus className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{s.label}</h3>
                          <p className="text-sm font-medium text-muted-foreground">
                            {s.price} DA
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(s)}
                          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Modifier"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Supprimer "${s.label}" ?`)) {
                              deleteSupplement(s.id).catch(() =>
                                alert("Erreur lors de la suppression")
                              );
                            }
                          }}
                          className="grid h-9 w-9 place-items-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
