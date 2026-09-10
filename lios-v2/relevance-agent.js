import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const OPENAI_URL = "https://api.openai.com/v1";
const ANALYSIS_MODEL = process.env.LIOS_AI_MODEL || "gpt-5-mini";
const EMBEDDING_MODEL = process.env.LIOS_EMBEDDING_MODEL || "text-embedding-3-small";
const API_KEY = process.env.OPENAI_API_KEY || "";
const DATA_DIR = process.env.LIOS_DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "editorial-rag.sqlite");
const MAX_ITEMS = Math.max(1, Math.min(200, Number(process.env.LIOS_AI_DAILY_MAX_ITEMS || 80)));
const MIN_RELEVANCE = 6;
const USER_AGENT = "LIOS-Matheus-Libonatti-Agent/1.0 (+https://matheuslibonatti.tech)";

let database;

function db() {
  if (database) return database;
  database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      scanned INTEGER NOT NULL DEFAULT 0,
      stored INTEGER NOT NULL DEFAULT 0,
      discarded INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS news_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT,
      published_at TEXT,
      analyzed_at TEXT NOT NULL,
      relevance INTEGER NOT NULL CHECK(relevance BETWEEN 0 AND 10),
      stored INTEGER NOT NULL CHECK(stored IN (0, 1)),
      summary TEXT NOT NULL,
      rationale TEXT NOT NULL,
      affected_profiles TEXT NOT NULL,
      impacts TEXT NOT NULL,
      action_horizon TEXT NOT NULL,
      model TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rag_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL UNIQUE,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(evaluation_id) REFERENCES news_evaluations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_evaluations_relevance ON news_evaluations(relevance DESC);
    CREATE INDEX IF NOT EXISTS idx_evaluations_analyzed_at ON news_evaluations(analyzed_at DESC);
  `);
  return database;
}

async function openai(pathname, body, timeoutMs = 90000) {
  if (!API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
  const response = await fetch(`${OPENAI_URL}${pathname}`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `OpenAI respondeu HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function outputText(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("");
}

function stripArticle(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function fetchArticle(signal) {
  try {
    const response = await fetch(signal.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("Conteúdo não textual");
    return stripArticle(await response.text());
  } catch {
    return "";
  }
}

function evaluationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      evaluations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            signal_id: { type: "string" },
            relevance: { type: "integer", minimum: 0, maximum: 10 },
            summary: { type: "string" },
            rationale: { type: "string" },
            affected_profiles: {
              type: "array",
              items: { type: "string", enum: ["motorista", "transportadora", "gestor_logistica", "tecnologia", "embarcador"] }
            },
            impacts: {
              type: "array",
              items: { type: "string", enum: ["renda", "custos", "credito", "caminhoes", "frete", "regulacao", "seguranca", "rotas", "politica", "tecnologia", "comercio_exterior"] }
            },
            action_horizon: { type: "string", enum: ["agora", "24h", "7d", "30d", "longo_prazo", "nenhuma"] }
          },
          required: ["signal_id", "relevance", "summary", "rationale", "affected_profiles", "impacts", "action_horizon"]
        }
      }
    },
    required: ["evaluations"]
  };
}

async function evaluateBatch(items, avatar) {
  const response = await openai("/responses", {
    model: ANALYSIS_MODEL,
    reasoning: { effort: "minimal" },
    max_output_tokens: 1800,
    store: false,
    instructions: `Você é o Agente Coletor da Matheus Libonatti. Avalie notícias para uma audiência composta por motoristas de caminhão, caminhoneiros agregados, donos de transportadoras e frotas, gestores de logística, tecnologia, embarcadores e profissionais de comércio exterior. Atribua relevância de 0 a 10. Nota 6 significa utilidade clara para pelo menos um perfil. Política só é relevante quando tiver efeito econômico, regulatório, operacional, rodoviário, de crédito, trabalho ou logística. Rejeite fofoca, esporte, entretenimento genérico, sensacionalismo e coincidências de palavras. Não invente fatos ausentes. Diferencie impacto imediato de contexto geral.

Avatar editorial:
${avatar.slice(0, 10000)}`,
    input: JSON.stringify(items.map((item) => ({
      signal_id: item.signal.id,
      title: item.signal.title,
      source: item.signal.sourceLabel,
      category: item.signal.categoryLabel,
      published_at: item.signal.publishedAt,
      context: item.signal.context,
      article_text: item.article || "Texto integral indisponível; avalie apenas os metadados fornecidos."
    }))),
    text: {
      format: {
        type: "json_schema",
        name: "matheus_libonatti_relevance_batch",
        strict: true,
        schema: evaluationSchema()
      }
    }
  });
  const parsed = JSON.parse(outputText(response));
  return {
    evaluations: parsed.evaluations,
    usage: response.usage || { input_tokens: 0, output_tokens: 0 }
  };
}

