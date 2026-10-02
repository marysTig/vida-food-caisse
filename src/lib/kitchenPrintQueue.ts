/**
 * Unified durable print queue (kitchen stations + receipt).
 * UI only enqueues — PrintQueueDaemon owns Bluetooth.
 */

import { supabase } from "@/lib/supabase";
import {
  computeKitchenFingerprint,
  getKitchenDelta,
  type CartItem,
} from "@/lib/cart";
import type { GlobalSupplement } from "@/lib/globalSupplementsStore";
import { getPrintersFromStore, type Printer } from "@/lib/printerStore";
import { useTableOrdersStore } from "@/lib/tableOrdersStore";
import { getLocalPrintDeviceId } from "@/lib/printDevice";
import {
  buildKitchenEscPos,
  buildReceiptEscPos,
  uint8ToBase64,
} from "@/lib/escposTickets";

export const PRIORITY_RECEIPT = 100;
export const PRIORITY_KITCHEN = 10;
export const MAX_PRINT_ATTEMPTS = 3;
/** Longer backoff after failures so RFCOMM can settle (was 2.5s → thrash). */
export const RETRY_BACKOFF_MS = 8000;
/** Fast retry for caisse — 8s kitchen backoff made first fail feel like "didn't print". */
export const RECEIPT_RETRY_BACKOFF_MS = 800;
export const INTER_PRINTER_GAP_MS = 4000;
/** Short cool-down when caisse switches MAC (not the full 4s kitchen gap). */
export const RECEIPT_MAC_COOLDOWN_MS = 1500;

export type PrintJobType = "kitchen" | "receipt";
export type PrintJobStatus =
  | "pending"
  | "printing"
  | "done"
  | "needs_manual"
  | "cancelled";

export type PrintJobPayload = {
  escposBase64: string;
  tableId: string;
  orderLabel: string | number;
  orderNote?: string;
  globalSupplements?: GlobalSupplement[];
  /** Kitchen: fingerprints to patch after this station succeeds */
  fingerprints?: Record<string, string>;
  deltaLineIds?: string[];
  /** Kitchen: lines that were on this ticket (for consol re-route) */
  lines?: CartItem[];
  /** Set when this job is a one-shot consol of a failed station */
  consolOfJobId?: string;
};

export type PrintJob = {
  id: string;
  table_id: string | null;
  job_type: PrintJobType;
  priority: number;
  printer_id: string | null;
  printer_name: string | null;
  mac_address: string | null;
  idempotency_key: string;
  status: PrintJobStatus;
  attempt_count: number;
  next_attempt_at: string;
  claimed_by_device_id: string | null;
  payload: PrintJobPayload;
  error: string | null;
  created_at: string;
  updated_at: string;
  printed_at: string | null;
};

export type KitchenStationBundle = {
  printerId: string;
  printerName: string;
  lines: CartItem[];
};

/** @deprecated — legacy shape kept for Admin job list compatibility */
export type KitchenPrintJobPayload = {
  tableId: string;
  orderLabel: string | number;
  orderNote?: string;
  globalSupplements?: GlobalSupplement[];
  stations: KitchenStationBundle[];
  deltaLineIds: string[];
  fingerprints: Record<string, string>;
};

export type KitchenPrintJob = PrintJob;

export type EnqueueKitchenResult =
  | { status: "enqueued"; jobIds: string[] }
  | { status: "noop"; reason: "empty_delta" | "duplicate" }
  | { status: "blocked_unmapped"; unmappedNames: string[] }
  | { status: "error"; message: string };

export type EnqueueReceiptResult =
  | { status: "enqueued"; jobId: string }
  | { status: "noop"; reason: "no_printer" | "duplicate" }
  | { status: "error"; message: string };

const STALE_PRINTING_MS = 2 * 60 * 1000;

function enabledKitchenPrinters(printers: Printer[]): Printer[] {
  return printers.filter(
    (p) => p.enabled && (p.type === "plaque" || p.type === "four"),
  );
}

