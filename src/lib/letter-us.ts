import type { Condition, LetterLabels, LetterTemplate } from "./letter-content";

/**
 * The mainland award letter — English.
 *
 * A translation of the Puerto Rico letter in letter-content.ts, for Florida,
 * North Carolina, Texas and Louisiana. The commercial terms are deliberately
 * identical: the same 180-day term, the same $150 per day liquidated damages,
 * the same $10,000 mobilisation cap, the same payment stages and percentages.
 * Only the language and the Puerto Rico institutions change.
 *
 * THREE CONDITIONS ARE NOT TRANSLATIONS. They bound the subcontractor to
 * Puerto Rico bodies that do not exist on the mainland, so translating them
 * literally would have produced an obligation nobody could satisfy:
 *
 *   2  "Responsabilidad Pública" is rendered as Commercial General Liability,
 *      which is what that cover is called here.
 *   12 The Fondo del Seguro del Estado (CFSE) is Puerto Rico's monopoly
 *      workers' compensation insurer, and has no mainland equivalent. Replaced
 *      with workers' compensation under the law of the state where the work is
 *      performed, keeping the commercial effect intact: retainage and the final
 *      payment are held until compliance is evidenced.
 *   17 OGPe is Puerto Rico's permitting office and PRDOH its housing
 *      department. Replaced with "the authority having jurisdiction" and "the
 *      administering state agency". CDBG-DR is kept — Florida, North Carolina,
 *      Texas and Louisiana all run CDBG-DR programmes.
 *
 * The mobilisation cap, the letterhead address and the signatory were all
 * confirmed by the business on 2026-09-16; the cap is deliberately the same
 * $10,000 the Puerto Rico letter states.
 *
 * This is a drafting exercise, not legal advice. Have counsel read it before
 * the first letter reaches a subcontractor.
 */

export const US_LETTER_HEADER = [
  "BYRDSON SERVICES, LLC",
  "Home Repair, Reconstruction, or Relocation Program",
  "Single-Family Housing Program",
  "Subcontractors — Community Development Block Grant Disaster Recovery",
] as const;

/** The mainland office. The Puerto Rico letter carries the Guaynabo address. */
export const US_CM_ADDRESS = [
  "Byrdson Services LLC",
  "1245 W Cardinal Drive",
  "Beaumont, TX 77705",
] as const;

export const US_LETTER_INTRO =
  "By means of this letter, Byrdson Services, LLC (hereinafter, the CM) notifies you that you have been awarded as Subcontractor for the execution of the work relating to the case identified below, in accordance with the terms of this document, the Master Service Agreement in force between the parties, and the applicable Terms and Conditions, which form an integral part of this Subcontract.";

export const US_MOBILISATION_NOTE =
  "The Mobilization payment is limited to a maximum of ten thousand dollars ($10,000.00), regardless of the Total Amount awarded. Each payment corresponds solely to the stage that has been completed, verified and inspected.";

/**
 * Who signs a mainland award. Her title is the Designation on her Internal
 * Users record (buskqh27r rid 61), which is the authority for it — the Puerto
 * Rico letter takes its signatory's title from Job Role instead, because that
 * record carries both and they differ.
 */
export const US_SIGNATORY = {
  name: "Joellen Hall",
  title: "Vice President of Operations",
  company: "Byrdson Services, LLC",
} as const;

