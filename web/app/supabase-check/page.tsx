"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function SupabaseCheckPage() {
  const [status, setStatus] = useState("Checking connection...");
  const [details, setDetails] = useState("");

  useEffect(() => {
    async function checkConnection() {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("batches").select("id").limit(1);

      if (error) {
        setStatus("Connection or query failed");
        setDetails(`${error.code ?? "ERROR"}: ${error.message}`);
        return;
      }

      setStatus("Supabase API connection successful");
      setDetails(
        "The batches query succeeded. An empty result is okay if RLS hides rows or the table has no data.",
      );
    }

    void checkConnection();
  }, []);

  return (
    <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
      <h1>LoopProof · Supabase Check</h1>
      <p>{status}</p>
      <p>{details}</p>
    </main>
  );
}