function lineCategoryId(item: CartItem): string | undefined {
  return item.product.categoryId || undefined;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return `fb-${Math.abs(h).toString(16)}-${input.length}`;
}

export function findUnmappedDeltaLines(
  delta: CartItem[],
  kitchenPrinters: Printer[],
): CartItem[] {
  const mappedIds = new Set<string>();
  for (const p of kitchenPrinters) {
    for (const id of p.category_ids ?? []) mappedIds.add(id);
  }
  return delta.filter((item) => {
    const catId = lineCategoryId(item);
    return !catId || !mappedIds.has(catId);
  });
}

export function buildStationBundles(
  delta: CartItem[],
  kitchenPrinters: Printer[],
): KitchenStationBundle[] {
  const bundles: KitchenStationBundle[] = [];
  for (const printer of kitchenPrinters) {
    const ids = new Set(printer.category_ids ?? []);
    const lines = delta.filter((item) => {
      const catId = lineCategoryId(item);
      return !!catId && ids.has(catId);
    });
    if (lines.length > 0) {
      bundles.push({
        printerId: printer.id,
        printerName: printer.name,
        lines,
      });
    }
  }
  return bundles;
}

export async function buildIdempotencyKey(
  tableId: string,
  delta: CartItem[],
): Promise<string> {
  const parts = delta
    .map((item) => `${item.id}:${computeKitchenFingerprint(item)}`)
    .sort();
  return sha256Hex(`${tableId}|${parts.join(";")}`);
}

export type EnqueueKitchenParams = {
  tableId: string;
  orderLabel: string | number;
  items?: CartItem[];
  orderNote?: string;
  globalSupplements?: GlobalSupplement[];
  printers?: Printer[];
};

/**
 * One DB job per kitchen station with prebuilt ESC/POS — no Bluetooth.
 */
export async function enqueueKitchenStations(
  params: EnqueueKitchenParams,
): Promise<EnqueueKitchenResult> {
  const store = useTableOrdersStore.getState();
  const items = params.items ?? store.orders[params.tableId] ?? [];
  const orderNote =
    params.orderNote ?? store.orderNotes[params.tableId] ?? "";
  const globalSupplements =
    params.globalSupplements ?? store.orderSupplements[params.tableId] ?? [];
  const printers = params.printers ?? getPrintersFromStore();
  const kitchenPrinters = enabledKitchenPrinters(printers);

  const delta = getKitchenDelta(items);
  if (delta.length === 0) {
    return { status: "noop", reason: "empty_delta" };
  }

  if (kitchenPrinters.length === 0) {
    return {
      status: "error",
      message: "Aucune imprimante cuisine (plaque/four) activée.",
    };
  }

  const unmapped = findUnmappedDeltaLines(delta, kitchenPrinters);
  if (unmapped.length > 0) {
    return {
      status: "blocked_unmapped",
      unmappedNames: unmapped.map((i) => i.product.name),
    };
  }

  const stations = buildStationBundles(delta, kitchenPrinters);
  if (stations.length === 0) {
    return {
      status: "blocked_unmapped",
      unmappedNames: delta.map((i) => i.product.name),
    };
  }

  const baseKey = await buildIdempotencyKey(params.tableId, delta);
  const now = new Date().toISOString();
  const jobIds: string[] = [];

  for (const station of stations) {
    const printer = kitchenPrinters.find((p) => p.id === station.printerId);
    const mac = (printer?.mac_address ?? "").trim();
    if (!printer || !mac) continue;

    const stationFps: Record<string, string> = {};
    for (const item of station.lines) {
      stationFps[item.id] = computeKitchenFingerprint(item);
    }

    const escpos = buildKitchenEscPos({
      items: station.lines,
      orderNumber: params.orderLabel,
      ...(orderNote ? { orderNote } : {}),
      ...(globalSupplements.length > 0 ? { globalSupplements } : {}),
    });

    const idempotencyKey = `${baseKey}|${station.printerId}`;
    const payload: PrintJobPayload = {
      escposBase64: uint8ToBase64(escpos),
      tableId: params.tableId,
      orderLabel: params.orderLabel,
      fingerprints: stationFps,
      deltaLineIds: station.lines.map((l) => l.id),
      lines: station.lines,
    };
    if (orderNote) payload.orderNote = orderNote;
    if (globalSupplements.length > 0) payload.globalSupplements = globalSupplements;

    const row = {
      table_id: params.tableId,
      job_type: "kitchen" as const,
      priority: PRIORITY_KITCHEN,
      printer_id: printer.id,
      printer_name: printer.name,
      mac_address: mac,
      idempotency_key: idempotencyKey,
      status: "pending" as const,
      attempt_count: 0,
      next_attempt_at: now,
      payload,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("print_jobs")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("print_jobs")
          .select("id, status")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (
          existing &&
          (existing.status === "needs_manual" || existing.status === "cancelled")
        ) {
          await supabase
            .from("print_jobs")
            .update({
              status: "pending",
              attempt_count: 0,
              next_attempt_at: now,
              payload,
              claimed_by_device_id: null,
              error: null,
              updated_at: now,
            })
            .eq("id", existing.id as string);
          jobIds.push(existing.id as string);
          continue;
        }
        // pending/printing/done → skip duplicate
        continue;
      }
      console.error("[print_jobs] kitchen enqueue error:", error.message);
      return { status: "error", message: error.message };
    }
    if (data?.id) jobIds.push(data.id as string);
  }

  if (jobIds.length === 0) {
    return { status: "noop", reason: "duplicate" };
  }
  return { status: "enqueued", jobIds };
}

