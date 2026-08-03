const USER_AGENT = "LIOS-Matheus-Libonatti/1.0 (+https://matheuslibonatti.tech)";

const CATEGORY_RULES = {
  economia: [
    "economia", "economic", "economy", "finance", "financial", "fiscal", "inflação",
    "inflacao", "juros", "selic", "dólar", "dolar", "câmbio", "cambio", "pib",
    "mercado", "imposto", "tarifa", "exportação", "exportacao", "importação",
    "importacao", "comércio", "comercio", "investimento", "banco", "receita"
  ],
  politica: [
    "política", "politica", "politics", "governo", "government", "congresso",
    "senado", "senate", "câmara", "camara", "deputado", "senador", "presidente",
    "ministro", "eleição", "eleicao", "election", "stf", "regulação", "regulacao",
    "legislação", "legislacao", "projeto de lei", "medida provisória", "medida provisoria"
  ],
  caminhoes: [
    "caminhão", "caminhao", "caminhões", "caminhoes", "truck", "trucks", "trucking",
    "caminhoneiro", "caminhoneiros", "frete", "diesel", "rodovia", "estrada",
    "transportadora", "transporte rodoviário", "transporte rodoviario"
  ],
  logistica: [
    "logística", "logistica", "logistics", "supply chain", "cadeia de suprimentos",
    "porto de", "porto do", "portos", "seaport", "ferrovia", "rail", "armazém", "armazem",
    "aduana", "alfândega", "alfandega", "fronteira", "mercosul", "carga",
    "container", "contêiner", "terminal", "export", "import"
  ]
};

const CATEGORY_LABELS = {
  economia: "Economia",
  politica: "Política",
  caminhoes: "Caminhões",
  logistica: "Logística"
};

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value = "") {
  return decodeXml(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function classify(text) {
  const normalized = String(text || "").toLocaleLowerCase("pt-BR");
  let best = null;
  let matches = 0;
  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    const count = keywords.filter((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(normalized);
    }).length;
    if (count > matches) {
      best = category;
      matches = count;
    }
  }
  return best ? { id: best, label: CATEGORY_LABELS[best], matches } : null;
}

function trafficNumber(value) {
  const match = String(value).replace(/[.,]/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function editorialAction(score) {
  if (score >= 80) return "PUBLICAR";
  if (score >= 62) return "ATUALIZAR";
  if (score >= 42) return "MONITORAR";
  return "OBSERVAR";
}

async function getText(url, timeout = 25000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/xml, text/xml;q=0.9" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function collectGoogleTrends() {
  const xml = await getText("https://trends.google.com/trending/rss?geo=BR");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return items.flatMap((item) => {
    const title = tagValue(item, "title");
    const traffic = tagValue(item, "ht:approx_traffic");
    const publishedAt = tagValue(item, "pubDate");
    const newsTitle = tagValue(item, "ht:news_item_title");
    const newsUrl = tagValue(item, "ht:news_item_url");
    const titleCategory = classify(title);
    const newsCategory = classify(newsTitle);
    const category = titleCategory || newsCategory;
    if (!category) return [];
    const volume = trafficNumber(traffic);
    const score = Math.min(96, 48 + Math.round(Math.log10(Math.max(volume, 1)) * 12) + category.matches * 3);
    return [{
      id: `google:${title.toLocaleLowerCase("pt-BR")}`,
      source: "google-trends",
      sourceLabel: "Google Trends",
      title: titleCategory ? title : newsTitle,
      context: titleCategory
        ? (newsTitle || `Busca em alta no Brasil · ${traffic || "volume não informado"}`)
        : `${title} está em alta nas buscas · ${traffic || "volume não informado"}`,
      url: newsUrl || `https://trends.google.com/trending?geo=BR`,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
      category: category.id,
      categoryLabel: category.label,
      score,
      signal: volume,
      signalLabel: traffic ? `${traffic} buscas` : "Em alta"
    }];
  });
}

async function collectGdelt() {
  const query = encodeURIComponent("(economy OR politics OR truck OR logistics) sourcecountry:brazil");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=75&format=json&sort=datedesc&timespan=24h`;
  let text;
  try {
    text = await getText(url, 35000);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 5500));
    text = await getText(url, 35000);
  }
  const payload = JSON.parse(text);
  return (payload.articles || []).flatMap((article) => {
    const category = classify(article.title);
    if (!category) return [];
    const publishedAt = String(article.seendate || "").replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z"
    );
    const ageHours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
    const score = Math.min(92, Math.max(38, 72 - Math.round(ageHours * 1.2) + category.matches * 4));
    return [{
      id: `gdelt:${article.url}`,
      source: "gdelt",
      sourceLabel: "GDELT",
      title: article.title,
      context: `${article.domain} · cobertura jornalística recente`,
      url: article.url,
      image: article.socialimage || "",
      publishedAt,
      category: category.id,
      categoryLabel: category.label,
      score,
      signal: Math.max(0, Math.round(24 - ageHours)),
      signalLabel: ageHours < 1 ? "Última hora" : `Há ${Math.max(1, Math.round(ageHours))} h`
    }];
  });
}

function yesterdayUtc() {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return {
    year: date.getUTCFullYear(),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    day: String(date.getUTCDate()).padStart(2, "0")
  };
}

async function collectWikimedia() {
  const { year, month, day } = yesterdayUtc();
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/pt.wikipedia.org/all-access/${year}/${month}/${day}`;
  const payload = JSON.parse(await getText(url));
  const articles = payload.items?.[0]?.articles || [];
  return articles.flatMap((article) => {
    const title = decodeURIComponent(article.article).replaceAll("_", " ");
    if (/^(Wikipédia:|Especial:|Página principal$)/i.test(title)) return [];
    const category = classify(title);
    if (!category) return [];
    const score = Math.min(90, 34 + Math.round(Math.log10(Math.max(article.views, 1)) * 11) + category.matches * 3);
    return [{
      id: `wikimedia:${article.article}`,
      source: "wikimedia",
      sourceLabel: "Wikimedia",
      title,
      context: `Artigo em evidência na Wikipédia em português · posição ${article.rank}`,
      url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(article.article)}`,
      publishedAt: `${year}-${month}-${day}T23:59:59Z`,
      category: category.id,
      categoryLabel: category.label,
      score,
      signal: article.views,
      signalLabel: `${new Intl.NumberFormat("pt-BR").format(article.views)} visualizações`
    }];
  });
}

export async function collectEditorialRadar() {
  const collectors = [
    ["google-trends", "Google Trends", collectGoogleTrends],
    ["gdelt", "GDELT", collectGdelt],
    ["wikimedia", "Wikimedia", collectWikimedia]
  ];
  const settled = await Promise.allSettled(collectors.map(([, , collect]) => collect()));
  const sourceStatus = {};
  const signals = [];
  settled.forEach((result, index) => {
    const [id, label] = collectors[index];
    if (result.status === "fulfilled") {
      sourceStatus[id] = { label, ok: true, count: result.value.length, error: null };
      signals.push(...result.value);
    } else {
      sourceStatus[id] = { label, ok: false, count: 0, error: result.reason?.message || "Falha na coleta" };
    }
  });

  const deduped = [...new Map(
    signals
      .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt))
      .map((item) => [`${item.source}:${item.title.toLocaleLowerCase("pt-BR")}`, item])
  ).values()].slice(0, 120);

  return {
    updatedAt: new Date().toISOString(),
    refreshMinutes: 12,
    scope: ["Economia", "Política", "Caminhões", "Logística"],
    sourceStatus,
    signals: deduped.map((item) => ({ ...item, recommendation: editorialAction(item.score) }))
  };
}
