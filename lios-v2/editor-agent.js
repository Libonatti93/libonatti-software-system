import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const OPENAI_URL = "https://api.openai.com/v1";
const API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.LIOS_EDITOR_MODEL || "gpt-5-mini";
const DATA_DIR = process.env.LIOS_DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "editorial-rag.sqlite");
const MAX_SOURCES = Math.max(4, Math.min(30, Number(process.env.LIOS_EDITOR_MAX_SOURCES || 15)));
const MAX_WEEKLY_DRAFTS = 6;
const MIN_EDITORIAL_RELEVANCE = 8;
const USER_AGENT = "LIOS-Matheus-Libonatti-Editor/1.0 (+https://matheuslibonatti.tech)";

let database;

function db() {
  if (database) return database;
  database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
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
    CREATE TABLE IF NOT EXISTS editorial_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      source_count INTEGER NOT NULL DEFAULT 0,
      draft_count INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS editorial_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      dek TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      editorial_angle TEXT NOT NULL,
      practical_impacts TEXT NOT NULL,
      seo_title TEXT NOT NULL,
      meta_description TEXT NOT NULL,
      primary_keyword TEXT NOT NULL DEFAULT '',
      secondary_keywords TEXT NOT NULL DEFAULT '[]',
      search_intent TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'review',
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS editorial_draft_sources (
      draft_id INTEGER NOT NULL,
      evaluation_id INTEGER NOT NULL,
      PRIMARY KEY(draft_id, evaluation_id),
      FOREIGN KEY(draft_id) REFERENCES editorial_drafts(id),
      FOREIGN KEY(evaluation_id) REFERENCES news_evaluations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_editorial_drafts_created_at
      ON editorial_drafts(created_at DESC);
  `);
  const draftColumns = new Set(
    database.prepare("PRAGMA table_info(editorial_drafts)").all().map((column) => column.name)
  );
  if (!draftColumns.has("primary_keyword")) {
    database.exec("ALTER TABLE editorial_drafts ADD COLUMN primary_keyword TEXT NOT NULL DEFAULT ''");
  }
  if (!draftColumns.has("secondary_keywords")) {
    database.exec("ALTER TABLE editorial_drafts ADD COLUMN secondary_keywords TEXT NOT NULL DEFAULT '[]'");
  }
  if (!draftColumns.has("search_intent")) {
    database.exec("ALTER TABLE editorial_drafts ADD COLUMN search_intent TEXT NOT NULL DEFAULT ''");
  }
  return database;
}

async function openai(body) {
  if (!API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
  const response = await fetch(`${OPENAI_URL}/responses`, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI respondeu HTTP ${response.status}`);
  return payload;
}

function outputText(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("");
}

function schema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      drafts: {
        type: "array",
        maxItems: 2,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            slug: { type: "string" },
            dek: { type: "string" },
            editorial_angle: { type: "string" },
            body_markdown: { type: "string" },
            practical_impacts: { type: "array", minItems: 2, items: { type: "string" } },
            seo_title: { type: "string" },
            meta_description: { type: "string" },
            primary_keyword: { type: "string" },
            secondary_keywords: { type: "array", maxItems: 8, items: { type: "string" } },
            search_intent: { type: "string", enum: ["informacional", "noticia", "comparacao", "decisao_pratica"] },
            source_ids: { type: "array", minItems: 2, items: { type: "integer" } }
          },
          required: [
            "title", "slug", "dek", "editorial_angle", "body_markdown",
            "practical_impacts", "seo_title", "meta_description", "primary_keyword",
            "secondary_keywords", "search_intent", "source_ids"
          ]
        }
      }
    },
    required: ["drafts"]
  };
}

function availableSources() {
  return db().prepare(`
    SELECT e.id, e.title, e.url, e.source, e.category, e.published_at,
           e.relevance, e.summary, e.rationale, e.affected_profiles,
           e.impacts, e.action_horizon, r.content
    FROM rag_documents r
    JOIN news_evaluations e ON e.id = r.evaluation_id
    WHERE NOT EXISTS (
      SELECT 1 FROM editorial_draft_sources ds WHERE ds.evaluation_id = e.id
    )
      AND e.relevance >= ?
    ORDER BY e.relevance DESC, e.analyzed_at DESC
    LIMIT ?
  `).all(MIN_EDITORIAL_RELEVANCE, MAX_SOURCES);
}

