// Single source of truth for all UI text.
// Tone: clear, neutral, slightly formal. No exclamation marks, no emoji.
// Labels use sentence case. Helper text is one short sentence.
// Error messages are specific and actionable.
//
// Key paths are referenced by other modules (fields.js, app.js, pdf.js).
// Do not rename keys without coordinating with those owners.

export const COPY = {
  app: {
    title: "Bill of Sale Builder",
    // Subtitle is rendered dynamically by app.js using the selected state's
    // honorific and name (e.g. "State of California", "Commonwealth of
    // Pennsylvania", "District of Columbia").
    subtitleTemplate: "{honorific} of {name}",
    subtitleNoHonorific: "{name}",
    footerDisclaimerTemplate: "Not a substitute for {name} DMV title transfer requirements.",
    // Shown before the user has picked a state (so the header keeps its
    // height and the page doesn't reflow once a state is committed).
    subtitleNoState: "Select a state",
    footerDisclaimerNoState: "Not legal advice. Verify with your state DMV before relying on this document.",
    // Empty-state option shown in every <select> control.
    selectPlaceholder: "Choose...",
  },
  // Step 1 state-guidance card. Rendered by app.js renderStateGuidance() from
  // the selected state's STATES entry. {name} = state name, {days} = the
  // state's filingDeadlineDays. The notary line is keyed by the state's
  // notary requirement ('required' / 'recommended' / 'optional' / 'not_required').
  stateGuidance: {
    headingTemplate: "{name} guidance",
    filingDeadlineTemplate: "Transfer the title within {days} days of the sale to stay within {name}'s deadline.",
    notary: {
      required: "{name} requires this bill of sale to be notarized. A notary block is included in your PDF.",
      recommended: "{name} recommends notarizing this bill of sale. You can add a notary block in the sale terms step.",
      optional: "Notarization is optional in {name}. You can add a notary block in the sale terms step if you want one.",
      not_required: "{name} does not require notarization for this bill of sale.",
    },
    disclaimerTemplate: "Requirements can change and may vary by county. Confirm the details with the {name} DMV before you rely on this document.",
  },
  actions: {
    back: "Back",
    continue: "Continue",
    // Shown on the Continue button for the last form step (before PDF preview).
    review: "Review",
    clear: "Clear form",
    download: "Download PDF",
    // Opens the generated blob PDF in a new tab; the iframe preview is unreliable
    // on some mobile browsers, so this is the dependable view path.
    openPdf: "Open PDF in new tab",
    backToEdit: "Back to edit",
  },
  modals: {
    clearForm: {
      title: "Clear the form?",
      body: "This erases everything you've entered. You can't undo it.",
      cancel: "Cancel",
      confirm: "Clear form",
    },
  },
  // Per-step chrome (eyebrow / title / sub). app.js writes these onto the
  // empty [data-step-*] attributes when a step renders. titleTemplate steps
  // (you / other) substitute {role} with the party label at render time.
  wizard: {
    steps: {
      setup: {
        eyebrow: "Step 1 of 6",
        title: "Setup",
        sub: "Pick the state where the title will be transferred and your role in the sale.",
      },
      you: {
        eyebrow: "Step 2 of 6",
        titleTemplate: "Your information ({role})",
        sub: "Your contact details.",
      },
      other: {
        eyebrow: "Step 3 of 6",
        titleTemplate: "Other party ({role})",
        sub: "Their contact details, or skip and leave blank for handwriting.",
      },
      vehicle: {
        eyebrow: "Step 4 of 6",
        title: "Vehicle",
        sub: "What's being sold.",
      },
      sale: {
        eyebrow: "Step 5 of 6",
        title: "Sale terms",
        sub: "Price, date, and payment.",
      },
      review: {
        eyebrow: "Step 6 of 6",
        title: "Review & download",
        sub: "Verify the document below, then download.",
      },
    },
  },
  meta: {
    usState: { label: "State where the title will be transferred", req: true, placeholder: "Type a state name..." },
    role: {
      label: "I am the...",
      req: true,
      options: {
        seller: "Seller",
        buyer: "Buyer",
      },
    },
  },
  vehicle: {
    title: "Vehicle",
    sub: "What's being sold.",
    type: {
      label: "Vehicle type",
      req: true,
      options: {
        motor: "Motor vehicle",
        trailer: "Trailer",
        boat: "Boat",
      },
    },
    year: { label: "Year", req: true, hint: "" },
    make: { label: "Make", req: true },
    model: { label: "Model", req: true },
    color: { label: "Color", req: true },
    vin: {
      label: "VIN",
      req: true,
      hint: "17 characters; we exclude letters I, O, and Q. The VIN is sent to the NHTSA database to fill in year, make, and model; nothing else leaves your browser.",
      status: {
        decoding: "Decoding VIN...",
        decoded: "Decoded - year, make, model, and body filled in.",
        failed: "Couldn't decode this VIN. Fill in the details manually.",
      },
    },
    serial: { label: "VIN or serial number", req: true },
    hin: {
      label: "HIN",
      req: true,
      hint: "12 characters - hull identification number.",
    },
    length: { label: "Length (feet)", req: true },
    hullMaterial: {
      label: "Hull material",
      req: true,
      options: {
        fiberglass: "Fiberglass",
        aluminum: "Aluminum",
        wood: "Wood",
        steel: "Steel",
        other: "Other",
      },
    },
    subType: {
      label: "Body type",
      req: true,
      motor: {
        sedan: "Sedan",
        suv: "SUV",
        truck: "Truck",
        van: "Van",
        coupe: "Coupe",
        motorcycle: "Motorcycle",
        other: "Other",
      },
      trailer: {
        utility: "Utility",
        cargo: "Cargo",
        boatTrailer: "Boat trailer",
        other: "Other",
      },
      boat: {
        powerboat: "Powerboat",
        sailboat: "Sailboat",
        pwc: "Personal watercraft",
        other: "Other",
      },
    },
    subTypeOther: { label: "Describe", req: true },
    odometer: { label: "Odometer reading", req: true },
    odometerUnit: {
      label: "Unit",
      req: true,
      options: {
        miles: "Miles",
        km: "Kilometers",
      },
    },
    odometerStatus: {
      label: "Odometer accuracy",
      req: true,
      options: {
        actual: "Actual mileage",
        not_actual: "Not actual mileage",
        exceeds: "Exceeds mechanical limits",
      },
    },
  },
  parties: {
    firstName: { label: "First name", req: true },
    middleName: { label: "Middle name (optional)", req: false },
    lastName: { label: "Last name", req: true },
    street: { label: "Street address", req: true },
    street2: { label: "Apt / Suite / Unit (optional)", req: false },
    city: { label: "City", req: true },
    state: { label: "State", req: true },
    zip: { label: "ZIP", req: true, hint: "The ZIP is sent to a public postal-code service to fill in city and state; nothing else leaves your browser." },
    phone: { label: "Phone (optional)", req: false },
    license: {
      label: "Driver's license / ID number (optional)",
      req: false,
      hint: "Helps the DMV match the title.",
    },
    coOwnerToggle: { label: "Two people on the title", req: false },
    coOwnerSameAddress: { label: "Co-owner shares this address", req: false },
    coOwnerStreet2: { label: "Co-owner apt / suite / unit (optional)", req: false },
    coOwnerFirstName: { label: "Co-owner first name", req: false },
    coOwnerMiddleName: { label: "Co-owner middle name (optional)", req: false },
    coOwnerLastName: { label: "Co-owner last name", req: false },
    coOwnerStreet: { label: "Co-owner street address", req: false },
    coOwnerCity: { label: "Co-owner city", req: false },
    coOwnerState: { label: "Co-owner state", req: false },
    coOwnerZip: { label: "Co-owner ZIP", req: false },
    coOwnerPhone: { label: "Co-owner phone (optional)", req: false },
    coOwnerLicense: { label: "Co-owner driver's license / ID (optional)", req: false },
  },
  seller: {
    title: "Seller",
    sub: "Who is selling the vehicle.",
    skipFill: { label: "Skip - leave seller blank for handwriting", req: false },
    nameHint: "As it appears on the title.",
  },
  buyer: {
    title: "Buyer",
    sub: "Who is purchasing the vehicle.",
    skipFill: { label: "Skip - leave buyer blank for handwriting", req: false },
    nameHint: "As it appears on your driver's license.",
  },
  sale: {
    title: "Sale terms",
    sub: "Price, date, and payment.",
    price: {
      label: "Sale price (USD)",
      req: true,
      hint: "Enter 0 or use Gift if no money is exchanged.",
    },
    date: { label: "Date of sale", req: true },
    payment: {
      label: "Payment method",
      req: true,
      options: {
        cash: "Cash",
        check: "Check",
        money_order: "Money order",
        financed: "Financed",
        gift: "Gift (no money exchanged)",
        other: "Other",
      },
    },
    paymentOther: { label: "Describe payment", req: true },
    priceNegotiable: { label: "Negotiable - leave sale price blank", req: false },
    includeNotary: { label: "Add notary block to the PDF", req: false },
    includeWitness: { label: "Add witness signature lines to the PDF", req: false },
  },
  review: {
    title: "Review & download",
    sub: "Verify the document below, then download.",
    // Shown in the Step 6 preview area when PDF generation throws.
    buildError: "We couldn't build the document preview. Go back, double-check your entries, then return to this step.",
    // Always-on helper under the preview; the inline iframe is unreliable on
    // some mobile browsers, so point users at the new-tab / download paths.
    previewHint: "Not seeing the preview? Open the PDF in a new tab or download it to view your document.",
  },
  errors: {
    required: "Required.",
    vin: "Must be exactly 17 characters; letters I, O, and Q are not allowed.",
    hin: "Must be exactly 12 characters.",
    year: "Enter a year between 1900 and next year.",
    zip: "Use the format 12345 or 12345-6789.",
    price: "Enter a positive amount.",
    odometer: "Enter the odometer reading as a whole number, zero or more.",
    length: "Enter the length in feet as a number, zero or more.",
    date: "Enter a valid date.",
    dateFuture: "Sale date can't be in the future.",
    phone: "Enter a 10-digit phone number.",
    usState: "Pick a US state.",
  },
  pdf: {
    title: "VEHICLE BILL OF SALE",
    sellerHeading: "SELLER",
    buyerHeading: "BUYER",
    vehicleHeading: "VEHICLE",
    saleHeading: "SALE",
    ackHeading: "ACKNOWLEDGMENT",
    signaturesHeading: "SIGNATURES",
    ackBody: "The Seller transfers all right, title, and interest in the vehicle described above to the Buyer for the consideration stated. The vehicle is sold AS-IS, with no warranties expressed or implied.",
    ackBodyGift: "The Seller transfers all right, title, and interest in the vehicle described above to the Buyer as a gift, with no monetary consideration. The vehicle is transferred AS-IS, with no warranties expressed or implied.",
    ackOdoCert: "The Seller certifies the odometer reading is correct to the best of their knowledge.",
    sellerSignatureLabel: "Seller signature",
    buyerSignatureLabel: "Buyer signature",
    dateLabel: "Date",
    rows: {
      name: "Name:",
      address: "Address:",
      phone: "Phone:",
      dlId: "DL/ID:",
      type: "Type:",
      description: "Description:",
      vin: "VIN:",
      vinSerial: "VIN / Serial:",
      hin: "HIN:",
      length: "Length:",
      hull: "Hull:",
      odometer: "Odometer:",
      salePrice: "Sale price:",
      dateOfSale: "Date of sale:",
      payment: "Payment:",
    },
    lengthUnit: "ft",
    giftValue: "Gift - no monetary consideration",
    notaryHeading: "NOTARIZATION",
    notaryRows: {
      stateCounty: "State & County:",
      date: "Date:",
      notarySig: "Notary signature:",
      commission: "Commission expires:",
    },
    witnessHeading: "WITNESSES",
    witness1Signature: "Witness 1 signature",
    witness1Name: "Witness 1 printed name",
    witness2Signature: "Witness 2 signature",
    witness2Name: "Witness 2 printed name",
  },
};
