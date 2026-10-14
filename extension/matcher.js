/**
 * Matcher de preguntas — JobAutoApply
 *
 * Lógica pura (sin DOM) para:
 *  1. Parsear `respuestas_sugeridas` del tracker (empleo.vacantes) en pares pregunta → respuesta.
 *  2. Emparejar la etiqueta de un campo del formulario con la mejor respuesta disponible.
 *  3. Elegir la opción correcta en selects / radios de sí-no.
 *
 * Se carga en el content script (junto a content.js) y también en Node para los tests.
 */
(function (root) {
  "use strict";

  // Respuestas que nunca se rellenan automáticamente: el dato falta y Santiago debe completarlo.
  const PENDING_RE = /\[\s*completar[^\]]*\]/i;

  // Intenciones conocidas. Cada una se reconoce por regex sobre el texto normalizado
  // (minúsculas, sin tildes). El orden importa: la primera que coincide gana.
  const INTENTS = [
    { id: "sponsorship", re: /sponsor|h-?1b|visa status|visa sponsorship|patrocinio/ },
    { id: "us_auth", re: /(authori[sz]ed|eligible|legally).*(work).*(united states|u\.?s\.?a?\b|us\b)|work authori[sz]ation|autorizad[oa].*(trabajar|laborar)/ },
    { id: "based", re: /where are you (based|located)|current location|country of residence|where do you (live|reside)|en que (pais|ciudad) (vives|resides)|ubicacion|^location$|^(location|city|country)\b/ },
    { id: "heard", re: /how did you (hear|find|learn)|where did you (hear|find)|como te enteraste|referral source|^source$/ },
    { id: "python_years", re: /(years|anos).*(python)|python.*(years|anos|experience)/ },
    { id: "sql_years", re: /(years|anos).*(sql|pl\/?sql|oracle|database)|(sql|pl\/?sql|oracle).*(years|anos)/ },
    { id: "consulting", re: /consult(ing|ancy)|agency/ },
    { id: "salary", re: /salary|compensation|pay expectation|expected (rate|pay)|hourly rate|rate expectation|expectativa salarial|aspiracion salarial|tarifa/ },
    { id: "notice", re: /notice period|start date|when can you start|availability to start|earliest start|^availability$|disponibilidad|preaviso/ },
    { id: "why_company", re: /why (do you want|are you interested|.*interested in)|why (join|work)|what (drew|attracts)|por que te interesa|por que quieres/ },
    { id: "excites", re: /what (kind of )?work excites|what excites you|que te motiva/ },
    { id: "hardest_bug", re: /hardest bug|toughest bug|most difficult (bug|problem)|tracked down/ },
    { id: "experience", re: /tell us about your experience|describe your (relevant )?experience|skills and achievements|work experience|experiencia profesional/ },
    { id: "education", re: /education|academic background|estudios|formacion/ },
    { id: "english", re: /english (level|proficiency)|nivel de ingles/ },
    { id: "cloud", re: /\b(aws|azure|gcp|google cloud|cloud)\b.*(experience|years)/ },
    { id: "linkedin", re: /linkedin/ },
    { id: "github", re: /github/ },
    { id: "cover_letter", re: /cover letter|carta de presentacion|additional information|anything else/ },
  ];

  const STOPWORDS = new Set(
    (
      "a an the and or of to in on for with your you we us our is are be do did have has how what when where which who why " +
      "tell about please any if so this that it its at as by from me my i el la los las de del y o en con tu te que por para un una"
    ).split(" ")
  );

  function normalize(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[*?¿!¡:"“”()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(text) {
    return normalize(text)
      .split(/[^a-z0-9+#/.-]+/)
      .map((t) => t.replace(/^[./-]+|[./-]+$/g, ""))
      .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  }

  function detectIntent(text) {
    const n = normalize(text);
    if (!n) return null;
    for (const intent of INTENTS) {
      if (intent.re.test(n)) return intent.id;
    }
    return null;
  }

  // Quita "(300–2000 chars)", "(50-1000)", etc. del título de la pregunta.
  function stripLimit(question) {
    return String(question).replace(/\s*\((?:[^()]*\d[^()]*)\)\s*$/, "").trim();
  }

  function parseLimit(question) {
    const m = String(question).match(/\((?:[^()]*?)(\d{2,5})\s*(?:[-–]\s*(\d{2,5}))?[^()]*\)\s*$/);
    if (!m) return null;
    return m[2] ? { min: Number(m[1]), max: Number(m[2]) } : { min: 0, max: Number(m[1]) };
  }

  /**
   * Parsea el texto de respuestas_sugeridas. Soporta dos formatos:
   *   A) "### Pregunta exacta (límite)\nRespuesta en una o varias líneas"
   *   B) "- Etiqueta: respuesta" (formato antiguo de la rutina)
   * Ignora la sección final "PENDIENTES:".
   */
  function parseAnswers(raw) {
    const text = String(raw || "").replace(/\r\n/g, "\n");
    const items = [];

    if (/^#{2,4}\s+/m.test(text)) {
      const blocks = text.split(/^#{2,4}\s+/m).slice(1);
      for (const block of blocks) {
        const lines = block.split("\n");
        const header = lines.shift().trim();
        let body = lines.join("\n");
        body = body.split(/^\s*PENDIENTES\s*:/im)[0];
        body = body.replace(/^```[a-z]*\n?|```\s*$/gim, "").trim();
        if (!header || !body) continue;
        items.push(makeItem(stripLimit(header), body, parseLimit(header)));
      }
      return items;
    }

    for (const line of text.split("\n")) {
      const m = line.match(/^\s*[-*]\s*([^:]{2,80}):\s*(.+)$/);
      if (m) items.push(makeItem(m[1].trim(), m[2].trim(), null));
    }
    return items;
  }

  function makeItem(question, answer, limit) {
    return {
      question,
      answer,
      limit,
      intent: detectIntent(question),
      pending: PENDING_RE.test(answer),
      tokens: tokens(question),
    };
  }

  function overlapScore(a, b) {
    if (!a.length || !b.length) return 0;
    const setB = new Set(b);
    let hits = 0;
    for (const t of new Set(a)) if (setB.has(t)) hits++;
    return hits / Math.min(new Set(a).size, setB.size);
  }

  /**
   * Devuelve { item, score, reason } con la mejor respuesta para una etiqueta de campo, o null.
   * Reglas: misma intención (score 1) o solapamiento de palabras ≥ 0.6.
   */
  function matchQuestion(label, items) {
    const labelIntent = detectIntent(label);
    const labelTokens = tokens(label);
    let best = null;

    for (const item of items) {
      let score = 0;
      let reason = "";
      if (labelIntent && item.intent === labelIntent) {
        score = 1;
        reason = `intent:${labelIntent}`;
      } else {
        // Además del título, la intención puede venir del cuerpo en el formato "- Etiqueta: …".
        const overlap = overlapScore(labelTokens, item.tokens);
        if (overlap >= 0.6) {
          score = 0.6 + overlap * 0.3;
          reason = `overlap:${overlap.toFixed(2)}`;
        }
      }
      if (score > 0 && (!best || score > best.score)) best = { item, score, reason };
    }
    return best;
  }

  /**
   * Para selects / radios: deduce "sí" o "no" a partir del texto de la respuesta.
   * Solo devuelve algo cuando la respuesta empieza claramente por sí/no.
   */
  function yesNoFromAnswer(answer) {
    const n = normalize(answer);
    if (/^(no)\b/.test(n)) return "no";
    if (/^(yes|si)\b/.test(n)) return "yes";
    return null;
  }

  function pickOption(optionTexts, answer) {
    const yn = yesNoFromAnswer(answer);
    const norm = optionTexts.map(normalize);
    if (yn) {
      const re = yn === "yes" ? /^(yes|si)\b/ : /^no\b/;
      const idx = norm.findIndex((o) => re.test(o));
      if (idx >= 0) return idx;
    }
    // Coincidencia exacta o la opción contenida al inicio de la respuesta (p. ej. "Colombia").
    const na = normalize(answer);
    const exact = norm.findIndex((o) => o && (o === na || na.startsWith(o + " ") || na.startsWith(o + ",")));
    return exact >= 0 ? exact : -1;
  }

  /**
   * Respuestas base de filtro (del banco de respuestas del proyecto). Solo se usan cuando
   * la vacante del tracker no trae su propia respuesta para esa intención, y solo con vacantes
   * del tracker, que ya pasaron la validación de elegibilidad (remoto desde Colombia/LATAM).
   */
  const DEFAULT_ANSWERS = [
    ["Where are you based?", "Cali, Colombia (UTC-5)."],
    ["Are you legally authorized to work in the United States?", "No. I'm based in Colombia and would work remotely from Colombia."],
    ["Will you require visa sponsorship?", "No. I'm applying to work remotely from Colombia, so I wouldn't need a US work visa for this role."],
    [
      "How many years of experience do you have working with Python?",
      "I don't have professional Python experience yet; I've used it in personal projects (a text-to-SQL RAG system with local LLMs, data work with Pandas/NumPy). My professional experience is 5+ years in SQL and PL/SQL/Oracle.",
    ],
    ["How many years of experience do you have with SQL?", "5+ years, professionally (SQL, PL/SQL, Oracle)."],
  ].map(([q, a]) => makeItem(q, a, null));

  /**
   * `extras` son respuestas del perfil ([pregunta, respuesta]). Reemplazan a la respuesta del
   * tracker con su misma intención solo si esa está pendiente ([COMPLETAR]) o no existe.
   */
  function withDefaults(items, extras = []) {
    let result = items.slice();
    for (const [q, a] of extras) {
      if (!a) continue;
      const extra = makeItem(q, a, null);
      if (!extra.intent || extra.pending) continue;
      if (result.some((i) => i.intent === extra.intent && !i.pending)) continue;
      result = result.filter((i) => i.intent !== extra.intent).concat(extra);
    }
    const have = new Set(result.map((i) => i.intent).filter(Boolean));
    return result.concat(DEFAULT_ANSWERS.filter((d) => !have.has(d.intent)));
  }

  function slug(text) {
    return normalize(String(text || "").replace(/\(.*?\)/g, "")).replace(/[^a-z0-9]+/g, "");
  }

  function urlKey(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/(apply|application|applications\/new)\/?$/, "").replace(/\/+$/, "");
      return (u.hostname.replace(/^www\./, "") + path).toLowerCase();
    } catch {
      return "";
    }
  }

  /**
   * Busca qué vacante del tracker corresponde a la pestaña abierta. Devuelve { vacante, reason } o null.
   * Orden: URL exacta (url o enlaces en notas) → id numérico del ATS → slug de la empresa en la ruta del ATS.
   */
  function matchVacante(tabUrl, vacantes) {
    const tabKey = urlKey(tabUrl);
    if (!tabKey) return null;
    const linksOf = (v) => [v.url].concat(String(v.notas || "").match(/https?:\/\/[^\s|)"']+/g) || []);

    for (const v of vacantes) {
      if (linksOf(v).some((l) => { const k = urlKey(l); return k && (tabKey === k || tabKey.startsWith(k + "/")); })) {
        return { vacante: v, reason: "url" };
      }
    }
    const ids = (tabUrl.match(/\d{6,}/g) || []);
    for (const v of vacantes) {
      const hay = linksOf(v).join(" ") + " " + (v.fuente_job_id || "");
      if (ids.some((id) => hay.includes(id))) return { vacante: v, reason: "job-id" };
    }
    let path = "";
    try { path = new URL(tabUrl).pathname.toLowerCase(); } catch { /* url inválida */ }
    const segments = path.split("/").filter(Boolean).map((s) => s.replace(/[^a-z0-9]/g, ""));
    for (const v of vacantes) {
      const s = slug(v.empresa);
      if (s.length >= 4 && segments.includes(s)) return { vacante: v, reason: "empresa" };
    }
    return null;
  }

  const api = { matchVacante, urlKey, withDefaults, DEFAULT_ANSWERS, normalize, tokens, detectIntent, parseAnswers, matchQuestion, pickOption, yesNoFromAnswer, parseLimit, stripLimit, PENDING_RE };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JobAutoApplyMatcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
