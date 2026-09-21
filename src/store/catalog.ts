export const products = [
  {
    id: "ridge-pack",
    name: "Ridge Daypack",
    category: "Bags",
    price: 12900,
    image: "/northline/ridge.webp",
    color: "Forest",
    size: "22 litres",
    description: "A little less to carry. A little further to go.",
    detail:
      "A considered roll-top silhouette, with a padded laptop sleeve and room for the things that make a day yours.",
    features: [
      "Weather-resistant woven shell",
      "Padded 16-inch laptop compartment",
      "Adjustable roll-top closure",
    ],
  },
  {
    id: "weekend-tote",
    name: "Weekend Tote",
    category: "Bags",
    price: 7800,
    image: "/northline/tote.webp",
    color: "Olive",
    size: "18 litres",
    description: "For the unplanned part of your day.",
    detail:
      "An easy, open canvas carryall. Generous handles, a quiet shape, and space for a spontaneous detour.",
    features: [
      "Structured cotton canvas",
      "Internal essentials pocket",
      "Comfortable shoulder handles",
    ],
  },
  {
    id: "field-organizer",
    name: "Field Organizer",
    category: "Accessories",
    price: 3400,
    image: "/northline/pouch.webp",
    color: "Graphite",
    size: "1.5 litres",
    description: "Small things. In their right place.",
    detail:
      "A compact zip pouch for the cables, keys, and small essentials that tend to disappear at the bottom of a bag.",
    features: [
      "Wide-opening zip",
      "Soft protective lining",
      "Webbing carry loop",
    ],
  },
  {
    id: "daily-bottle",
    name: "Daily Bottle",
    category: "Accessories",
    price: 3200,
    image: "/northline/bottle.webp",
    color: "Chalk",
    size: "600 ml",
    description: "A good habit, made to go with you.",
    detail:
      "A clean, uncomplicated insulated bottle. A comfortable carry loop and a softly textured finish for everyday journeys.",
    features: [
      "Double-wall stainless steel",
      "Screw-top lid",
      "Powder-coated finish",
    ],
  },
] as const;
export type Product = (typeof products)[number];
export const money = (minor: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: minor % 100 ? 2 : 0,
  }).format(minor / 100);
export const productById = (id: string) => products.find((p) => p.id === id);