/** Alias used by existing Valider call sites */
export async function enqueueKitchenPrint(
  params: EnqueueKitchenParams,
): Promise<EnqueueKitchenResult> {
  return enqueueKitchenStations(params);
}

export type EnqueueReceiptParams = {
  tableId: string;
  orderLabel: string | number;
  items: CartItem[];
  total: number;
  globalSupplements?: GlobalSupplement[];
  checkoutTs?: number;
  printers?: Printer[];
};

/**
 * Enqueue caisse receipt — fire-and-forget, no Bluetooth.
 */
export async function enqueueReceipt(
  params: EnqueueReceiptParams,
): Promise<EnqueueReceiptResult> {
  const printers = params.printers ?? getPrintersFromStore();
  const caisse = printers.find(
    (p) => p.enabled && p.type === "caisse" && (p.mac_address || "").trim() !== "",
  );
  if (!caisse) {
    return { status: "noop", reason: "no_printer" };
  }

  const mac = caisse.mac_address!.trim();

  // table_id column is uuid — never insert fake strings like "receipt-2"
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const tableIdForDb =
    params.tableId && uuidRe.test(params.tableId) ? params.tableId : null;
  const idempotencyScope = params.tableId || String(params.orderLabel);

  const checkoutTs = params.checkoutTs ?? Date.now();
  const idempotencyKey = `receipt:${idempotencyScope}:${checkoutTs}`;
  const escpos = buildReceiptEscPos({
    items: params.items,
    total: params.total,
    tableNumber: params.orderLabel,
    ...(params.globalSupplements?.length
      ? { globalSupplements: params.globalSupplements }
      : {}),
  });
  const now = new Date().toISOString();
  const payload: PrintJobPayload = {
    escposBase64: uint8ToBase64(escpos),
    tableId: tableIdForDb ?? idempotencyScope,
    orderLabel: params.orderLabel,
  };
  if (params.globalSupplements?.length) {
    payload.globalSupplements = params.globalSupplements;
  }

  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      table_id: tableIdForDb,
      job_type: "receipt",
      priority: PRIORITY_RECEIPT,
      printer_id: caisse.id,
      printer_name: caisse.name,
      mac_address: mac,
      idempotency_key: idempotencyKey,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: now,
      payload,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { status: "noop", reason: "duplicate" };
    }
    console.error("[print_jobs] receipt enqueue error:", error.message);
    return { status: "error", message: error.message };
  }
  return { status: "enqueued", jobId: (data?.id as string) ?? "" };
}

