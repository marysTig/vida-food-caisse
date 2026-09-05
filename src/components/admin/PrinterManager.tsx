import { useState } from "react";
import { Printer as PrinterIcon, Plus, Trash2, Edit2, Check, X, Bluetooth, BluetoothConnected } from "lucide-react";
import { toast } from "sonner";
import { usePrinterStore, type Printer, type PrinterType } from "@/lib/printerStore";
import { useMenuStore } from "@/lib/menuStore";
import { printerService } from "@/lib/printerService";
import { ComponentLoader } from "@/components/ui/PageLoader";

export function PrinterManager() {
  const { printers, loading, addPrinter, updatePrinter, deletePrinter } = usePrinterStore();
  const { categories } = useMenuStore();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Printer>>({});
  
  // Refresh force state when connecting printers to update UI
  const [, setForceRender] = useState(0);

  if (loading) return <ComponentLoader />;

  const handleEdit = (printer: Printer) => {
    setEditingId(printer.id);
    setFormData({ ...printer });
  };

  const handleSave = async (id: string) => {
    try {
      if (id === "new") {
        await addPrinter(formData as Omit<Printer, "id">);
      } else {
        await updatePrinter(id, formData);
      }
      setEditingId(null);
      setFormData({});
      toast.success("Imprimante enregistrée");
    } catch (err: any) {
      toast.error("Erreur lors de l'enregistrement", { description: err.message });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({});
  };

  const handleTestPrint = async (printer: Printer) => {
    try {
      if (!printerService.isConnected(printer.id)) {
        toast.info("Connexion Bluetooth en cours...");
        await printerService.connectPrinter(printer);
        setForceRender(prev => prev + 1);
      }
      await printerService.printTest(printer);
      toast.success("Test d'impression envoyé !");
    } catch (err: any) {
      toast.error("Échec de l'impression", { description: err.message });
    }
  };

  const toggleCategory = (catName: string) => {
    const cats = formData.categories || [];
    if (cats.includes(catName)) {
      setFormData({ ...formData, categories: cats.filter(c => c !== catName) });
    } else {
      setFormData({ ...formData, categories: [...cats, catName] });
    }
  };

  const isEditing = (id: string) => editingId === id;

  const renderForm = (printer?: Printer) => {
    const isNew = !printer;
    const isPlaqueOrFour = formData.type === "plaque" || formData.type === "four";

    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm mb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Nom</label>
            <input
              type="text"
              value={formData.name || ""}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Imprimante Caisse"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Type / Poste</label>
            <select
              value={formData.type || "caisse"}
              onChange={e => {
                const type = e.target.value as PrinterType;
                setFormData({ 
                  ...formData, 
                  type,
                  categories: type === "caisse" ? [] : (formData.categories || [])
                });
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="caisse">Caisse (Générale)</option>
              <option value="plaque">Plaque</option>
              <option value="four">Four</option>
            </select>
          </div>
        </div>

        {isPlaqueOrFour && (
          <div>
            <label className="mb-2 block text-xs font-semibold text-muted-foreground">
              Catégories associées (Impression filtrée)
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => {
                const isSelected = (formData.categories || []).includes(cat.name);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.name)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {isSelected && <Check className="inline-block h-3 w-3 mr-1" />}
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" /> Annuler
          </button>
          <button
            onClick={() => handleSave(isNew ? "new" : printer.id)}
            disabled={!formData.name}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Gestion des Imprimantes</h2>
          <p className="text-sm text-muted-foreground">Configurez les imprimantes Bluetooth pour la caisse et la cuisine.</p>
        </div>
        {!editingId && (
          <button
            onClick={() => {
              setEditingId("new");
              setFormData({ name: "", type: "caisse", categories: [], enabled: true });
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus className="h-4 w-4" /> Ajouter une imprimante
          </button>
        )}
      </div>

      {isEditing("new") && renderForm()}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {printers.map(printer => {
          if (isEditing(printer.id)) {
            return (
              <div key={printer.id} className="sm:col-span-2 lg:col-span-3">
                {renderForm(printer)}
              </div>
            );
          }

          const isConnected = printerService.isConnected(printer.id);
          
          return (
            <div key={printer.id} className={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all ${!printer.enabled ? 'opacity-60 grayscale-[0.5]' : 'border-border hover:shadow-md'}`}>
              <div className="flex items-start justify-between border-b border-border p-4 bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <PrinterIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{printer.name}</h3>
                    <p className="text-xs text-muted-foreground capitalize">
                      Poste : {printer.type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-success' : 'bg-destructive'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-success' : 'bg-destructive'}`}></span>
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {isConnected ? 'Connectée' : 'Déconnectée'}
                  </span>
                </div>
              </div>
              
              <div className="flex-1 p-4">
                {(printer.type === "plaque" || printer.type === "four") ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Catégories filtrées :</p>
                    <div className="flex flex-wrap gap-1">
                      {printer.categories && printer.categories.length > 0 ? (
                        printer.categories.map(cat => (
                          <span key={cat} className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                            {cat}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs italic text-muted-foreground">Aucune catégorie sélectionnée</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Imprime tous les tickets d'encaissement.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between border-t border-border bg-card p-3 gap-2">
                <button
                  onClick={() => handleTestPrint(printer)}
                  disabled={!printer.enabled}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {isConnected ? <BluetoothConnected className="h-3.5 w-3.5 text-blue-500" /> : <Bluetooth className="h-3.5 w-3.5 text-muted-foreground" />}
                  Tester
                </button>
                <button
                  onClick={() => handleEdit(printer)}
                  className="flex items-center justify-center rounded-lg bg-secondary p-2 text-secondary-foreground hover:bg-secondary/80"
                  title="Modifier"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async () => {
                    const toggle = !printer.enabled;
                    await updatePrinter(printer.id, { enabled: toggle });
                    toast.success(`Imprimante ${toggle ? 'activée' : 'désactivée'}`);
                  }}
                  className={`flex items-center justify-center rounded-lg border p-2 ${printer.enabled ? 'border-border text-muted-foreground hover:bg-muted' : 'border-success bg-success/10 text-success hover:bg-success/20'}`}
                  title={printer.enabled ? "Désactiver" : "Activer"}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Supprimer cette imprimante ?")) {
                      await deletePrinter(printer.id);
                    }
                  }}
                  className="flex items-center justify-center rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10"
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {printers.length === 0 && !isEditing("new") && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-muted mb-4">
            <PrinterIcon className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Aucune imprimante configurée</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Ajoutez une imprimante Bluetooth pour imprimer des tickets de caisse ou envoyer des commandes en cuisine.
          </p>
        </div>
      )}
    </div>
  );
}