export const US_CONDITIONS: Condition[] = [
  {
    n: 1,
    title: "Acceptance.",
    text: "The Subcontractor shall sign and return this letter within three (3) business days. Failure to accept within that term may result in the case being reassigned.",
  },
  {
    n: 2,
    title: "Insurance.",
    text: "Within fourteen (14) business days following acceptance, the Subcontractor shall submit to the CM evidence of the required policies, including Workers' Compensation and Commercial General Liability.",
  },
  {
    n: 3,
    title: "Commencement of Work / NTP.",
    text: "This letter does not authorize the commencement of work. The Subcontractor may not mobilize, purchase materials or perform any work without having received a written Notice to Proceed (NTP). Any expense incurred prior to the NTP shall be at the Subcontractor's risk.",
  },
  {
    n: 4,
    title: "Payments.",
    text: "Payments shall be made by work stage, in the exact amounts detailed in the Payment Breakdown, subject to actual progress, documentation, inspections and approval by the CM and the Program Manager. The CM shall process payment for each stage within fourteen (14) calendar days after the corresponding inspection has been approved and all required documentation has been received, including the lien waiver. The Mobilization payment is limited to a maximum of $10,000.00 and shall be treated as an amortizable advance. No cumulative payment shall exceed the value of the work completed and verified on site.",
  },
  {
    n: 5,
    title: "Revocation / Cancellation of the Case.",
    text: "Prior to issuance of the NTP, the CM may revoke this award or reassign the case for administrative, programmatic or performance reasons, without such action giving rise to any right to additional compensation.",
  },
  {
    n: 6,
    title: "Confidentiality.",
    text: "The amount of this award and any economic information relating to this Subcontract shall be confidential between Byrdson Services, LLC and the Subcontractor, and may not be disclosed to third parties without the CM's prior written authorization, except to the extent that disclosure is required by law, regulation, administrative order, by a competent governmental agency or by the requirements of the program. Failure to comply with this confidentiality obligation may result, at the CM's discretion, in the Subcontractor not being considered for future assignments.",
  },
  {
    n: 7,
    title: "Agreed Costs.",
    text: "Once this Subcontract by Case has been accepted, the award amount and the costs associated with the approved scope shall be considered final and binding. No price adjustments, revisions or renegotiations shall be accepted unless a Change Order duly authorized by the CM is issued for additional work or for changes to the scope originally approved.",
  },
  {
    n: 8,
    title: "Back Charges for Materials, Equipment or Suppliers.",
    text: "The CM may provide or pay directly for materials, equipment or suppliers related to the project, whether directly or through third parties. Such costs shall be deemed incurred on the Subcontractor's account and shall be subject to a back charge, which shall be deducted from the invoice for the next payment stage. Where such payments involve third parties, the Subcontractor shall be responsible for confirming and validating with the CM in advance the essential elements of the payment, including without limitation the type of service or material, quantities, specifications and amount to be paid. Any error, misunderstanding, discrepancy or claim relating to orders, quantities, specifications, deliveries or third-party suppliers shall be at the Subcontractor's sole risk.",
  },
  {
    n: 9,
    title: "Time for Completion.",
    text: "By accepting this award, the Subcontractor accepts and undertakes to complete the whole of the work, including approval of the Final Inspection, within one hundred eighty (180) calendar days from issuance of the Notice to Proceed (NTP). This term is an essential term of this Subcontract.",
  },
  {
    n: 10,
    title: "Liquidated Damages.",
    text: "If the Subcontractor does not complete the work within the one hundred eighty (180) calendar day term, or within any extension approved in writing pursuant to Condition 11, the Subcontractor shall pay the CM, as liquidated damages and not as a penalty, the sum of one hundred fifty dollars ($150.00) for each calendar day of delay until the Final Inspection is approved. The CM may deduct accrued liquidated damages from any payment outstanding to the Subcontractor, including the Final Inspection payment.",
  },
  {
    n: 11,
    title: "Time Extensions.",
    text: "It is the Subcontractor's sole responsibility to request any time extension in writing at the time the event causing the delay occurs, and in no case later than five (5) business days after becoming aware of that event, including the justification and supporting documentation. Extension requests submitted at the end of the project, or on a cumulative basis, shall not be considered. No extension shall be valid without the CM's prior written approval, and liquidated damages shall continue to accrue in the absence of an approved extension.",
  },
  {
    n: 12,
    title: "Workers' Compensation Coverage.",
    text: "The Subcontractor shall be responsible for obtaining, paying for and keeping in force workers' compensation coverage for this project as required by the law of the state in which the work is performed, including all premiums applicable to its payroll. Retainage and the Final Inspection payment shall not be released until the Subcontractor provides the CM with satisfactory evidence of workers' compensation compliance for this project.",
  },
  {
    n: 13,
    title: "Termination for Default.",
    text: "Following issuance of the Notice to Proceed (NTP), the CM may terminate this Subcontract for cause if the Subcontractor abandons the work, fails to maintain a rate of progress sufficient to meet the Time for Completion, fails to meet quality standards or the requirements of the program, or breaches any term of this Subcontract, upon written notice and a five (5) business day period to cure. In the event of termination, the CM may complete the work itself or through third parties and shall deduct from the unpaid balance all costs of completing and correcting the work, plus accrued liquidated damages. If such costs exceed the unpaid balance, the Subcontractor shall pay the difference to the CM.",
  },
  {
    n: 14,
    title: "Lien Waivers.",
    text: "Each stage payment request shall be accompanied by a conditional lien waiver covering the stage being invoiced. The Final Inspection payment shall require an unconditional lien waiver. No payment request shall be processed without the corresponding waiver.",
  },
  {
    n: 15,
    title: "Warranty.",
    text: "The Subcontractor warrants the workmanship of all work for a period of one (1) year from approval of the Final Inspection, and shall correct at its own cost any defect in workmanship notified during that period, within the reasonable term set by the CM.",
  },
  {
    n: 16,
    title: "Corrective Work.",
    text: "Every failed inspection, rejected hold point or punch list item shall be corrected by the Subcontractor at its own cost within five (5) business days of notice. Time required for corrective work does not extend the Time for Completion and does not constitute grounds for a time extension.",
  },
  {
    n: 17,
    title: "Program Compliance.",
    text: "The work shall be performed in accordance with the approved scope (Xactimate estimate), the applicable CDBG-DR program guidelines and those of the administering state agency, the permits issued by the authority having jurisdiction, the applicable building codes and the CM's construction hold points. The Subcontractor shall cooperate fully with the inspectors of the CM, the Program Manager and the program.",
  },
  {
    n: 18,
    title: "Assignment and Subcontracting.",
    text: "The Subcontractor may not assign this Subcontract nor subcontract any portion of the work without the CM's prior written approval.",
  },
  {
    n: 19,
    title: "Pre-Commencement Site Inspection.",
    text: "Before mobilizing or commencing any work, the Subcontractor shall carry out a site inspection together with the CM's representative and sign the corresponding inspection record, confirming: (a) that it has reviewed the awarded scope against the existing site conditions; (b) that it has identified and notified in writing any discrepancy, omitted work or potential change order; and (c) any site condition that may affect construction. Once the record has been signed and work has commenced, the Subcontractor shall be deemed to have accepted the site conditions and the awarded scope, and no claims, adjustments or change orders shall be accepted for conditions that were observable during that inspection.",
  },
  {
    n: 20,
    title: "Delay Documentation.",
    text: "The Subcontractor is solely responsible for preparing, maintaining and submitting to the CM contemporaneous documentation of every delay, including daily logs, photographs, the date of the causing event and its impact on the schedule. Such documentation shall be submitted through the electronic platform designated by the CM (the subcontractor portal in Quickbase). Delays not documented contemporaneously through that platform shall not be considered for time extensions under Condition 11, nor shall they constitute a defense against the liquidated damages under Condition 10.",
  },
];

