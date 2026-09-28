import { useEffect, useState } from "react";
import { Printer as PrinterIcon, Plus, Trash2, Edit2, Check, X, Bluetooth, BluetoothConnected, Tablet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { usePrinterStore, type Printer, type PrinterType } from "@/lib/printerStore";
import { useMenuStore } from "@/lib/menuStore";
import { printerService } from "@/lib/printerService";
import { usePrintSettingsStore } from "@/lib/printSettingsStore";
import { fetchRecentKitchenJobs, requeueFailedKitchenJob, type KitchenPrintJob } from "@/lib/kitchenPrintQueue";
import { closeCircuit } from "@/lib/kitchenCircuitBreaker";
import {
  getPrintActivity,
  subscribePrintActivity,
  type PrintActivityEntry,
} from "@/lib/printActivityLog";
import { ComponentLoader } from "@/components/ui/PageLoader";

type Reachability = {
  status: "unknown" | "checking" | "ok" | "fail";
  detail: string;
};

export function PrinterManager() {
  const { printers, loading, addPrinter, updatePrinter, deletePrinter } = usePrinterStore();
  const { categories } = useMenuStore();
  const {
    localDeviceId,
    primaryDeviceId,
    isPrimaryHub,
    loading: hubLoading,
    claimPrimaryHub,
    fallbackKitchenPrinterId,
    setFallbackPrinter,
  } = usePrintSettingsStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Printer>>({});
  const [pairedDevices, setPairedDevices] = useState<{ name: string; address: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [recentJobs, setRecentJobs] = useState<KitchenPrintJob[]>([]);
  const [activity, setActivity] = useState<PrintActivityEntry[]>(() => getPrintActivity());
  const [reachability, setReachability] = useState<Record<string, Reachability>>({});
  const [probingAll, setProbingAll] = useState(false);

  useEffect(() => {
    return subscribePrintActivity(() => setActivity(getPrintActivity()));
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetchRecentKitchenJobs(8).then((jobs) => {
      if (mounted) setRecentJobs(jobs);
    });
    const t = setInterval(() => {
      void fetchRecentKitchenJobs(8).then((jobs) => {
        if (mounted) setRecentJobs(jobs);
      });
    }, 8000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const probePrinter = async (printer: Printer) => {
    setReachability((prev) => ({
      ...prev,
      [printer.id]: { status: "checking", detail: "Test en cours…" },
    }));
    const result = await printerService.verifyPrinterReachable(printer);
    setReachability((prev) => ({
      ...prev,
      [printer.id]: {
        status: result.ok ? "ok" : "fail",
        detail: result.detail,
      },
    }));
    return result;
  };

  const probeAll = async () => {
    setProbingAll(true);
    try {
      for (const p of printers) {
        await probePrinter(p);
      }
    } finally {
      setProbingAll(false);
    }
  };

  useEffect(() => {
    if (loading || hubLoading || printers.length === 0) return;
    void probeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hubLoading, printers.map((p) => `${p.id}:${p.mac_address}`).join("|")]);

  if (loading || hubLoading) return <ComponentLoader />;

  const categoryNameById = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const handleEdit = (printer: Printer) => {
    setEditingId(printer.id);
    setFormData({ ...printer });
  };

  const handleSave = async (id: string) => {
    try {
      if (id === "new") {
        await addPrinter({
          name: formData.name || "",
          type: formData.type || "caisse",
          mac_address: formData.mac_address ?? null,
          enabled: formData.enabled ?? true,
          categories: [],
          category_ids: formData.category_ids ?? [],
        });
      } else {
        await updatePrinter(id, {
          ...formData,
          categories: [],
          category_ids: formData.category_ids ?? [],
        });
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
    setPairedDevices([]);
  };

  const scanDevices = async () => {
    setScanning(true);
    try {
      const devices = await printerService.getPairedDevices();
      setPairedDevices(devices);
      if (devices.length === 0) toast.info("Aucun appareil Bluetooth associé trouvé sur la tablette.");
    } catch (err: any) {
      toast.error("Erreur de scan Bluetooth", { description: err.message });
    }
    setScanning(false);
  };

  const handleTestPrint = async (printer: Printer) => {
    try {
      toast.info("Connexion / test Bluetooth…");
      const reach = await probePrinter(printer);
      if (!reach.ok) {
        toast.error("Imprimante injoignable", { description: reach.detail });
        return;
      }
      await printerService.printTest(printer);
      toast.success("Test d'impression envoyé !");
      await probePrinter(printer);
    } catch (err: any) {
      toast.error("Échec de l'impression", { description: err.message });
      await probePrinter(printer);
    }
  };

  const toggleCategoryId = (catId: string) => {
    const ids = formData.category_ids || [];
    if (ids.includes(catId)) {
      setFormData({ ...formData, category_ids: ids.filter((c) => c !== catId) });
    } else {
      setFormData({ ...formData, category_ids: [...ids, catId] });
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
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Imprimante Caisse"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Type / Poste</label>
            <select
              value={formData.type || "caisse"}
              onChange={(e) => {
                const type = e.target.value as PrinterType;
                setFormData({
                  ...formData,
                  type,
                  category_ids: type === "caisse" ? [] : formData.category_ids || [],
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

        {printerService.isNativePlatform() && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Appareil Bluetooth (Adresse MAC)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.mac_address || ""}
                onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                placeholder="Sélectionnez un appareil ci-contre ->"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={scanDevices}
                disabled={scanning}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                {scanning ? "Recherche..." : "Rechercher"}
              </button>
            </div>
            {pairedDevices.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2 max-h-40 overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-1 font-semibold">
                  Appareils appairés (cliquez pour sélectionner) :
                </p>
                {pairedDevices.map((d) => (
                  <button
                    key={d.address}
                    type="button"
                    onClick={() => setFormData({ ...formData, mac_address: d.address })}
                    className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${
                      formData.mac_address === d.address
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-muted bg-background border border-transparent hover:border-border"
                    }`}
                  >
                    <span>{d.name || "Appareil Inconnu"}</span>
                    <span
                      className={`text-xs ${
                        formData.mac_address === d.address
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {d.address}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              Vous devez d&apos;abord associer (appairer) l&apos;imprimante dans les réglages Bluetooth
              d&apos;Android.
            </p>
          </div>
        )}

        {isPlaqueOrFour && (
          <div>
            <label className="mb-2 block text-xs font-semibold text-muted-foreground">
              Catégories associées (par ID — impression filtrée)
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const isSelected = (formData.category_ids || []).includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategoryId(cat.id)}
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
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Aucune catégorie menu chargée.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" /> Annuler
          </button>
          <button
            type="button"
            onClick={() => handleSave(isNew ? "new" : printer!.id)}
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
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6 lg:p-8">
      {/* Print hub */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10">
              <Tablet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Hub d&apos;impression cuisine</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Un seul appareil (tablette caisse principale) exécute les tickets plaque/four via
                Bluetooth. Les autres sessions n&apos;envoient que des jobs en file d&apos;attente.
              </p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground break-all">
                Cet appareil : {localDeviceId}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground break-all">
                Hub actuel : {primaryDeviceId || "(non défini)"}
              </p>
              <p className="mt-1 text-xs font-semibold">
                {isPrimaryHub ? (
                  <span className="text-success">Cet appareil est le hub primaire</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">
                    Cet appareil n&apos;est pas le hub — l&apos;impression cuisine Bluetooth ne
                    partira pas d&apos;ici
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await claimPrimaryHub();
                toast.success("Cet appareil est maintenant le hub d'impression");
              } catch (err: any) {
                toast.error("Impossible de définir le hub", { description: err.message });
              }
            }}
            className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Définir cet appareil comme hub
          </button>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Imprimante cuisine de secours (optionnel)
          </label>
          <p className="text-[11px] text-muted-foreground mb-2">
            Non requis. Laissez vide en fonctionnement normal : en cas d&apos;échec,
            utilisez « Réimprimer cuisine » / « Relancer ». Le fallback n&apos;est utile
            que si vous avez une seconde imprimante dédiée.
          </p>
          <select
            value={fallbackKitchenPrinterId ?? ""}
            onChange={async (e) => {
              const val = e.target.value || null;
              try {
                await setFallbackPrinter(val);
                toast.success(
                  val ? "Imprimante de secours enregistrée" : "Fallback désactivé",
                );
              } catch (err: any) {
                toast.error("Erreur fallback", { description: err.message });
              }
            }}
            className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">— Aucune (réimpression manuelle uniquement) —</option>
            {printers
              .filter((p) => p.enabled && (p.type === "plaque" || p.type === "four" || p.type === "caisse"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </option>
              ))}
          </select>
        </div>

        {activity.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Activité impression (caisse + tests) — locale
            </p>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {activity.slice(0, 12).map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 text-xs text-foreground"
                >
                  <span className="text-muted-foreground">
                    {new Date(a.at).toLocaleTimeString("fr-FR")}
                  </span>
                  <span className="uppercase font-semibold">{a.kind}</span>
                  <span>{a.printerName}</span>
                  <span
                    className={
                      a.status === "success"
                        ? "text-success"
                        : a.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {a.status}
                  </span>
                  {a.detail && (
                    <span className="w-full text-muted-foreground truncate" title={a.detail}>
                      {a.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recentJobs.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Derniers jobs cuisine</p>
            <ul className="space-y-1">
              {recentJobs.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground"
                >
                  <span className="font-mono text-muted-foreground">{j.id.slice(0, 8)}</span>
                  <span className="capitalize">{j.status}</span>
                  <span className="text-muted-foreground">
                    {new Date(j.created_at).toLocaleString("fr-FR")}
                  </span>
                  {j.status === "failed" && (
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold hover:bg-muted"
                      onClick={async () => {
                        try {
                          // Clear circuits for kitchen printers so retry can connect
                          for (const p of printers) {
                            if (p.type === "plaque" || p.type === "four") {
                              closeCircuit(p.mac_address);
                            }
                          }
                          await requeueFailedKitchenJob(j.id);
                          toast.success("Job remis en file");
                          const jobs = await fetchRecentKitchenJobs(8);
                          setRecentJobs(jobs);
                        } catch (err: any) {
                          toast.error("Relance impossible", { description: err.message });
                        }
                      }}
                    >
                      Relancer
                    </button>
                  )}
                  {j.error && (
                    <span className="w-full text-destructive truncate" title={j.error}>
                      {j.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Gestion des Imprimantes</h2>
          <p className="text-sm text-muted-foreground">
            Configurez les imprimantes Bluetooth pour la caisse et la cuisine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void probeAll()}
            disabled={probingAll || printers.length === 0}
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${probingAll ? "animate-spin" : ""}`} />
            Vérifier Bluetooth
          </button>
          {!editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId("new");
                setFormData({
                  name: "",
                  type: "caisse",
                  categories: [],
                  category_ids: [],
                  enabled: true,
                });
              }}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="h-4 w-4" /> Ajouter une imprimante
            </button>
          )}
        </div>
      </div>

      {isEditing("new") && renderForm()}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {printers.map((printer) => {
          if (isEditing(printer.id)) {
            return (
              <div key={printer.id} className="sm:col-span-2 lg:col-span-3">
                {renderForm(printer)}
              </div>
            );
          }

          const reach = reachability[printer.id] ?? {
            status: "unknown" as const,
            detail: "Non vérifié",
          };
          const isOk = reach.status === "ok";
          const isChecking = reach.status === "checking";
          const missingCats =
            (printer.type === "plaque" || printer.type === "four") &&
            (!printer.category_ids || printer.category_ids.length === 0);

          return (
            <div
              key={printer.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all ${
                !printer.enabled ? "opacity-60 grayscale-[0.5]" : "border-border hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between border-b border-border p-4 bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <PrinterIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{printer.name}</h3>
                    <p className="text-xs text-muted-foreground capitalize">Poste : {printer.type}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {printer.mac_address || "MAC manquante"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      {!isChecking && (
                        <span
                          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            isOk ? "bg-success animate-ping" : "bg-destructive"
                          }`}
                        />
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${
                          isChecking
                            ? "bg-amber-500"
                            : isOk
                              ? "bg-success"
                              : "bg-destructive"
                        }`}
                      />
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {isChecking
                        ? "Vérif…"
                        : isOk
                          ? "Joignable"
                          : reach.status === "unknown"
                            ? "Inconnu"
                            : "Injoignable"}
                    </span>
                  </div>
                  <span
                    className="text-[9px] text-muted-foreground max-w-[140px] text-right truncate"
                    title={reach.detail}
                  >
                    {reach.detail}
                  </span>
                </div>
              </div>

              <div className="flex-1 p-4">
                {printer.type === "plaque" || printer.type === "four" ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                      Catégories filtrées :
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {printer.category_ids && printer.category_ids.length > 0 ? (
                        printer.category_ids.map((id) => (
                          <span
                            key={id}
                            className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                          >
                            {categoryNameById(id)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs italic text-destructive">
                          Aucune catégorie — les commandes seront bloquées pour ces produits
                        </span>
                      )}
                    </div>
                    {missingCats && (
                      <p className="mt-2 text-[11px] text-destructive">
                        Associez au moins une catégorie menu.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Imprime tous les tickets d&apos;encaissement.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between border-t border-border bg-card p-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTestPrint(printer)}
                  disabled={!printer.enabled}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {isOk ? (
                    <BluetoothConnected className="h-3.5 w-3.5 text-blue-500" />
                  ) : (
                    <Bluetooth className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  Tester
                </button>
                <button
                  type="button"
                  onClick={() => handleEdit(printer)}
                  className="flex items-center justify-center rounded-lg bg-secondary p-2 text-secondary-foreground hover:bg-secondary/80"
                  title="Modifier"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const toggle = !printer.enabled;
                    await updatePrinter(printer.id, { enabled: toggle });
                    toast.success(`Imprimante ${toggle ? "activée" : "désactivée"}`);
                  }}
                  className={`flex items-center justify-center rounded-lg border p-2 ${
                    printer.enabled
                      ? "border-border text-muted-foreground hover:bg-muted"
                      : "border-success bg-success/10 text-success hover:bg-success/20"
                  }`}
                  title={printer.enabled ? "Désactiver" : "Activer"}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
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
            Ajoutez une imprimante Bluetooth pour imprimer des tickets de caisse ou envoyer des
            commandes en cuisine.
          </p>
        </div>
      )}
    </div>
  );
}