async function embed(contents) {
  if (!contents.length) return [];
  const response = await openai("/embeddings", {
    model: EMBEDDING_MODEL,
    input: contents,
    encoding_format: "float"
  });
  return (response.data || []).sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

function buildRagContent(signal, evaluation, article) {
  return [
    `Título: ${signal.title}`,
    `Fonte: ${signal.sourceLabel}`,
    `URL: ${signal.url}`,
    `Publicado em: ${signal.publishedAt}`,
    `Categoria: ${signal.categoryLabel}`,
    `Relevância Matheus Libonatti: ${evaluation.relevance}/10`,
    `Resumo: ${evaluation.summary}`,
    `Justificativa: ${evaluation.rationale}`,
    `Perfis afetados: ${evaluation.affected_profiles.join(", ")}`,
    `Impactos: ${evaluation.impacts.join(", ")}`,
    `Horizonte de ação: ${evaluation.action_horizon}`,
    article ? `Conteúdo coletado: ${article}` : ""
  ].filter(Boolean).join("\n");
}

export function relevanceAgentConfigured() {
  return Boolean(API_KEY);
}

export function relevanceAgentStats() {
  const database = db();
  const totals = database.prepare(`
    SELECT
      COUNT(*) AS analyzed,
      COALESCE(SUM(stored), 0) AS stored,
      COALESCE(SUM(CASE WHEN stored = 0 THEN 1 ELSE 0 END), 0) AS discarded,
      COALESCE(AVG(relevance), 0) AS average_relevance
    FROM news_evaluations
  `).get();
  const latestRun = database.prepare("SELECT * FROM agent_runs ORDER BY id DESC LIMIT 1").get() || null;
  return { ...totals, average_relevance: Number(totals.average_relevance || 0).toFixed(1), latestRun };
}

export function recentEvaluations(limit = 50) {
  return db().prepare(`
    SELECT id, signal_id, url, title, source, category, published_at, analyzed_at,
           relevance, stored, summary, rationale, affected_profiles, impacts, action_horizon
    FROM news_evaluations
    ORDER BY analyzed_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(200, Number(limit) || 50))).map((row) => ({
    ...row,
    stored: Boolean(row.stored),
    affected_profiles: JSON.parse(row.affected_profiles),
    impacts: JSON.parse(row.impacts)
  }));
}

export async function runRelevanceAgent({ signals, avatar, deadline }) {
  const database = db();
  const run = database.prepare("INSERT INTO agent_runs(started_at, status) VALUES (?, 'running')")
    .run(new Date().toISOString());
  const runId = Number(run.lastInsertRowid);
  let scanned = 0;
  let stored = 0;
  let discarded = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    if (!API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
    const seen = database.prepare("SELECT 1 FROM news_evaluations WHERE signal_id = ?");
    const pending = signals.filter((signal) => !seen.get(signal.id)).slice(0, MAX_ITEMS);
    for (let index = 0; index < pending.length && Date.now() < deadline; index += 5) {
      const batchSignals = pending.slice(index, index + 5);
      const items = [];
      for (const signal of batchSignals) {
        if (Date.now() >= deadline) break;
        items.push({ signal, article: await fetchArticle(signal) });
      }
      if (!items.length) break;
      const result = await evaluateBatch(items, avatar);
      inputTokens += result.usage.input_tokens || 0;
      outputTokens += result.usage.output_tokens || 0;
      const evaluationMap = new Map(result.evaluations.map((item) => [item.signal_id, item]));
      const accepted = [];
      for (const item of items) {
        const evaluation = evaluationMap.get(item.signal.id);
        if (!evaluation) continue;
        const keep = evaluation.relevance >= MIN_RELEVANCE;
        const inserted = database.prepare(`
          INSERT OR IGNORE INTO news_evaluations(
            signal_id, url, title, source, category, published_at, analyzed_at,
            relevance, stored, summary, rationale, affected_profiles, impacts,
            action_horizon, model
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.signal.id, item.signal.url, item.signal.title, item.signal.sourceLabel,
          item.signal.categoryLabel, item.signal.publishedAt, new Date().toISOString(),
          evaluation.relevance, keep ? 1 : 0, evaluation.summary, evaluation.rationale,
          JSON.stringify(evaluation.affected_profiles), JSON.stringify(evaluation.impacts),
          evaluation.action_horizon, ANALYSIS_MODEL
        );
        if (!inserted.changes) continue;
        scanned += 1;
        if (keep) {
          stored += 1;
          accepted.push({
            evaluationId: Number(inserted.lastInsertRowid),
            content: buildRagContent(item.signal, evaluation, item.article)
          });
        } else {
          discarded += 1;
        }
      }
      if (accepted.length) {
        const vectors = await embed(accepted.map((item) => item.content));
        const insertDocument = database.prepare(`
          INSERT INTO rag_documents(evaluation_id, content, embedding, embedding_model, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        accepted.forEach((item, vectorIndex) => {
          insertDocument.run(
            item.evaluationId,
            item.content,
            JSON.stringify(vectors[vectorIndex]),
            EMBEDDING_MODEL,
            new Date().toISOString()
          );
        });
      }
    }
    const status = Date.now() >= deadline ? "time_limit" : "success";
    database.prepare(`
      UPDATE agent_runs
      SET finished_at = ?, status = ?, scanned = ?, stored = ?, discarded = ?,
          input_tokens = ?, output_tokens = ?
      WHERE id = ?
    `).run(new Date().toISOString(), status, scanned, stored, discarded, inputTokens, outputTokens, runId);
    return { status, scanned, stored, discarded, inputTokens, outputTokens };
  } catch (error) {
    database.prepare(`
      UPDATE agent_runs
      SET finished_at = ?, status = 'error', scanned = ?, stored = ?, discarded = ?,
          input_tokens = ?, output_tokens = ?, error = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(), scanned, stored, discarded, inputTokens, outputTokens,
      String(error.message || error).slice(0, 1000), runId
    );
    throw error;
  }
}
