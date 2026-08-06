import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { fileURLToPath } from "node:url";
import { collectEditorialRadar } from "./editorial-radar.js";
import {
  recentEvaluations,
  relevanceAgentConfigured,
  relevanceAgentStats,
  runRelevanceAgent
} from "./relevance-agent.js";
import {
  editorAgentConfigured,
  editorAgentStats,
  recentDrafts,
  runEditorAgent
} from "./editor-agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 8091);
const DATA_DIR = process.env.LIOS_DATA_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PUBLIC_SITE = (process.env.LIOS_PUBLIC_SITE || "https://matheuslibonatti.tech").replace(/\/$/, "");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const USERNAME = process.env.LIOS_USERNAME || (IS_PRODUCTION ? "" : "matheus");
const PASSWORD_SALT = process.env.LIOS_PASSWORD_SALT || "";
const PASSWORD_HASH = process.env.LIOS_PASSWORD_HASH || "";

if (!USERNAME || !PASSWORD_SALT || !PASSWORD_HASH) {
  console.error("LIOS_USERNAME, LIOS_PASSWORD_SALT e LIOS_PASSWORD_HASH são obrigatórios.");
  process.exit(1);
}

const workflows = [
  {
    id: "site-health",
    name: "Saúde do portal",
    description: "Mede disponibilidade, latência e tamanho das páginas públicas.",
    schedule: "A cada 15 minutos",
    nodes: [
      { id: "trigger", label: "Agendador", type: "trigger", x: 34, y: 128 },
      { id: "pt", label: "Página PT-BR", type: "source", x: 238, y: 58 },
      { id: "es", label: "Página ES", type: "source", x: 238, y: 198 },
      { id: "measure", label: "Medir resposta", type: "process", x: 470, y: 128 },
      { id: "store", label: "Histórico local", type: "store", x: 700, y: 128 }
    ],
    edges: [["trigger", "pt"], ["trigger", "es"], ["pt", "measure"], ["es", "measure"], ["measure", "store"]]
  },
  {
    id: "content-audit",
    name: "Auditoria editorial e SEO",
    description: "Lê o sitemap e verifica metadados essenciais das páginas publicadas.",
    schedule: "A cada 6 horas",
    nodes: [
      { id: "trigger", label: "Agendador", type: "trigger", x: 34, y: 128 },
      { id: "sitemap", label: "Sitemap", type: "source", x: 238, y: 128 },
      { id: "crawl", label: "Ler páginas", type: "process", x: 446, y: 128 },
      { id: "rules", label: "Regras editoriais", type: "process", x: 654, y: 128 },
      { id: "store", label: "Resultado", type: "store", x: 862, y: 128 }
    ],
    edges: [["trigger", "sitemap"], ["sitemap", "crawl"], ["crawl", "rules"], ["rules", "store"]]
  },
  {
    id: "editorial-radar",
    name: "Radar editorial",
    description: "Cruza tendências de busca, cobertura jornalística e atenção pública para priorizar pautas.",
    schedule: "A cada 12 minutos",
    nodes: [
      { id: "trigger", label: "Agendador", type: "trigger", x: 24, y: 128 },
      { id: "google", label: "Google Trends", type: "source", x: 218, y: 18 },
      { id: "gdelt", label: "GDELT", type: "source", x: 218, y: 128 },
      { id: "wikimedia", label: "Wikimedia", type: "source", x: 218, y: 238 },
      { id: "classify", label: "Classificar pautas", type: "process", x: 460, y: 128 },
      { id: "score", label: "Priorizar sinais", type: "process", x: 674, y: 128 },
      { id: "store", label: "Radar LIOS", type: "store", x: 878, y: 128 }
    ],
    edges: [
      ["trigger", "google"], ["trigger", "gdelt"], ["trigger", "wikimedia"],
      ["google", "classify"], ["gdelt", "classify"], ["wikimedia", "classify"],
      ["classify", "score"], ["score", "store"]
    ]
  },
  {
    id: "relevance-agent",
    name: "Agente de relevância",
    description: "Lê notícias, compara com o avatar Matheus Libonatti e armazena no RAG apenas notas 6/10 ou maiores.",
    schedule: "Diariamente, 05:00–06:00 (Brasília)",
    nodes: [
      { id: "trigger", label: "Janela diária", type: "trigger", x: 24, y: 128 },
      { id: "queue", label: "Notícias inéditas", type: "source", x: 220, y: 128 },
      { id: "read", label: "Ler conteúdo", type: "process", x: 424, y: 128 },
      { id: "avatar", label: "Aplicar avatar", type: "process", x: 628, y: 58 },
      { id: "score", label: "Nota de 0 a 10", type: "process", x: 628, y: 198 },
      { id: "rag", label: "RAG ≥ 6", type: "store", x: 856, y: 128 }
    ],
    edges: [
      ["trigger", "queue"], ["queue", "read"], ["read", "avatar"],
      ["read", "score"], ["avatar", "rag"], ["score", "rag"]
    ]
  },
  {
    id: "editor-agent",
    name: "Editor de inteligência",
    description: "Conecta documentos aprovados no RAG e cria rascunhos autorais da Matheus Libonatti com fontes rastreáveis.",
    schedule: "Segundas, quartas e sextas, 06:05 (Brasília)",
    nodes: [
      { id: "trigger", label: "Após o coletor", type: "trigger", x: 24, y: 128 },
      { id: "rag", label: "Recuperar RAG", type: "source", x: 220, y: 128 },
      { id: "connect", label: "Conectar notícias", type: "process", x: 424, y: 58 },
      { id: "angle", label: "Linha Matheus Libonatti", type: "process", x: 424, y: 198 },
      { id: "write", label: "Redigir análise", type: "process", x: 650, y: 128 },
      { id: "review", label: "Rascunho para revisão", type: "store", x: 866, y: 128 }
    ],
    edges: [
      ["trigger", "rag"], ["rag", "connect"], ["rag", "angle"],
      ["connect", "write"], ["angle", "write"], ["write", "review"]
    ]
  }
];

