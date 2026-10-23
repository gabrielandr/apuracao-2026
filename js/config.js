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
 * Agora o site usa o 1º turno para conferência, com os dois mais votados.
 * No 2º turno (25/10/2026, a partir das 17h de Brasília), troque para:
 *
 *   code: "6258",
 *   selection: "runoff",
 *
 * selection:
 *   "top2"    os dois mais votados no Brasil (teste do 1º turno)
 *   "runoff"  quem tem situação de 2º turno; se o arquivo já tiver
 *             só os dois candidatos, mostra esses dois
 */
window.APURACAO = {
  code: "6257",
  selection: "top2",
  cycle: "ele2026",
  cargo: 1,
  ambiente: "oficial",
  base: "https://resultados.tse.jus.br",
  pollMs: 60000,
};