/** One-shot consol: re-route failed station payload to another kitchen printer. */
export async function enqueueConsolKitchenJob(params: {
  failedJob: PrintJob;
  targetPrinter: Printer;
}): Promise<{ status: "enqueued" | "duplicate" | "error"; jobId?: string; message?: string }> {
  const { failedJob, targetPrinter } = params;
  const mac = (targetPrinter.mac_address ?? "").trim();
  if (!mac) {
    return { status: "error", message: "Imprimante sans adresse MAC" };
  }
  const idempotencyKey = `consol|${failedJob.id}|${targetPrinter.id}`;
  const now = new Date().toISOString();
  const payload: PrintJobPayload = {
    ...failedJob.payload,
    consolOfJobId: failedJob.id,
  };

  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      table_id: failedJob.table_id,
      job_type: "kitchen",
      priority: PRIORITY_KITCHEN,
      printer_id: targetPrinter.id,
      printer_name: targetPrinter.name,
      mac_address: mac,
      idempotency_key: idempotencyKey,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: now,
      payload,
      error: `Consol depuis ${failedJob.printer_name ?? failedJob.id}`,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { status: "duplicate" };
    return { status: "error", message: error.message };
  }
  return { status: "enqueued", jobId: (data?.id as string) ?? "" };
}

