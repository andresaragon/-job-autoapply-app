/**
 * Motor de análisis ATS y concordancia de palabras clave (ATS Match Score Engine).
 * 
 * Evalúa la coincidencia semántica y léxica entre una descripción de vacante (Job Description)
 * y el currículum generado (Tailored CV), calculando puntuación ponderada, desglose por categorías,
 * palabras clave coincidentes y ausentes, y recomendaciones accionables.
 */

export type KeywordCategory =
  | "hard_skill"
  | "tool_framework"
  | "methodology"
  | "soft_skill"
  | "cloud_devops"
  | "data_ai"
  | "other";

export type KeywordImportance = "high" | "medium" | "low";

export interface KeywordMatch {
  term: string;
  category: KeywordCategory;
  inJobCount: number;
  inCvCount: number;
  matched: boolean;
  importance: KeywordImportance;
}

export interface AtsMatchAnalysis {
  overallScore: number; // 0 - 100
  grade: "Excelente" | "Bueno" | "Regular" | "Bajo";
  gradeColor: "emerald" | "amber" | "orange" | "rose";
  summary: string;
  stats: {
    totalJobKeywords: number;
    matchedKeywordsCount: number;
    missingKeywordsCount: number;
    hardSkillsScore: number; // 0 - 100
    softSkillsScore: number; // 0 - 100
    quantifiableMetricsCount: number; // Logros con números o porcentajes
  };
  matchedKeywords: KeywordMatch[];
  missingKeywords: KeywordMatch[];
  recommendations: string[];
}