const etranslinkAvatarNote = {
  id: "etranslink-avatar-v1",
  avatarVersion: 2,
  title: "Avatar Matheus Libonatti v0.2 — audiência composta do transporte",
  body: `STATUS: perfil composto definido pelo fundador e aberto a refinamento com dados reais de audiência.

DEFINIÇÃO
O avatar da Matheus Libonatti não é uma única pessoa fictícia. É uma composição de características recorrentes entre profissionais que vivem o transporte, os caminhões, a logística, a tecnologia e a política. O conteúdo deve reconhecer diferenças de renda, escolaridade, função e poder de decisão sem perder a linguagem comum da estrada e da operação.

QUEM COMPÕE A AUDIÊNCIA
• motorista de caminhão autônomo ou empregado;
• caminhoneiro agregado;
• proprietário de um caminhão;
• dono de pequena ou média transportadora;
• empresário com vários caminhões próprios ou agregados;
• gestor, coordenador ou analista de logística;
• profissional de tecnologia aplicada ao transporte;
• comprador de frete, embarcador e profissional de comércio exterior;
• pessoas interessadas em política porque decisões públicas afetam diretamente trabalho, crédito, combustível e operação.

DEMOGRAFIA
• idade central: 24 a 55 anos;
• maioria masculina, sem tratar logística como território exclusivamente masculino;
• presença crescente e relevante de motoristas, gestoras, empresárias e profissionais de tecnologia mulheres;
• renda pessoal ou capacidade econômica muito ampla: aproximadamente R$ 2 mil a R$ 60 mil por mês;
• vive em capitais, cidades do interior, corredores rodoviários, regiões de fronteira e polos industriais ou agrícolas;
• pode ter ensino básico, técnico ou superior — conhecimento prático não deve ser confundido com escolaridade formal.

O QUE UNE ESSE PÚBLICO
O caminhão e a logística interferem diretamente em sua renda, patrimônio, rotina ou responsabilidade profissional. Mesmo quando ocupa um escritório, pensa em estrada, prazo, custo, risco, disponibilidade e cliente. Valoriza informação que ajude a ganhar, economizar, evitar prejuízo ou antecipar uma mudança.

RELAÇÃO COM DINHEIRO E CRÉDITO
• entende ou deseja entender financiamento, consórcio, leasing e capital de giro;
• acompanha juros, Selic, inflação, câmbio e acesso a crédito;
• avalia compra, troca, manutenção e depreciação de caminhões;
• calcula parcela, combustível, pedágio, seguro, pneus, oficina, impostos e custo por quilômetro;
• diferencia faturamento de lucro, embora nem sempre possua controles organizados;
• interessa-se por renegociação de dívida, score, linhas para empresas, antecipação e proteção patrimonial;
• empresário compara retorno da frota, ociosidade, margem por operação e custo de veículos próprios versus agregados.

INTERESSES CENTRAIS
• caminhões novos e usados, lançamentos, testes e comparativos;
• preço do diesel, Arla 32, pneus, peças, manutenção e oficina;
• frete, piso mínimo, tabela, pedágio, CIOT, MDF-e, RNTRC e ANTT;
• crédito, juros, financiamento, consórcio, seguro e tributação;
• política nacional e internacional com impacto econômico ou regulatório;
• rodovias, obras, concessões, acidentes, restrições e segurança;
• agronegócio, safra, indústria, portos, fronteiras e Mercosul;
• tecnologia embarcada, rastreamento, telemetria, aplicativos, IA e automação logística;
• gestão de frota, contratação de motoristas, cargas, agregados e produtividade;
• direitos, deveres, legislação trabalhista e qualidade de vida na estrada.

DORES DO MOTORISTA
• renda instável e frete apertado;
• diesel, manutenção e alimentação consumindo margem;
• tempo parado, espera, retorno vazio e falta de carga;
• insegurança, roubo, acidente e condições das rodovias;
• pressão de prazo, distância da família e desgaste físico;
• regras e documentos difíceis de acompanhar.

DORES DO DONO DE TRANSPORTADORA OU FROTA
• ociosidade e baixa margem;
• custo imprevisível de frota;
• crédito caro e patrimônio imobilizado;
• contratação, retenção e gestão de motoristas e agregados;
• inadimplência, seguro, sinistro e risco trabalhista;
• dificuldade de transformar dados operacionais em decisão;
• necessidade constante de cargas, clientes e contratos melhores.

DORES DO GESTOR DE LOGÍSTICA E TECNOLOGIA
• informação fragmentada entre sistemas, planilhas e pessoas;
• pressão simultânea por custo, prazo e nível de serviço;
• integração de dados, rastreabilidade e visibilidade da operação;
• necessidade de justificar investimentos em tecnologia;
• mudanças políticas, econômicas e regulatórias sem tradução operacional;
• dificuldade de separar tendência relevante de ruído.

COMPORTAMENTO DE CONTEÚDO
• acessa principalmente pelo celular;
• recebe links por WhatsApp, redes sociais e grupos profissionais;
• lê manchetes rapidamente e aprofunda quando percebe impacto financeiro ou operacional;
• reage a números concretos, comparações, mapas, tabelas, exemplos e consequências;
• rejeita linguagem corporativa vazia, excesso de teoria e notícia sem conclusão prática;
• pode consumir conteúdo curto na estrada e análises mais completas fora do volante;
• valoriza fonte confiável, mas quer que a Matheus Libonatti traduza a informação.

PERGUNTAS QUE O CONTEÚDO DEVE RESPONDER
1. O que aconteceu?
2. Isso afeta quem?
3. Quanto pode custar ou economizar?
4. Muda frete, rota, prazo, crédito, documento ou disponibilidade?
5. O que motorista, empresário ou gestor precisa fazer?
6. Quando começa a valer?
7. A fonte é confiável?

CRITÉRIO EDITORIAL
Priorizar quando houver impacto em:
• renda e margem;
• custo do caminhão ou da operação;
• crédito e capacidade de investimento;
• legislação e obrigação documental;
• segurança e condições de trabalho;
• oferta de cargas e caminhões;
• prazo, rota, fronteira ou corredor logístico;
• competitividade de transportadoras e embarcadores;
• decisão política com consequência prática;
• tecnologia capaz de reduzir custo, risco ou tempo.

TOM DA MATHEUS LIBONATTI
Direto, respeitoso, inteligente e acessível. Nunca tratar motorista como desinformado nem escrever apenas para executivos. Explicar termos técnicos sem infantilizar. Separar fato, análise e opinião. Evitar sensacionalismo político. Mostrar impacto e ação prática.

FORMATO IDEAL
• manchete clara;
• resumo em poucas linhas;
• “por que isso importa”;
• impacto separado para motorista, transportadora e gestor;
• números e fonte;
• prazo ou data de vigência;
• ação recomendada;
• análise aprofundada opcional.

ANTIAVATAR
Não é conteúdo para entretenimento genérico, fofoca, política partidária sem impacto logístico, notícia de acidente explorada como espetáculo, propaganda disfarçada ou opinião sem fonte.

MISSÃO EDITORIAL
Transformar notícias econômicas, políticas, rodoviárias, tecnológicas e logísticas em inteligência prática para quem dirige, possui, contrata, administra ou conecta caminhões e cargas.`,
  tags: ["avatar", "marketing", "audiencia", "editorial", "caminhoneiro", "transportadora", "logistica"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const cesarDomains = [
  ["fundamentos-lios", "Fundamentos LIOS", "princípios que orientam inteligência, memória, contexto e ação", ["arquitetura", "inteligencia"]],
  ["rag", "RAG e recuperação", "recuperação contextual, chunking, ranking e respostas ancoradas", ["rag", "busca-semantica"]],
  ["vetores", "Vetores e embeddings", "representação vetorial, similaridade e organização semântica", ["vetores", "embeddings"]],
  ["agentes", "Agentes de IA", "papéis, ferramentas, memória, limites e colaboração entre agentes", ["agentes", "ia"]],
  ["automacao", "Automação inteligente", "gatilhos, filas, idempotência, observabilidade e execução confiável", ["automacao", "workflows"]],
  ["engenharia", "Engenharia de software", "código sustentável, contratos, testes, versionamento e evolução", ["engenharia", "software"]],
  ["google-search", "Google Search", "indexação, intenção de busca, cobertura, descoberta orgânica e avaliação de resultados", ["google", "search", "seo"]],
  ["openai", "OpenAI", "modelos, Responses API, embeddings, ferramentas, segurança e aplicações com contexto", ["openai", "ia", "api"]],
  ["gemini", "Google Gemini", "modelos multimodais, grounding, contexto, integração e comparação responsável", ["gemini", "google", "ia"]],
  ["web-scraping", "Web scraping e crawlers", "coleta ética, robots, parsing, filas, deduplicação e rastreabilidade de fontes", ["web-scraping", "crawler", "coleta"]],
  ["ranking-dados", "Ranking de dados", "relevância, qualidade, recência, autoridade, sinais e ordenação explicável", ["ranking", "dados", "relevancia"]],
  ["sites-google", "Sites no Google", "SEO técnico, Search Console, sitemaps, canonical, dados estruturados e desempenho", ["google", "sites", "search-console"]]
];

const cesarAspects = [
  ["conceito", "Conceito central", "Defina o conceito em linguagem clara, registre por que ele importa e conecte-o à arquitetura do LIOS."],
  ["principios", "Princípios de decisão", "Liste os princípios que ajudam a escolher caminhos sem perder clareza, segurança ou valor para o usuário."],
  ["arquitetura", "Arquitetura de referência", "Descreva componentes, responsabilidades, entradas, saídas e fronteiras que mantêm o sistema evolutivo."],
  ["implementacao", "Implementação prática", "Transforme a ideia em passos pequenos, verificáveis e versionáveis, com critérios objetivos de conclusão."],
  ["qualidade", "Qualidade e validação", "Defina testes, sinais de confiança e evidências necessárias antes de considerar o conhecimento pronto para uso."],
  ["riscos", "Riscos e limites", "Registre falhas prováveis, custos ocultos, dependências e situações que exigem aprovação humana."],
  ["metricas", "Métricas e observação", "Escolha medidas que indiquem utilidade, saúde, custo, velocidade e impacto sem criar números cenográficos."],
  ["evolucao", "Evolução futura", "Mapeie próximos experimentos, conexões com outras áreas e perguntas que o Cesar deve continuar investigando."]
];

function localVector(text, dimensions = 32) {
  const vector = Array(dimensions).fill(0);
  const words = String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").match(/[a-z0-9]{3,}/g) || [];
  for (const word of words) {
    let hash = 2166136261;
    for (const character of word) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    vector[Math.abs(hash) % dimensions] += hash & 1 ? 1 : -1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => Number((value / norm).toFixed(5)));
}

function vectorSimilarity(a = [], b = []) {
  return a.reduce((score, value, index) => score + value * (b[index] || 0), 0);
}

function cesarSeedNotes() {
  const createdAt = new Date().toISOString();
  return cesarDomains.flatMap(([domainId, domainTitle, description, domainTags], domainIndex) =>
    cesarAspects.map(([aspectId, aspectTitle, guidance], aspectIndex) => {
      const title = `${domainTitle} · ${aspectTitle}`;
      const body = `${domainTitle} reúne ${description}. ${guidance}\n\nAplicação no Cesar: esta memória deve se conectar às demais notas por significado e tags, oferecendo contexto recuperável para decisões, pesquisas, automações e agentes do ecossistema LIOS.\n\nPergunta viva: como transformar este conhecimento em uma ação útil, rastreável e segura?`;
      const tags = ["cesar", "lios", domainId, aspectId, ...domainTags, cesarDomains[(domainIndex + aspectIndex + 1) % cesarDomains.length][0]];
      return {
        id: `cesar-${domainId}-${aspectId}`,
        seedVersion: 2,
        title,
        body,
        tags: [...new Set(tags)],
        createdAt,
        updatedAt: createdAt
      };
    })
  );
}

function connectCesarNotes(notes) {
  const enriched = notes.map((note) => ({
    ...note,
    vector: localVector([note.title, note.body, ...(note.tags || [])].join(" "))
  }));
  return enriched.map((note) => {
    const noteTags = new Set(note.tags || []);
    const relatedIds = enriched
      .filter((candidate) => candidate.id !== note.id)
      .map((candidate) => ({
        id: candidate.id,
        score: vectorSimilarity(note.vector, candidate.vector)
          + (candidate.tags || []).filter((tag) => noteTags.has(tag)).length * .18
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((candidate) => candidate.id);
    return { ...note, relatedIds };
  });
}

const defaultState = {
  version: 1,
  createdAt: new Date().toISOString(),
  runs: [],
  editorialRadar: {
    updatedAt: null,
    refreshMinutes: 12,
    scope: ["Economia", "Política", "Caminhões", "Logística"],
    sourceStatus: {},
    signals: []
  },
  relevanceAgent: {
    timezone: "America/Sao_Paulo",
    windowStart: "05:00",
    windowEnd: "06:00",
    minimumRelevance: 6,
    lastScheduledDate: null,
    status: "unconfigured",
    lastResult: null
  },
  editorAgent: {
    timezone: "America/Sao_Paulo",
    scheduledAt: "Seg/Qua/Sex · 06:05",
    lastScheduledDate: null,
    status: "unconfigured",
    lastResult: null
  },
  notes: [
    {
      id: "welcome",
      title: "LIOS v2",
      body: "Painel privado, orquestração em código, memória local e agentes configuráveis. Esta nota pode ser editada ou removida quando a base começar a crescer.",
      tags: ["lios", "arquitetura"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  agents: [
    {
      id: "radar",
      name: "Radar",
      role: "Pesquisa fontes e identifica sinais relevantes.",
      enabled: false,
      provider: "Não configurado",
      budget: "R$ 0,00"
    },
    {
      id: "editor",
      name: "Editor",
      role: "Organiza contexto e prepara rascunhos para revisão.",
      enabled: false,
      provider: "Não configurado",
      budget: "R$ 0,00"
    },
    {
      id: "auditor",
      name: "Auditor",
      role: "Verifica fonte, consistência, SEO e riscos antes da publicação.",
      enabled: false,
      provider: "Não configurado",
      budget: "R$ 0,00"
    }
  ]
};

let state = structuredClone(defaultState);
let persistQueue = Promise.resolve();
const sessions = new Map();
const loginAttempts = new Map();
const sseClients = new Set();
const running = new Set();

await mkdir(DATA_DIR, { recursive: true });
try {
  const stored = JSON.parse(await readFile(STATE_FILE, "utf8"));
  state = { ...defaultState, ...stored };
} catch (error) {
  if (error.code !== "ENOENT") console.error("Falha ao ler estado:", error);
  await persist();
}

state.relevanceAgent = {
  ...defaultState.relevanceAgent,
  ...state.relevanceAgent,
  timezone: "America/Sao_Paulo",
  windowStart: "05:00",
  windowEnd: "06:00"
};
state.editorAgent = {
  ...defaultState.editorAgent,
  ...state.editorAgent,
  timezone: "America/Sao_Paulo",
  scheduledAt: "Seg/Qua/Sex · 06:05"
};

const avatarNoteIndex = state.notes.findIndex((note) => note.id === etranslinkAvatarNote.id);
if (avatarNoteIndex === -1) {
  state.notes.unshift(etranslinkAvatarNote);
  await persist();
} else if (state.notes[avatarNoteIndex].avatarVersion !== etranslinkAvatarNote.avatarVersion) {
  state.notes[avatarNoteIndex] = {
    ...etranslinkAvatarNote,
    createdAt: state.notes[avatarNoteIndex].createdAt || etranslinkAvatarNote.createdAt,
    updatedAt: new Date().toISOString()
  };
  await persist();
}

const desiredCesarNotes = cesarSeedNotes();
const desiredCesarIds = new Set(desiredCesarNotes.map((note) => note.id));
const existingSeedNotes = new Map(state.notes.filter((note) => note.seedVersion).map((note) => [note.id, note]));
state.notes = state.notes.filter((note) => !note.seedVersion || desiredCesarIds.has(note.id));
state.notes = state.notes.filter((note) => !note.seedVersion);
state.notes.push(...desiredCesarNotes.map((note) => {
  const existing = existingSeedNotes.get(note.id);
  return existing?.seedVersion === 2 ? existing : {
    ...note,
    createdAt: existing?.createdAt || note.createdAt
  };
}));
state.notes = connectCesarNotes(state.notes);
await persist();

function persist() {
  persistQueue = persistQueue.then(async () => {
    const tempFile = `${STATE_FILE}.tmp`;
    await writeFile(tempFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(tempFile, STATE_FILE);
  }).catch((error) => console.error("Falha ao persistir estado:", error));
  return persistQueue;
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error("PAYLOAD_TOO_LARGE"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        return [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
      })
  );
}

function sessionFor(req) {
  const token = cookies(req).lios_session;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  return session;
}

function remoteAddress(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0];
  const host = req.headers.host;
  return origin === `${proto}://${host}`;
}

function requireSession(req, res, { csrf = false } = {}) {
  const session = sessionFor(req);
  if (!session) {
    sendJson(res, 401, { error: "Sessão expirada." });
    return null;
  }
  if (csrf && (!sameOrigin(req) || req.headers["x-lios-csrf"] !== session.csrf)) {
    sendJson(res, 403, { error: "Validação de segurança falhou." });
    return null;
  }
  return session;
}

function verifyPassword(password) {
  const actual = scryptSync(String(password), PASSWORD_SALT, 64);
  const expected = Buffer.from(PASSWORD_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function emit(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) client.write(message);
}

function beginRun(workflowId, trigger) {
  const run = {
    id: randomBytes(12).toString("hex"),
    workflowId,
    trigger,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    summary: "Execução iniciada.",
    metrics: {},
    steps: []
  };
  state.runs.unshift(run);
  state.runs = state.runs.slice(0, 500);
  emit("run", run);
  return run;
}

function addStep(run, nodeId, status, message, data = {}) {
  const step = {
    nodeId,
    status,
    message,
    data,
    at: new Date().toISOString()
  };
  run.steps.push(step);
  emit("step", { runId: run.id, workflowId: run.workflowId, ...step });
}

async function measuredFetch(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "LIOS-v2/0.1 (+https://matheuslibonatti.tech)" },
    ...options
  });
  const text = await response.text();
  return {
    url: response.url,
    status: response.status,
    ok: response.ok,
    latencyMs: Math.round(performance.now() - started),
    bytes: Buffer.byteLength(text),
    text
  };
}

async function runSiteHealth(trigger = "schedule") {
  if (running.has("site-health")) return null;
  running.add("site-health");
  const run = beginRun("site-health", trigger);
  const started = performance.now();
  try {
    addStep(run, "trigger", "success", `Fluxo iniciado por ${trigger}.`);
    const pages = [
      ["pt", `${PUBLIC_SITE}/pt-br/`],
      ["es", `${PUBLIC_SITE}/es/`],
      ["en", `${PUBLIC_SITE}/en/`]
    ];
    const results = [];
    for (const [nodeId, url] of pages) {
      addStep(run, nodeId, "running", `Consultando ${url}`);
      const result = await measuredFetch(url);
      results.push({ url, status: result.status, ok: result.ok, latencyMs: result.latencyMs, bytes: result.bytes });
      addStep(run, nodeId, result.ok ? "success" : "error", `HTTP ${result.status} em ${result.latencyMs} ms.`, {
        status: result.status,
        latencyMs: result.latencyMs,
        bytes: result.bytes
      });
    }
    addStep(run, "measure", "success", "Respostas comparadas e métricas calculadas.");
    const healthy = results.filter((item) => item.ok).length;
    run.metrics = {
      healthyPages: healthy,
      checkedPages: results.length,
      uptimePercent: Math.round((healthy / results.length) * 100),
      averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length),
      pages: results
    };
    addStep(run, "store", "success", "Leitura registrada no histórico local.");
    run.status = healthy === results.length ? "success" : "warning";
    run.summary = `${healthy}/${results.length} páginas disponíveis · média ${run.metrics.averageLatencyMs} ms`;
  } catch (error) {
    run.status = "error";
    run.summary = error.message;
    addStep(run, "store", "error", `Falha: ${error.message}`);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Math.round(performance.now() - started);
    running.delete("site-health");
    await persist();
    emit("run", run);
  }
  return run;
}

function match(html, expression) {
  return expression.test(html);
}

async function runContentAudit(trigger = "schedule") {
  if (running.has("content-audit")) return null;
  running.add("content-audit");
  const run = beginRun("content-audit", trigger);
  const started = performance.now();
  try {
    addStep(run, "trigger", "success", `Fluxo iniciado por ${trigger}.`);
    addStep(run, "sitemap", "running", "Lendo sitemap público.");
    const sitemap = await measuredFetch(`${PUBLIC_SITE}/sitemap.xml`);
    if (!sitemap.ok) throw new Error(`Sitemap respondeu HTTP ${sitemap.status}`);
    const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((item) => item[1]).slice(0, 25);
    addStep(run, "sitemap", "success", `${urls.length} URLs encontradas.`);
    addStep(run, "crawl", "running", "Verificando páginas publicadas.");
    const pages = [];
    for (const url of urls) {
      const page = await measuredFetch(url);
      const checks = {
        title: match(page.text, /<title>[^<]{8,}<\/title>/i),
        description: match(page.text, /<meta\s+name=["']description["'][^>]+content=["'][^"']{40,}/i)
          || match(page.text, /<meta\s+content=["'][^"']{40,}["'][^>]+name=["']description["']/i),
        canonical: match(page.text, /<link\s+rel=["']canonical["'][^>]+href=/i),
        language: match(page.text, /<html\s+[^>]*lang=["'][^"']+["']/i),
        heading: match(page.text, /<h1[\s>]/i)
      };
      const passed = Object.values(checks).filter(Boolean).length;
      pages.push({ url, status: page.status, ok: page.ok, checks, score: Math.round((passed / 5) * 100) });
    }
    addStep(run, "crawl", "success", `${pages.length} páginas analisadas.`);
    const averageScore = pages.length
      ? Math.round(pages.reduce((sum, page) => sum + page.score, 0) / pages.length)
      : 0;
    const issues = pages.reduce((sum, page) => sum + Object.values(page.checks).filter((value) => !value).length, 0);
    addStep(run, "rules", issues ? "warning" : "success", `${issues} pendências técnicas encontradas.`);
    run.metrics = {
      sitemapUrls: urls.length,
      auditedPages: pages.length,
      averageScore,
      issues,
      pages
    };
    addStep(run, "store", "success", "Auditoria registrada no histórico local.");
    run.status = averageScore >= 90 ? "success" : averageScore >= 70 ? "warning" : "error";
    run.summary = `${pages.length} páginas · score técnico ${averageScore}% · ${issues} pendências`;
  } catch (error) {
    run.status = "error";
    run.summary = error.message;
    addStep(run, "store", "error", `Falha: ${error.message}`);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Math.round(performance.now() - started);
    running.delete("content-audit");
    await persist();
    emit("run", run);
  }
  return run;
}

async function runEditorialRadar(trigger = "schedule") {
  if (running.has("editorial-radar")) return null;
  running.add("editorial-radar");
  const run = beginRun("editorial-radar", trigger);
  const started = performance.now();
  try {
    addStep(run, "trigger", "success", `Coleta iniciada por ${trigger}.`);
    for (const nodeId of ["google", "gdelt", "wikimedia"]) {
      addStep(run, nodeId, "running", "Consultando fonte externa.");
    }
    const radar = await collectEditorialRadar();
    for (const [source, status] of Object.entries(radar.sourceStatus)) {
      if (status.ok) continue;
      const previousSignals = (state.editorialRadar?.signals || [])
        .filter((item) => item.source === source)
        .map((item) => ({ ...item, stale: true }));
      if (previousSignals.length) {
        radar.signals.push(...previousSignals);
        status.stale = true;
        status.count = previousSignals.length;
      }
    }
    radar.signals.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));
    for (const [source, nodeId] of [
      ["google-trends", "google"],
      ["gdelt", "gdelt"],
      ["wikimedia", "wikimedia"]
    ]) {
      const status = radar.sourceStatus[source];
      addStep(
        run,
        nodeId,
        status.ok ? "success" : "error",
        status.ok ? `${status.count} sinais relevantes coletados.` : `Falha: ${status.error}`,
        status
      );
    }
    addStep(run, "classify", "success", "Sinais classificados em economia, política, caminhões e logística.");
    addStep(run, "score", "success", `${radar.signals.length} oportunidades deduplicadas e priorizadas.`);
    state.editorialRadar = radar;
    addStep(run, "store", "success", "Radar editorial atualizado na base local.");
    const availableSources = Object.values(radar.sourceStatus).filter((source) => source.ok).length;
    run.metrics = {
      availableSources,
      totalSources: 3,
      signals: radar.signals.length,
      publish: radar.signals.filter((item) => item.recommendation === "PUBLICAR").length,
      update: radar.signals.filter((item) => item.recommendation === "ATUALIZAR").length
    };
    run.status = availableSources === 3 ? "success" : availableSources ? "warning" : "error";
    run.summary = `${radar.signals.length} pautas · ${availableSources}/3 fontes disponíveis`;
  } catch (error) {
    run.status = "error";
    run.summary = error.message;
    addStep(run, "store", "error", `Falha: ${error.message}`);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Math.round(performance.now() - started);
    running.delete("editorial-radar");
    await persist();
    emit("run", run);
    emit("radar", state.editorialRadar);
  }
  return run;
}

async function runDailyRelevanceAgent(trigger = "schedule") {
  if (running.has("relevance-agent")) return null;
  running.add("relevance-agent");
  const run = beginRun("relevance-agent", trigger);
  const started = performance.now();
  const clock = saoPauloClock();
  const remainingWindowMs =
    trigger === "schedule"
      ? Math.max(0, (6 * 60 - (clock.hour * 60 + clock.minute)) * 60 * 1000)
      : 60 * 60 * 1000;
  const deadline = Date.now() + Math.min(60 * 60 * 1000, remainingWindowMs);
  try {
    addStep(run, "trigger", "success", `Janela iniciada por ${trigger}; limite rígido de 60 minutos.`);
    if (!relevanceAgentConfigured()) throw new Error("OPENAI_API_KEY não configurada.");
    const avatar = state.notes.find((note) => note.id === etranslinkAvatarNote.id)?.body || etranslinkAvatarNote.body;
    addStep(run, "queue", "success", `${state.editorialRadar.signals.length} sinais disponíveis; somente inéditos serão analisados.`);
    addStep(run, "read", "running", "Lendo conteúdos disponíveis nas fontes.");
    addStep(run, "avatar", "running", "Comparando notícias com a audiência composta Matheus Libonatti.");
    addStep(run, "score", "running", "Aplicando régua de relevância de 0 a 10.");
    const result = await runRelevanceAgent({
      signals: state.editorialRadar.signals,
      avatar,
      deadline
    });
    addStep(run, "read", "success", `${result.scanned} notícias inéditas analisadas.`);
    addStep(run, "avatar", "success", "Impactos separados por motorista, transportadora, gestor, tecnologia e embarcador.");
    addStep(run, "score", "success", `${result.stored} com nota ≥ 6; ${result.discarded} abaixo do corte.`);
    addStep(run, "rag", "success", `${result.stored} documentos vetorizados e armazenados.`);
    run.metrics = result;
    run.status = result.status === "success" ? "success" : "warning";
    run.summary = `${result.scanned} lidas · ${result.stored} no RAG · ${result.discarded} descartadas`;
    state.relevanceAgent.status = "ready";
    state.relevanceAgent.lastResult = { ...result, finishedAt: new Date().toISOString() };
  } catch (error) {
    run.status = "error";
    run.summary = error.message;
    state.relevanceAgent.status = relevanceAgentConfigured() ? "error" : "unconfigured";
    state.relevanceAgent.lastResult = { status: "error", error: error.message, finishedAt: new Date().toISOString() };
    addStep(run, "rag", "error", `Falha: ${error.message}`);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Math.round(performance.now() - started);
    running.delete("relevance-agent");
    await persist();
    emit("run", run);
    emit("agent", state.relevanceAgent);
  }
  return run;
}

async function runDailyEditorAgent(trigger = "schedule") {
  if (running.has("editor-agent")) return null;
  running.add("editor-agent");
  const run = beginRun("editor-agent", trigger);
  const started = performance.now();
  try {
    addStep(run, "trigger", "success", `Editor iniciado por ${trigger}.`);
    if (!editorAgentConfigured()) throw new Error("OPENAI_API_KEY não configurada.");
    const avatar = state.notes.find((note) => note.id === etranslinkAvatarNote.id)?.body || etranslinkAvatarNote.body;
    addStep(run, "rag", "running", "Recuperando documentos ainda não utilizados pelo editor.");
    addStep(run, "connect", "running", "Procurando conexões responsáveis entre pelo menos duas fontes.");
    addStep(run, "angle", "running", "Traduzindo os fatos para transporte, logística e caminhões.");
    addStep(run, "write", "running", "Produzindo texto autoral com rastreabilidade.");
    const result = await runEditorAgent({ avatar });
    addStep(run, "rag", "success", `${result.sourceCount} documentos elegíveis recuperados.`);
    addStep(run, "connect", "success", "Conexões limitadas aos fatos e cenários sustentados pelas fontes.");
    addStep(run, "angle", "success", "Impactos práticos organizados para o Avatar Matheus Libonatti.");
    addStep(run, "write", "success", `${result.draftCount} rascunhos autorais criados.`);
    addStep(run, "review", "success", "Conteúdo salvo para revisão humana; nada foi publicado automaticamente.");
    run.metrics = result;
    run.status = result.status === "success" ? "success" : "warning";
    run.summary = `${result.sourceCount} fontes · ${result.draftCount} rascunhos para revisão`;
    state.editorAgent.status = "ready";
    state.editorAgent.lastResult = { ...result, finishedAt: new Date().toISOString() };
  } catch (error) {
    run.status = "error";
    run.summary = error.message;
    state.editorAgent.status = editorAgentConfigured() ? "error" : "unconfigured";
    state.editorAgent.lastResult = { status: "error", error: error.message, finishedAt: new Date().toISOString() };
    addStep(run, "review", "error", `Falha: ${error.message}`);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Math.round(performance.now() - started);
    running.delete("editor-agent");
    await persist();
    emit("run", run);
    emit("agent", state.editorAgent);
  }
  return run;
}

async function executeWorkflow(id, trigger) {
  if (id === "site-health") return runSiteHealth(trigger);
  if (id === "content-audit") return runContentAudit(trigger);
  if (id === "editorial-radar") return runEditorialRadar(trigger);
  if (id === "relevance-agent") return runDailyRelevanceAgent(trigger);
  if (id === "editor-agent") return runDailyEditorAgent(trigger);
  throw new Error("Fluxo não encontrado.");
}

function dashboardPayload() {
  const completed = state.runs.filter((run) => run.status !== "running");
  const successful = completed.filter((run) => run.status === "success").length;
  const latestHealth = state.runs.find((run) => run.workflowId === "site-health" && run.metrics?.checkedPages);
  const latestAudit = state.runs.find((run) => run.workflowId === "content-audit" && run.metrics?.auditedPages);
  const last24h = state.runs
    .filter((run) => Date.now() - new Date(run.startedAt).getTime() <= 24 * 60 * 60 * 1000)
    .map((run) => ({
      at: run.startedAt,
      workflowId: run.workflowId,
      status: run.status,
      durationMs: run.durationMs || 0
    }))
    .reverse();
  return {
    generatedAt: new Date().toISOString(),
    site: PUBLIC_SITE,
    summary: {
      uptimePercent: latestHealth?.metrics?.uptimePercent ?? null,
      averageLatencyMs: latestHealth?.metrics?.averageLatencyMs ?? null,
      seoScore: latestAudit?.metrics?.averageScore ?? null,
      auditedPages: latestAudit?.metrics?.auditedPages ?? null,
      totalRuns: completed.length,
      successRate: completed.length ? Math.round((successful / completed.length) * 100) : null,
      activeAgents: state.agents.filter((agent) => agent.enabled).length,
      monthlyAiCost: 0
    },
    activity: last24h,
    latestRuns: state.runs.slice(0, 12)
  };
}

async function serveStatic(req, res, pathname) {
  const cleanPath = pathname.replace(/^\/+/, "");
  const requestPath = pathname === "/" ? "index.html" : (path.extname(cleanPath) ? cleanPath : path.join(cleanPath, "index.html"));
  const filePath = path.resolve(PUBLIC_DIR, requestPath);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("NOT_FILE");
    const extension = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webp": "image/webp"
    };
    res.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Não encontrado.");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/api/auth/status" && req.method === "GET") {
      const session = sessionFor(req);
      sendJson(res, 200, session ? { authenticated: true, user: session.user, csrf: session.csrf } : { authenticated: false });
      return;
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      if (!sameOrigin(req)) {
        sendJson(res, 403, { error: "Origem inválida." });
        return;
      }
      const ip = remoteAddress(req);
      const attempt = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
      if (attempt.blockedUntil > Date.now()) {
        sendJson(res, 429, { error: "Muitas tentativas. Aguarde alguns minutos." });
        return;
      }
      const body = await readJson(req);
      const validUser = safeText(body.username, 80) === USERNAME;
      const validPassword = body.password && verifyPassword(body.password);
      if (!validUser || !validPassword) {
        attempt.count += 1;
        if (attempt.count >= 5) {
          attempt.blockedUntil = Date.now() + 15 * 60 * 1000;
          attempt.count = 0;
        }
        loginAttempts.set(ip, attempt);
        sendJson(res, 401, { error: "Usuário ou senha inválidos." });
        return;
      }
      loginAttempts.delete(ip);
      const token = randomBytes(32).toString("hex");
      const csrf = randomBytes(24).toString("hex");
      sessions.set(token, { user: USERNAME, csrf, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
      const secure = IS_PRODUCTION ? "; Secure" : "";
      sendJson(res, 200, { authenticated: true, user: USERNAME, csrf }, {
        "Set-Cookie": `lios_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`
      });
      return;
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const session = requireSession(req, res, { csrf: true });
      if (!session) return;
      const token = cookies(req).lios_session;
      sessions.delete(token);
      sendJson(res, 200, { ok: true }, {
        "Set-Cookie": "lios_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
      });
      return;
    }

    if (pathname.startsWith("/api/")) {
      const session = requireSession(req, res, { csrf: req.method !== "GET" });
      if (!session) return;

      if (pathname === "/api/dashboard" && req.method === "GET") {
        sendJson(res, 200, dashboardPayload());
        return;
      }
      if (pathname === "/api/editorial-radar" && req.method === "GET") {
        sendJson(res, 200, state.editorialRadar);
        return;
      }
      if (pathname === "/api/editorial-radar/refresh" && req.method === "POST") {
        if (running.has("editorial-radar")) {
          sendJson(res, 409, { error: "O radar já está sendo atualizado." });
          return;
        }
        runEditorialRadar("manual").catch((error) => console.error(error));
        sendJson(res, 202, { accepted: true });
        return;
      }
      if (pathname === "/api/relevance-agent" && req.method === "GET") {
        sendJson(res, 200, {
          configured: relevanceAgentConfigured(),
          configuration: state.relevanceAgent,
          stats: relevanceAgentStats(),
          evaluations: recentEvaluations(Number(url.searchParams.get("limit") || 50))
        });
        return;
      }
      if (pathname === "/api/editor-agent" && req.method === "GET") {
        sendJson(res, 200, {
          configured: editorAgentConfigured(),
          configuration: state.editorAgent,
          stats: editorAgentStats(),
          drafts: recentDrafts(Number(url.searchParams.get("limit") || 30))
        });
        return;
      }
      if (pathname === "/api/workflows" && req.method === "GET") {
        sendJson(res, 200, {
          workflows: workflows.map((workflow) => ({
            ...workflow,
            running: running.has(workflow.id),
            latestRun: state.runs.find((run) => run.workflowId === workflow.id) || null
          }))
        });
        return;
      }
      const runMatch = pathname.match(/^\/api\/workflows\/([a-z-]+)\/run$/);
      if (runMatch && req.method === "POST") {
        if (runMatch[1] === "relevance-agent" && saoPauloClock().hour !== 5) {
          sendJson(res, 409, { error: "O Coletor Editorial só executa entre 05:00 e 06:00, horário de Brasília." });
          return;
        }
        if (running.has(runMatch[1])) {
          sendJson(res, 409, { error: "Este fluxo já está em execução." });
          return;
        }
        executeWorkflow(runMatch[1], "manual").catch((error) => console.error(error));
        sendJson(res, 202, { accepted: true });
        return;
      }
      if (pathname === "/api/notes" && req.method === "GET") {
        const query = safeText(url.searchParams.get("q"), 120).toLocaleLowerCase("pt-BR");
        const notes = query
          ? state.notes.filter((note) => [note.title, note.body, ...note.tags].join(" ").toLocaleLowerCase("pt-BR").includes(query))
          : state.notes;
        sendJson(res, 200, { notes });
        return;
      }
      if (pathname === "/api/notes" && req.method === "POST") {
        const body = await readJson(req);
        const title = safeText(body.title, 140);
        const noteBody = safeText(body.body, 12000);
        if (!title || !noteBody) {
          sendJson(res, 400, { error: "Título e conteúdo são obrigatórios." });
          return;
        }
        const note = {
          id: randomBytes(10).toString("hex"),
          title,
          body: noteBody,
          tags: Array.isArray(body.tags)
            ? body.tags.map((tag) => safeText(tag, 32)).filter(Boolean).slice(0, 12)
            : safeText(body.tags, 300).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        state.notes.unshift(note);
        state.notes = connectCesarNotes(state.notes);
        await persist();
        sendJson(res, 201, { note });
        return;
      }
      const noteMatch = pathname.match(/^\/api\/notes\/([a-z0-9-]+)$/);
      if (noteMatch && req.method === "PUT") {
        const noteIndex = state.notes.findIndex((note) => note.id === noteMatch[1]);
        if (noteIndex === -1) {
          sendJson(res, 404, { error: "Nota não encontrada." });
          return;
        }
        const body = await readJson(req);
        const title = safeText(body.title, 140);
        const noteBody = safeText(body.body, 12000);
        if (!title || !noteBody) {
          sendJson(res, 400, { error: "Título e conteúdo são obrigatórios." });
          return;
        }
        state.notes[noteIndex] = {
          ...state.notes[noteIndex],
          title,
          body: noteBody,
          tags: Array.isArray(body.tags)
            ? body.tags.map((tag) => safeText(tag, 32)).filter(Boolean).slice(0, 12)
            : safeText(body.tags, 300).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
          updatedAt: new Date().toISOString()
        };
        state.notes = connectCesarNotes(state.notes);
        await persist();
        sendJson(res, 200, { note: state.notes.find((note) => note.id === noteMatch[1]) });
        return;
      }
      if (noteMatch && req.method === "DELETE") {
        const before = state.notes.length;
        state.notes = state.notes.filter((note) => note.id !== noteMatch[1]);
        if (state.notes.length === before) {
          sendJson(res, 404, { error: "Nota não encontrada." });
          return;
        }
        state.notes = connectCesarNotes(state.notes);
        await persist();
        sendJson(res, 200, { ok: true });
        return;
      }
      if (pathname === "/api/agents" && req.method === "GET") {
        const configured = relevanceAgentConfigured();
        sendJson(res, 200, {
          agents: state.agents.map((agent) => {
            if (agent.id === "radar") return {
              ...agent,
              name: "Coletor Editorial",
              role: "Lê notícias, aplica o Avatar Matheus Libonatti e envia notas ≥ 6 para o RAG.",
              enabled: configured,
              provider: configured ? "OpenAI · gpt-5-mini" : "Aguardando chave OpenAI",
              budget: "Máx. 80 notícias/dia"
            };
            if (agent.id === "editor") return {
              ...agent,
              name: "Editor de Inteligência",
              role: "Conecta notícias do RAG e cria conteúdo autoral para revisão humana.",
              enabled: editorAgentConfigured(),
              provider: editorAgentConfigured() ? "OpenAI · gpt-5-mini" : "Aguardando chave OpenAI",
              budget: "Máx. 6 rascunhos/semana"
            };
            return agent;
          }),
          providerConfigured: configured,
          relevanceAgent: {
            configuration: state.relevanceAgent,
            stats: relevanceAgentStats()
          },
          editorAgent: {
            configuration: state.editorAgent,
            stats: editorAgentStats(),
            drafts: recentDrafts(10)
          },
          message: configured
            ? "Coletor programado diariamente das 05:00 às 06:00, horário de Brasília."
            : "A estrutura está pronta, mas OPENAI_API_KEY ainda não foi configurada."
        });
        return;
      }
      if (pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-store",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no"
        });
        res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }
      sendJson(res, 404, { error: "Rota não encontrada." });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    const statusCode = error.message === "PAYLOAD_TOO_LARGE" ? 413 : error.message === "INVALID_JSON" ? 400 : 500;
    sendJson(res, statusCode, { error: statusCode === 500 ? "Erro interno." : "Requisição inválida." });
    if (statusCode === 500) console.error(error);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LIOS v2 ouvindo na porta ${PORT}`);
  setTimeout(() => {
    runSiteHealth("startup").catch(console.error);
    runContentAudit("startup").catch(console.error);
    runEditorialRadar("startup").catch(console.error);
  }, 1500);
});

setInterval(() => runSiteHealth("schedule").catch(console.error), 15 * 60 * 1000);
setInterval(() => runContentAudit("schedule").catch(console.error), 6 * 60 * 60 * 1000);
setInterval(() => runEditorialRadar("schedule").catch(console.error), 12 * 60 * 1000);
function saoPauloClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday
  };
}

setInterval(() => {
  const clock = saoPauloClock();
  if (clock.hour !== 5 || state.relevanceAgent.lastScheduledDate === clock.date) return;
  state.relevanceAgent.lastScheduledDate = clock.date;
  persist().catch(console.error);
  runDailyRelevanceAgent("schedule").catch(console.error);
}, 60 * 1000);
setInterval(() => {
  const clock = saoPauloClock();
  const editorialDays = new Set(["Mon", "Wed", "Fri"]);
  if (!editorialDays.has(clock.weekday) || clock.hour !== 6 || clock.minute < 5 || state.editorAgent.lastScheduledDate === clock.date) return;
  state.editorAgent.lastScheduledDate = clock.date;
  persist().catch(console.error);
  runDailyEditorAgent("schedule").catch(console.error);
}, 60 * 1000);
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(token);
  }
}, 10 * 60 * 1000);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    server.close();
    await persist();
    process.exit(0);
  });
}
