const services = [
  {
    number: "01",
    title: "Produtos digitais",
    text: "Sites, plataformas e sistemas web construídos para entregar uma experiência clara e gerar resultado para o negócio."
  },
  {
    number: "02",
    title: "APIs e integrações",
    text: "Serviços robustos que conectam ferramentas, organizam dados e eliminam tarefas manuais do dia a dia."
  },
  {
    number: "03",
    title: "Arquitetura e evolução",
    text: "Diagnóstico técnico, modernização de sistemas e decisões de arquitetura que sustentam o crescimento do produto."
  },
  {
    number: "04",
    title: "Automação inteligente",
    text: "Fluxos e agentes que reduzem trabalho repetitivo, aceleram operações e ampliam a capacidade da equipe."
  }
];

const principles = [
  ["Clareza antes do código", "Entender o problema, o usuário e o resultado esperado antes de escolher a tecnologia."],
  ["Entrega em ciclos curtos", "Construir, validar e evoluir com visibilidade, sem transformar o projeto em uma caixa-preta."],
  ["Qualidade que permanece", "Criar software legível, seguro e preparado para ser mantido quando o negócio crescer."]
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      <header className="nav-shell">
        <a className="brand" href="#inicio" aria-label="Ir para o início">
          ML<span>.</span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#servicos">Serviços</a>
          <a href="#trabalho">Trabalho</a>
          <a href="#sobre">Sobre</a>
        </nav>
        <a className="nav-cta" href="#contato">
          Vamos conversar <ArrowIcon />
        </a>
      </header>

      <section className="hero" id="inicio">
        <div className="eyebrow">
          <span />
          Disponível para novos projetos
        </div>
        <h1>
          Software que move
          <br />
          <em>negócios adiante.</em>
        </h1>
        <div className="hero-bottom">
          <p>
            Sou Matheus Libonatti, engenheiro de software. Transformo desafios
            reais em produtos digitais rápidos, confiáveis e prontos para
            crescer.
          </p>
          <a className="circle-link" href="#servicos" aria-label="Conheça meus serviços">
            <ArrowIcon />
          </a>
        </div>
        <div className="hero-code" aria-hidden="true">
          <span>ENGENHARIA</span>
          <span>PRODUTO</span>
          <span>RESULTADO</span>
        </div>
      </section>

      <section className="services section" id="servicos">
        <div className="section-heading">
          <p className="kicker">O que eu construo</p>
          <h2>Tecnologia com propósito, do primeiro desenho à produção.</h2>
        </div>
        <div className="services-list">
          {services.map((service) => (
            <article className="service" key={service.number}>
              <span>{service.number}</span>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="work section" id="trabalho">
        <div className="work-copy">
          <p className="kicker light">Projetos selecionados</p>
          <h2>Código é o meio. Impacto é a medida.</h2>
          <p>
            Este portfólio está começando a tomar forma. Em breve, esta área
            reunirá estudos de caso com contexto, decisões técnicas e os
            resultados de cada projeto.
          </p>
          <a href="https://github.com/Libonatti93" target="_blank" rel="noreferrer">
            Ver atividade no GitHub <ArrowIcon />
          </a>
        </div>
        <div className="project-card">
          <div className="project-top">
            <span>CASE 001</span>
            <span>EM CONSTRUÇÃO</span>
          </div>
          <div className="project-mark">ML</div>
          <div>
            <p>Libonatti Software System</p>
            <h3>A base para uma nova geração de produtos.</h3>
          </div>
        </div>
      </section>

      <section className="about section" id="sobre">
        <div>
          <p className="kicker">Como eu trabalho</p>
          <h2>Rigor técnico sem perder de vista as pessoas.</h2>
        </div>
        <div className="principles">
          {principles.map(([title, text], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="contact section" id="contato">
        <p className="kicker light">Vamos construir algo relevante</p>
        <h2>
          Tem um desafio?
          <br />
          <em>Eu quero ouvir.</em>
        </h2>
        <a
          className="contact-button"
          href="https://github.com/Libonatti93"
          target="_blank"
          rel="noreferrer"
        >
          Falar pelo GitHub <ArrowIcon />
        </a>
      </section>

      <footer>
        <a className="brand footer-brand" href="#inicio">
          ML<span>.</span>
        </a>
        <p>Engenharia de software com intenção.</p>
        <div>
          <a href="https://github.com/Libonatti93" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="#inicio">Voltar ao topo ↑</a>
        </div>
        <small>© {new Date().getFullYear()} Matheus Libonatti</small>
      </footer>
    </main>
  );
}
