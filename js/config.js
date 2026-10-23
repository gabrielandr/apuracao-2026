/**
 * Único lugar para configurar a eleição.
 *
 * Códigos oficiais em
 * https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
 * (pleito 3220 em 04/10/2026 e pleito 3221 em 25/10/2026):
 *
 *   6257  1º turno federal   "Eleição Ordinária Federal - 2026 1º Turno"
 *         campo cdt2 = 6258
 *   6258  2º turno federal   "Eleição Ordinária Federal - 2026 2º Turno"
 *
 * O site está no 2º turno. Para voltar ao modo de teste do 1º turno:
 *
 *   code: "6257",
 *   selection: "top2",
 *
 * selection:
 *   "top2"    os dois mais votados no Brasil (teste do 1º turno)
 *   "runoff"  quem tem situação de 2º turno; se o arquivo já tiver
 *             só os dois candidatos, mostra esses dois
 */
window.APURACAO = {
  code: "6258",
  selection: "runoff",
  cycle: "ele2026",
  cargo: 1,
  ambiente: "oficial",
  base: "https://resultados.tse.jus.br",
  pollMs: 60000,
};