// Diccionario predefinido de términos técnicos y habilidades reconocidas
const TECH_DICTIONARY: Record<string, { category: KeywordCategory; defaultImportance: KeywordImportance }> = {
  // Lenguajes
  typescript: { category: "hard_skill", defaultImportance: "high" },
  javascript: { category: "hard_skill", defaultImportance: "high" },
  python: { category: "hard_skill", defaultImportance: "high" },
  java: { category: "hard_skill", defaultImportance: "high" },
  kotlin: { category: "hard_skill", defaultImportance: "high" },
  swift: { category: "hard_skill", defaultImportance: "high" },
  golang: { category: "hard_skill", defaultImportance: "high" },
  "go/golang": { category: "hard_skill", defaultImportance: "high" },
  rust: { category: "hard_skill", defaultImportance: "high" },
  "c#": { category: "hard_skill", defaultImportance: "high" },
  "c++": { category: "hard_skill", defaultImportance: "high" },
  php: { category: "hard_skill", defaultImportance: "medium" },
  ruby: { category: "hard_skill", defaultImportance: "medium" },
  sql: { category: "hard_skill", defaultImportance: "high" },
  html5: { category: "hard_skill", defaultImportance: "medium" },
  css3: { category: "hard_skill", defaultImportance: "medium" },
  bash: { category: "hard_skill", defaultImportance: "medium" },
  shell: { category: "hard_skill", defaultImportance: "medium" },

  // Frameworks y Librerías Frontend / Backend
  react: { category: "tool_framework", defaultImportance: "high" },
  "next.js": { category: "tool_framework", defaultImportance: "high" },
  nextjs: { category: "tool_framework", defaultImportance: "high" },
  vue: { category: "tool_framework", defaultImportance: "high" },
  angular: { category: "tool_framework", defaultImportance: "high" },
  "node.js": { category: "tool_framework", defaultImportance: "high" },
  nodejs: { category: "tool_framework", defaultImportance: "high" },
  express: { category: "tool_framework", defaultImportance: "medium" },
  nestjs: { category: "tool_framework", defaultImportance: "high" },
  fastapi: { category: "tool_framework", defaultImportance: "high" },
  django: { category: "tool_framework", defaultImportance: "high" },
  flask: { category: "tool_framework", defaultImportance: "medium" },
  "spring boot": { category: "tool_framework", defaultImportance: "high" },
  spring: { category: "tool_framework", defaultImportance: "medium" },
  tailwind: { category: "tool_framework", defaultImportance: "medium" },
  tailwindcss: { category: "tool_framework", defaultImportance: "medium" },
  redux: { category: "tool_framework", defaultImportance: "medium" },
  prisma: { category: "tool_framework", defaultImportance: "medium" },
  drizzle: { category: "tool_framework", defaultImportance: "medium" },

  // Cloud & DevOps
  aws: { category: "cloud_devops", defaultImportance: "high" },
  azure: { category: "cloud_devops", defaultImportance: "high" },
  gcp: { category: "cloud_devops", defaultImportance: "high" },
  "google cloud": { category: "cloud_devops", defaultImportance: "high" },
  docker: { category: "cloud_devops", defaultImportance: "high" },
  kubernetes: { category: "cloud_devops", defaultImportance: "high" },
  k8s: { category: "cloud_devops", defaultImportance: "high" },
  terraform: { category: "cloud_devops", defaultImportance: "high" },
  "ci/cd": { category: "cloud_devops", defaultImportance: "high" },
  cicd: { category: "cloud_devops", defaultImportance: "high" },
  "github actions": { category: "cloud_devops", defaultImportance: "high" },
  gitlab: { category: "cloud_devops", defaultImportance: "medium" },
  linux: { category: "cloud_devops", defaultImportance: "medium" },
  serverless: { category: "cloud_devops", defaultImportance: "medium" },
  lambda: { category: "cloud_devops", defaultImportance: "medium" },
  nginx: { category: "cloud_devops", defaultImportance: "medium" },

  // Bases de Datos
  postgresql: { category: "hard_skill", defaultImportance: "high" },
  postgres: { category: "hard_skill", defaultImportance: "high" },
  mysql: { category: "hard_skill", defaultImportance: "high" },
  mongodb: { category: "hard_skill", defaultImportance: "high" },
  redis: { category: "hard_skill", defaultImportance: "high" },
  supabase: { category: "hard_skill", defaultImportance: "medium" },
  firebase: { category: "hard_skill", defaultImportance: "medium" },
  dynamodb: { category: "hard_skill", defaultImportance: "medium" },
  elasticsearch: { category: "hard_skill", defaultImportance: "medium" },
  oracle: { category: "hard_skill", defaultImportance: "high" },
  "pl/sql": { category: "hard_skill", defaultImportance: "high" },
  bigquery: { category: "hard_skill", defaultImportance: "high" },
  snowflake: { category: "hard_skill", defaultImportance: "high" },

  // Arquitectura y Metodologías
  microservices: { category: "methodology", defaultImportance: "high" },
  microservicios: { category: "methodology", defaultImportance: "high" },
  rest: { category: "methodology", defaultImportance: "medium" },
  restful: { category: "methodology", defaultImportance: "medium" },
  "rest api": { category: "methodology", defaultImportance: "high" },
  graphql: { category: "methodology", defaultImportance: "high" },
  grpc: { category: "methodology", defaultImportance: "medium" },
  agile: { category: "methodology", defaultImportance: "medium" },
  scrum: { category: "methodology", defaultImportance: "medium" },
  kanban: { category: "methodology", defaultImportance: "low" },
  tdd: { category: "methodology", defaultImportance: "medium" },
  "clean code": { category: "methodology", defaultImportance: "medium" },
  "clean architecture": { category: "methodology", defaultImportance: "high" },
  "system design": { category: "methodology", defaultImportance: "high" },
  "unit testing": { category: "methodology", defaultImportance: "medium" },
  testing: { category: "methodology", defaultImportance: "medium" },
  "code review": { category: "methodology", defaultImportance: "low" },

  // Inteligencia Artificial y Datos
  ai: { category: "data_ai", defaultImportance: "medium" },
  ia: { category: "data_ai", defaultImportance: "medium" },
  llm: { category: "data_ai", defaultImportance: "high" },
  rag: { category: "data_ai", defaultImportance: "high" },
  "machine learning": { category: "data_ai", defaultImportance: "high" },
  "deep learning": { category: "data_ai", defaultImportance: "high" },
  pytorch: { category: "data_ai", defaultImportance: "high" },
  tensorflow: { category: "data_ai", defaultImportance: "high" },
  langchain: { category: "data_ai", defaultImportance: "medium" },
  nlp: { category: "data_ai", defaultImportance: "medium" },
  openai: { category: "data_ai", defaultImportance: "medium" },
  gemini: { category: "data_ai", defaultImportance: "medium" },
  claude: { category: "data_ai", defaultImportance: "medium" },
  ollama: { category: "data_ai", defaultImportance: "medium" },

  // Habilidades Blandas
  leadership: { category: "soft_skill", defaultImportance: "medium" },
  liderazgo: { category: "soft_skill", defaultImportance: "medium" },
  mentoring: { category: "soft_skill", defaultImportance: "low" },
  mentoria: { category: "soft_skill", defaultImportance: "low" },
  communication: { category: "soft_skill", defaultImportance: "medium" },
  comunicacion: { category: "soft_skill", defaultImportance: "medium" },
  "problem solving": { category: "soft_skill", defaultImportance: "medium" },
  "resolucion de problemas": { category: "soft_skill", defaultImportance: "medium" },
  teamwork: { category: "soft_skill", defaultImportance: "low" },
  "trabajo en equipo": { category: "soft_skill", defaultImportance: "low" },
  ownership: { category: "soft_skill", defaultImportance: "medium" },
  autonomia: { category: "soft_skill", defaultImportance: "medium" },
  collaboration: { category: "soft_skill", defaultImportance: "low" },
  colaboracion: { category: "soft_skill", defaultImportance: "low" },
  english: { category: "soft_skill", defaultImportance: "high" },
  ingles: { category: "soft_skill", defaultImportance: "high" },
  b2: { category: "soft_skill", defaultImportance: "high" },
  c1: { category: "soft_skill", defaultImportance: "high" },
};

