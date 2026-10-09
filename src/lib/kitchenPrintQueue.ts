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
import { getPrintersFromStore, isPrinterEndpointConfigured, resolvePrinterTransport, type Printer } from "@/lib/printerStore";
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
/** 2-printer profile — keep in sync with EscPosBluetoothPrinter / PrintJobRepository. */
export const RETRY_BACKOFF_MS = 2500;
export const RECEIPT_RETRY_BACKOFF_MS = 450;
/** 2-kitchen BT profile — MAC handoff gap (native EscPosBluetoothPrinter). */
export const INTER_PRINTER_GAP_MS = 100;
/** Short cool-down when caisse switches MAC (not the full kitchen gap). */
export const RECEIPT_MAC_COOLDOWN_MS = 350;

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
  transport?: "bluetooth" | "usb";
  usb_vendor_id?: number | null;
  usb_product_id?: number | null;
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

/** Max enabled cuisine Bluetooth stations (USB Caisse is separate). */
const MAX_ENABLED_KITCHEN = 2;

function enabledKitchenPrinters(printers: Printer[]): Printer[] {
  return printers
    .filter(
      (p) =>
        p.enabled &&
        p.type === "cuisine" &&
        (p.mac_address || "").trim() !== "",
    )
    .slice(0, MAX_ENABLED_KITCHEN);
}

function isCatchAllCuisine(printer: Printer): boolean {
  return (printer.category_ids?.length ?? 0) === 0;
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
  if (kitchenPrinters.some(isCatchAllCuisine)) return [];
  const mappedIds = new Set<string>();
  for (const p of kitchenPrinters) {
    for (const id of p.category_ids ?? []) mappedIds.add(id);
  }
  return delta.filter((item) => {
    const catId = lineCategoryId(item);
    return !catId || !mappedIds.has(catId);
  });
}

/**
 * Split delta across kitchen printers.
 * Mapped stations claim their categories first; catch-all gets leftovers only
 * (avoids double-print when Four has categories and Plaque is empty).
 */
