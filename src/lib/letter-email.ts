import { money } from "./format";
import type { LetterInput } from "./letter";

/** The default covering note that goes with the attached letter. */
export function defaultSubject(input: LetterInput): string {
  const caseNo = input.jobName.trim() || "—";
  return `Adjudicación de Subcontrato — Caso ${caseNo}`;
}

export function defaultBody(input: LetterInput): string {
  const sub = input.subcontractor.trim() || "Subcontratista";
  const caseNo = input.jobName.trim() || "—";
  const chosen = input.result.tierRows.find((r) => r.selected);

  return [
    `Estimados ${sub}:`,
    "",
    `Adjunto encontrará la Adjudicación de Subcontrato correspondiente al caso ${caseNo}.`,
    "",
    `Monto Total adjudicado: ${money(input.result.award)}`,
    chosen
      ? `Participación del subcontratista: ${chosen.pct}% (${money(chosen.amount)}) más Hard Costs de ${money(input.result.hc)}.`
      : "",
    "",
    "Favor de firmar y devolver esta carta dentro de tres (3) días laborables. La falta de aceptación dentro de dicho término podrá resultar en la reasignación del caso.",
    "",
    "Esta carta no autoriza el inicio de trabajos. No podrá movilizar, adquirir materiales ni ejecutar obra alguna sin haber recibido una Orden de Proceder (NTP) por escrito.",
    "",
    "Cordialmente,",
    "Byrdson Services, LLC",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}
