/**
 * The Spanish body text of the Byrdson award letter, extracted verbatim from
 * the Quickbase document template "Adjudicacion_Subcontrato" (template 3) so
 * the wording is not retyped and cannot drift by transcription.
 *
 * If the Quickbase template's legal text changes, this must be regenerated —
 * the two are not linked at runtime.
 */

export const LETTER_HEADER = [
  "BYRDSON SERVICES, LLC",
  "Home Repair, Reconstruction, or Relocation Program",
  "Single-Family Housing Program",
  "Subcontractors Community Development Block Grant Disaster Recovery Mitigation",
] as const;

export const CM_ADDRESS = [
  "Byrdson Services LLC",
  "Metro Office Park",
  "Lote 3 St.402",
  "Guaynabo, PR, 00971",
] as const;

export const LETTER_INTRO = "Por medio de la presente, Byrdson Services, LLC, (en adelante, CM) le notifica que ha sido adjudicado como Subcontratista, para la ejecución de los trabajos relacionados al caso identificado a continuación, conforme a los términos de este documento, el Master Service Agreement vigente entre las partes, y los Términos y Condiciones aplicables, los cuales forman parte integral de este Subcontrato.";

export const MOBILISATION_NOTE = "El pago de Movilización está limitado a un máximo de diez mil dólares ($10,000.00), independientemente del Monto Total adjudicado. Cada pago corresponde únicamente a la etapa completada, verificada e inspeccionada.";

export const SIGNATORY = {
  name: "Priscilla M. Rodríguez Pérez",
  title: "Project Manager",
  company: "Byrdson Services, LLC",
} as const;

export interface Condition {
  n: number;
  title: string;
  text: string;
}