/**
 * Escapa caracteres especiales para usar en expresiones regulares.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whitelist estricta de acrónimos técnicos para evitar falsos positivos con títulos o encabezados en mayúsculas
const KNOWN_TECH_ACRONYMS = new Set([
  "AWS", "GCP", "SDK", "API", "APIS", "ETL", "CI", "CD", "CICD", "TDD", "BDD",
  "JWT", "ORM", "SSO", "SQL", "CSS", "HTML", "REST", "AI", "ML", "NLP", "LLM",
  "RAG", "VPC", "IAM", "DNS", "CLI", "UI", "UX", "SPA", "SSR", "PWA", "WASM",
  "S3", "EC2", "RDS", "EKS", "ECS", "GKE", "CDN", "SAAS", "PAAS", "IAAS", "ERP",
  "CRM", "OOP", "SOLID", "K8S", "SEO", "SEM", "PR"
]);

/**
 * Cuenta las ocurrencias de un término dentro de un texto, respetando límites de palabra,
 * términos especiales con símbolos (C++, C#, .NET, CI/CD) y delimitadores gramaticales
 * mediante lookahead sin consumir caracteres contiguos.
 */
function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  const escaped = escapeRegex(term);
  
  // Prefijo: inicio de cadena, espacio o cualquier carácter no alfanumérico (excepto #, + si no están en el término)
  const prefix = term.startsWith(".") 
    ? `(?:^|\\s|[^a-zA-Z0-9_#])` 
    : `(?:^|\\s|[^a-zA-Z0-9_#+])`;

  // Sufijo con lookahead sin consumir: fin de cadena, espacio o puntuación gramatical (, . ; : ! ? ) ] } " ' etc.)
  const suffix = (term.endsWith("+") || term.endsWith("#"))
    ? `(?=$|\\s|[^a-zA-Z0-9_#+])`
    : `(?=$|\\s|[.,;:!?)\\]}"'\`]|[^a-zA-Z0-9_#+])`;

  const regex = new RegExp(`${prefix}${escaped}${suffix}`, "gi");
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Extrae siglas y acrónimos relevantes en mayúsculas verificados contra la whitelist técnica.
 */
function extractDynamicAcronyms(text: string): string[] {
  const acronymRegex = /\b[A-Z]{2,6}\b/g;
  const matches = text.match(acronymRegex) || [];
  
  const unique = new Set<string>();
  for (const m of matches) {
    if (KNOWN_TECH_ACRONYMS.has(m.toUpperCase())) {
      unique.add(m.toLowerCase());
    }
  }
  return Array.from(unique);
}

/**
 * Analiza la concordancia entre la vacante y el CV generado.
 */
