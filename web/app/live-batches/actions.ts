"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelBatchWithRpc,
  recordCollectionWithRpc,
  recordReceiptWithRpc,
  registerBatchWithRpc,
  submitProcessingWithRpc,
  submitVerifierDecisionFormData,
  validateVerifierDecisionReason,
  type BatchContextForValidation,
  type EvidenceUploadInput,
  type ProcessingOutputInput,
} from "@/lib/live-batches";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type RegisterFormState = {
  status: "idle" | "success" | "error";
  batchId?: string;
  code?: string;
  message?: string;
};

export type LifecycleFormState = {
  status: "idle" | "success" | "error";
  code?: string;
  message?: string;
  nextState?: string;
};

async function extractEvidenceFromFormData(
  formData: FormData,
  fieldName = "evidenceFile",
): Promise<
  | { ok: true; evidence: EvidenceUploadInput }
  | { ok: false; code: string; message: string }
> {
  const entry = formData.get(fieldName);
  if (!entry || typeof entry === "string") {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      message: "Please select an evidence file (PDF, JPEG, or PNG) to upload.",
    };
  }

  const file = entry as File;
  if (file.size <= 0) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      message: "Selected evidence file is empty (0 bytes). Select a valid PDF, JPEG, or PNG file.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    ok: true,
    evidence: {
      bytes,
      mimeType: file.type,
      fileName: file.name,
    },
  };
}

async function fetchBatchContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  batchId: string,
): Promise<(BatchContextForValidation & { public_ref?: string }) | undefined> {
  const { data } = await supabase
    .from("batches")
    .select(
      "id, public_ref, state, registrar_id, collector_id, processor_id, verifier_id, intake_mass_grams, current_revision",
    )
    .eq("id", batchId)
    .maybeSingle();

  if (!data) {
    return undefined;
  }

  const row = data as BatchContextForValidation & {
    public_ref?: string;
    current_revision?: number;
  };

  let claimedOutputGrams: number | null = null;
  if (typeof row.current_revision === "number" && row.current_revision > 0) {
    const { data: revData } = await supabase
      .from("processing_revisions")
      .select("total_output_grams")
      .eq("batch_id", batchId)
      .eq("revision", row.current_revision)
      .maybeSingle();
    const total = (revData as { total_output_grams?: number } | null)?.total_output_grams;
    if (typeof total === "number" && Number.isFinite(total)) {
      claimedOutputGrams = Number(total);
    }
  }

  return {
    ...row,
    claimed_output_grams: claimedOutputGrams,
  };
}

function revalidateLiveBatchRoutes(batchId: string, publicRef?: string): void {
  revalidatePath("/live-batches");
  revalidatePath(`/live-batches/${batchId}`);
  if (publicRef) {
    revalidatePath(`/live-batches/${publicRef}`);
  }
}

export async function registerBatchAction(
  _prevState: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const categoryCode = Number(formData.get("categoryCode") ?? 0);
  const collectorId = String(formData.get("collectorId") ?? "");
  const processorId = String(formData.get("processorId") ?? "");
  const verifierId = String(formData.get("verifierId") ?? "");

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      status: "error",
      code: "CONFIG_ERROR",
      message: err instanceof Error ? err.message : "Supabase configuration error.",
    };
  }

  const result = await registerBatchWithRpc(supabase, {
    categoryCode,
    collectorId,
    processorId,
    verifierId,
  });

  if (!result.ok) {
    return {
      status: "error",
      code: result.code,
      message: result.error,
    };
  }

  revalidatePath("/live-batches");
  return {
    status: "success",
    batchId: result.batchId,
    message: `Batch registered in Supabase via public.lp_register_batch.`,
  };
}

export async function recordCollectionAction(
  _prevState: LifecycleFormState,
  formData: FormData,
): Promise<LifecycleFormState> {
  const batchId = String(formData.get("batchId") ?? "").trim();
  const intakeMassGrams = Number(formData.get("intakeMassGrams") ?? 0);

  const fileRes = await extractEvidenceFromFormData(formData, "evidenceFile");
  if (!fileRes.ok) {
    return {
      status: "error",
      code: fileRes.code,
      message: fileRes.message,
    };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      status: "error",
      code: "CONFIG_ERROR",
      message: err instanceof Error ? err.message : "Supabase configuration error.",
    };
  }

  const batchCtx = await fetchBatchContext(supabase, batchId);
  const result = await recordCollectionWithRpc(supabase, {
    batchId,
    intakeMassGrams,
    evidence: fileRes.evidence,
    batch: batchCtx,
  });

  if (!result.ok) {
    return {
      status: "error",
      code: result.code,
      message: result.error,
    };
  }

  revalidateLiveBatchRoutes(result.batchId, batchCtx?.public_ref);
  return {
    status: "success",
    nextState: result.nextState,
    message:
      "Collection recorded via public.lp_record_collection. Batch transitioned REGISTERED → COLLECTED.",
  };
}

