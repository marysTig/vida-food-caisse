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

export type KitchenStationBundle = {
  printerId: string;
  printerName: string;
  lines: CartItem[];
};

export type KitchenPrintJobPayload = {
  tableId: string;
  orderLabel: string | number;
  orderNote?: string;
  globalSupplements?: GlobalSupplement[];
  stations: KitchenStationBundle[];
  /** Line ids included in this delta (for fingerprint patch on success) */
  deltaLineIds: string[];
  /** Fingerprints that will be written after successful print */
  fingerprints: Record<string, string>;
};

export type KitchenPrintJob = {
  id: string;
  table_id: string;
  idempotency_key: string;
  status: "pending" | "printing" | "done" | "failed" | "cancelled";
  claimed_by_device_id: string | null;
  payload: KitchenPrintJobPayload;
  error: string | null;
  created_at: string;
  updated_at: string;
  printed_at: string | null;
};

export type EnqueueKitchenResult =
  | { status: "enqueued"; jobId: string }
  | { status: "noop"; reason: "empty_delta" | "duplicate" }
  | { status: "blocked_unmapped"; unmappedNames: string[] }
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

/** Build SHA-256 hex (Web Crypto) for idempotency key. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback (non-crypto) — still unique enough for POS idempotency keys
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
 * Enqueue a kitchen print job for the delta of unprinted / changed lines.
 * Does not mark fingerprints — that happens only after the primary hub prints successfully.
 */
export async function enqueueKitchenPrint(
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
    const names = unmapped.map((i) => i.product.name);
    return { status: "blocked_unmapped", unmappedNames: names };
  }

  const stations = buildStationBundles(delta, kitchenPrinters);
  if (stations.length === 0) {
    return {
      status: "blocked_unmapped",
      unmappedNames: delta.map((i) => i.product.name),
    };
  }

  const fingerprints: Record<string, string> = {};
  for (const item of delta) {
    fingerprints[item.id] = computeKitchenFingerprint(item);
  }

  const idempotencyKey = await buildIdempotencyKey(params.tableId, delta);
  const payload: KitchenPrintJobPayload = {
    tableId: params.tableId,
    orderLabel: params.orderLabel,
    stations,
    deltaLineIds: delta.map((i) => i.id),
    fingerprints,
  };
  if (orderNote) payload.orderNote = orderNote;
  if (globalSupplements.length > 0) payload.globalSupplements = globalSupplements;

  const { data, error } = await supabase
    .from("kitchen_print_jobs")
    .insert({
      table_id: params.tableId,
      idempotency_key: idempotencyKey,
      status: "pending",
      payload,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique violation → another session already enqueued this exact delta
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("kitchen_print_jobs")
        .select("id, status, payload")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existing?.status === "failed" || existing?.status === "cancelled") {
        const { error: reErr } = await supabase
          .from("kitchen_print_jobs")
          .update({
            status: "pending",
            payload,
            claimed_by_device_id: null,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id as string);
        if (reErr) {
          return { status: "error", message: reErr.message };
        }
        return { status: "enqueued", jobId: existing.id as string };
      }

      if (existing?.status === "pending" || existing?.status === "printing") {
        return { status: "noop", reason: "duplicate" };
      }

      // status === done with same fingerprint → already printed
      return { status: "noop", reason: "duplicate" };
    }
    console.error("[kitchen_print] enqueue error:", error.message);
    return { status: "error", message: error.message };
  }

  return { status: "enqueued", jobId: (data?.id as string) ?? "" };
}

/**
 * Consolidated fallback job when a station MAC is down / circuit-open.
 * Uses a distinct idempotency key so it does not collide with the original delta key.
 */
export async function enqueueFallbackKitchenJob(params: {
  tableId: string;
  orderLabel: string | number;
  orderNote?: string;
  globalSupplements?: GlobalSupplement[];
  fallbackPrinter: Printer;
  lines: CartItem[];
  fingerprints: Record<string, string>;
  sourceJobId: string;
}): Promise<EnqueueKitchenResult> {
  if (params.lines.length === 0) {
    return { status: "noop", reason: "empty_delta" };
  }

  const stations: KitchenStationBundle[] = [
    {
      printerId: params.fallbackPrinter.id,
      printerName: params.fallbackPrinter.name,
      lines: params.lines,
    },
  ];

  const idempotencyKey = await sha256Hex(
    `fallback|${params.sourceJobId}|${params.fallbackPrinter.id}|${params.lines
      .map((l) => l.id)
      .sort()
      .join(",")}`,
  );

  const payload: KitchenPrintJobPayload = {
    tableId: params.tableId,
    orderLabel: params.orderLabel,
    stations,
    deltaLineIds: params.lines.map((l) => l.id),
    fingerprints: params.fingerprints,
  };
  if (params.orderNote) payload.orderNote = params.orderNote;
  if (params.globalSupplements?.length) {
    payload.globalSupplements = params.globalSupplements;
  }

  const { data, error } = await supabase
    .from("kitchen_print_jobs")
    .insert({
      table_id: params.tableId,
      idempotency_key: idempotencyKey,
      status: "pending",
      payload,
      error: `Fallback depuis job ${params.sourceJobId}`,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { status: "noop", reason: "duplicate" };
    }
    return { status: "error", message: error.message };
  }
  return { status: "enqueued", jobId: (data?.id as string) ?? "" };
}

