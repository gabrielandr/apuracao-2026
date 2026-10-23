# Apuração 2026

Painel estático do **segundo turno para presidente** (25/10/2026, a partir das 17h de Brasília). Os números vêm só dos JSON oficiais do TSE. Nada é estimado: se a fonte falhar, a tela avisa e mantém a última leitura.

Neste momento o arquivo `js/config.js` aponta para o **1º turno (eleição 6257)**, para conferir com votos reais. O 1º turno teve vários candidatos; o modo `top2` mostra os dois mais votados no Brasil e usa esses mesmos dois em cada estado.

## Trocar para o 2º turno

Edite só `js/config.js`:

```js
window.APURACAO = {
  code: "6258",
  selection: "runoff",
  // o restante permanece
};
```

Os códigos saem de [`ele-c.json`](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json):

| Código | O que é | Data |
| --- | --- | --- |
| 6257 | Eleição Ordinária Federal, 1º turno (`cdt2` = 6258) | 04/10/2026 |
| 6258 | Eleição Ordinária Federal, 2º turno | 25/10/2026 |

`selection: "runoff"` prefere quem está com situação de 2º turno. No arquivo do 2º turno já são só os dois candidatos, e os dois aparecem mesmo com zero voto. Antes das 17h de 25/10/2026 esse arquivo oficial está em 0,00% de urnas apuradas; a tela mostra esse zero, não um número estimado.

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

A cor do estado é a diferença, em pontos percentuais, entre o `pvapn` desses dois candidatos:

- menos de 2: cinza gelo
- de 2 a menos de 10: tom claro (vermelho se Lula lidera, azul se Flávio Bolsonaro lidera)
- de 10 a menos de 20: tom médio
- 20 ou mais: tom forte
- sem arquivo ou `pst` igual a 0: neutro

## CORS

O host `resultados.tse.jus.br` devolve `Access-Control-Allow-Origin` com a origem do pedido (testado com `https://gabrielandr.github.io`). O navegador lê o JSON direto. A página consulta de novo a cada 60 segundos, guarda a última leitura em `localStorage` e, se o TSE não responder, mostra um aviso em vez de inventar número.

Não foi preciso espelhar os JSON. Se o TSE passar a bloquear CORS, o caminho gratuito é uma GitHub Action agendada que baixa esses mesmos arquivos para `data/` e o front passa a lê-los no próprio site.

## Mapa

`assets/brazil.svg` é gerado por `scripts/build-map.py` a partir do GeoJSON público [brazil-states](https://github.com/codeforamerica/click_that_hood) (malha por UF, simplificada). O mapa por município fica para depois. O Exterior (ZZ) não entra no desenho; está no seletor porque o total do Brasil inclui esses votos.

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