export async function recordReceiptAction(
  _prevState: LifecycleFormState,
  formData: FormData,
): Promise<LifecycleFormState> {
  const batchId = String(formData.get("batchId") ?? "").trim();

  const fileRes = await extractEvidenceFromFormData(formData, "evidenceFile");
  if (!fileRes.ok) {
    return {
      status: "error",
      code: fileRes.code,
      message: fileRes.message,
    };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      status: "error",
      code: "CONFIG_ERROR",
      message: err instanceof Error ? err.message : "Supabase configuration error.",
    };
  }

  const batchCtx = await fetchBatchContext(supabase, batchId);
  const result = await recordReceiptWithRpc(supabase, {
    batchId,
    evidence: fileRes.evidence,
    batch: batchCtx,
  });

  if (!result.ok) {
    return {
      status: "error",
      code: result.code,
      message: result.error,
    };
  }

  revalidateLiveBatchRoutes(result.batchId, batchCtx?.public_ref);
  return {
    status: "success",
    nextState: result.nextState,
    message:
      "Facility receipt recorded via public.lp_record_receipt. Batch transitioned COLLECTED → RECEIVED.",
  };
}

export async function submitProcessingAction(
  _prevState: LifecycleFormState,
  formData: FormData,
): Promise<LifecycleFormState> {
  const batchId = String(formData.get("batchId") ?? "").trim();
  const modeRaw = String(formData.get("mode") ?? "submit").trim();
  const mode: "submit" | "resubmit" = modeRaw === "resubmit" ? "resubmit" : "submit";
  const intakeMassGrams = Number(formData.get("intakeMassGrams") ?? 0);
  const outputsJson = String(formData.get("outputsJson") ?? "[]");

  let outputs: ProcessingOutputInput[];
  try {
    const parsed = JSON.parse(outputsJson);
    if (!Array.isArray(parsed)) {
      throw new Error("Outputs payload must be a JSON array.");
    }
    outputs = parsed as ProcessingOutputInput[];
  } catch {
    return {
      status: "error",
      code: "INVALID_OUTPUTS",
      message: "Invalid processing output fractions format.",
    };
  }

  const fileRes = await extractEvidenceFromFormData(formData, "evidenceFile");
  if (!fileRes.ok) {
    return {
      status: "error",
      code: fileRes.code,
      message: fileRes.message,
    };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      status: "error",
      code: "CONFIG_ERROR",
      message: err instanceof Error ? err.message : "Supabase configuration error.",
    };
  }

  const batchCtx = await fetchBatchContext(supabase, batchId);
  const result = await submitProcessingWithRpc(supabase, {
    batchId,
    mode,
    intakeMassGrams: batchCtx?.intake_mass_grams ?? intakeMassGrams,
    outputs,
    evidence: fileRes.evidence,
    batch: batchCtx,
  });

  if (!result.ok) {
    return {
      status: "error",
      code: result.code,
      message: result.error,
    };
  }

  revalidateLiveBatchRoutes(result.batchId, batchCtx?.public_ref);
  const rpcLabel =
    mode === "resubmit" ? "public.lp_resubmit_processing" : "public.lp_submit_processing";
  return {
    status: "success",
    nextState: result.nextState,
    message: `Processing claim recorded via ${rpcLabel}. Batch is now PROCESSED_CLAIMED (Pending verifier review).`,
  };
}

export async function verifierDecisionAction(
  _prevState: LifecycleFormState,
  formData: FormData,
): Promise<LifecycleFormState> {
  const batchId = String(formData.get("batchId") ?? "").trim();
  const decisionRaw = String(formData.get("decision") ?? "").trim();
  const returnReasonRaw = formData.get("returnReason");
  const rejectReasonRaw = formData.get("rejectReason");

  const reasonCheck = validateVerifierDecisionReason(
    decisionRaw,
    returnReasonRaw !== null ? String(returnReasonRaw) : null,
    rejectReasonRaw !== null ? String(rejectReasonRaw) : null,
  );
  if (!reasonCheck.ok) {
    return {
      status: "error",
      code: reasonCheck.code,
      message: reasonCheck.error,
    };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      status: "error",
      code: "CONFIG_ERROR",
      message: err instanceof Error ? err.message : "Supabase configuration error.",
    };
  }

  const batchCtx = await fetchBatchContext(supabase, batchId);
  const result = await submitVerifierDecisionFormData(supabase, formData, batchCtx);
  if (result.status === "error") {
    return {
      status: "error",
      code: result.code,
      message: result.message,
    };
  }

  if (result.batchId) {
    revalidateLiveBatchRoutes(result.batchId, batchCtx?.public_ref);
  }
  return {
    status: "success",
    nextState: result.nextState,
    message: result.message,
  };
}

export async function cancelBatchAction(
  _prevState: LifecycleFormState,
  formData: FormData,
): Promise<LifecycleFormState> {
  const batchId = String(formData.get("batchId") ?? "").trim();

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      status: "error",
      code: "CONFIG_ERROR",
      message: err instanceof Error ? err.message : "Supabase configuration error.",
    };
  }

  const batchCtx = await fetchBatchContext(supabase, batchId);
  const result = await cancelBatchWithRpc(supabase, {
    batchId,
    batch: batchCtx,
  });

  if (!result.ok) {
    return {
      status: "error",
      code: result.code,
      message: result.error,
    };
  }

  revalidateLiveBatchRoutes(result.batchId, batchCtx?.public_ref);
  return {
    status: "success",
    nextState: result.nextState,
    message: "Batch cancelled before collection via public.lp_cancel_batch (REGISTERED → CANCELLED).",
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/live-batches");
  revalidatePath("/login");
  redirect("/login");
}

