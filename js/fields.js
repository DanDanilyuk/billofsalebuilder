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
//   kind:      'text' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'searchSelect'
//   options?:  { value: label } map for select/radio
//   optionsKey?: data-source key for searchSelect (e.g. 'states' -> STATE_LIST)
//   hint?:     helper text under the field
//   validate?: array of validator names from validation.js
//   mono?:     true to render with .input--mono (VIN/HIN style)
//   showWhen?: (state) => boolean predicate for conditional visibility
//   emphasis?: 'prominent' for checkbox -> applies .checkbox--prominent class
//              (used for the skip-fill toggle on the "other party" step)

import { COPY } from './copy.js';
import { STATES } from './states.js';

// Step 2 binds to whichever party prefix matches the user's role; step 3
// binds to the opposite. So role=seller -> Step 2 is seller, Step 3 is buyer.
export function youPrefix(state)   { return state.meta?.role === 'buyer' ? 'buyer'  : 'seller'; }
export function otherPrefix(state) { return state.meta?.role === 'buyer' ? 'seller' : 'buyer';  }

function metaFields() {
  const c = COPY.meta;
  return [
    {
      path: 'meta.usState',
      label: c.usState.label,
      req: true,
      kind: 'searchSelect',
      optionsKey: 'states',
      validate: ['usState'],
    },
    {
      path: 'meta.role',
      label: c.role.label,
      req: true,
      kind: 'radio',
      options: c.role.options,
    },
  ];
}

function partyFields(prefix, opts = {}) {
  const p = COPY.parties;
  const stepCopy = COPY[prefix] || {};
  // Skip-fill toggle leaves the section blank in the PDF for handwriting.
  // Used when the form printer doesn't have the counter-party's details yet.
  // The "you" step (omitSkipFill: true) drops it - you presumably know your
  // own info.
  const notSkipped = (s) => !s[prefix].skipFill;
  const showsCoOwner = (s) => !s[prefix].skipFill && !!s[prefix].hasCoOwner;
  const showsCoOwnerAddress = (s) => showsCoOwner(s) && !s[prefix].coOwnerSameAddress;

  const fields = [];
  if (!opts.omitSkipFill) {
    const skipField = {
      path: `${prefix}.skipFill`,
      label: stepCopy.skipFill?.label || '',
      req: false,
      kind: 'checkbox',
    };
    if (opts.prominent) skipField.emphasis = 'prominent';
    fields.push(skipField);
  }

  fields.push(
    { path: `${prefix}.name`,    label: p.name.label,    req: !!p.name.req,    kind: 'text', showWhen: notSkipped },
    { path: `${prefix}.street`,  label: p.street.label,  req: !!p.street.req,  kind: 'text', showWhen: notSkipped },
    { path: `${prefix}.city`,    label: p.city.label,    req: !!p.city.req,    kind: 'text', showWhen: notSkipped },
    { path: `${prefix}.state`,   label: p.state.label,   req: !!p.state.req,   kind: 'text', showWhen: notSkipped },
    { path: `${prefix}.zip`,     label: p.zip.label,     req: !!p.zip.req,     kind: 'text', validate: ['zip'], showWhen: notSkipped },
    { path: `${prefix}.phone`,   label: p.phone.label,   req: !!p.phone.req,   kind: 'text', validate: ['phoneOptional'], showWhen: notSkipped },
    { path: `${prefix}.license`, label: p.license.label, req: !!p.license.req, kind: 'text', hint: p.license.hint, showWhen: notSkipped },
  );

  // Joint-title toggle (button-styled). Only meaningful when not skip-filled
  // (skip-fill already prints two blank pairs in the PDF).
  fields.push({
    path: `${prefix}.hasCoOwner`,
    label: p.coOwnerToggle.label,
    req: false,
    kind: 'checkbox',
    emphasis: 'prominent',
    showWhen: notSkipped,
  });

  // Co-owner fields. Optional - none are required. Address fields hide when
  // coOwnerSameAddress is on (the PDF will mirror the primary's address).
  fields.push(
    { path: `${prefix}.coOwner.name`,    label: p.coOwnerName.label,    req: false, kind: 'text', showWhen: showsCoOwner },
    { path: `${prefix}.coOwnerSameAddress`, label: p.coOwnerSameAddress.label, req: false, kind: 'checkbox', showWhen: showsCoOwner },
    { path: `${prefix}.coOwner.street`,  label: p.coOwnerStreet.label,  req: false, kind: 'text', showWhen: showsCoOwnerAddress },
    { path: `${prefix}.coOwner.city`,    label: p.coOwnerCity.label,    req: false, kind: 'text', showWhen: showsCoOwnerAddress },
    { path: `${prefix}.coOwner.state`,   label: p.coOwnerState.label,   req: false, kind: 'text', showWhen: showsCoOwnerAddress },
    { path: `${prefix}.coOwner.zip`,     label: p.coOwnerZip.label,     req: false, kind: 'text', validate: ['zip'], showWhen: showsCoOwnerAddress },
    { path: `${prefix}.coOwner.phone`,   label: p.coOwnerPhone.label,   req: false, kind: 'text', validate: ['phoneOptional'], showWhen: showsCoOwner },
    { path: `${prefix}.coOwner.license`, label: p.coOwnerLicense.label, req: false, kind: 'text', showWhen: showsCoOwner },
  );

  return fields;
}

