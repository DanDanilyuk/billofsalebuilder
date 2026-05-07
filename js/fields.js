// js/fields.js
//
// Per-step ordered field configs. The wizard renders whatever this returns;
// fields whose `showWhen(state)` is false are filtered out (so they're not
// rendered AND not validated).
//
// Field shape:
//   path:      dot-path into state (e.g. 'vehicle.year')
//   label:     visible label string (always pulled from COPY)
//   req:       boolean - whether the required validator runs
//   kind:      'text' | 'number' | 'date' | 'select' | 'radio' | 'checkbox'
//   options?:  { value: label } map for select/radio
//   hint?:     helper text under the field
//   validate?: array of validator names from validation.js
//   mono?:     true to render with .input--mono (VIN/HIN style)
//   showWhen?: (state) => boolean predicate for conditional visibility

import { COPY } from './copy.js';

function partyFields(prefix) {
  const p = COPY.parties;
  return [
    { path: `${prefix}.name`,    label: p.name.label,    req: !!p.name.req,    kind: 'text' },
    { path: `${prefix}.street`,  label: p.street.label,  req: !!p.street.req,  kind: 'text' },
    { path: `${prefix}.city`,    label: p.city.label,    req: !!p.city.req,    kind: 'text' },
    { path: `${prefix}.state`,   label: p.state.label,   req: !!p.state.req,   kind: 'text' },
    { path: `${prefix}.zip`,     label: p.zip.label,     req: !!p.zip.req,     kind: 'text', validate: ['zip'] },
    { path: `${prefix}.phone`,   label: p.phone.label,   req: !!p.phone.req,   kind: 'text', validate: ['phoneOptional'] },
    { path: `${prefix}.license`, label: p.license.label, req: !!p.license.req, kind: 'text', hint: p.license.hint },
  ];
}

function vehicleFields(state) {
  const t = state.vehicle.type;
  const c = COPY.step1;
  const fields = [];

  fields.push({ path: 'vehicle.type', label: c.type.label, req: true, kind: 'radio', options: c.type.options });
  fields.push({ path: 'vehicle.year', label: c.year.label, req: true, kind: 'number', validate: ['year'] });
  fields.push({ path: 'vehicle.make', label: c.make.label, req: true, kind: 'text' });
  fields.push({ path: 'vehicle.model', label: c.model.label, req: true, kind: 'text' });
  fields.push({ path: 'vehicle.color', label: c.color.label, req: true, kind: 'text' });

  // Identifier - shape depends on vehicle type.
  if (t === 'motor') {
    fields.push({
      path: 'vehicle.vin', label: c.vin.label, hint: c.vin.hint,
      req: true, kind: 'text', mono: true, validate: ['vin'],
    });
  } else if (t === 'trailer') {
    // Serial OK; no strict format validator (trailers may have 17-char VIN
    // OR a manufacturer-issued serial of varying length).
    fields.push({
      path: 'vehicle.vin', label: c.serial.label,
      req: !!c.serial.req, kind: 'text', mono: true,
    });
  } else if (t === 'boat') {
    fields.push({
      path: 'vehicle.hin', label: c.hin.label, hint: c.hin.hint,
      req: true, kind: 'text', mono: true, validate: ['hin'],
    });
  }

  // Length - trailer + boat.
  if (t === 'trailer' || t === 'boat') {
    fields.push({
      path: 'vehicle.length', label: c.length.label, req: true, kind: 'number',
    });
  }

  // Hull material - boat only.
  if (t === 'boat') {
    fields.push({
      path: 'vehicle.hullMaterial', label: c.hullMaterial.label,
      req: true, kind: 'select', options: c.hullMaterial.options,
    });
  }

  // Body / sub-type. Options vary by vehicle type.
  const subOptions = c.subType[t] || c.subType.motor;
  fields.push({
    path: 'vehicle.subType', label: c.subType.label,
    req: true, kind: 'select', options: subOptions,
  });
  fields.push({
    path: 'vehicle.subTypeOther', label: c.subTypeOther.label,
    req: true, kind: 'text',
    showWhen: (s) => s.vehicle.subType === 'other',
  });

  // Odometer block - motor vehicles only.
  if (t === 'motor') {
    fields.push({
      path: 'vehicle.odometer', label: c.odometer.label,
      req: true, kind: 'number',
    });
    fields.push({
      path: 'vehicle.odometerUnit', label: c.odometerUnit.label,
      req: true, kind: 'radio', options: c.odometerUnit.options,
    });
    fields.push({
      path: 'vehicle.odometerStatus', label: c.odometerStatus.label,
      req: true, kind: 'radio', options: c.odometerStatus.options,
    });
  }

  return fields;
}

function saleFields() {
  const c = COPY.step4;
  return [
    {
      path: 'sale.price', label: c.price.label, hint: c.price.hint,
      req: true, kind: 'number', validate: ['price'],
      showWhen: (s) => s.sale.payment !== 'gift',
    },
    { path: 'sale.date', label: c.date.label, req: true, kind: 'date', validate: ['date'] },
    { path: 'sale.payment', label: c.payment.label, req: true, kind: 'radio', options: c.payment.options },
    {
      path: 'sale.paymentOther', label: c.paymentOther.label,
      req: true, kind: 'text',
      showWhen: (s) => s.sale.payment === 'other',
    },
    { path: 'sale.asIsAck', label: c.asIsAck.label, req: true, kind: 'checkbox' },
  ];
}

export function fieldsForStep(stepNumber, state) {
  let raw;
  switch (stepNumber) {
    case 1: raw = vehicleFields(state); break;
    case 2: raw = partyFields('seller'); break;
    case 3: raw = partyFields('buyer'); break;
    case 4: raw = saleFields(); break;
    default: raw = [];
  }
  return raw.filter((f) => !f.showWhen || f.showWhen(state));
}
