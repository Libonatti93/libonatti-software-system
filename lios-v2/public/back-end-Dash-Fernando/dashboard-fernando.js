"use strict";

const DEMO = Object.freeze({
  periodDays: 30,
  examsToday: 438,
  examsMonth: 8742,
  projectedRevenue: 1924731,
  realizedRevenue: 1654700,
  economy: 684300,
  operationalCosts: 1347312,
  losses: 54250,
  projectedResult: 523169,
  avgTicket: 220.18,
  sla: 96.8,
  capacityTotal: 11000,
  critical: 12,
  nearSla: 18,
  queue: 76,
  requested: 438,
  routed: 421,
  accepted: 397,
  completed: 362,
  opportunity: 148000,
  avgDeadline: 3.8,
  journey: {
    leads: 3420, qualifiedLeads: 1128, appointments: 746, arrivals: 621,
    hashedIdentities: 614, appointmentsCompleted: 588, keywordAlerts: 132,
    redFlags: 74, examOrders: 1046, centralizedOrders: 1018,
    acquiredPatients: 431, acquiredExams: 962, potentialRevenue: 286400, estimatedProfit: 74520
  },
  doctors: [
    {name:"Dra. Helena Costa", visits:142, orders:268, conversion:71.8, avgRevenue:512, culture:96, level:"good"},
    {name:"Dr. Rafael Lima", visits:131, orders:239, conversion:68.4, avgRevenue:486, culture:92, level:"good"},
    {name:"Dra. Marina Alves", visits:119, orders:211, conversion:64.7, avgRevenue:451, culture:87, level:"attention"},
    {name:"Dr. Bruno Martins", visits:104, orders:176, conversion:59.6, avgRevenue:418, culture:79, level:"attention"},
    {name:"Demais médicos", visits:92, orders:152, conversion:62.1, avgRevenue:432, culture:85, level:"attention"}
  ],
  hourly: [12,14,18,22,27,31,36,42,48,52,49,39,28,20],
  examTypes: [
    {name:"Imagem", value:3497},
    {name:"Medicina nuclear", value:2186},
    {name:"Cardiologia", value:1311},
    {name:"Outros", value:1748}
  ],
  regions: [
    {name:"Sudeste", volume:3840, capacity:4300, status:"risk", note:"Próxima do limite"},
    {name:"Sul", volume:1712, capacity:2200, status:"ok", note:"Disponível"},
    {name:"Nordeste", volume:1510, capacity:1750, status:"watch", note:"Em atenção"},
    {name:"Centro-Oeste", volume:1050, capacity:1650, status:"ok", note:"Disponível"},
    {name:"Norte", volume:630, capacity:1100, status:"ok", note:"Disponível"}
  ],
  operators: [
    {id:"horizonte", name:"Operadora Horizonte", volume:2798, ticket:228, revenue:637944, sla:98.1, margin:30.2, trend:7.8, risk:"Oportunidade", context:"Crescimento com SLA e margem acima da média."},
    {id:"vida", name:"Vida Plena Saúde", volume:2361, ticket:214, revenue:505254, sla:97.4, margin:27.5, trend:4.2, risk:"Estável", context:"Carteira equilibrada e previsível no período."},
    {id:"integra", name:"Integra Nacional", volume:2011, ticket:219, revenue:440409, sla:95.2, margin:24.1, trend:-1.6, risk:"Atenção", context:"Prazo em imagem pressiona SLA e margem."},
    {id:"demais", name:"Demais operadoras", volume:1572, ticket:217, revenue:341124, sla:95.6, margin:25.0, trend:2.1, risk:"Atenção", context:"Mix pulverizado pede acompanhamento regional."}
  ],
  providers: [
    {name:"Núcleo Atlas", volume:1940, accept:98.2, capacity:83, response:7, sla:98.1, quality:96, margin:31, state:"Referência", level:"good", context:"Melhor equilíbrio entre aceite, qualidade e retorno."},
    {name:"Imagem Vale", volume:1650, accept:96.4, capacity:94, response:11, sla:96.8, quality:94, margin:26, state:"Saturação", level:"critical", context:"Alta entrega, mas pouca folga para absorver picos."},
    {name:"MedNuclear Sul", volume:1380, accept:97.1, capacity:61, response:8, sla:97.6, quality:97, margin:29, state:"Disponível", level:"good", context:"Janela ociosa com qualidade acima da rede."},
    {name:"Centro Diagnóstico Aurora", volume:1120, accept:93.8, capacity:68, response:14, sla:94.9, quality:91, margin:24, state:"Atenção", level:"attention", context:"Tempo de resposta explica parte do desvio de SLA."},
    {name:"Rede Prisma", volume:980, accept:95.2, capacity:58, response:9, sla:96.1, quality:95, margin:28, state:"Disponível", level:"good", context:"Capacidade ociosa para redistribuição regional."},
    {name:"Outros prestadores", volume:1672, accept:94.7, capacity:72, response:12, sla:95.5, quality:93, margin:25, state:"Monitorar", level:"attention", context:"Grupo heterogêneo; leitura individual na próxima etapa."}
  ]
});