function vehicleFields(state) {
  const t = state.vehicle.type;
  const c = COPY.vehicle;
  const fields = [];

  fields.push({ path: 'vehicle.type', label: c.type.label, req: true, kind: 'radio', options: c.type.options });

  // Identifier (VIN / serial / HIN) sits right after type. For motor + trailer
  // the VIN auto-decodes via NHTSA vPIC and fills year/make/model/body; the
  // user can edit the auto-filled values freely.
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

  fields.push({ path: 'vehicle.year', label: c.year.label, req: true, kind: 'number', validate: ['year'] });
  fields.push({ path: 'vehicle.make', label: c.make.label, req: true, kind: 'text' });
  fields.push({ path: 'vehicle.model', label: c.model.label, req: true, kind: 'text' });
  fields.push({ path: 'vehicle.color', label: c.color.label, req: true, kind: 'text' });

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

function saleFields(state) {
  const c = COPY.sale;
  const stateData = STATES[state.meta?.usState];
  // Notary toggle hides for jurisdictions that don't use it. 'required' /
  // 'recommended' / 'optional' all surface the checkbox; 'not_required' hides
  // it (and forces the value off so a stale auto-default doesn't sneak it
  // into the PDF).
  const notaryNeeded = stateData ? stateData.notary !== 'not_required' : true;

  const fields = [
    // Negotiable toggle hides the price field and renders a blank line in the
    // PDF. Only meaningful when payment isn't a gift (gifts already skip price).
    {
      path: 'sale.priceNegotiable', label: c.priceNegotiable.label,
      req: false, kind: 'checkbox',
      showWhen: (s) => s.sale.payment !== 'gift',
    },
    {
      path: 'sale.price', label: c.price.label, hint: c.price.hint,
      req: true, kind: 'number', validate: ['price'],
      showWhen: (s) => s.sale.payment !== 'gift' && !s.sale.priceNegotiable,
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

  if (notaryNeeded) {
    fields.push({
      path: 'sale.includeNotary',
      label: c.includeNotary.label,
      req: false,
      kind: 'checkbox',
    });
  }

  return fields;
}

export function fieldsForStep(stepNumber, state) {
  let raw;
  switch (stepNumber) {
    case 1: raw = metaFields();                                                       break;
    case 2: raw = partyFields(youPrefix(state),    { omitSkipFill: true });           break;
    case 3: raw = partyFields(otherPrefix(state),  { prominent: true });              break;
    case 4: raw = vehicleFields(state);                              break;
    case 5: raw = saleFields(state);                                 break;
    default: raw = [];
  }
  return raw.filter((f) => !f.showWhen || f.showWhen(state));
}
