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
    subtitle: "Commonwealth of Virginia",
    footerDisclaimer: "Not a substitute for Virginia DMV title transfer requirements.",
  },
  actions: {
    back: "Back",
    continue: "Continue",
    clear: "Clear form",
    download: "Download PDF",
    backToEdit: "Back to edit",
  },
  step1: {
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
    name: { label: "Full name", req: true },
    street: { label: "Street address", req: true },
    city: { label: "City", req: true },
    state: { label: "State", req: true },
    zip: { label: "ZIP", req: true },
    phone: { label: "Phone (optional)", req: false },
    license: {
      label: "Driver's license / ID number (optional)",
      req: false,
      hint: "Helps Virginia DMV match the title.",
    },
  },
  step2: {
    title: "Seller",
    sub: "Who is selling the vehicle.",
  },
  step3: {
    title: "Buyer",
    sub: "Who is purchasing the vehicle.",
  },
  step4: {
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
    asIsAck: {
      label: "I understand the vehicle is sold as-is, with no warranties expressed or implied.",
      req: true,
    },
  },
  step5: {
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
