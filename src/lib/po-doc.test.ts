import assert from "node:assert/strict";
import { test } from "node:test";
import { PO_ACCEPTANCE, renderPoDocument, type PoDocument } from "./po-doc";
import { poBody, poSubject } from "./po-email";
import { REGIONS } from "./regions";

function doc(over: Partial<PoDocument> = {}): PoDocument {
  return {
    poNumber: "PO-10588",
    jobAddress: "918 Railroad Street, Columbia, North Carolina 27925",
    dateCreated: "2026-02-13T14:14:29Z",
    dateReleased: "",
    scheduledCompletion: "",
    subVendor: "MCAE Tech LLC",
    jobName: "APP-10144-CM - Recon - 918 Railroad Street",
    title: "Roofing",
    status: "Released",
    totalPrice: 1530,
    scopeOfWork: "Roof labor for Josephine I model house",
    projectSpecifics: "",
    lines: [
      {
        title: "Roofing",
        costType: "Subcontractor",
        quantity: 1,
        unitCost: 1530,
        builderCost: 1530,
      },
    ],
    ...over,
  };
}

test("the document carries every field the Quickbase print shows", () => {
  const html = renderPoDocument(doc());
  for (const shown of [
    "PO-10588",
    "918 Railroad Street, Columbia, North Carolina 27925",
    "02-13-2026",
    "MCAE Tech LLC",
    "APP-10144-CM - Recon - 918 Railroad Street",
    "Roofing",
    "Released",
    "$1,530.00",
    "Roof labor for Josephine I model house",
    "Subcontractor",
  ]) {
    assert.ok(
      html.includes(shown),
      `missing from the purchase order: ${shown}`,
    );
  }
  for (const heading of [
    "Purchase Order",
    "Scope of Work",
    "PO Cost Line Items",
    "Acceptance",
  ]) {
    assert.match(
      html,
      new RegExp(`<h2>${heading}</h2>`),
      `missing section: ${heading}`,
    );
  }
});

test("the acceptance wording is reproduced, not paraphrased", () => {
  /*
   * This sentence is what makes the page an offer the subcontractor accepts
   * rather than a statement of what was decided. Rewording it changes what
   * they are signing.
   */
  const html = renderPoDocument(doc());
  assert.ok(html.includes(PO_ACCEPTANCE));
  assert.match(html, /Signature/);
  assert.match(html, /Approved by/);
});

test("line items total, and the total is the contract not the rollup", () => {
  const html = renderPoDocument(
    doc({
      // A partial breakdown: $700 of a $1,000 contract, which is exactly what
      // a mainland award looks like before the balance is broken down.
      totalPrice: 1000,
      lines: [
        {
          title: "Mobilisation",
          costType: "Subcontractor",
          quantity: 1,
          unitCost: 500,
          builderCost: 500,
        },
        {
          title: "Rough-in",
          costType: "Subcontractor",
          quantity: 1,
          unitCost: 200,
          builderCost: 200,
        },
      ],
    }),
  );
  assert.ok(html.includes("$1,000.00"), "Total Price is the contract");
  assert.ok(html.includes("$700.00"), "the line items total what they come to");
});

test("a purchase order with no line items still renders", () => {
  const html = renderPoDocument(doc({ lines: [] }));
  assert.match(html, /No line items on this purchase order yet/);
  assert.ok(!/undefined|NaN/.test(html));
});

test("blank dates print an em dash rather than an invalid one", () => {
  const html = renderPoDocument(
    doc({ dateCreated: "", dateReleased: "", scheduledCompletion: "" }),
  );
  assert.ok(!/Invalid Date|NaN|undefined/.test(html));
  assert.ok(html.includes("&mdash;"));
});

test("a stray angle bracket cannot break the markup", () => {
  const html = renderPoDocument(
    doc({
      subVendor: '<script>alert("x")</script>',
      title: 'A & B "quoted"',
    }),
  );
  assert.ok(
    !html.includes("<script>alert"),
    "unescaped markup made it through",
  );
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
});

test("the covering note names the purchase order and its figure", () => {
  const d = doc();
  assert.equal(
    poSubject(d),
    "PO-10588 — APP-10144-CM - Recon - 918 Railroad Street",
  );
  const body = poBody(d);
  assert.match(body, /MCAE Tech LLC/);
  assert.match(body, /PO-10588/);
  assert.match(body, /\$1,530\.00/);
  // No Spanish leaking in from the award letter's note.
  assert.ok(!/Adjunto|Estimados|Cordialmente/.test(body));
});

test("only the mainland sends a purchase order to the subcontractor", () => {
  /*
   * The PO document exists in English only. Puerto Rico's award goes out on a
   * Spanish letter, and mailing this alongside it would send an English
   * contract document to a subcontractor whose letter deliberately is not.
   */
  assert.equal(REGIONS.PR.poDocument, false);
  for (const key of ["FL", "NC", "TX", "LA"] as const) {
    assert.equal(REGIONS[key].poDocument, true, `${key} should send the PO`);
  }
});
