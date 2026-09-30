import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncJobsResult } from "@/lib/types";

/**
 * Limpia y normaliza texto HTML convirtiéndolo a texto plano legible para el usuario y el LLM.
 */
export function stripHtml(rawHtml?: string | null): string {
  if (!rawHtml) return "";

  return rawHtml
    // Reemplaza elementos de salto o fin de párrafo por saltos de línea
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    // Elimina cualquier etiqueta HTML residual
    .replace(/<[^>]+>/g, "")
    // Decodifica entidades HTML habituales
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    // Normaliza saltos de línea y espacios repetidos
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Detecta el ATS (Applicant Tracking System) utilizado por la empresa basándose en el dominio de la URL.
 */
export function detectAts(url: string): string | null {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("greenhouse.io") || lowerUrl.includes("boards.greenhouse.io")) {
    return "greenhouse";
  }
  if (lowerUrl.includes("lever.co") || lowerUrl.includes("jobs.lever.co")) {
    return "lever";
  }
  if (lowerUrl.includes("ashbyhq.com") || lowerUrl.includes("jobs.ashbyhq.com")) {
    return "ashby";
  }
  if (lowerUrl.includes("myworkdayjobs.com") || lowerUrl.includes("workday.com")) {
    return "workday";
  }
  if (lowerUrl.includes("smartrecruiters.com")) {
    return "smartrecruiters";
  }
  if (lowerUrl.includes("breezy.hr")) {
    return "breezy";
  }
  if (lowerUrl.includes("workable.com")) {
    return "workable";
  }
  if (lowerUrl.includes("bamboohr.com")) {
    return "bamboohr";
  }

  return null;
}

export interface NormalizedJob {
  fuente: string;
  titulo: string;
  empresa: string;
  url: string;
  tipo_ats: string | null;
  remoto: boolean;
  ubicacion: string | null;
  descripcion: string;
  fecha_publicacion: string | null;
}

interface RemotiveApiJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  publication_date?: string;
  candidate_required_location?: string;
  description?: string;
}

interface ArbeitnowApiJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  location?: string;
  created_at?: number;
}

/**
 * Consulta la API abierta de Remotive (ofertas remotas de tecnología y digitales).
 */
export async function fetchRemotiveJobs(limit = 25): Promise<NormalizedJob[]> {
  try {
    const res = await fetch(`https://remotive.com/api/remote-jobs?limit=${limit}`, {
      headers: { "User-Agent": "JobAutoApplyApp/1.0" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.warn(`[Aggregator] Remotive API devolvió status: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const jobs: RemotiveApiJob[] = data.jobs || [];

    return jobs.map((job) => ({
      fuente: "remotive",
      titulo: job.title.trim(),
      empresa: job.company_name.trim(),
      url: job.url.trim(),
      tipo_ats: detectAts(job.url),
      remoto: true,
      ubicacion: job.candidate_required_location || "Remoto Global",
      descripcion: stripHtml(job.description),
      fecha_publicacion: job.publication_date ? new Date(job.publication_date).toISOString() : new Date().toISOString(),
    }));
  } catch (error) {
    console.error("[Aggregator] Error al consultar Remotive:", error);
    return [];
  }
}

/**
 * Consulta la API abierta de Arbeitnow (ofertas tech remotas e internacionales).
 */
export async function fetchArbeitnowJobs(): Promise<NormalizedJob[]> {
  try {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
      headers: { "User-Agent": "JobAutoApplyApp/1.0" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.warn(`[Aggregator] Arbeitnow API devolvió status: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const jobs: ArbeitnowApiJob[] = data.data || [];

    return jobs.map((job) => {
      let publishedDate: string | null = null;
      if (job.created_at) {
        // Arbeitnow usa unix seconds
        publishedDate = new Date(job.created_at * 1000).toISOString();
      }

      return {
        fuente: "arbeitnow",
        titulo: job.title.trim(),
        empresa: job.company_name.trim(),
        url: job.url.trim(),
        tipo_ats: detectAts(job.url),
        remoto: Boolean(job.remote),
        ubicacion: job.location || (job.remote ? "Remoto" : "No especificado"),
        descripcion: stripHtml(job.description),
        fecha_publicacion: publishedDate || new Date().toISOString(),
      };
    });
  } catch (error) {
    console.error("[Aggregator] Error al consultar Arbeitnow:", error);
    return [];
  }
}

/**
 * Sincroniza ofertas de fuentes públicas hacia la tabla `public.job_postings` en Supabase.
 * Utiliza upsert idempotente en (fuente, url) para evitar duplicados.
 */
export async function syncJobsToSupabase(supabase: SupabaseClient): Promise<SyncJobsResult> {
  const errors: string[] = [];
  let remotiveCount = 0;
  let arbeitnowCount = 0;

  // 1. Obtener de ambas fuentes en paralelo
  const [remotiveJobs, arbeitnowJobs] = await Promise.all([
    fetchRemotiveJobs(35),
    fetchArbeitnowJobs(),
  ]);

  const allJobs = [...remotiveJobs, ...arbeitnowJobs];

  if (allJobs.length === 0) {
    return {
      success: false,
      totalSynced: 0,
      sources: { remotive: 0, arbeitnow: 0 },
      errors: ["No se pudieron obtener ofertas de ninguna de las fuentes públicas"],
    };
  }

  // 2. Insertar/Actualizar en lotes de 40 para no sobrecargar el endpoint de Supabase
  const batchSize = 40;
  for (let i = 0; i < allJobs.length; i += batchSize) {
    const batch = allJobs.slice(i, i + batchSize);

    const { error } = await supabase.from("job_postings").upsert(batch, {
      onConflict: "fuente,url",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(`[Aggregator] Error en batch de upsert [${i} a ${i + batch.length}]:`, error);
      errors.push(error.message);
    } else {
      batch.forEach((job) => {
        if (job.fuente === "remotive") remotiveCount++;
        if (job.fuente === "arbeitnow") arbeitnowCount++;
      });
    }
  }

  return {
    success: errors.length === 0,
    totalSynced: remotiveCount + arbeitnowCount,
    sources: {
      remotive: remotiveCount,
      arbeitnow: arbeitnowCount,
    },
    errors: errors.length > 0 ? errors : undefined,
  };
}