export const US_LABELS: LetterLabels = {
  documentTitle: "Subcontract Award — {job}",
  heading: "Subcontract Award for {jobType}",
  subject: "Subject: Award &ndash; Subcontract for Case {job}",
  sectionCase: "Case Information",
  sectionAward: "Award Breakdown",
  sectionContract: "Total Contract Price",
  sectionSchedule: "Payment Breakdown",
  sectionConditions: "General Conditions",
  caseProgram: "Program",
  caseProjectNumber: "Project Number",
  caseProjectAddress: "Project Address",
  caseScopeOfWork: "Scope of Work",
  caseStartDate: "Estimated Start Date",
  caseEndDate: "Estimated Completion Date",
  caseTerm: "Time for Completion",
  caseTermValue: "180 calendar days from the NTP",
  caseExtension: "Completion Extension",
  caseExtensionValue: "N/A",
  awardExtracted: "Extracted Scope ({coverages})",
  awardLessOandP: "Less Overhead &amp; Profit",
  awardSubsShare: "Subcontractor Share ({pct})",
  awardHc: "Hard Costs (HC)",
  awardAda: "ADA Conversion",
  awardTotal: "Total Amount",
  awardDemolition: "Demolition",
  awardSite: "Site",
  awardSeptic: "Septic System",
  awardHome: "Home",
  awardChangeOrder: "Change Order",
  awardRevisedTotal: "Revised Total Amount",
  scheduleNumber: "#",
  scheduleStage: "Stage",
  schedulePct: "%",
  scheduleAmount: "Payment Amount",
  scheduleTotal: "Total",
  scheduleShortfall:
    "The remaining {amount} has not yet been scheduled and will be detailed in a later breakdown.",
  signatureLine:
    "Signature: ____________________&nbsp;&nbsp;&nbsp;Date: ____________",
  counterparty: "Authorized Representative",
};

export const US_LETTER: LetterTemplate = {
  lang: "en",
  header: US_LETTER_HEADER,
  cmAddress: US_CM_ADDRESS,
  intro: US_LETTER_INTRO,
  scheduleNote: US_MOBILISATION_NOTE,
  signatory: US_SIGNATORY,
  conditions: US_CONDITIONS,
  labels: US_LABELS,
  fileSuffix: " - Subcontract Award.pdf",
};