export const CONDITIONS: Condition[] = [
  {
    "n": 1,
    "title": "Aceptación.",
    "text": "El Subcontratista deberá firmar y devolver esta carta dentro de tres (3) días laborables. La falta de aceptación dentro de dicho término podrá resultar en la reasignación del caso."
  },
  {
    "n": 2,
    "title": "Seguros.",
    "text": "Dentro de catorce (14) días laborables luego de la aceptación, el Subcontratista deberá someter evidencia de las pólizas requeridas (incluyendo Workers' Compensation y Responsabilidad Pública) al CM."
  },
  {
    "n": 3,
    "title": "Inicio de Trabajos / NTP.",
    "text": "Esta carta no autoriza el inicio de trabajos. El Subcontratista no podrá movilizar, adquirir materiales ni ejecutar obra alguna sin haber recibido una Orden de Proceder (Notice to Proceed – NTP) por escrito. Cualquier gasto previo al NTP será a riesgo del Subcontratista."
  },
  {
    "n": 4,
    "title": "Pagos.",
    "text": "Los pagos se realizarán por etapas de trabajo, en las cantidades exactas detalladas en el Desglose de Pagos, sujetos a progreso real, documentación, inspecciones y aprobación del CM y Gerente de Programa. El CM procesará el pago de cada etapa dentro de catorce (14) días calendario luego de aprobada la inspección correspondiente y recibida toda la documentación requerida, incluyendo el relevo de gravamen. El pago de Movilización está limitado a un máximo de $10,000.00 y será considerado adelanto amortizable. Ningún pago acumulado excederá el valor del trabajo completado y verificado en sitio."
  },
  {
    "n": 5,
    "title": "Revocación / Cancelación del Caso.",
    "text": "El CM podrá, antes de la emisión del NTP, revocar esta adjudicación o reasignar el caso por razones administrativas, programáticas o de desempeño, sin que ello genere derecho a compensación adicional."
  },
  {
    "n": 6,
    "title": "Confidencialidad.",
    "text": "El monto de esta adjudicación y cualquier información económica relacionada con este Subcontrato será confidencial entre Byrdson Services, LLC y el Subcontratista, y no podrá ser divulgada a terceros sin autorización previa por escrito del CM, salvo en la medida en que su divulgación sea requerida por ley, reglamento, orden administrativa, por agencia gubernamental competente o por los requisitos del programa. El incumplimiento con esta obligación de confidencialidad podrá resultar, a discreción del CM, en que el Subcontratista no sea considerado para asignaciones futuras."
  },
  {
    "n": 7,
    "title": "Costos Acordados.",
    "text": "Una vez aceptado este Subcontrato por Caso, el monto de la adjudicación y los costos asociados al alcance aprobado se considerarán finales y vinculantes. No se aceptarán ajustes, revisiones o renegociaciones de precio, salvo que medie una Orden de Cambio (Change Order) debidamente autorizada por el CM por concepto de trabajos adicionales o cambios al alcance originalmente aprobado."
  },
  {
    "n": 8,
    "title": "“Back Charge” por Materiales, Equipo o Suplidores.",
    "text": "El CM podrá proveer o pagar directamente materiales, equipos o suplidores relacionados con el proyecto, ya sea de forma directa o a través de terceros. Dichos costos se considerarán incurridos por cuenta del Subcontratista y estarán sujetos a back charge, el cual será descontado de la factura correspondiente a la próxima etapa de pago. En los casos en que dichos pagos involucren a terceros, el Subcontratista será responsable de confirmar y validar previamente al CM los elementos esenciales del pago, incluyendo, sin limitarse a, tipo de servicio o material, cantidades, especificaciones y monto a pagar. Cualquier error, malentendido, discrepancia o reclamación relacionada con pedidos, cantidades, especificaciones, entregas o suplidores terceros será a riesgo exclusivo del Subcontratista."
  },
  {
    "n": 9,
    "title": "Plazo de Ejecución.",
    "text": "Al aceptar esta adjudicación, el Subcontratista acepta y se obliga a completar la totalidad de los trabajos, incluyendo la aprobación de la Inspección Final, dentro de ciento ochenta (180) días calendario contados a partir de la emisión de la Orden de Proceder (NTP). Este plazo constituye un término esencial de este Subcontrato."
  },
  {
    "n": 10,
    "title": "Daños Liquidados.",
    "text": "Si el Subcontratista no completa los trabajos dentro del plazo de ciento ochenta (180) días calendario, o dentro de cualquier extensión aprobada por escrito conforme a la Condición 11, el Subcontratista pagará al CM, en concepto de daños liquidados y no como penalidad, la cantidad de ciento cincuenta dólares ($150.00) por cada día calendario de atraso hasta la aprobación de la Inspección Final. El CM podrá descontar los daños liquidados acumulados de cualquier pago pendiente al Subcontratista, incluyendo el pago de Inspección Final."
  },
  {
    "n": 11,
    "title": "Extensiones de Tiempo.",
    "text": "Es responsabilidad exclusiva del Subcontratista solicitar por escrito cualquier extensión de tiempo en el momento en que ocurra el evento que cause la demora, y en ningún caso más tarde de cinco (5) días laborables luego de conocido dicho evento, incluyendo la justificación y documentación de soporte. Las solicitudes de extensión presentadas al final del proyecto, o de forma acumulada, no serán consideradas. Ninguna extensión será válida sin la aprobación previa por escrito del CM, y los daños liquidados continuarán acumulándose en ausencia de una extensión aprobada."
  },
  {
    "n": 12,
    "title": "Póliza del Fondo (CFSE).",
    "text": "El Subcontratista será responsable de obtener, pagar y mantener vigente la póliza del Fondo del Seguro del Estado (CFSE) correspondiente a este proyecto, incluyendo el pago de todas las primas aplicables a su nómina. La retención y el pago de Inspección Final no serán liberados hasta que el Subcontratista provea al CM evidencia satisfactoria de cumplimiento con la CFSE para este proyecto."
  },
  {
    "n": 13,
    "title": "Terminación por Incumplimiento.",
    "text": "Luego de emitida la Orden de Proceder (NTP), el CM podrá terminar este Subcontrato por causa si el Subcontratista abandona los trabajos, no mantiene un ritmo de trabajo que permita cumplir el Plazo de Ejecución, incumple los estándares de calidad o los requisitos del programa, o incumple cualquier término de este Subcontrato, previa notificación escrita y un término de cinco (5) días laborables para corregir. En caso de terminación, el CM podrá completar los trabajos por sí o mediante terceros y descontará del balance no pagado todos los costos de completar y corregir los trabajos, más los daños liquidados acumulados. Si dichos costos exceden el balance no pagado, el Subcontratista pagará la diferencia al CM."
  },
  {
    "n": 14,
    "title": "Relevos de Gravamen.",
    "text": "Cada solicitud de pago por etapa deberá estar acompañada de un relevo condicional de gravamen (conditional lien waiver) correspondiente a la etapa facturada. El pago de Inspección Final requerirá un relevo incondicional de gravamen. Ninguna solicitud de pago será procesada sin el relevo correspondiente."
  },
  {
    "n": 15,
    "title": "Garantía.",
    "text": "El Subcontratista garantiza la mano de obra de todos los trabajos por un período de un (1) año contado a partir de la aprobación de la Inspección Final, y corregirá a su costo cualquier defecto de mano de obra notificado durante dicho período dentro del término razonable que fije el CM."
  },
  {
    "n": 16,
    "title": "Trabajos Correctivos.",
    "text": "Toda inspección fallida, hold point rechazado o partida de punch list deberá ser corregida por el Subcontratista a su costo dentro de cinco (5) días laborables de la notificación. El tiempo requerido para trabajos correctivos no extiende el Plazo de Ejecución ni constituye base para una extensión de tiempo."
  },
  {
    "n": 17,
    "title": "Cumplimiento del Programa.",
    "text": "Los trabajos se ejecutarán conforme al alcance aprobado (estimado Xactimate), las guías del programa CDBG-DR y del PRDOH, los permisos de OGPe, los códigos aplicables y los hold points de construcción del CM. El Subcontratista cooperará plenamente con los inspectores del CM, del Gerente de Programa y del programa."
  },
  {
    "n": 18,
    "title": "Cesión y Subcontratación.",
    "text": "El Subcontratista no podrá ceder este Subcontrato ni subcontratar porción alguna de los trabajos sin la aprobación previa por escrito del CM."
  },
  {
    "n": 19,
    "title": "Inspección de Sitio Previa al Inicio.",
    "text": "Antes de movilizar o iniciar trabajo alguno, el Subcontratista deberá realizar una inspección del sitio junto al representante del CM y firmar el acta de inspección correspondiente, confirmando: (a) que revisó el alcance adjudicado contra las condiciones existentes del sitio; (b) que identificó y notificó por escrito cualquier discrepancia, trabajo omitido o cambio de orden potencial; y (c) toda condición del sitio que pueda afectar la construcción. Firmada el acta e iniciados los trabajos, se entenderá que el Subcontratista aceptó las condiciones del sitio y el alcance adjudicado, y no se aceptarán reclamaciones, ajustes ni cambios de orden por condiciones que eran observables durante dicha inspección."
  },
  {
    "n": 20,
    "title": "Documentación de Demoras.",
    "text": "El Subcontratista es el único responsable de preparar, mantener y someter al CM la documentación contemporánea de toda demora, incluyendo registros diarios, fotografías, fecha del evento causante y su impacto en el itinerario. Dicha documentación deberá someterse a través de la plataforma electrónica designada por el CM (portal de subcontratistas en Quickbase). Las demoras no documentadas contemporáneamente a través de dicha plataforma no serán consideradas para extensiones de tiempo conforme a la Condición 11, ni constituirán defensa contra los daños liquidados de la Condición 10."
  }
];