const money = value => new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL", maximumFractionDigits:0}).format(value);
const number = value => new Intl.NumberFormat("pt-BR", {maximumFractionDigits:0}).format(value);
const decimal = value => new Intl.NumberFormat("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1}).format(value);
const pct = value => `${decimal(value)}%`;
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
const capacityUsed = DEMO.examsMonth / DEMO.capacityTotal * 100;
const marginRate = DEMO.projectedResult / DEMO.projectedRevenue * 100;

function assertCoherence(){
  const checks = [
    [sum(DEMO.operators,"volume"), DEMO.examsMonth, "volume das operadoras"],
    [sum(DEMO.operators,"revenue"), DEMO.projectedRevenue, "receita das operadoras"],
    [sum(DEMO.regions,"volume"), DEMO.examsMonth, "volume regional"],
    [sum(DEMO.regions,"capacity"), DEMO.capacityTotal, "capacidade regional"],
    [sum(DEMO.providers,"volume"), DEMO.examsMonth, "volume dos prestadores"],
    [sum(DEMO.examTypes,"value"), DEMO.examsMonth, "mix de exames"],
    [sum(DEMO.doctors,"visits"), DEMO.journey.appointmentsCompleted, "atendimentos por médico"],
    [sum(DEMO.doctors,"orders"), DEMO.journey.examOrders, "pedidos por médico"],
    [DEMO.operationalCosts + DEMO.losses + DEMO.projectedResult, DEMO.projectedRevenue, "ponte financeira"],
    [DEMO.hourly.reduce((a,b)=>a+b,0), DEMO.examsToday, "exames por hora"]
  ];
  checks.forEach(([actual, expected, label]) => {
    if(Math.abs(actual-expected) > 1) throw new Error(`Inconsistência demonstrativa em ${label}: ${actual} != ${expected}`);
  });
}

function currentGreeting(){
  const parts = new Intl.DateTimeFormat("pt-BR", {hour:"2-digit", hour12:false, timeZone:"America/Sao_Paulo"}).formatToParts(new Date());
  const hour = Number(parts.find(part=>part.type==="hour")?.value || 12);
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

function dateTime(){
  const now = new Date();
  return {
    date:new Intl.DateTimeFormat("pt-BR", {day:"2-digit", month:"short", year:"numeric", timeZone:"America/Sao_Paulo"}).format(now).replace(" de "," ").toUpperCase(),
    time:new Intl.DateTimeFormat("pt-BR", {hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo"}).format(now)
  };
}

const info = tip => `<button class="info" type="button" aria-label="Definição" data-tip="${tip}">i</button>`;
function kpiCard(label,value,trend,trendType,comparison,context,tip){
  return `<article class="kpi"><div class="kpi-head"><span class="kpi-label">${label}</span>${info(tip)}</div><strong>${value}</strong><div class="kpi-meta"><span class="trend ${trendType}">${trend}</span><span>${comparison}</span></div><span class="kpi-context">${context}</span></article>`;
}

function lineChart(values){
  const width=760, height=220, left=30, right=12, top=14, bottom=28;
  const max=Math.max(...values)*1.15;
  const x=i=>left+i*(width-left-right)/(values.length-1);
  const y=v=>top+(max-v)*(height-top-bottom)/max;
  const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
  const area=`${left},${height-bottom} ${points} ${x(values.length-1)},${height-bottom}`;
  const grid=[0,.25,.5,.75,1].map(r=>`<line class="grid-line" x1="${left}" y1="${top+r*(height-top-bottom)}" x2="${width-right}" y2="${top+r*(height-top-bottom)}"/>`).join("");
  const labels=values.map((v,i)=> i%3===0 || i===values.length-1 ? `<text class="axis-label" x="${x(i)}" y="${height-7}" text-anchor="middle">${String(i+7).padStart(2,"0")}h</text>` : "").join("");
  const dots=values.map((v,i)=>`<circle class="point" cx="${x(i)}" cy="${y(v)}" r="3" tabindex="0" data-value="${v}" data-hour="${String(i+7).padStart(2,"0")}:00"/>`).join("");
  return `<div class="chart-wrap"><svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Exames solicitados por hora"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f47216" stop-opacity=".24"/><stop offset="1" stop-color="#f47216" stop-opacity=".02"/></linearGradient></defs>${grid}<polygon class="area" points="${area}"/><polyline class="line" points="${points}"/>${dots}${labels}</svg><div class="chart-tooltip" id="chart-tooltip"></div></div>`;
}

function regionRows(){
  return DEMO.regions.map(region=>{
    const used=region.volume/region.capacity*100;
    return `<div class="region-row ${region.status}"><b>${region.name}</b><span class="bar-track"><i style="width:${used}%"></i></span><strong>${pct(used)}</strong><small>${region.note}</small></div>`;
  }).join("");
}

function operatorRows(){
  return DEMO.operators.map(operator=>`<tr data-operator-row="${operator.id}"><td><b>${operator.name}</b><small>Nome fictício demonstrativo</small></td><td>${number(operator.volume)}</td><td>${money(operator.ticket)}</td><td>${money(operator.revenue)}</td><td>${pct(operator.sla)}</td><td>${pct(operator.margin)}</td><td class="${operator.trend>=0?'trend positive':'trend negative'}">${operator.trend>=0?'↑':'↓'} ${decimal(Math.abs(operator.trend))}%</td><td><span class="state ${operator.risk==='Oportunidade'?'good':operator.risk==='Estável'?'good':'attention'}">${operator.risk}</span></td></tr>`).join("");
}

function providerRows(){
  return DEMO.providers.map(provider=>`<tr><td><b>${provider.name}</b><small>Prestador fictício demonstrativo</small></td><td>${number(provider.volume)}</td><td>${pct(provider.accept)}</td><td>${provider.capacity}%</td><td>${provider.response} min</td><td>${pct(provider.sla)}</td><td>${provider.quality}/100</td><td>${provider.margin}%</td><td><span class="state ${provider.level}">${provider.state}</span></td><td class="provider-row-context">${provider.context}</td></tr>`).join("");
}

function doctorRows(){
  return DEMO.doctors.map(doctor=>`<tr><td><b>${doctor.name}</b><small>Perfil fictício demonstrativo</small></td><td>${number(doctor.visits)}</td><td>${number(doctor.orders)}</td><td>${pct(doctor.conversion)}</td><td>${money(doctor.avgRevenue)}</td><td><div class="culture-score"><span><i style="width:${doctor.culture}%"></i></span><b>${doctor.culture}/100</b></div></td><td><span class="state ${doctor.level}">${doctor.culture>=90?'Alinhado':'Acompanhar'}</span></td></tr>`).join("");
}

function journeyTemplate(){
  const journey=DEMO.journey;
  const funnel=[
    ["Leads gerados",journey.leads], ["Leads qualificados",journey.qualifiedLeads],
    ["Consultas agendadas",journey.appointments], ["Atendimentos concluídos",journey.appointmentsCompleted],
    ["Pacientes com exame adquirido",journey.acquiredPatients]
  ];
  return `<section class="section journey-section" id="jornada"><div class="section-heading"><div><span class="section-code">Jornada ponta a ponta · antes, durante e depois da consulta</span><h2>Da chegada do lead ao resultado de cada exame</h2></div><p>Uma única leitura para acompanhar aquisição, cuidado clínico, execução e resultado financeiro em tempo real.</p></div>
    <div class="journey-kpis"><article><span>Leads gerados</span><strong>${number(journey.leads)}</strong><small>${pct(journey.qualifiedLeads/journey.leads*100)} qualificados</small></article><article><span>Chegadas identificadas</span><strong>${number(journey.hashedIdentities)}</strong><small>${pct(journey.hashedIdentities/journey.arrivals*100)} com hash</small></article><article><span>Red flags clínicas</span><strong>${number(journey.redFlags)}</strong><small>${number(journey.keywordAlerts)} alertas de palavras-chave</small></article><article><span>Pedidos centralizados</span><strong>${number(journey.centralizedOrders)}</strong><small>${pct(journey.centralizedOrders/journey.examOrders*100)} enviados automaticamente</small></article><article><span>Receita provável</span><strong>${money(journey.potentialRevenue)}</strong><small>estimativa por paciente</small></article><article><span>Lucro estimado</span><strong>${money(journey.estimatedProfit)}</strong><small>${pct(journey.estimatedProfit/journey.potentialRevenue*100)} sobre a receita provável</small></article></div>
    <div class="patient-flow" aria-label="Fluxo demonstrativo da jornada do paciente"><article class="flow-step"><b>01</b><span>Atração</span><strong>${number(journey.leads)} leads</strong><small>Campanhas e canais acompanhados até a conversão.</small></article><i>→</i><article class="flow-step"><b>02</b><span>Chegada segura</span><strong>${number(journey.hashedIdentities)} identificações</strong><small>Digital ou face convertida em hash para reconhecimento seguro.</small></article><i>→</i><article class="flow-step"><b>03</b><span>Consulta assistida</span><strong>${number(journey.redFlags)} red flags</strong><small>Prontuário alerta palavras-chave e exames correspondentes.</small></article><i>→</i><article class="flow-step"><b>04</b><span>Agendamento</span><strong>${number(journey.centralizedOrders)} pedidos</strong><small>Pedidos chegam à central assim que o paciente sai da sala.</small></article><i>→</i><article class="flow-step"><b>05</b><span>Aquisição parceira</span><strong>${number(journey.acquiredExams)} exames</strong><small>Cross PACS, Cross Viewer e Cross Report assumem desde a aquisição.</small></article><i>→</i><article class="flow-step result"><b>06</b><span>Resultado visível</span><strong>${money(journey.estimatedProfit)}</strong><small>Atendimento, receita provável e lucro acompanhados on-line.</small></article></div>
    <div class="journey-detail"><article class="panel conversion-funnel"><div class="panel-head"><div><h3>Conversão da jornada</h3><p>Do interesse inicial à aquisição do exame · últimos 30 dias</p></div><span class="tag demo">tempo real demonstrativo</span></div>${funnel.map(([label,value])=>`<div class="funnel-row"><span>${label}</span><i style="--funnel:${value/journey.leads*100}%"></i><b>${number(value)}</b></div>`).join("")}</article>
    <article class="panel clinical-radar"><div class="panel-head"><div><h3>Radar clínico e operacional</h3><p>Sinais que já nasceriam acompanhados</p></div><span class="live-dot">● AO VIVO</span></div><div class="radar-grid"><div><span>Palavras-chave detectadas</span><strong>${number(journey.keywordAlerts)}</strong><small>no prontuário eletrônico</small></div><div><span>Exames sugeridos</span><strong>${number(journey.examOrders)}</strong><small>com validação médica</small></div><div><span>Pedidos na central</span><strong>${number(journey.centralizedOrders)}</strong><small>28 aguardam confirmação</small></div><div><span>Taxa de aquisição</span><strong>${pct(journey.acquiredExams/journey.centralizedOrders*100)}</strong><small>PACS · Viewer · Report</small></div></div><div class="privacy-note"><b>Identidade protegida</b><span>O dashboard trabalha com indicadores agregados; a biometria é representada por hash, sem exibir a digital, a face ou a identidade do paciente.</span></div></article></div>
    <article class="panel doctor-performance"><div class="panel-head"><div><h3>Conversão por médico e alinhamento cultural</h3><p>Monitoramento contínuo com contexto — volume, pedidos, receita e aderência à cultura.</p></div><span class="tag attention">acompanhamento gerencial</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Médico</th><th>Atendimentos</th><th>Pedidos</th><th>Conversão</th><th>Receita provável / paciente</th><th>Alinhamento cultural</th><th>Leitura</th></tr></thead><tbody>${doctorRows()}</tbody></table></div><p class="ethics-note">Indicadores de pessoas devem apoiar desenvolvimento e qualidade assistencial; decisões exigem contexto, critérios transparentes e revisão humana.</p></article>
  </section>`;
}

function accessTemplate(){
  return `<section class="access" id="access-screen" aria-label="Entrada da central executiva"><div class="access-story"><img class="access-logo" src="/brand/cross-doctoring.svg" alt="Cross Doctoring Health"><span class="access-kicker">Central executiva personalizada</span><h1>A Cross inteira.<br>Em uma só visão.</h1><p>Operação, capacidade, qualidade e resultado conectados para antecipar decisões.</p><div class="access-proof"><div><b>${number(DEMO.examsMonth)}</b><span>exames demonstrativos</span></div><div><b>${pct(DEMO.sla)}</b><span>SLA demonstrativo</span></div><div><b>${money(DEMO.opportunity)}</b><span>oportunidade simulada</span></div></div></div><div class="access-panel"><span>Bem-vindo, Fernando.</span><h2>Seu cockpit executivo está pronto.</h2><p>Esta experiência usa somente dados fictícios e coerentes para demonstrar o potencial de uma visão integrada da Cross.</p><button id="enter-dashboard" type="button">Entrar na central executiva →</button><small>PROTÓTIPO CONCEITUAL · Sem dados pessoais, integrações ou operação real.</small></div></section>`;
}

function appTemplate(){
  const clock=dateTime();
  return `<div class="demo-ribbon">PROTÓTIPO EXECUTIVO · DADOS DEMONSTRATIVOS · CROSS DOCTORING</div><div class="app"><aside class="sidebar" id="sidebar"><a class="side-brand" href="#visao"><img src="/brand/cross-doctoring.svg" alt="Cross Doctoring Health"><span>Inteligência executiva<br>para decisões antecipadas</span></a><nav class="side-nav" aria-label="Navegação principal"><a class="active" href="#visao"><span>Visão executiva</span></a><a href="#operacao"><span>Operação ao vivo</span></a><a href="#capacidade"><span>Rede e capacidade</span></a><a href="#operadoras"><span>Operadoras</span></a><a href="#prestadores"><span>Prestadores</span></a><a href="#financeiro"><span>Financeiro</span></a><a href="#alertas"><span>Qualidade e alertas</span></a><a href="#inteligencia"><span>Inteligência</span></a></nav><div class="side-meta"><b>● SIMULAÇÃO ATIVA</b><span id="side-update">Atualizado às ${clock.time} · horário simulado</span></div></aside><main class="workspace"><header class="topbar"><button class="mobile-menu" id="mobile-menu" type="button" aria-label="Abrir navegação">MENU</button><div class="top-title"><b>CENTRAL EXECUTIVA · FERNANDO</b><span>${currentGreeting()}, Fernando. A operação está estável, com duas decisões em foco.</span></div><div class="top-actions"><label for="view-select">Ir para</label><select class="control-select" id="view-select"><option value="visao">Visão consolidada</option><option value="operacao">Operação ao vivo</option><option value="capacidade">Rede e capacidade</option><option value="operadoras">Operadoras</option><option value="financeiro">Financeiro</option><option value="inteligencia">Simulador</option></select><span class="status-chip">Demonstração ativa</span><span class="time-chip">30 DIAS · ${clock.date} · <b id="clock">${clock.time}</b></span><div class="avatar" aria-label="Fernando">FR</div></div></header><div class="content">
    <section class="executive-hero" id="visao"><div class="hero-copy"><span class="eyebrow">CENTRAL EXECUTIVA · FERNANDO</span><h1>Decisões antes dos desvios.</h1><p>Uma visão viva da operação para enxergar riscos, capturar oportunidades e acelerar o crescimento da Cross.</p></div><aside class="hero-focus"><span>Prioridade executiva agora</span><strong>Redistribuir imagem em duas regiões.</strong><small>Impacto potencial demonstrativo: ${money(DEMO.opportunity)} · decisão recomendada hoje</small></aside></section>
    <section class="kpi-strip" aria-label="Indicadores executivos">
      ${kpiCard("Exames hoje",number(DEMO.examsToday),"↑ 12,0%","positive","vs. média diária","Demanda acima do plano, sem perda relevante de SLA.","Solicitações demonstrativas registradas no dia simulado.")}
      ${kpiCard("Exames em 30 dias",number(DEMO.examsMonth),"↑ 6,4%","positive","vs. período anterior","Volume distribuído entre quatro grupos de operadoras fictícias.","Soma dos volumes demonstrativos atribuídos às operadoras, regiões e prestadores.")}
      ${kpiCard("Receita projetada",money(DEMO.projectedRevenue),"↑ 7,4%","positive","vs. plano","Projeção calculada por volume e ticket de cada operadora.","Soma demonstrativa de exames multiplicados pelo ticket médio de cada operadora.")}
      ${kpiCard("Economia gerada",money(DEMO.economy),"↑ 14,2%","positive","vs. período anterior","Estimativa conceitual de desperdício evitado para a rede.","Valor fictício atribuído a otimização, redistribuição e uso de capacidade.")}
      ${kpiCard("Margem operacional",pct(marginRate),"→ 0,3 pt","neutral","vs. plano","Margem estável; imagem concentra a principal oportunidade.","Resultado projetado dividido pela receita projetada demonstrativa.")}
      ${kpiCard("SLA no prazo",pct(DEMO.sla),"↑ 1,3 pt","positive","vs. período anterior","Dentro da meta, com concentração de risco regional.","Percentual demonstrativo de solicitações concluídas dentro do prazo acordado.")}
      ${kpiCard("Capacidade utilizada",pct(capacityUsed),"↑ 3,1 pt","negative","vs. período anterior","Sudeste e Nordeste exigem redistribuição preventiva.","Volume de 30 dias dividido pela capacidade demonstrativa total da rede.")}
      ${kpiCard("Solicitações críticas",number(DEMO.critical),"↓ 4","positive","desde a manhã","Casos ativos fora do SLA, concentrados em duas regiões.","Quantidade fictícia de solicitações abertas e fora do SLA neste momento simulado.")}
    </section>

    <section class="section" id="resumo"><div class="section-heading"><div><span class="section-code">01 · Leitura executiva</span><h2>O que Fernando precisa saber agora</h2></div><p>Uma síntese demonstrativa transforma sinais dispersos em contexto, consequência e decisão.</p></div><div class="panel briefing"><div class="brief-summary"><span class="tag demo">Insight demonstrativo gerado para apresentação</span><h3>A operação cresceu acima do planejado, mantendo o SLA estável.</h3><p>A capacidade de imagem em duas regiões se aproxima do limite, mas três prestadores possuem janelas ociosas suficientes para absorver a demanda. A redistribuição simulada representa uma oportunidade estimada de margem e redução de prazo.</p><small>Leitura baseada exclusivamente nos dados fictícios desta página.</small></div><div class="brief-grid"><article class="brief-item"><span>O que melhorou</span><strong>Volume +6,4% com SLA em ${pct(DEMO.sla)}</strong><p>O crescimento foi absorvido sem deterioração relevante da qualidade operacional.</p></article><article class="brief-item"><span>O que exige atenção</span><strong>Imagem em 89% no Sudeste</strong><p>A concentração regional antecipa risco de prazo antes que o SLA se deteriore.</p></article><article class="brief-item"><span>O que pode gerar valor</span><strong>${money(DEMO.opportunity)} de impacto potencial</strong><p>Capacidade ociosa em três prestadores pode receber parte da demanda concentrada.</p></article><article class="brief-item"><span>Decisão sugerida</span><strong>Redistribuir 40% do pico de imagem</strong><p>Executar cenário piloto, acompanhar aceite e revisar o impacto em 48 horas.</p></article></div></div></section>

    <section class="section" id="valor"><div class="section-heading"><div><span class="section-code">02 · Mapa de valor</span><h2>A Cross como camada inteligente do ecossistema</h2></div><p>Não apenas intermediar: orquestrar capacidade, prazo, qualidade e resultado.</p></div><div class="value-map"><div class="value-node"><b>01</b><strong>Demanda</strong><span>${number(DEMO.examsMonth)} exames conectados</span></div><div class="value-arrow">→</div><div class="value-node"><b>02</b><strong>Orquestração Cross</strong><span>Regras, contexto e melhor destino</span></div><div class="value-arrow">→</div><div class="value-node"><b>03</b><strong>Rede de prestadores</strong><span>${number(DEMO.capacityTotal)} exames de capacidade</span></div><div class="value-arrow">→</div><div class="value-node"><b>04</b><strong>Exame realizado</strong><span>Prazo, aceite e qualidade acompanhados</span></div><div class="value-arrow">→</div><div class="value-node"><b>05</b><strong>Valor gerado</strong><span>Economia, receita e margem</span></div><div class="value-outcomes"><div><small>Capacidade aproveitada</small><strong>${pct(capacityUsed)}</strong><em>visão demonstrativa</em></div><div><small>Prazo médio</small><strong>${decimal(DEMO.avgDeadline)} dias</strong><em>−0,6 dia vs. base</em></div><div><small>Economia para a rede</small><strong>${money(DEMO.economy)}</strong><em>estimativa fictícia</em></div><div><small>Resultado projetado Cross</small><strong>${money(DEMO.projectedResult)}</strong><em>${pct(marginRate)} de margem</em></div></div></div></section>

    <section class="section" id="operacao"><div class="section-heading"><div><span class="section-code">03 · Operação em movimento</span><h2>O que está acontecendo agora</h2></div><p>Fluxo e demanda horária simulados · atualização visual discreta · sem dados de pacientes.</p></div><div class="live-layout"><article class="panel"><div class="flow-stats"><div class="flow-stat"><span>Solicitados</span><strong>${DEMO.requested}</strong></div><div class="flow-stat"><span>Encaminhados</span><strong>${DEMO.routed}</strong></div><div class="flow-stat"><span>Aceitos</span><strong>${DEMO.accepted}</strong></div><div class="flow-stat"><span>Concluídos</span><strong>${DEMO.completed}</strong></div></div><div class="panel-head"><div><h3>Exames solicitados por hora</h3><p>A soma das faixas corresponde aos ${DEMO.examsToday} exames de hoje</p></div><span class="tag demo">dados fictícios</span></div>${lineChart(DEMO.hourly)}</article><article class="panel live-side"><div class="queue-box"><span>Fila ativa demonstrativa</span><div class="queue-main"><strong>${DEMO.queue}</strong><div><b>${DEMO.nearSla}</b><small>próximas do SLA</small><b>${DEMO.critical}</b><small>fora do SLA</small></div></div></div><div class="mini-bars"><span class="section-code">Distribuição por tipo</span>${DEMO.examTypes.map(item=>`<div class="mini-row"><div><span>${item.name}</span><b>${pct(item.value/DEMO.examsMonth*100)}</b></div><span class="bar-track"><i style="width:${item.value/DEMO.examsMonth*100}%"></i></span></div>`).join("")}</div></article></div></section>

    <section class="section" id="capacidade"><div class="section-heading"><div><span class="section-code">04 · Rede e capacidade</span><h2>Onde o risco pode surgir — e para onde mover a demanda</h2></div><p>Capacidade fictícia mensal comparada ao volume demonstrativo dos últimos 30 dias.</p></div><div class="capacity-layout"><article class="capacity-total"><span>Capacidade total da rede</span><div class="capacity-number"><strong>${number(DEMO.capacityTotal)}</strong><small>exames / 30 dias</small></div><div class="capacity-ring-row"><div class="capacity-ring" style="--value:${capacityUsed}"><div><b>${pct(capacityUsed)}</b><span>utilizada</span></div></div><div class="capacity-legend"><div><small>Capacidade utilizada</small><b>${number(DEMO.examsMonth)}</b></div><div><small>Capacidade ociosa</small><b>${number(DEMO.capacityTotal-DEMO.examsMonth)}</b></div><div><small>Prestadores com janela</small><b>3 demonstrativos</b></div></div></div></article><article class="panel"><div class="panel-head"><div><h3>Utilização por região</h3><p>O alerta nasce antes da saturação</p></div><span class="tag attention">2 regiões em foco</span></div><div class="region-table">${regionRows()}</div></article></div><div class="scenario"><div class="scenario-col"><span class="tag critical">Situação atual</span><h3>Demanda concentrada em imagem</h3><div class="scenario-metrics"><div><span>Pico regional</span><b>89,3%</b></div><div><span>Prazo médio</span><b>3,8 dias</b></div><div><span>Impacto em risco</span><b>${money(92000)}</b></div></div><p class="scenario-note">Sudeste recebe demanda acima do ritmo planejado enquanto prestadores em três regiões mantêm capacidade disponível.</p></div><div class="scenario-arrow">→</div><div class="scenario-col"><span class="tag good">Com ação sugerida</span><h3>40% do pico redistribuído</h3><div class="scenario-metrics"><div><span>Pico regional</span><b>81,4%</b></div><div><span>Prazo médio</span><b>2,2 dias</b></div><div><span>Impacto potencial</span><b>${money(DEMO.opportunity)}</b></div></div><p class="scenario-note">Cenário conceitual: mais equilíbrio de rede, redução de prazo e proteção da margem sem ampliar a estrutura fixa.</p></div></div></section>

    <section class="section" id="operadoras"><div class="section-heading"><div><span class="section-code">05 · Operadoras e resultado</span><h2>Quem move receita, margem e risco</h2></div><div class="data-tools"><span class="tag demo">nomes fictícios</span><select class="control-select" id="operator-filter" aria-label="Selecionar operadora"><option value="all">Todas as operadoras</option>${DEMO.operators.map(item=>`<option value="${item.id}">${item.name}</option>`).join("")}</select></div></div><article class="panel"><div class="operator-overview" id="operator-overview"></div><div class="operator-layout"><div class="table-scroll"><table class="data-table"><thead><tr><th>Operadora</th><th>Volume</th><th>Ticket</th><th>Receita</th><th>SLA</th><th>Margem</th><th>Tendência</th><th>Leitura</th></tr></thead><tbody>${operatorRows()}</tbody></table></div><aside class="share-chart"><span class="section-code">Participação no volume</span><div class="donut"></div><div class="legend-list">${DEMO.operators.map((operator,index)=>`<div><i></i><span>${operator.name}</span><b>${Math.round(operator.volume/DEMO.examsMonth*100)}%</b></div>`).join("")}</div></aside></div></article></section>

    <section class="section" id="prestadores"><div class="section-heading"><div><span class="section-code">06 · Prestadores e eficiência</span><h2>Contexto antes de qualquer julgamento</h2></div><p>Ranking fictício para orientar redistribuição; desempenho deve sempre ser lido junto de capacidade, prazo e especialidade.</p></div><article class="panel"><div class="provider-highlights"><div class="provider-highlight"><span>Melhor equilíbrio</span><strong>Núcleo Atlas</strong><small>Qualidade, aceite e margem</small></div><div class="provider-highlight"><span>Maior capacidade ociosa</span><strong>Rede Prisma</strong><small>42% de janela disponível</small></div><div class="provider-highlight"><span>Risco de saturação</span><strong>Imagem Vale</strong><small>94% da capacidade utilizada</small></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Prestador</th><th>Volume</th><th>Aceite</th><th>Capacidade</th><th>Resposta</th><th>SLA</th><th>Qualidade</th><th>Margem</th><th>Situação</th><th>Contexto</th></tr></thead><tbody>${providerRows()}</tbody></table></div></article></section>

    <section class="section" id="financeiro"><div class="section-heading"><div><span class="section-code">07 · Financeiro executivo</span><h2>Do volume movimentado ao resultado projetado</h2></div><p>Todos os valores são demonstrativos e fecham matematicamente na ponte financeira.</p></div><div class="finance-layout"><article class="panel finance-kpis"><div class="finance-kpi"><span>Receita realizada</span><strong>${money(DEMO.realizedRevenue)}</strong><small>86,0% da projeção</small></div><div class="finance-kpi"><span>Receita projetada</span><strong>${money(DEMO.projectedRevenue)}</strong><small>soma por operadora</small></div><div class="finance-kpi"><span>Custo estimado</span><strong>${money(DEMO.operationalCosts)}</strong><small>70,0% da receita</small></div><div class="finance-kpi"><span>Ticket médio</span><strong>${money(DEMO.avgTicket)}</strong><small>receita ÷ exames</small></div><div class="finance-kpi"><span>Economia gerada</span><strong>${money(DEMO.economy)}</strong><small>valor para a rede</small></div><div class="finance-kpi"><span>Oportunidade</span><strong>${money(DEMO.opportunity)}</strong><small>cenário redistribuído</small></div></article><article class="panel bridge"><span class="section-code">Ponte do resultado</span><div class="bridge-row"><span>Receita bruta projetada</span><div class="bridge-bar"><i style="width:100%"></i></div><b>${money(DEMO.projectedRevenue)}</b></div><div class="bridge-row minus"><span>− Custos da operação</span><div class="bridge-bar"><i style="width:${DEMO.operationalCosts/DEMO.projectedRevenue*100}%"></i></div><b>− ${money(DEMO.operationalCosts)}</b></div><div class="bridge-row minus"><span>− Perdas e ineficiências</span><div class="bridge-bar"><i style="width:${DEMO.losses/DEMO.projectedRevenue*100}%"></i></div><b>− ${money(DEMO.losses)}</b></div><div class="bridge-row plus"><span>+ Oportunidade capturável</span><div class="bridge-bar"><i style="width:${DEMO.opportunity/DEMO.projectedRevenue*100}%"></i></div><b>+ ${money(DEMO.opportunity)}</b></div><div class="bridge-row result"><span>= Resultado com ação</span><div class="bridge-bar"><i style="width:${(DEMO.projectedResult+DEMO.opportunity)/DEMO.projectedRevenue*100}%"></i></div><b>${money(DEMO.projectedResult+DEMO.opportunity)}</b></div></article></div></section>

    <section class="section" id="alertas"><div class="section-heading"><div><span class="section-code">08 · Alertas que geram ação</span><h2>Evidência, impacto e próximo passo</h2></div><p>Alertas fictícios organizados pela consequência executiva, não pela cor.</p></div><div class="alert-list"><article class="action-alert"><span class="alert-level">Oportunidade</span><h3>${money(DEMO.opportunity)} de impacto potencial</h3><p>Redistribuição de exames para prestadores com capacidade ociosa.</p><div class="alert-facts"><div><span>Evidência</span><b>3 prestadores abaixo de 68%</b></div><div><span>Impacto</span><b>Margem + prazo</b></div><div><span>Ação</span><b>Piloto de redistribuição</b></div><div><span>Prazo</span><b>Hoje · 18h</b></div><div><span>Responsável</span><b>Diretoria de Operações</b></div></div><button class="explore-btn" data-alert="opportunity" type="button">Explorar cenário</button></article><article class="action-alert"><span class="alert-level">Atenção</span><h3>Capacidade próxima do limite</h3><p>No ritmo demonstrado, imagem no Sudeste pressiona o limite planejado.</p><div class="alert-facts"><div><span>Evidência</span><b>89,3% de utilização</b></div><div><span>Impacto</span><b>+0,8 dia de prazo</b></div><div><span>Ação</span><b>Abrir janela adicional</b></div><div><span>Prazo</span><b>Próximas 48h</b></div><div><span>Responsável</span><b>Gestão da Rede</b></div></div><button class="explore-btn" data-alert="capacity" type="button">Explorar cenário</button></article><article class="action-alert"><span class="alert-level">Crítico</span><h3>${DEMO.critical} solicitações fora do SLA</h3><p>Concentração em duas regiões pede intervenção operacional.</p><div class="alert-facts"><div><span>Evidência</span><b>12 casos ativos</b></div><div><span>Impacto</span><b>${money(54250)} em risco</b></div><div><span>Ação</span><b>Força-tarefa regional</b></div><div><span>Prazo</span><b>Imediato</b></div><div><span>Responsável</span><b>Qualidade + Operações</b></div></div><button class="explore-btn" data-alert="critical" type="button">Explorar cenário</button></article></div></section>

    <section class="section" id="inteligencia"><div class="section-heading"><div><span class="section-code">09 · Simulador de decisão</span><h2>E se a Cross agir agora?</h2></div><p>Simulação conceitual com dados demonstrativos. Os controles não representam uma previsão real.</p></div><div class="simulator"><div class="sim-controls"><span class="tag demo">Simulação conceitual</span><h3>Configure o cenário</h3><p>A combinação padrão reproduz a oportunidade demonstrativa de ${money(DEMO.opportunity)}.</p>
      <div class="slider-row"><div class="slider-label"><span>Demanda redistribuída</span><b id="redistribution-value">40%</b></div><input id="redistribution" type="range" min="0" max="60" value="40" step="5"></div>
      <div class="slider-row"><div class="slider-label"><span>Capacidade adicional</span><b id="added-capacity-value">+10%</b></div><input id="added-capacity" type="range" min="0" max="25" value="10" step="1"></div>
      <div class="slider-row"><div class="slider-label"><span>Redução de prazo alvo</span><b id="deadline-value">−1,2 dia</b></div><input id="deadline" type="range" min="0" max="20" value="12" step="1"></div>
      <div class="slider-row"><div class="slider-label"><span>Participação de prestadores</span><b id="participation-value">70%</b></div><input id="participation" type="range" min="50" max="100" value="70" step="5"></div>
      <div class="slider-row"><div class="slider-label"><span>Variação de volume</span><b id="volume-value">+10%</b></div><input id="volume" type="range" min="-10" max="30" value="10" step="5"></div>
    </div><div class="sim-results"><div class="sim-result-grid"><div class="sim-result"><span>SLA estimado</span><strong id="sim-sla">—</strong><small id="sim-sla-delta">—</small></div><div class="sim-result"><span>Capacidade utilizada</span><strong id="sim-capacity">—</strong><small id="sim-capacity-delta">—</small></div><div class="sim-result"><span>Prazo médio</span><strong id="sim-deadline">—</strong><small id="sim-deadline-delta">—</small></div><div class="sim-result"><span>Receita projetada</span><strong id="sim-revenue">—</strong><small>volume ajustado</small></div><div class="sim-result"><span>Resultado projetado</span><strong id="sim-margin">—</strong><small id="sim-margin-rate">—</small></div><div class="sim-result"><span>Economia estimada</span><strong id="sim-economy">—</strong><small>efeito demonstrativo</small></div></div><div class="impact-total"><div><span>Impacto financeiro potencial</span><strong id="sim-impact">—</strong></div><p>O cálculo combina redistribuição, capacidade, prazo, participação e volume. Serve para demonstrar raciocínio, não prometer resultado.</p></div></div></div></section>

    <section class="section" id="prioridades"><div class="section-heading"><div><span class="section-code">10 · Linha executiva</span><h2>Próximas decisões</h2></div><p>Uma lista curta para transformar visibilidade em cadência de execução.</p></div><div class="priority-list"><div class="priority"><span class="priority-no">01</span><strong>Atuar nas 12 solicitações críticas</strong><span>Impacto: proteger SLA e ${money(54250)}</span><span>Qualidade + Operações</span><span class="state critical">Agora</span></div><div class="priority"><span class="priority-no">02</span><strong>Redistribuir demanda em duas regiões</strong><span>Impacto: ${money(DEMO.opportunity)} potencial</span><span>Diretoria de Operações</span><span class="state attention">Hoje</span></div><div class="priority"><span class="priority-no">03</span><strong>Liberar capacidade adicional em imagem</strong><span>Impacto: reduzir pico a 81,4%</span><span>Gestão da Rede</span><span class="state attention">48 horas</span></div><div class="priority"><span class="priority-no">04</span><strong>Revisar grupo de prestadores em atenção</strong><span>Impacto: aceite e tempo de resposta</span><span>Relacionamento</span><span class="state good">Esta semana</span></div><div class="priority"><span class="priority-no">05</span><strong>Validar o caso financeiro do piloto</strong><span>Impacto: capturar margem incremental</span><span>Financeiro</span><span class="state good">Planejado</span></div></div></section>

    <section class="section"><div class="roadmap"><div class="roadmap-copy"><span class="section-code">Da visibilidade à inteligência</span><h2>A Cross já produz os sinais.</h2><p>A próxima evolução é transformá-los em decisões — com dados reais, alertas confiáveis e inteligência operacional contínua.</p></div><div class="roadmap-steps"><div class="roadmap-step"><b>01 · HOJE</b><strong>Visão executiva</strong><span>Protótipo demonstrativo integrado.</span></div><div class="roadmap-step"><b>02 · PRÓXIMA ETAPA</b><strong>Dados reais</strong><span>Integração segura e governada.</span></div><div class="roadmap-step"><b>03 · DEPOIS</b><strong>Alertas automáticos</strong><span>Sinais com contexto e responsáveis.</span></div><div class="roadmap-step"><b>04 · EVOLUÇÃO</b><strong>Previsões</strong><span>Cenários calibrados pela operação.</span></div><div class="roadmap-step"><b>05 · FUTURO</b><strong>Inteligência contínua</strong><span>Decisões antes dos desvios.</span></div></div></div><div class="signature">Concepção e desenvolvimento: Matheus Libonatti.</div></section>
  </div></main></div><div class="modal" id="scenario-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><article class="modal-card"><div class="modal-head"><div><span class="section-code" id="modal-level">Cenário demonstrativo</span><h3 id="modal-title">Explorar cenário</h3></div><button class="modal-close" id="modal-close" type="button" aria-label="Fechar">×</button></div><div class="modal-body" id="modal-body"></div></article></div>`;
}

function renderOperatorSnapshot(id="all"){
  const target=document.querySelector("#operator-overview");
  if(!target) return;
  const selected=DEMO.operators.find(item=>item.id===id);
  const view=selected || {
    name:"Visão consolidada", volume:DEMO.examsMonth, ticket:DEMO.avgTicket,
    revenue:DEMO.projectedRevenue, sla:DEMO.sla, margin:marginRate,
    context:"Todas as operadoras demonstrativas combinadas."
  };
  target.innerHTML=`<div class="operator-kpi"><small>Escopo selecionado</small><strong>${view.name}</strong></div><div class="operator-kpi"><small>Volume</small><strong>${number(view.volume)}</strong></div><div class="operator-kpi"><small>Receita</small><strong>${money(view.revenue)}</strong></div><div class="operator-kpi"><small>SLA · margem</small><strong>${pct(view.sla)} · ${pct(view.margin)}</strong></div>`;
  document.querySelectorAll("[data-operator-row]").forEach(row=>row.classList.toggle("selected",selected && row.dataset.operatorRow===selected.id));
}

function updateSimulator(){
  const redistribution=Number(document.querySelector("#redistribution").value);
  const addedCapacity=Number(document.querySelector("#added-capacity").value);
  const deadline=Number(document.querySelector("#deadline").value)/10;
  const participation=Number(document.querySelector("#participation").value);
  const volume=Number(document.querySelector("#volume").value);
  const impact=redistribution*1800 + addedCapacity*2600 + (deadline*10)*1500 + (participation-50)*700 + volume*1800;
  const nextVolume=DEMO.examsMonth*(1+volume/100);
  const nextCapacity=DEMO.capacityTotal*(1+addedCapacity/100);
  const nextCapacityRate=nextVolume/nextCapacity*100;
  const nextSla=Math.min(99.4,Math.max(90,DEMO.sla+redistribution*.025+addedCapacity*.02+deadline*.35+(participation-50)*.01-volume*.02));
  const nextDeadline=Math.max(1.1,DEMO.avgDeadline-deadline-redistribution*.01-(participation-50)*.005+Math.max(volume,0)*.01);
  const nextRevenue=DEMO.projectedRevenue*(1+volume/100);
  const nextResult=DEMO.projectedResult+impact;
  const nextEconomy=DEMO.economy+impact*.55;
  const values={
    "redistribution-value":`${redistribution}%`, "added-capacity-value":`+${addedCapacity}%`,
    "deadline-value":`−${decimal(deadline)} dia`, "participation-value":`${participation}%`,
    "volume-value":`${volume>=0?"+":""}${volume}%`, "sim-sla":pct(nextSla),
    "sim-sla-delta":`${nextSla>=DEMO.sla?"+":""}${decimal(nextSla-DEMO.sla)} pt vs. base`,
    "sim-capacity":pct(nextCapacityRate), "sim-capacity-delta":`${decimal(nextCapacityRate-capacityUsed)} pt vs. base`,
    "sim-deadline":`${decimal(nextDeadline)} dias`, "sim-deadline-delta":`−${decimal(DEMO.avgDeadline-nextDeadline)} dia vs. base`,
    "sim-revenue":money(nextRevenue), "sim-margin":money(nextResult), "sim-margin-rate":`${pct(nextResult/nextRevenue*100)} sobre receita`,
    "sim-economy":money(nextEconomy), "sim-impact":money(impact)
  };
  Object.entries(values).forEach(([id,value])=>{const node=document.getElementById(id);if(node)node.textContent=value});
}

const scenarios={
  opportunity:{level:"Oportunidade demonstrativa",title:"Redistribuir capacidade antes de contratar estrutura",text:"O cenário combina a demanda de imagem concentrada com a disponibilidade fictícia de MedNuclear Sul, Rede Prisma e Centro Diagnóstico Aurora.",facts:[["Demanda redistribuída","40% do pico"],["Prazo estimado","3,8 → 2,2 dias"],["Pico regional","89,3% → 81,4%"],["Impacto potencial",money(DEMO.opportunity)]],action:"Recomendação conceitual: aprovar piloto de 48 horas com regra de aceite e acompanhamento de qualidade."},
  capacity:{level:"Atenção demonstrativa",title:"Abrir janela antes da saturação",text:"A tendência fictícia indica que o Sudeste pode superar o limite confortável se mantiver o ritmo sem redistribuição.",facts:[["Utilização atual","89,3%"],["Limite preventivo","90,0%"],["Folga em outras regiões",number(1308)+" exames"],["Horizonte de ação","48 horas"]],action:"Recomendação conceitual: reservar capacidade de contingência e revisar o ritmo a cada turno."},
  critical:{level:"Crítico demonstrativo",title:"Proteger SLA e valor em risco",text:"Doze solicitações fictícias estão fora do SLA e dezoito se aproximam do limite, sem qualquer identificação de paciente.",facts:[["Fora do SLA","12 solicitações"],["Próximas do limite","18 solicitações"],["Regiões concentradas","2"],["Valor em risco",money(DEMO.losses)]],action:"Recomendação conceitual: criar força-tarefa com Operações e Qualidade e revisar o quadro em duas horas."}
};

function openScenario(key){
  const scenario=scenarios[key]; if(!scenario) return;
  document.querySelector("#modal-level").textContent=scenario.level;
  document.querySelector("#modal-title").textContent=scenario.title;
  document.querySelector("#modal-body").innerHTML=`<p>${scenario.text}</p><div class="modal-scenario">${scenario.facts.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div><p><b>${scenario.action}</b></p><button class="primary-btn" type="button" data-jump-simulator>Levar ao simulador →</button>`;
  document.querySelector("#scenario-modal").classList.add("open");
  document.body.classList.add("modal-open");
}

function closeScenario(){
  document.querySelector("#scenario-modal")?.classList.remove("open");
  document.body.classList.remove("modal-open");
}

function bindInteractions(){
  const access=document.querySelector("#access-screen");
  document.querySelector("#enter-dashboard").addEventListener("click",()=>{access.classList.add("leaving");setTimeout(()=>access.remove(),560)});
  document.querySelector("#mobile-menu").addEventListener("click",()=>document.querySelector("#sidebar").classList.toggle("open"));
  document.querySelectorAll(".side-nav a").forEach(link=>link.addEventListener("click",()=>document.querySelector("#sidebar").classList.remove("open")));
  document.querySelector("#view-select").addEventListener("change",event=>document.getElementById(event.target.value)?.scrollIntoView({behavior:"smooth",block:"start"}));
  const operatorFilter=document.querySelector("#operator-filter");
  operatorFilter.addEventListener("change",event=>renderOperatorSnapshot(event.target.value));
  document.querySelectorAll("[data-operator-row]").forEach(row=>row.addEventListener("click",()=>{operatorFilter.value=row.dataset.operatorRow;renderOperatorSnapshot(row.dataset.operatorRow)}));
  document.querySelectorAll(".sim-controls input").forEach(input=>input.addEventListener("input",updateSimulator));
  document.querySelectorAll(".explore-btn").forEach(button=>button.addEventListener("click",()=>openScenario(button.dataset.alert)));
  document.querySelector("#modal-close").addEventListener("click",closeScenario);
  document.querySelector("#scenario-modal").addEventListener("click",event=>{if(event.target.id==="scenario-modal")closeScenario();if(event.target.matches("[data-jump-simulator]")){closeScenario();document.querySelector("#inteligencia").scrollIntoView({behavior:"smooth"})}});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeScenario()});
  const tooltip=document.querySelector("#chart-tooltip");
  document.querySelectorAll(".point").forEach(point=>{
    const show=()=>{const svg=point.closest("svg");const wrap=svg.parentElement;const svgRect=svg.getBoundingClientRect();const wrapRect=wrap.getBoundingClientRect();const x=Number(point.getAttribute("cx"))/760*svgRect.width+svgRect.left-wrapRect.left;const y=Number(point.getAttribute("cy"))/220*svgRect.height+svgRect.top-wrapRect.top;tooltip.style.left=`${x}px`;tooltip.style.top=`${y}px`;tooltip.textContent=`${point.dataset.hour} · ${point.dataset.value} exames demonstrativos`;tooltip.style.display="block"};
    point.addEventListener("mouseenter",show);point.addEventListener("focus",show);point.addEventListener("mouseleave",()=>tooltip.style.display="none");point.addEventListener("blur",()=>tooltip.style.display="none");
  });
  if("IntersectionObserver" in window){
    const navLinks=[...document.querySelectorAll(".side-nav a")];
    const observer=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;navLinks.forEach(link=>link.classList.toggle("active",link.getAttribute("href")===`#${visible.target.id}`))},{rootMargin:"-20% 0px -65% 0px",threshold:[0,.1,.4]});
    navLinks.forEach(link=>{const section=document.querySelector(link.getAttribute("href"));if(section)observer.observe(section)});
  }
  renderOperatorSnapshot(); updateSimulator();
  setInterval(()=>{const clock=dateTime();const node=document.querySelector("#clock");if(node)node.textContent=clock.time;const side=document.querySelector("#side-update");if(side)side.textContent=`Atualizado às ${clock.time} · horário simulado`},30000);
}

function start(){
  assertCoherence();
  document.body.innerHTML=accessTemplate()+appTemplate();
  document.querySelector("#resumo").insertAdjacentHTML("beforebegin",journeyTemplate());
  document.querySelector('.side-nav a[href="#operacao"]').insertAdjacentHTML("beforebegin",'<a href="#jornada"><span>Jornada do paciente</span></a>');
  document.querySelector('#view-select option[value="operacao"]').insertAdjacentHTML("beforebegin",'<option value="jornada">Jornada do paciente</option>');
  bindInteractions();
}

start();
