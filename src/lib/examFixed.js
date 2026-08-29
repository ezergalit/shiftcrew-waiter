// A knowledge card is menu-shaped but is not a dish — same rule as pubToCard and the
// manager app's health card. Kept in its own module so the three users agree.
export const isKnowledgeCard = (c) =>
  (c?.category || "").startsWith("הדרכת") || (c?.name || "").startsWith("מה חשוב לדעת");
