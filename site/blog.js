const blogTranslations = {
  pt: {
    lang: "pt-BR",
    titleTag: "Blog de tecnologia — Matheus Libonatti",
    description: "Artigos sobre engenharia de software, inteligência artificial, desenvolvimento web e tecnologia.",
    skip: "Pular para o conteúdo", home: "Início", articles: "Artigos",
    title: "Tecnologia sem ruído.",
    intro: "Engenharia de software, IA, web e decisões técnicas explicadas com clareza para quem constrói produtos digitais.",
    category: "ENGENHARIA DE SOFTWARE",
    articleTitle: "Como escolher uma tecnologia sem transformar a stack em um problema",
    articleLead: "A melhor tecnologia não é a mais nova. É aquela que sua equipe consegue operar, evoluir e substituir quando o produto mudar.",
    deck: "Frameworks mudam rapidamente, mas os critérios de uma boa decisão técnica permanecem: contexto, capacidade da equipe, custo operacional e reversibilidade.",
    heading1: "Comece pelo problema, não pela ferramenta",
    paragraph1: "Antes de comparar linguagens ou frameworks, descreva o que o sistema precisa fazer, quantas pessoas vão mantê-lo e quais riscos realmente importam. Uma aplicação interna para cinquenta usuários pede decisões diferentes de uma plataforma financeira disponível o tempo inteiro.",
    heading2: "Prefira decisões reversíveis",
    paragraph2: "Uma boa arquitetura cria limites claros. Banco de dados, interface, regras de negócio e integrações não precisam ficar presos uns aos outros. Essa separação permite trocar uma parte sem reconstruir o produto inteiro.",
    quote: "Tecnologia é uma escolha de produto: cada dependência adiciona capacidade, mas também adiciona responsabilidade.",
    heading3: "Meça o custo depois do lançamento",
    paragraph3: "Desenvolver é apenas o começo. Observe deploy, monitoramento, segurança, contratação e tempo para corrigir falhas. A stack certa reduz o custo total de manter o software confiável enquanto o negócio cresce.",
    top: "Voltar ao topo ↑"
  },
  es: {
    lang: "es-419",
    titleTag: "Blog de tecnología — Matheus Libonatti",
    description: "Artículos sobre ingeniería de software, inteligencia artificial, desarrollo web y tecnología.",
    skip: "Saltar al contenido", home: "Inicio", articles: "Artículos",
    title: "Tecnología sin ruido.",
    intro: "Ingeniería de software, IA, web y decisiones técnicas explicadas con claridad para quienes construyen productos digitales.",
    category: "INGENIERÍA DE SOFTWARE",
    articleTitle: "Cómo elegir una tecnología sin convertir el stack en un problema",
    articleLead: "La mejor tecnología no es la más nueva. Es la que tu equipo puede operar, evolucionar y reemplazar cuando el producto cambie.",
    deck: "Los frameworks cambian rápido, pero los criterios de una buena decisión técnica permanecen: contexto, capacidad del equipo, costo operativo y reversibilidad.",
    heading1: "Empieza por el problema, no por la herramienta",
    paragraph1: "Antes de comparar lenguajes o frameworks, describe qué debe hacer el sistema, cuántas personas lo mantendrán y qué riesgos importan. Una aplicación interna para cincuenta usuarios exige decisiones distintas de una plataforma financiera siempre disponible.",
    heading2: "Prefiere decisiones reversibles",
    paragraph2: "Una buena arquitectura crea límites claros. Base de datos, interfaz, reglas de negocio e integraciones no tienen que quedar atadas. Esta separación permite cambiar una parte sin reconstruir todo el producto.",
    quote: "La tecnología es una decisión de producto: cada dependencia agrega capacidad, pero también responsabilidad.",
    heading3: "Mide el costo después del lanzamiento",
    paragraph3: "Desarrollar es solo el comienzo. Observa despliegue, monitoreo, seguridad, contratación y tiempo para corregir fallas. El stack correcto reduce el costo total de mantener el software confiable mientras el negocio crece.",
    top: "Volver arriba ↑"
  },
  en: {
    lang: "en",
    titleTag: "Technology blog — Matheus Libonatti",
    description: "Articles about software engineering, artificial intelligence, web development and technology.",
    skip: "Skip to content", home: "Home", articles: "Articles",
    title: "Technology without the noise.",
    intro: "Software engineering, AI, web and technical decisions explained clearly for people building digital products.",
    category: "SOFTWARE ENGINEERING",
    articleTitle: "How to choose technology without turning your stack into a problem",
    articleLead: "The best technology is not the newest one. It is the one your team can operate, evolve and replace when the product changes.",
    deck: "Frameworks change quickly, but the criteria behind a sound technical decision remain: context, team capability, operating cost and reversibility.",
    heading1: "Start with the problem, not the tool",
    paragraph1: "Before comparing languages or frameworks, describe what the system must do, how many people will maintain it and which risks matter. An internal app for fifty users calls for different choices than an always-on financial platform.",
    heading2: "Prefer reversible decisions",
    paragraph2: "Good architecture creates clear boundaries. Database, interface, business rules and integrations do not need to be locked together. This separation lets you replace one part without rebuilding the entire product.",
    quote: "Technology is a product decision: every dependency adds capability, but it also adds responsibility.",
    heading3: "Measure the cost after launch",
    paragraph3: "Development is only the beginning. Consider deployment, monitoring, security, hiring and recovery time. The right stack lowers the total cost of keeping software dependable as the business grows.",
    top: "Back to top ↑"
  }
};

const blogLanguage = location.pathname.startsWith("/es") ? "es" : location.pathname.startsWith("/en") ? "en" : "pt";
const copy = blogTranslations[blogLanguage];
document.documentElement.lang = copy.lang;
document.title = copy.titleTag;
document.querySelector("#meta-description").content = copy.description;
document.querySelectorAll("[data-copy]").forEach((element) => {
  if (copy[element.dataset.copy]) element.textContent = copy[element.dataset.copy];
});
const locale = { pt: "pt-br", es: "es", en: "en" }[blogLanguage];
document.querySelectorAll("[data-home]").forEach((link) => link.href = `/${locale}/`);
document.querySelector(`[data-lang="${blogLanguage}"]`).setAttribute("aria-current", "page");
document.querySelector("#year").textContent = new Date().getFullYear();
