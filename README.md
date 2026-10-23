# Apuração 2026

Painel estático do **segundo turno para presidente** (25/10/2026, a partir das 17h de Brasília). Os números vêm só dos JSON oficiais do TSE, eleição **6258**. Nada é estimado: se a fonte falhar, a tela avisa e mantém a última leitura desta eleição.

Enquanto o arquivo do 2º turno estiver em 0% de urnas, ou ainda não puder ser lido, o mapa, os candidatos, as regiões e o gráfico ficam em espera. A tela mostra o horário `dg` e `hg` do TSE e não coloca percentual do 1º turno no lugar do resultado. O card **Variação vs 1º turno** continua usando `data/primeiro-turno.json` e, antes da apuração, avisa que está aguardando.

No topo, **2º turno** é a aba inicial. **1º turno** (também em `#1turno`) mostra o mapa e os cards com os arquivos oficiais da eleição 6257 e, embaixo, o gráfico nacional feito com `data/primeiro-turno-parciais.json`, a captura ArvorCo/PNAD. A consulta de 60 segundos continua no 2º turno.

No 1º turno, escolher **Rio de Janeiro** ou **São Paulo** troca o mapa do Brasil por um mapa de ruas (Leaflet e tiles do OpenStreetMap) com um ponto por local de votação. A cor segue a mesma regra do mapa dos estados e o tamanho segue os votos válidos. Os arquivos são `data/locais/rj-1t.json` e `data/locais/sp-1t.json`: soma dos boletins de urna do pleito 3220 com as coordenadas de `eleitorado_local_votacao_2026` (`NR_TURNO=1`). Seção agregada não tem boletim próprio. Local sem coordenada fica fora do mapa, e a nota diz quantos. Os outros estados continuam no mapa do Brasil. `tools/crawl.py` só aceita RJ e SP.

## Voltar ao modo de teste

O 1º turno fica só para conferência. Edite `js/config.js`:

```js
window.APURACAO = {
  code: "6257",
  selection: "top2",
  // o restante permanece
};
```

Os códigos saem de [`ele-c.json`](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json):

| Código | O que é | Data |
| --- | --- | --- |
| 6257 | Eleição Ordinária Federal, 1º turno (`cdt2` = 6258) | 04/10/2026 |
| 6258 | Eleição Ordinária Federal, 2º turno | 25/10/2026 |

`selection: "runoff"` prefere quem está com situação de 2º turno. No arquivo do 2º turno já são só os dois candidatos. Com 0% de urnas a tela não exibe o voto nem o percentual deles.

## Endpoints

O ciclo 2026 não publica mais a pasta `dados-simplificados` (esse caminho responde 404). O arquivo usado pela divulgação, documentado pelo TSE como resultado unificado (EA20), é o `-u.json`:

```
https://resultados.tse.jus.br/oficial/ele2026/{eleicao}/dados/{uf}/{uf}-c0001-e{eleicao com 6 dígitos}-u.json
```

Exemplos do 1º turno:

- Brasil: https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json
- São Paulo: https://resultados.tse.jus.br/oficial/ele2026/6257/dados/sp/sp-c0001-e006257-u.json

2º turno:

- https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json

Fotos oficiais: `.../ele2026/{eleicao}/fotos/br/{sqcand}.jpeg`.

O diretório está no `ele-c.json`, tipo `u`: `<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>`.

### Campos lidos

| Na tela | Campo |
| --- | --- |
| Percentual do candidato | `pvap` (votos válidos), votos em `vap` |
| Urnas apuradas | `s.pst` (seções totalizadas `s.st` de `s.ts`) |
| Brancos | `v.vb` e `v.pvb` |
| Nulos | `v.tvn` e `v.ptvn` (total de nulos) |
| Abstenção | `e.a` e `e.pa` |
| Horário do TSE | `dg` e `hg`, horário de Brasília |

O card **Por região** soma o `vap` de cada candidato nas UFs da região e divide pela soma de `v.vv` (votos válidos) dessas UFs. O percentual de urnas é a soma de `s.st` dividida pela soma de `s.ts`. Não é média de percentuais. O Exterior (ZZ) fica de fora. O TSE não publica esse recorte.

O card **Variação vs 1º turno** compara o percentual do 2º turno com o 1º turno na mesma % de urnas apuradas. No Brasil, o `pst` é o do arquivo nacional. Num estado, a conta é a da região (Norte, Nordeste, Centro-Oeste, Sudeste ou Sul): urnas são a soma de `s.st` sobre a soma de `s.ts`, e o percentual é a soma dos votos sobre a soma de `v.vv`. O ponto do 1º turno é o de `pst` mais próximo. A diferença é o percentual do 2º turno menos o daquele ponto, em pontos percentuais. Em 100% das urnas, isso coincide com o final contra o final.

As parciais do 1º turno estão em `data/primeiro-turno-parciais.json` (só `pst`, percentual do Flávio e percentual do Lula, em centésimos). Saem de uma captura de terceiros dos arquivos oficiais do TSE, feita pela ArvorCo/PNAD: versões do arquivo do Brasil e, por região, a soma minuto a minuto das UFs, sem o Exterior. O percentual é votos do candidato divididos pelos votos válidos. O fim da série bate com `data/primeiro-turno.json`. A ordem em que as urnas entram muda de um turno para o outro, então a comparação é uma aproximação. Com 0% de urnas o card não mostra número. `?simular=1` só testa essa conta, tratando um ponto do 1º turno perto de 50% como se fosse o 2º; sem o parâmetro, a página não simula.

