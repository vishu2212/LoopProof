"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type LoginFormState = {
  status: "idle" | "error";
  message?: string;
};

export async function signInAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      status: "error",
      message: "Email and password are required.",
    };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Supabase configuration error.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  revalidatePath("/live-batches");
  revalidatePath("/login");
  redirect("/live-batches");
}