export async function claimKitchenJob(
  jobId: string,
  deviceId: string = getLocalPrintDeviceId(),
): Promise<KitchenPrintJob | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("kitchen_print_jobs")
    .update({
      status: "printing",
      claimed_by_device_id: deviceId,
      updated_at: now,
      error: null,
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[kitchen_print] claim error:", error.message);
    return null;
  }
  if (!data) return null;
  return mapJobRow(data);
}

/** Reclaim jobs stuck in printing longer than STALE_PRINTING_MS. */
export async function reclaimStalePrintingJobs(
  deviceId: string = getLocalPrintDeviceId(),
): Promise<KitchenPrintJob[]> {
  const cutoff = new Date(Date.now() - STALE_PRINTING_MS).toISOString();
  const { data: stale, error } = await supabase
    .from("kitchen_print_jobs")
    .select("*")
    .eq("status", "printing")
    .lt("updated_at", cutoff);

  if (error) {
    console.error("[kitchen_print] stale fetch error:", error.message);
    return [];
  }

  const claimed: KitchenPrintJob[] = [];
  for (const row of stale ?? []) {
    const { data, error: updErr } = await supabase
      .from("kitchen_print_jobs")
      .update({
        status: "printing",
        claimed_by_device_id: deviceId,
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
  return claimed;
}

export async function fetchPendingKitchenJobs(): Promise<KitchenPrintJob[]> {
  const { data, error } = await supabase
    .from("kitchen_print_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[kitchen_print] pending fetch error:", error.message);
    return [];
  }
  return (data ?? []).map(mapJobRow);
}

export async function markKitchenJobDone(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("kitchen_print_jobs")
    .update({
      status: "done",
      printed_at: now,
      updated_at: now,
      error: null,
    })
    .eq("id", jobId);
  if (error) console.error("[kitchen_print] mark done error:", error.message);
}

export async function markKitchenJobFailed(
  jobId: string,
  message: string,
  previousPayload?: KitchenPrintJobPayload,
): Promise<void> {
  const attemptCount = (previousPayload as KitchenPrintJobPayload & { attemptCount?: number })?.attemptCount ?? 0;
  const nextPayload = previousPayload
    ? { ...previousPayload, attemptCount: attemptCount + 1 }
    : undefined;
  const { error } = await supabase
    .from("kitchen_print_jobs")
    .update({
      status: "failed",
      error: message,
      updated_at: new Date().toISOString(),
      claimed_by_device_id: null,
      ...(nextPayload ? { payload: nextPayload } : {}),
    })
    .eq("id", jobId);
  if (error) console.error("[kitchen_print] mark failed error:", error.message);
}

export const MAX_KITCHEN_PRINT_ATTEMPTS = 3;

export function kitchenJobAttemptCount(job: KitchenPrintJob): number {
  return (
    (job.payload as KitchenPrintJobPayload & { attemptCount?: number })
      ?.attemptCount ?? 0
  );
}

/**
 * After successful print: patch only kitchenFingerprint / kitchenPrintedAt on
 * matching line ids so concurrent cart edits are not clobbered.
 */
export async function patchOrderKitchenFingerprints(
  tableId: string,
  fingerprints: Record<string, string>,
): Promise<void> {
  const store = useTableOrdersStore.getState();
  const current = store.orders[tableId];
  // Order may already be cleared after encaissement — do not recreate empty rows
  if (!current || current.length === 0) return;

  const printedAt = new Date().toISOString();
  const next = current.map((item) => {
    const fp = fingerprints[item.id];
    if (!fp) return item;
    // Only stamp if the line still matches the printed fingerprint
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

/**
 * Reset a failed job to pending so the hub can retry (same idempotency key stays).
 */
export async function requeueFailedKitchenJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from("kitchen_print_jobs")
    .update({
      status: "pending",
      claimed_by_device_id: null,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "failed");
  if (error) console.error("[kitchen_print] requeue error:", error.message);
}

export async function fetchRecentKitchenJobs(
  limit = 20,
): Promise<KitchenPrintJob[]> {
  const { data, error } = await supabase
    .from("kitchen_print_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[kitchen_print] recent fetch error:", error.message);
    return [];
  }
  return (data ?? []).map(mapJobRow);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobRow(row: any): KitchenPrintJob {
  return {
    id: row.id as string,
    table_id: row.table_id as string,
    idempotency_key: row.idempotency_key as string,
    status: row.status as KitchenPrintJob["status"],
    claimed_by_device_id: (row.claimed_by_device_id as string | null) ?? null,
    payload: row.payload as KitchenPrintJobPayload,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    printed_at: (row.printed_at as string | null) ?? null,
  };
}
