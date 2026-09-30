export type ApplicationStatus =
  | "borrador"
  | "lista_para_revision"
  | "enviada"
  | "en_proceso"
  | "entrevista"
  | "rechazada"
  | "oferta";

export type ApplicationMode = "auto_ats" | "semiauto" | "manual";

export interface Resume {
  id: string;
  user_id: string;
  contenido_base: string; // texto plano estructurado del CV original
  es_actual?: boolean;
  created_at: string;
}

export interface JobPosting {
  id: string;
  fuente: string; // "adzuna" | "arbeitnow" | "remotive" | "greenhouse" | ...
  titulo: string;
  empresa: string;
  url: string;
  tipo_ats: string | null; // "greenhouse" | "lever" | "ashby" | "workday" | null
  remoto: boolean;
  ubicacion: string | null;
  descripcion: string | null;
  fecha_publicacion: string | null;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  job_posting_id: string;
  resume_id: string;
  cv_generado: string | null;
  carta_generada: string | null;
  estado: ApplicationStatus;
  modo: ApplicationMode;
  fecha_envio: string | null;
  created_at: string;
}

export interface GenerateContentRequest {
  resumeId: string;
  jobPostingId?: string;
  jobDescriptionText?: string; // usado cuando la oferta se pega a mano en vez de venir del agregador
  preferredProvider?: "auto" | "ollama" | "anthropic" | "gemini";
}

export interface GenerateContentResponse {
  cv_generado: string;
  carta_generada: string;
  provider?: "ollama" | "anthropic" | "gemini";
}

export interface ApplicationWithJob extends Application {
  job_posting?: JobPosting | null;
  resume?: Pick<Resume, "id" | "created_at"> | null;
}

export interface SyncJobsResult {
  success: boolean;
  totalSynced: number;
  sources: {
    remotive: number;
    arbeitnow: number;
  };
  errors?: string[];
}

export interface UserProfile {
  id: string;
  user_id: string;
  nombre_completo: string | null;
  telefono: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portafolio_url: string | null;
  ubicacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtsFieldMapping {
  field: string;
  selector: string;
  value: string;
}

export interface AtsAutoFillPayload {
  ats: string;
  targetUrl: string;
  fields: AtsFieldMapping[];
  script: string;
}