export async function claimNextPrintJob(
  deviceId: string = getLocalPrintDeviceId(),
): Promise<PrintJob | null> {
  const nowIso = new Date().toISOString();

  // Receipt pending? Pause kitchen claims.
  const { data: receiptPending } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("job_type", "receipt")
    .lte("next_attempt_at", nowIso)
    .limit(1);

  let query = supabase
    .from("print_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5);

  if (receiptPending && receiptPending.length > 0) {
    query = query.eq("job_type", "receipt");
  }

  const { data: candidates, error } = await query;

  if (error) {
    console.error("[print_jobs] claim fetch error:", error.message);
    return null;
  }
  if (!candidates?.length) return null;

  for (const row of candidates) {
    const { data, error: updErr } = await supabase
      .from("print_jobs")
      .update({
        status: "printing",
        claimed_by_device_id: deviceId,
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", (row as { id: string }).id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (!updErr && data) return mapJobRow(data);
  }
  return null;
}

export async function hasPendingReceiptJob(): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("job_type", "receipt")
    .lte("next_attempt_at", nowIso)
    .limit(1);
  return !!(data && data.length > 0);
}

export async function reclaimStalePrintingJobs(
  deviceId: string = getLocalPrintDeviceId(),
): Promise<PrintJob[]> {
  const cutoff = new Date(Date.now() - STALE_PRINTING_MS).toISOString();
  const { data: stale, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("status", "printing")
    .lt("updated_at", cutoff);

  if (error) return [];
  const claimed: PrintJob[] = [];
  for (const row of stale ?? []) {
    const { data, error: updErr } = await supabase
      .from("print_jobs")
      .update({
        status: "pending",
        claimed_by_device_id: null,
        next_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: "Reprise après interruption",
      })
      .eq("id", (row as { id: string }).id)
      .eq("status", "printing")
      .lt("updated_at", cutoff)
      .select("*")
      .maybeSingle();
    if (!updErr && data) claimed.push(mapJobRow(data));
  }
  void deviceId;
  return claimed;
}

export async function markPrintJobDone(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("print_jobs")
    .update({
      status: "done",
      printed_at: now,
      updated_at: now,
      error: null,
    })
    .eq("id", jobId);
}

export async function schedulePrintJobRetry(
  jobId: string,
  attemptCount: number,
  message: string,
  backoffMs: number = RETRY_BACKOFF_MS,
): Promise<"pending" | "needs_manual"> {
  const now = new Date();
  if (attemptCount >= MAX_PRINT_ATTEMPTS) {
    await supabase
      .from("print_jobs")
      .update({
        status: "needs_manual",
        attempt_count: attemptCount,
        error: message,
        claimed_by_device_id: null,
        updated_at: now.toISOString(),
      })
      .eq("id", jobId);
    return "needs_manual";
  }
  await supabase
    .from("print_jobs")
    .update({
      status: "pending",
      attempt_count: attemptCount,
      next_attempt_at: new Date(now.getTime() + backoffMs).toISOString(),
      error: message,
      claimed_by_device_id: null,
      updated_at: now.toISOString(),
    })
    .eq("id", jobId);
  return "pending";
}

/** Requeue interrupted kitchen (receipt preempt) without incrementing attempts. */
export async function requeueInterruptedJob(jobId: string): Promise<void> {
  await supabase
    .from("print_jobs")
    .update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      claimed_by_device_id: null,
      error: "Interrompu pour ticket caisse",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "printing");
}

export async function retryAllNeedsManual(): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("print_jobs")
    .update({
      status: "pending",
      attempt_count: 0,
      next_attempt_at: now,
      claimed_by_device_id: null,
      error: null,
      updated_at: now,
    })
    .eq("status", "needs_manual")
    .select("id");
  if (error) {
    console.error("[print_jobs] retry all error:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function fetchNeedsManualJobs(): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("status", "needs_manual")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapJobRow);
}

export async function fetchRecentPrintJobs(limit = 30): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(mapJobRow);
}

export async function patchOrderKitchenFingerprints(
  tableId: string,
  fingerprints: Record<string, string>,
): Promise<void> {
  const store = useTableOrdersStore.getState();
  const current = store.orders[tableId];
  if (!current || current.length === 0) return;

  const printedAt = new Date().toISOString();
  const next = current.map((item) => {
    const fp = fingerprints[item.id];
    if (!fp) return item;
    if (computeKitchenFingerprint(item) !== fp) return item;
    return {
      ...item,
      kitchenFingerprint: fp,
      kitchenPrintedAt: printedAt,
    };
  });

  store._patchOrder(tableId, next);
  await store.flushOrder(tableId);
}

/** Legacy aliases for Admin / old worker */
export async function markKitchenJobDone(jobId: string): Promise<void> {
  return markPrintJobDone(jobId);
}

export async function requeueFailedKitchenJob(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("print_jobs")
    .update({
      status: "pending",
      attempt_count: 0,
      next_attempt_at: now,
      claimed_by_device_id: null,
      error: null,
      updated_at: now,
    })
    .eq("id", jobId)
    .in("status", ["needs_manual", "cancelled"]);
}

export async function fetchRecentKitchenJobs(
  limit = 20,
): Promise<PrintJob[]> {
  return fetchRecentPrintJobs(limit);
}

export const MAX_KITCHEN_PRINT_ATTEMPTS = MAX_PRINT_ATTEMPTS;

export function kitchenJobAttemptCount(job: PrintJob): number {
  return job.attempt_count ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobRow(row: any): PrintJob {
  return {
    id: row.id as string,
    table_id: (row.table_id as string | null) ?? null,
    job_type: (row.job_type as PrintJobType) ?? "kitchen",
    priority: (row.priority as number) ?? PRIORITY_KITCHEN,
    printer_id: (row.printer_id as string | null) ?? null,
    printer_name: (row.printer_name as string | null) ?? null,
    mac_address: (row.mac_address as string | null) ?? null,
    idempotency_key: row.idempotency_key as string,
    status: row.status as PrintJobStatus,
    attempt_count: (row.attempt_count as number) ?? 0,
    next_attempt_at: (row.next_attempt_at as string) ?? row.created_at,
    claimed_by_device_id: (row.claimed_by_device_id as string | null) ?? null,
    payload: row.payload as PrintJobPayload,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    printed_at: (row.printed_at as string | null) ?? null,
  };
}