function normalizedSlug(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 100) || `pauta-${Date.now()}`;
}

export function editorAgentConfigured() {
  return Boolean(API_KEY);
}

export function editorAgentStats() {
  const database = db();
  const totals = database.prepare(`
    SELECT
      COUNT(*) AS drafts,
      COALESCE(SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END), 0) AS awaiting_review
    FROM editorial_drafts
  `).get();
  const latestRun = database.prepare("SELECT * FROM editorial_runs ORDER BY id DESC LIMIT 1").get() || null;
  return { ...totals, latestRun };
}

export function recentDrafts(limit = 30) {
  return db().prepare(`
    SELECT d.*,
      (SELECT json_group_array(json_object(
        'id', e.id, 'title', e.title, 'url', e.url, 'source', e.source,
        'published_at', e.published_at, 'relevance', e.relevance
      ))
      FROM editorial_draft_sources ds
      JOIN news_evaluations e ON e.id = ds.evaluation_id
      WHERE ds.draft_id = d.id) AS sources
    FROM editorial_drafts d
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, Number(limit) || 30))).map((row) => ({
    ...row,
    practical_impacts: JSON.parse(row.practical_impacts),
    secondary_keywords: JSON.parse(row.secondary_keywords || "[]"),
    sources: JSON.parse(row.sources || "[]")
  }));
}

export async function runEditorAgent({ avatar }) {
  const database = db();
  const run = database.prepare("INSERT INTO editorial_runs(started_at, status) VALUES (?, 'running')")
    .run(new Date().toISOString());
  const runId = Number(run.lastInsertRowid);
  let sourceCount = 0;
  let draftCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    if (!API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
    const weeklyDrafts = Number(database.prepare(`
      SELECT COUNT(*) AS total
      FROM editorial_drafts
      WHERE created_at >= datetime('now', '-7 days')
    `).get().total || 0);
    const weeklyRemaining = Math.max(0, MAX_WEEKLY_DRAFTS - weeklyDrafts);
    if (!weeklyRemaining) {
      database.prepare(`
        UPDATE editorial_runs
        SET finished_at = ?, status = 'weekly_limit'
        WHERE id = ?
      `).run(new Date().toISOString(), runId);
      return { status: "weekly_limit", sourceCount: 0, draftCount: 0, inputTokens: 0, outputTokens: 0 };
    }
    const sources = availableSources();
    sourceCount = sources.length;
    if (sources.length < 2) {
      database.prepare(`
        UPDATE editorial_runs
        SET finished_at = ?, status = 'no_sources', source_count = ?
        WHERE id = ?
      `).run(new Date().toISOString(), sourceCount, runId);
      return { status: "no_sources", sourceCount, draftCount: 0, inputTokens: 0, outputTokens: 0 };
    }

    const response = await openai({
      model: MODEL,
      reasoning: { effort: "minimal" },
      max_output_tokens: 7000,
      store: false,
      instructions: `Você é o Editor de Inteligência da Matheus Libonatti. Sua tarefa é transformar documentos previamente aprovados no RAG em jornalismo explicativo original para a comunidade brasileira de transporte.

REGRAS OBRIGATÓRIAS
1. Cada rascunho deve conectar pelo menos duas fontes com relevância editorial mínima 8/10 e usar somente source_ids existentes.
2. Não copie frases das fontes. Sintetize, contextualize e crie uma linha editorial própria.
3. Não invente fatos, números, causalidade ou declarações. Diferencie claramente fato confirmado, análise, hipótese e cenário possível.
4. Sempre traduza o assunto para consequências práticas em logística, frete, diesel, pedágio, crédito, pneus, peças, manutenção, caminhões, rotas, prazos, margem, segurança, regulação ou tecnologia.
5. Um tema indireto, como petróleo, câmbio, juros ou política, só entra quando a ligação com a rotina do Avatar Matheus Libonatti for explicada com prudência.
6. Escreva em português do Brasil, com clareza, autoridade e respeito. Evite clickbait, palavras vazias e promessa de certeza.
7. Inclua no corpo: abertura autoral; conexão entre os fatos; "O que isso muda no transporte"; impactos por perfil; sinais a acompanhar; conclusão útil.
8. O texto deve ser novo e útil, mas não alegue exclusividade nem garantia de SEO, Google ou AdSense.
9. Preserve rastreabilidade: ao atribuir fatos, cite o nome da fonte no texto. Não inclua URLs no corpo.
10. Produza no máximo ${Math.min(2, weeklyRemaining)} rascunho(s). Se as fontes não formarem uma conexão editorial responsável, retorne drafts vazio.
11. Escolha uma palavra-chave principal natural, até oito termos secundários e a intenção de busca real. Use esses termos apenas quando melhorarem clareza e descoberta; nunca repita palavras de forma artificial.

AVATAR EDITORIAL ESTRANSLINK
${avatar.slice(0, 10000)}`,
      input: JSON.stringify(sources.map((source) => ({
        source_id: source.id,
        title: source.title,
        publisher: source.source,
        url: source.url,
        category: source.category,
        published_at: source.published_at,
        relevance: source.relevance,
        summary: source.summary,
        rationale: source.rationale,
        affected_profiles: JSON.parse(source.affected_profiles),
        impacts: JSON.parse(source.impacts),
        action_horizon: source.action_horizon,
        rag_document: source.content
      }))),
      text: {
        format: {
          type: "json_schema",
          name: "matheus_libonatti_editorial_drafts",
          strict: true,
          schema: schema()
        }
      }
    });
    inputTokens = response.usage?.input_tokens || 0;
    outputTokens = response.usage?.output_tokens || 0;
    const parsed = JSON.parse(outputText(response));
    const validIds = new Set(sources.map((source) => Number(source.id)));
    const insertDraft = database.prepare(`
      INSERT OR IGNORE INTO editorial_drafts(
        title, slug, dek, body_markdown, editorial_angle, practical_impacts,
        seo_title, meta_description, primary_keyword, secondary_keywords,
        search_intent, status, model, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', ?, ?, ?)
    `);
    const insertSource = database.prepare(`
      INSERT OR IGNORE INTO editorial_draft_sources(draft_id, evaluation_id) VALUES (?, ?)
    `);
    for (const draft of (parsed.drafts || []).slice(0, Math.min(2, weeklyRemaining))) {
      const sourceIds = [...new Set(draft.source_ids.map(Number))]
        .filter((id) => validIds.has(id));
      if (sourceIds.length < 2) continue;
      const now = new Date().toISOString();
      const inserted = insertDraft.run(
        draft.title.slice(0, 180), normalizedSlug(draft.slug), draft.dek.slice(0, 400),
        draft.body_markdown.slice(0, 30000), draft.editorial_angle.slice(0, 1000),
        JSON.stringify(draft.practical_impacts.slice(0, 12)),
        draft.seo_title.slice(0, 180), draft.meta_description.slice(0, 320),
        draft.primary_keyword.slice(0, 120),
        JSON.stringify(draft.secondary_keywords.slice(0, 8)),
        draft.search_intent,
        MODEL, now, now
      );
      if (!inserted.changes) continue;
      const draftId = Number(inserted.lastInsertRowid);
      sourceIds.forEach((sourceId) => insertSource.run(draftId, sourceId));
      draftCount += 1;
    }
    database.prepare(`
      UPDATE editorial_runs
      SET finished_at = ?, status = 'success', source_count = ?, draft_count = ?,
          input_tokens = ?, output_tokens = ?
      WHERE id = ?
    `).run(new Date().toISOString(), sourceCount, draftCount, inputTokens, outputTokens, runId);
    return { status: "success", sourceCount, draftCount, inputTokens, outputTokens };
  } catch (error) {
    database.prepare(`
      UPDATE editorial_runs
      SET finished_at = ?, status = 'error', source_count = ?, draft_count = ?,
          input_tokens = ?, output_tokens = ?, error = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(), sourceCount, draftCount, inputTokens, outputTokens,
      String(error.message || error).slice(0, 1000), runId
    );
    throw error;
  }
}
