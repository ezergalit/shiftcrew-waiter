// TEMP DEV FALLBACK — mirrors the real seeded Salon Yevani menu (menu_app.published_menu)
// so the offline session in TeamLogin.jsx has real content to render instead of empty
// screens. Remove alongside the offline-session code once Supabase is confirmed healthy.
export const MOCK_CARDS = [
  { id: "m1", category: "starters", name: "Greek Caesar Salad", price: 78, desc: "סלט קיסר בסגנון יווני עם עלי סלט הרומן טרי, פרמזן קשה, חומוס בתנור, ורוטב קיסר קלאסי", ingredients: ["חסה רומן", "פרמזן", "חומוס", "רוטב קיסר"], allergens: ["לקטוז"], isSpecial: true },
  { id: "m2", category: "starters", name: "Helios", price: 78, desc: "סלט עדין עם גבינת פתה, עגבניות שרי, מלפפון, זיתים שחורים ובצל אדום", ingredients: ["פטה", "עגבניות שרי", "מלפפון", "זיתים שחורים", "בצל אדום"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m3", category: "starters", name: "Greek Truffle Cream 44", price: 44, desc: "קרם שמנת משובח בטעם כמהין שחור, מוגש עם לחם ים לבן חם ומצע עדשים", ingredients: ["שמנת", "כמהין שחור", "לחם", "עדשים"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m4", category: "starters", name: "Greek Truffle Cream 38", price: 38, desc: "קרם שמנת בטעם כמהין שחור, מוגש עם צלחת הורדבור וקרקרים", ingredients: ["שמנת", "כמהין שחור", "קרקרים"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m5", category: "starters", name: "Greek Truffle Cream 48", price: 48, desc: "קרם שמנת עשיר בטעם כמהין שחור, מוגש עם לחם בחמאה טרייה וזיתים", ingredients: ["שמנת", "כמהין שחור", "לחם", "חמאה", "זיתים"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m6", category: "mains", name: "Mykonos Tuna", price: 98, desc: "פסטת פטוצ׳יני טרייה עם סלמון אדום וטונה בדקואז׳ וכוסקוס, סלט ירוק צעיר", ingredients: ["פטוצ׳יני", "סלמון", "טונה", "כוסקוס"], allergens: [], isSpecial: false },
  { id: "m7", category: "mains", name: "Truffle Olympus", price: 98, desc: "פסטה מטרופל שחור, בולוטיני אלפונסו, קציפת פרמזן, רוטב חמאה", ingredients: ["פסטה", "כמהין", "פרמזן", "חמאה"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m8", category: "mains", name: "Greek Pomodoro", price: 92, desc: "פסטה עם רוטב עגבניות טרי (סן מרזאנו), שום, בזיליקום, זית ירוק — ללא שמנת", ingredients: ["עגבניות סן מרזאנו", "שום", "בזיליקום", "זית ירוק"], allergens: [], isSpecial: false },
  { id: "m9", category: "mains", name: "Santorini Puttanesca", price: 96, desc: "פסטה לינגוויני עם זיתים שחורים, קייפרס, טונה ואנשובי, שום וגרידת לימון", ingredients: ["לינגוויני", "זיתים שחורים", "קייפרס", "טונה", "אנשובי"], allergens: [], isSpecial: false },
  { id: "m10", category: "mains", name: "Spanakopita Pasta", price: 92, desc: "פסטה בטעם בורקת תרד יוונית — תערובת תרד וגבינת פטה, רוטב שמנת", ingredients: ["תרד", "פטה", "שמנת", "פסטה"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m11", category: "mains", name: "Greek Cheese Clouds", price: 110, desc: "פסטה עשירה בשלוש גבינות יווניות — פרמזן, מוצרלה וגבינה כחולה", ingredients: ["פרמזן", "מוצרלה", "גבינה כחולה", "פסטה"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m12", category: "mains", name: "Sea Fish 155", price: 155, desc: "דגה טרייה במשקל 350-400 גרם, צלויה בתנור בסגנון יווני קלאסי, שמן זית וזעתר", ingredients: ["דג ים", "שמן זית", "לימון", "זעתר"], allergens: [], isSpecial: false },
  { id: "m13", category: "mains", name: "Sea Tuna 168", price: 168, desc: "סטייק טונה בעובי גבוה, מטוגן קל על משטח חם, טעם ים חזק וטרי", ingredients: ["טונה", "שמן זית", "רוטב סויה"], allergens: [], isSpecial: false },
  { id: "m14", category: "mains", name: "Sea Bass 165", price: 165, desc: "בס ים שלם במשקל 350-400 גרם, צלוי בתנור עם לימון טרי, תרד וחמאה", ingredients: ["בס ים", "לימון", "תרד", "חמאה"], allergens: ["לקטוז"], isSpecial: false },
  { id: "m15", category: "mains", name: "Full Sea Bass 600", price: 600, desc: "בס ים שלם וגדול (1.2-1.5 ק\"ג), צלוי בתנור — מנה מרשימה לשולחן של 3-4 סועדים", ingredients: ["בס ים", "שמן זית", "עשבי תיבול"], allergens: [], isSpecial: false },
  { id: "m16", category: "desserts", name: "Sweet Greek Finale", price: 72, desc: "סיום מתוק בסגנון יווני — בקלווה בדבש וחמאה, אגוזים וזרעי שומשום", ingredients: ["בצק פילו", "אגוזים", "דבש", "שומשום"], allergens: ["אגוזים", "גלוטן", "לקטוז"], isSpecial: false },
  { id: "m17", category: "desserts", name: "Galaktoboureko", price: 72, desc: "עוגת קרם סולת יוונית מסורתית בבצק פילו פריך, מוגשת עם סירופ דבש חם", ingredients: ["בצק פילו", "סולת", "חלב", "דבש"], allergens: ["גלוטן", "לקטוז", "ביצים"], isSpecial: false },
  { id: "m18", category: "desserts", name: "Greek Yogurt & Honey", price: 55, desc: "יוגורט יווני סמיך עם דבש פרחים ואגוזי מלך קלויים", ingredients: ["יוגורט יווני", "דבש", "אגוזי מלך"], allergens: ["לקטוז", "אגוזים"], isSpecial: false },
  { id: "m19", category: "desserts", name: "Kataifi", price: 88, desc: "קטאיף פריך במילוי אגוזים, מוגש עם גלידה וסירופ דבש-הדרים", ingredients: ["קטאיף", "אגוזים", "דבש", "גלידה"], allergens: ["אגוזים", "גלוטן", "לקטוז"], isSpecial: false },
];

export const MOCK_BRIEF = {
  missing_items: ["לימון טרי"],
  new_items: ["Greek Caesar Salad — מנת השף, חשוב להמליץ"],
  oven_items: ["Galaktoboureko עד 18:00"],
  notes: "",
};

export const MOCK_LEADERBOARD = [
  { team_member_id: "demo-1", name: "נועה", points: 800, mastered_count: 8, streak: 3 },
  { team_member_id: "demo-2", name: "איתי", points: 500, mastered_count: 5, streak: 1 },
];
