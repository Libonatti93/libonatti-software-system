# LIOS v2 — Matheus Libonatti

Painel privado e orquestrador próprio da LIOS, sem n8n e sem dependências npm.

## O que existe

- autenticação por senha com hash `scrypt`;
- sessão privada `HttpOnly`, `SameSite=Strict` e expiração em oito horas;
- limitação de tentativas de login;
- proteção de origem e token CSRF nas operações de escrita;
- dashboard com dados reais de disponibilidade, latência e auditoria SEO;
- fluxos visuais com execução em código e atualização ao vivo por SSE;
- histórico persistente de até 500 execuções;
- segundo cérebro local com notas, tags e busca;
- cadastro visual de agentes, inicialmente inativos e com custo de IA zero.

## Configuração

Copie `.env.example` para um arquivo fora do Git e gere o hash:

```bash
npm run password -- 'uma-senha-forte-com-16-ou-mais-caracteres'
```

O serviço de produção usa `/data` como volume persistente e a porta `8091`.

## Docker

```bash
docker build -t matheus-libonatti-lios:v2 .
docker run -d \
  --name matheus-libonatti-lios-v2 \
  --network etranslink-internal \
  --restart unless-stopped \
  --env-file .env.production \
  -v matheus-libonatti-lios-data:/data \
  -p 127.0.0.1:8091:8091 \
  matheus-libonatti-lios:v2
```

O proxy Caddy também deve estar conectado à rede `etranslink-internal`.
O Caddy encaminha `painel.matheuslibonatti.tech` para essa porta. O subdomínio
também precisa de um registro DNS A para o mesmo IP de `matheuslibonatti.tech`.

## Dados

Os primeiros fluxos não simulam métricas:

- `site-health` consulta `/pt-br/`, `/es/` e `/en/`, medindo status, latência e bytes;
- `content-audit` lê o sitemap e verifica título, descrição, canonical, idioma
  e `h1` das páginas publicadas.

Novos coletores devem preservar fonte, horário, unidade, abrangência e erro.