A cor do estado é a diferença, em pontos percentuais, entre o `pvapn` desses dois candidatos:

- menos de 2: branco `#ffffff`
- de 2 a menos de 10: `#c44d4d` se Lula lidera, `#8787fb` se Flávio Bolsonaro lidera
- de 10 a menos de 20: `#bb0b0b` ou `#4040fb`
- 20 ou mais: `#800000` ou `#0303b5`
- sem arquivo ou `pst` igual a 0: neutro

## CORS

O host `resultados.tse.jus.br` devolve `Access-Control-Allow-Origin` com a origem do pedido (testado com `https://gabrielandr.github.io`). O navegador lê o JSON direto. A página consulta de novo a cada 60 segundos, guarda a última leitura em `localStorage` e, se o TSE não responder, mostra um aviso em vez de inventar número.

Não foi preciso espelhar os JSON. Se o TSE passar a bloquear CORS, o caminho gratuito é uma GitHub Action agendada que baixa esses mesmos arquivos para `data/` e o front passa a lê-los no próprio site.

## Mapa

`assets/brazil.svg` é gerado por `scripts/build-map.py` a partir do GeoJSON público [brazil-states](https://github.com/codeforamerica/click_that_hood) (malha por UF, simplificada). O mapa por município fica para depois. O Exterior (ZZ) não entra no desenho nem na lista do recorte. O dropdown no topo do card dos candidatos oferece Brasil e as 27 UFs pelo nome; escolher uma opção equivale a clicar no mapa, e o clique no mapa atualiza o dropdown. O total do Brasil continua vindo do arquivo nacional, que já inclui o Exterior. Um link `#/zz` ainda abre esse arquivo.

## Gráfico e histórico

Abaixo do mapa e dos cards, em largura cheia, o gráfico mostra a evolução do percentual de votos válidos (`pvap`) dos dois candidatos no Brasil, um ponto por atualização do TSE. O eixo horizontal é o `pst` (urnas apuradas). O tooltip e a tabela mostram também `dg` e `hg`. A variação desde o ponto anterior, em pontos percentuais, é calculada na tela a partir desses `pvap`; ela não é gravada. Antes da primeira urna apurada, o gráfico fica em espera e mostra o horário do arquivo do Brasil. Um link antigo `#/grafico` abre o Brasil.

Quem abre o site depois do início da apuração lê a série já publicada em `data/historico-{eleicao}.json`. O navegador acrescenta, só na memória, o ponto da leitura atual quando o `dg`+`hg` do Brasil é mais novo que o último ponto do arquivo. Não há ponto duplicado.

O workflow `.github/workflows/historico.yml` roda a cada 5 minutos (o GitHub pode atrasar) e também por disparo manual. Ele baixa o JSON oficial do Brasil da eleição de `js/config.js`. Se o horário `dg`+`hg` mudou, acrescenta um ponto com `dg`, `hg`, `pst` e, para cada candidato, `nome`, `pvap` e `vap`, grava na `main` e publica o Pages de novo. Um push feito pelo `GITHUB_TOKEN` não dispara o outro workflow, por isso este já faz o deploy. Enquanto o horário não muda, o workflow não cria commit.

Não existe série histórica oficial do 1º turno. `data/historico-6257.json` guarda o ponto congelado daquele teste e não entra na página enquanto a eleição configurada for a 6258. A série do 2º turno é `data/historico-6258.json`. O cron só grava um ponto quando o `pst` do Brasil é maior que zero e o `dg`+`hg` mudou. Enquanto as urnas estão em 0%, o workflow não cria commit.

```bash
node scripts/historico.test.mjs
node scripts/registrar-historico.mjs --dry-run
```

O teste usa uma sequência marcada como `EXEMPLO — não é série oficial` e não grava `data/`. O `--dry-run` só imprime o ponto real.

## Publicação

O workflow `.github/workflows/pages.yml` publica a branch `main` no GitHub Pages. O source tem de ser **GitHub Actions**. A URL do projeto é:

https://gabrielandr.github.io/apuracao-2026/

O token usado no push consegue gravar na `main`, mas não tem permissão de administração do repositório. Por isso a criação do site Pages responde `Resource not accessible by integration` e o workflow para no passo "Configurar o Pages" até alguém com acesso de admin fazer isto uma vez:

1. Abrir https://github.com/gabrielandr/apuracao-2026/settings/pages
2. Em **Build and deployment**, escolher **Source: GitHub Actions** e salvar.
3. Reexecutar o workflow em https://github.com/gabrielandr/apuracao-2026/actions

Com o site já existente, o workflow segue sozinho a cada push na `main`. O passo `enablement: true` tenta criar o site; sem a permissão `administration:write` essa criação falha, e passa a funcionar assim que o site existir.

## Conferência local

```bash
node scripts/verify.mjs
python3 -m http.server 8080
```

O script baixa o JSON oficial e confere se o parser devolve `pvap`, `vap`, `pst`, brancos, nulos, abstenção e o horário sem alterar o texto do TSE.