export function buildStationBundles(
  delta: CartItem[],
  kitchenPrinters: Printer[],
): KitchenStationBundle[] {
  const bundles: KitchenStationBundle[] = [];
  const claimedLineIds = new Set<string>();

  const mapped = kitchenPrinters.filter((p) => !isCatchAllCuisine(p));
  const catchAlls = kitchenPrinters.filter(isCatchAllCuisine);

  for (const printer of mapped) {
    const ids = new Set(printer.category_ids ?? []);
    const lines = delta.filter((item) => {
      const catId = lineCategoryId(item);
      return !!catId && ids.has(catId);
    });
    for (const line of lines) claimedLineIds.add(line.id);
    if (lines.length > 0) {
      bundles.push({
        printerId: printer.id,
        printerName: printer.name,
        lines,
      });
    }
  }

  const leftovers = delta.filter((item) => !claimedLineIds.has(item.id));
  if (leftovers.length > 0 && catchAlls.length > 0) {
    // Prefer first catch-all only — avoid printing leftovers on every catch-all.
    const printer = catchAlls[0]!;
    bundles.push({
      printerId: printer.id,
      printerName: printer.name,
      lines: leftovers,
    });
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

/** How long a finished kitchen job still guards its lines (print-mark lag). */
const IN_FLIGHT_DONE_WINDOW_MS = 2 * 60 * 1000;

type InFlightLine = { fingerprint: string; status: string; printedAt: string | null };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** item id → fingerprints on pending/printing (or just-done) kitchen jobs. */
async function fetchInFlightKitchenLines(
  tableId: string,
): Promise<Map<string, InFlightLine[]>> {
  const byItem = new Map<string, InFlightLine[]>();
  if (!UUID_RE.test(tableId)) return byItem;
  const since = new Date(Date.now() - IN_FLIGHT_DONE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("status, printed_at, fingerprints:payload->fingerprints")
    .eq("table_id", tableId)
    .eq("job_type", "kitchen")
    .or(`status.in.(pending,printing),and(status.eq.done,updated_at.gte."${since}")`);
  if (error) {
    console.warn("[KITCHEN ENQUEUE] in-flight lookup failed", error.message);
    return byItem;
  }
  for (const row of data ?? []) {
    const r = row as {
      status: string;
      printed_at: string | null;
      fingerprints: Record<string, string> | null;
    };
    for (const [itemId, fingerprint] of Object.entries(r.fingerprints ?? {})) {
      const list = byItem.get(itemId) ?? [];
      list.push({ fingerprint, status: r.status, printedAt: r.printed_at });
      byItem.set(itemId, list);
    }
  }
  return byItem;
}

function isLineInFlight(item: CartItem, inFlight: Map<string, InFlightLine[]>): boolean {
  const entries = inFlight.get(item.id);
  if (!entries) return false;
  const fp = computeKitchenFingerprint(item);
  return entries.some((e) => {
    if (e.fingerprint !== fp) return false;
    if (e.status !== "done") return true;
    // A done job only guards until its mark is visible on this line — an older
    // print superseded by a newer one must not block a legitimate reprint.
    const markedAt = item.kitchenPrintedAt ?? null;
    return !markedAt || !e.printedAt || Date.parse(e.printedAt) > Date.parse(markedAt);
  });
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
  console.log("[KITCHEN ENQUEUE] begin", {
    tableId: params.tableId,
    label: params.orderLabel,
  });
  const store = useTableOrdersStore.getState();
  const items = params.items ?? store.orders[params.tableId] ?? [];
  const orderNote =
    params.orderNote ?? store.orderNotes[params.tableId] ?? "";
  const globalSupplements =
    params.globalSupplements ?? store.orderSupplements[params.tableId] ?? [];
  const printers = params.printers ?? getPrintersFromStore();
  const kitchenPrinters = enabledKitchenPrinters(printers);

  const rawDelta = getKitchenDelta(items);
  if (rawDelta.length === 0) {
    return { status: "noop", reason: "empty_delta" };
  }
  // Lines already on a queued / just-printed ticket whose print mark has not
  // reached this tablet yet would otherwise print again (new idempotency key
  // as soon as the delta gains another line).
  const inFlight = await fetchInFlightKitchenLines(params.tableId);
  const delta = rawDelta.filter((item) => !isLineInFlight(item, inFlight));
  console.log("[KITCHEN ENQUEUE] delta", {
    items: items.length,
    delta: delta.length,
    inFlightSkipped: rawDelta.length - delta.length,
    kitchenPrinters: kitchenPrinters.length,
  });
  if (delta.length === 0) {
    return { status: "noop", reason: "duplicate" };
  }

  if (kitchenPrinters.length === 0) {
    return {
      status: "error",
      message: "Aucune imprimante cuisine activée.",
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
  let skippedNoMac = 0;

  type StationRow = {
    printerName: string;
    idempotencyKey: string;
    payload: PrintJobPayload;
    row: {
      table_id: string;
      job_type: "kitchen";
      priority: number;
      printer_id: string;
      printer_name: string;
      transport: "bluetooth";
      mac_address: string;
      usb_vendor_id: null;
      usb_product_id: null;
      idempotency_key: string;
      status: "pending";
      attempt_count: number;
      next_attempt_at: string;
      payload: PrintJobPayload;
      updated_at: string;
    };
  };

  const pendingRows: StationRow[] = [];
  for (const station of stations) {
    const printer = kitchenPrinters.find((p) => p.id === station.printerId);
    const mac = (printer?.mac_address ?? "").trim();
    if (!printer || !mac) {
      skippedNoMac += 1;
      console.warn("[KITCHEN ENQUEUE] skip no MAC", station.printerName);
      continue;
    }

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

    pendingRows.push({
      printerName: printer.name,
      idempotencyKey,
      payload,
      row: {
        table_id: params.tableId,
        job_type: "kitchen" as const,
        priority: PRIORITY_KITCHEN,
        printer_id: printer.id,
        printer_name: printer.name,
        transport: "bluetooth" as const,
        mac_address: mac,
        usb_vendor_id: null,
        usb_product_id: null,
        idempotency_key: idempotencyKey,
        status: "pending" as const,
        attempt_count: 0,
        next_attempt_at: now,
        payload,
        updated_at: now,
      },
    });
  }

  // Insert all station jobs in parallel so claimBatch can take both at once
  // (sequential insert let the first printer start before the second row existed).
  console.log(
    "[KITCHEN ENQUEUE] insert parallel",
    pendingRows.map((r) => r.printerName),
  );

  const insertResults = await Promise.all(
    pendingRows.map(async (entry) => {
      const { data, error } = await supabase
        .from("print_jobs")
        .insert(entry.row)
        .select("id")
        .maybeSingle();
      return { entry, data, error };
    }),
  );

  for (const { entry, data, error } of insertResults) {
    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("print_jobs")
          .select("id, status")
          .eq("idempotency_key", entry.idempotencyKey)
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
              payload: entry.payload,
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
    if (skippedNoMac > 0) {
      return {
        status: "error",
        message:
          "Imprimante(s) cuisine sans adresse MAC — associez-les dans Admin → Imprimantes.",
      };
    }
    return { status: "noop", reason: "duplicate" };
  }
  console.log("[KITCHEN ENQUEUE] ok", jobIds);
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
    (p) => p.enabled && p.type === "caisse" && isPrinterEndpointConfigured(p),
  );
  if (!caisse) {
    return { status: "noop", reason: "no_printer" };
  }

  const transport = resolvePrinterTransport(caisse);
  const mac =
    transport === "bluetooth" ? (caisse.mac_address ?? "").trim() : null;
  const usbVendorId = transport === "usb" ? caisse.usb_vendor_id : null;
  const usbProductId = transport === "usb" ? caisse.usb_product_id : null;

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

  console.log("[print_jobs] receipt insert…", { transport });
  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      table_id: tableIdForDb,
      job_type: "receipt",
      priority: PRIORITY_RECEIPT,
      printer_id: caisse.id,
      printer_name: caisse.name,
      transport,
      mac_address: mac,
      usb_vendor_id: usbVendorId,
      usb_product_id: usbProductId,
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
  console.log("[print_jobs] receipt enqueued", data?.id);
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
      transport: "bluetooth",
      mac_address: mac,
      usb_vendor_id: null,
      usb_product_id: null,
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

  // Any receipt still in flight (pending OR printing, even during backoff)?
  // Pause kitchen — logcat 22:52 showed kitchen attempt 3 while receipt retried.
  const { data: receiptHold } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("job_type", "receipt")
    .in("status", ["pending", "printing"])
    .limit(1);

  let query = supabase
    .from("print_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5);

  if (receiptHold && receiptHold.length > 0) {
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
  // Include printing + pending-not-yet-due so kitchen stays paused during
  // receipt backoff (was claiming kitchen between caisse retries).
  const { data } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("job_type", "receipt")
    .in("status", ["pending", "printing"])
    .limit(1);
  return !!(data && data.length > 0);
}

/** True when any production job is pending or mid-print (blocks Admin probes). */
export async function hasActivePrintJobs(): Promise<boolean> {
  const { data } = await supabase
    .from("print_jobs")
    .select("id")
    .in("status", ["pending", "printing"])
    .limit(1);
  return !!(data && data.length > 0);
}

/**
 * Immediately reclaim all `printing` jobs claimed by this device (daemon restart).
 * Does not wait for STALE_PRINTING_MS — used on hub bootstrap.
 */
export async function reclaimPrintingJobsForThisDevice(
  deviceId: string = getLocalPrintDeviceId(),
): Promise<PrintJob[]> {
  const { data: rows, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("status", "printing")
    .eq("claimed_by_device_id", deviceId);

  if (error || !rows?.length) return [];
  const claimed: PrintJob[] = [];
  const now = new Date().toISOString();
  for (const row of rows) {
    const { data, error: updErr } = await supabase
      .from("print_jobs")
      .update({
        status: "pending",
        claimed_by_device_id: null,
        next_attempt_at: now,
        updated_at: now,
        error: "Reprise après redémarrage hub",
      })
      .eq("id", (row as { id: string }).id)
      .eq("status", "printing")
      .eq("claimed_by_device_id", deviceId)
      .select("*")
      .maybeSingle();
    if (!updErr && data) claimed.push(mapJobRow(data));
  }
  if (claimed.length > 0) {
    console.log(
      `[print_jobs] reclaimed ${claimed.length} printing job(s) for device`,
    );
  }
  return claimed;
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

/**
 * Guarded to printing/pending (mirrors native PrintJobRepository.markDone):
 * a printed ticket must close even if reset to pending, but never reopen
 * done/needs_manual/cancelled rows.
 */
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
    .eq("id", jobId)
    .in("status", ["printing", "pending"]);
}

export async function schedulePrintJobRetry(
  jobId: string,
  attemptCount: number,
  message: string,
  backoffMs: number = RETRY_BACKOFF_MS,
): Promise<"pending" | "needs_manual"> {
  const now = new Date();
  const deviceId = getLocalPrintDeviceId();
  // Only rows still printing for this device — never clobber another claimant.
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
      .eq("id", jobId)
      .eq("status", "printing")
      .eq("claimed_by_device_id", deviceId);
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
    .eq("id", jobId)
    .eq("status", "printing")
    .eq("claimed_by_device_id", deviceId);
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
  const printedAt = new Date().toISOString();
  // Atomic server-side mark — never overwrites lines edited meanwhile.
  if (UUID_RE.test(tableId)) {
    const { error } = await supabase.rpc("mark_kitchen_items_printed", {
      p_table_id: tableId,
      p_fingerprints: fingerprints,
      p_printed_at: printedAt,
    });
    if (!error) return;
    console.warn("[print_jobs] mark_kitchen_items_printed unavailable — legacy patch", error.message);
  }

  const store = useTableOrdersStore.getState();
  const current = store.orders[tableId];
  if (!current || current.length === 0) return;

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
    transport: row.transport === "usb" ? "usb" : "bluetooth",
    usb_vendor_id:
      row.usb_vendor_id == null ? null : Number(row.usb_vendor_id),
    usb_product_id:
      row.usb_product_id == null ? null : Number(row.usb_product_id),
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