export function calculateAtsMatch(jobDescription: string, cvText: string): AtsMatchAnalysis {
  if (!jobDescription || !jobDescription.trim()) {
    return {
      overallScore: 0,
      grade: "Bajo",
      gradeColor: "rose",
      summary: "Sin descripción de vacante para comparar.",
      stats: {
        totalJobKeywords: 0,
        matchedKeywordsCount: 0,
        missingKeywordsCount: 0,
        hardSkillsScore: 0,
        softSkillsScore: 0,
        quantifiableMetricsCount: 0,
      },
      matchedKeywords: [],
      missingKeywords: [],
      recommendations: ["Ingresa o selecciona la descripción de una vacante para calcular el Match Score ATS."],
    };
  }

  const jobLower = jobDescription.toLowerCase();
  const cvLower = (cvText || "").toLowerCase();

  // 1. Detectar términos del diccionario que aparecen en la vacante
  const detectedKeywords = new Map<string, KeywordMatch>();

  for (const [term, meta] of Object.entries(TECH_DICTIONARY)) {
    const jobCount = countOccurrences(jobLower, term);
    if (jobCount > 0) {
      const cvCount = countOccurrences(cvLower, term);
      
      // Si el término aparece más de 2 veces en la vacante, elevar su importancia
      let importance = meta.defaultImportance;
      if (jobCount >= 3 && importance !== "high") {
        importance = "high";
      }

      detectedKeywords.set(term, {
        term,
        category: meta.category,
        inJobCount: jobCount,
        inCvCount: cvCount,
        matched: cvCount > 0,
        importance,
      });
    }
  }

  // 2. Extraer siglas dinámicas adicionales
  const dynamicAcronyms = extractDynamicAcronyms(jobDescription);
  for (const acronym of dynamicAcronyms) {
    if (!detectedKeywords.has(acronym)) {
      const jobCount = countOccurrences(jobLower, acronym);
      if (jobCount > 0) {
        const cvCount = countOccurrences(cvLower, acronym);
        detectedKeywords.set(acronym, {
          term: acronym.toUpperCase(),
          category: "hard_skill",
          inJobCount: jobCount,
          inCvCount: cvCount,
          matched: cvCount > 0,
          importance: jobCount >= 2 ? "high" : "medium",
        });
      }
    }
  }

  // 3. Separar en coincidentes y ausentes
  const matchedKeywords: KeywordMatch[] = [];
  const missingKeywords: KeywordMatch[] = [];

  for (const item of detectedKeywords.values()) {
    if (item.matched) {
      matchedKeywords.push(item);
    } else {
      missingKeywords.push(item);
    }
  }

  // Ordenar: coincidentes por frecuencia en vacante (descendente); ausentes por importancia (high -> medium -> low)
  matchedKeywords.sort((a, b) => b.inJobCount - a.inJobCount);
  const importanceOrder: Record<KeywordImportance, number> = { high: 3, medium: 2, low: 1 };
  missingKeywords.sort((a, b) => {
    const diff = importanceOrder[b.importance] - importanceOrder[a.importance];
    return diff !== 0 ? diff : b.inJobCount - a.inJobCount;
  });

  // 4. Calcular métricas cuantitativas en el CV (números, %, $, años)
  // Las viñetas con resultados numéricos tienen altísima ponderación en filtros ATS modernos
  const metricRegex = /\b(\d+[\%kM\+]?|\$\d+)\b/g;
  const metricMatches = (cvText || "").match(metricRegex) || [];
  const quantifiableMetricsCount = metricMatches.length;

  // 5. Cálculo ponderado de puntuaciones
  const totalKeywords = detectedKeywords.size;

  let hardSkillsTotal = 0;
  let hardSkillsMatched = 0;
  let softSkillsTotal = 0;
  let softSkillsMatched = 0;

  let weightedMax = 0;
  let weightedActual = 0;

  for (const item of detectedKeywords.values()) {
    const weight = item.importance === "high" ? 3 : item.importance === "medium" ? 2 : 1;
    weightedMax += weight;
    if (item.matched) {
      weightedActual += weight;
    }

    if (item.category === "hard_skill" || item.category === "tool_framework" || item.category === "cloud_devops" || item.category === "data_ai") {
      hardSkillsTotal++;
      if (item.matched) hardSkillsMatched++;
    } else {
      softSkillsTotal++;
      if (item.matched) softSkillsMatched++;
    }
  }

  const keywordCoverageScore = weightedMax > 0 ? (weightedActual / weightedMax) * 100 : 75;
  const hardSkillsScore = hardSkillsTotal > 0 ? Math.round((hardSkillsMatched / hardSkillsTotal) * 100) : 0;
  const softSkillsScore = softSkillsTotal > 0 ? Math.round((softSkillsMatched / softSkillsTotal) * 100) : 0;

  // Bonificación por métricas cuantificables (hasta +10 puntos)
  const metricBonus = Math.min(10, Math.floor(quantifiableMetricsCount * 1.5));

  // Puntuación global ajustada (0 a 100)
  let overallScore = Math.round(keywordCoverageScore * 0.9 + metricBonus);
  if (overallScore > 100) overallScore = 100;
  if (totalKeywords === 0) {
    // Si no hubo keywords específicas detectadas pero hay texto en ambos
    overallScore = cvText && cvText.length > 200 ? 70 : 40;
  }

  // 6. Determinar nivel y color
  let grade: "Excelente" | "Bueno" | "Regular" | "Bajo" = "Bajo";
  let gradeColor: "emerald" | "amber" | "orange" | "rose" = "rose";

  if (overallScore >= 80) {
    grade = "Excelente";
    gradeColor = "emerald";
  } else if (overallScore >= 65) {
    grade = "Bueno";
    gradeColor = "amber";
  } else if (overallScore >= 50) {
    grade = "Regular";
    gradeColor = "orange";
  } else {
    grade = "Bajo";
    gradeColor = "rose";
  }

  // 7. Generar recomendaciones accionables
  const recommendations: string[] = [];

  const highMissing = missingKeywords.filter((k) => k.importance === "high").slice(0, 4);
  if (highMissing.length > 0) {
    const termsStr = highMissing.map((k) => `"${k.term}"`).join(", ");
    recommendations.push(`Incorpora los requisitos clave ausentes con alta prioridad: ${termsStr}.`);
  }

  if (quantifiableMetricsCount < 4) {
    recommendations.push(
      "Añade más resultados cuantificables con porcentajes, montos o números (ej: 'reducción del 35% en latencia', 'equipo de 6 ingenieros')."
    );
  }

  if (hardSkillsScore < 70 && hardSkillsTotal > 0) {
    recommendations.push(
      "El match de tecnologías duras es inferior al 70%. Alinea las herramientas mencionadas en tu experiencia con el stack de la vacante."
    );
  }

  if (overallScore >= 80) {
    recommendations.push(
      "¡Excelente alineación con el algoritmo ATS! El CV contiene una densidad óptima de términos clave y superará los filtros automáticos."
    );
  }

  const gradeAdjectives: Record<string, string> = {
    Excelente: "excelente",
    Bueno: "buena",
    Regular: "regular",
    Bajo: "baja",
  };
  const summary = `Coincidencia ${gradeAdjectives[grade] || grade.toLowerCase()} (${overallScore}%). Se identificaron ${matchedKeywords.length} de ${totalKeywords} términos clave de la oferta.`;

  return {
    overallScore,
    grade,
    gradeColor,
    summary,
    stats: {
      totalJobKeywords: totalKeywords,
      matchedKeywordsCount: matchedKeywords.length,
      missingKeywordsCount: missingKeywords.length,
      hardSkillsScore,
      softSkillsScore,
      quantifiableMetricsCount,
    },
    matchedKeywords,
    missingKeywords,
    recommendations,
  };
}

/**
 * Función de utilidad rápida para badges y listas sin calcular estructuras pesadas.
 */
export function getQuickAtsScore(
  jobDescription?: string | null,
  cvText?: string | null
): { score: number; grade: string; color: "emerald" | "amber" | "orange" | "rose" } | null {
  if (!jobDescription || !cvText) return null;
  const analysis = calculateAtsMatch(jobDescription, cvText);
  return {
    score: analysis.overallScore,
    grade: analysis.grade,
    color: analysis.gradeColor,
  };
}

