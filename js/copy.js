// Single source of truth for all UI text.
// Tone: clear, neutral, slightly formal. No exclamation marks, no emoji.
// Labels use sentence case. Helper text is one short sentence.
// Error messages are specific and actionable.
//
// Key paths are referenced by other modules (fields.js, app.js, pdf.js).
// Do not rename keys without coordinating with those owners.

export const COPY = {
  app: {
    title: "Vehicle Bill of Sale",
    // Subtitle is rendered dynamically by app.js using the selected state's
    // honorific and name (e.g. "Commonwealth of Virginia", "State of California",
    // "District of Columbia").
    subtitleTemplate: "{honorific} of {name}",
    subtitleNoHonorific: "{name}",
    footerDisclaimerTemplate: "Not a substitute for {name} DMV title transfer requirements.",
    // Shown before the user has picked a state (so the header keeps its
    // height and the page doesn't reflow once a state is committed).
    subtitleNoState: "Select a state",
    footerDisclaimerNoState: "Not legal advice. Verify with your state DMV before relying on this document.",
  },
  actions: {
    back: "Back",
    continue: "Continue",
    clear: "Clear form",
    download: "Download PDF",
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
        sub: "Pick a state and your role.",
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
    usState: { label: "Which US state?", req: true },
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
      hint: "17 characters. We exclude letters I, O, and Q.",
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
        actual: "Reflects actual mileage",
        not_actual: "Does not reflect actual mileage",
        exceeds: "Exceeds mechanical limits",
      },
    },
  },
  parties: {
    firstName: { label: "First name", req: true },
    middleName: { label: "Middle name (optional)", req: false },
    lastName: { label: "Last name", req: true },
    street: { label: "Street address", req: true },
    city: { label: "City", req: true },
    state: { label: "State", req: true },
    zip: { label: "ZIP", req: true },
    phone: { label: "Phone (optional)", req: false },
    license: {
      label: "Driver's license / ID number (optional)",
      req: false,
      hint: "Helps the DMV match the title.",
    },
    coOwnerToggle: { label: "Two people on the title", req: false },
    coOwnerSameAddress: { label: "Co-owner shares this address", req: false },
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
  },
  review: {
    title: "Review & download",
    sub: "Verify the document below, then download.",
  },
  errors: {
    required: "Required.",
    vin: "Must be exactly 17 characters; letters I, O, and Q are not allowed.",
    hin: "Must be exactly 12 characters.",
    year: "Enter a year between 1900 and next year.",
    zip: "Use the format 12345 or 12345-6789.",
    price: "Enter a positive amount.",
    date: "Enter a valid date.",
    dateFuture: "Sale date can't be in the future.",
    phone: "Enter a 10-digit phone number.",
    usState: "Pick a US state.",
  },
  pdf: {
    title: "VEHICLE BILL OF SALE",
    subtitle: "Commonwealth of Virginia",
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
    footerDisclaimer: "Generated {timestamp}. Not a substitute for Virginia DMV title transfer requirements.",
  },
};
