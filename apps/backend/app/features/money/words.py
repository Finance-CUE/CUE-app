"""Reading money words (dashboard spec P4): categories from descriptions, and the
merchant a description names. Pure: no I/O. Mirrors the app's keyword lists
(mobile quickAdd/model.ts and categories.ts) so suggestions agree.
"""

import re

# First match wins, so the specific lists come first ("Swiggy Instamart" is groceries).
EXPENSE_WORDS: list[tuple[str, list[str]]] = [
    ("health", ["pharmacy", "medicine", "medicines", "chemist", "doctor", "hospital", "clinic", "apollo", "1mg",
                "pharmeasy", "netmeds", "dentist", "lab test", "health"]),
    ("education", ["course", "udemy", "coursera", "books", "book", "stationery", "tuition", "school fees",
                   "college fees", "exam fee", "education"]),
    ("travel", ["flight", "hotel", "makemytrip", "goibibo", "oyo", "airbnb", "cleartrip", "trip", "holiday", "travel"]),
    ("personal_care", ["salon", "haircut", "barber", "spa", "parlour", "parlor", "urban company", "grooming"]),
    ("subscriptions", ["netflix", "prime video", "amazon prime", "hotstar", "jiohotstar", "disney", "sonyliv", "zee5",
                       "spotify", "youtube premium", "apple music", "icloud", "google one", "chatgpt",
                       "gym membership", "cult fit", "cultfit", "swiggy one", "zomato gold", "subscription"]),
    ("groceries", ["instamart", "blinkit", "zepto", "bigbasket", "big basket", "jiomart", "dmart", "reliance fresh",
                   "grocery", "groceries", "kirana", "sabzi", "vegetables", "veggies", "fruits", "milk", "dairy",
                   "eggs", "bread", "atta", "rice", "dal", "supermarket"]),
    ("food_delivery", ["zomato", "swiggy", "eatsure", "dominos", "pizza", "mcdonalds", "kfc", "burger", "subway",
                       "starbucks", "chaayos", "ccd", "haldiram", "coffee", "chai", "tea", "lunch", "dinner",
                       "breakfast", "snacks", "snack", "restaurant", "cafe", "canteen", "mess", "tiffin", "biryani",
                       "dosa", "momos", "juice", "ice cream", "food", "meal", "dessert", "bakery", "sweets"]),
    ("transport", ["uber", "ola", "rapido", "namma yatri", "auto", "rickshaw", "cab", "taxi", "metro", "bus", "train",
                   "irctc", "petrol", "diesel", "fuel", "cng", "parking", "toll", "fastag", "redbus"]),
    ("bills", ["rent", "electricity", "bescom", "water bill", "gas bill", "cylinder", "lpg", "wifi", "broadband",
               "internet", "airtel", "jio", "vodafone", "bsnl", "recharge", "mobile bill", "phone bill", "dth",
               "maintenance", "society", "emi", "loan", "insurance", "lic", "fees", "bill"]),
    ("shopping", ["amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "croma", "decathlon", "zara", "uniqlo",
                  "ikea", "clothes", "shirt", "jeans", "shoes", "dress", "kurta", "saree", "watch", "headphones",
                  "charger", "gift", "cosmetics", "makeup", "shopping"]),
    ("entertainment", ["bookmyshow", "pvr", "inox", "movie", "movies", "cinema", "concert", "party", "drinks", "beer",
                       "pub", "bar", "club", "bowling", "gaming", "game", "outing", "picnic"]),
]  # fmt: skip

INCOME_WORDS: list[tuple[str, list[str]]] = [
    ("salary", ["salary", "payroll", "stipend", "wages"]),
    ("freelance", ["freelance", "client", "invoice", "project", "gig"]),
    ("interest", ["interest", "fd", "fixed deposit"]),
    ("dividends", ["dividend", "dividends"]),
    ("refunds", ["refund", "cashback", "reversal"]),
    ("gifts", ["gift", "shagun", "birthday"]),
    ("business", ["business", "sales", "shop", "store"]),
]

# How people name categories in questions ("how much on food?").
CATEGORY_NAMES: dict[str, str] = {
    "food": "food_delivery", "eating out": "food_delivery", "delivery": "food_delivery", "restaurants": "food_delivery",
    "groceries": "groceries", "grocery": "groceries", "transport": "transport", "travel": "travel", "cabs": "transport",
    "fuel": "transport", "shopping": "shopping", "bills": "bills", "rent": "bills", "subscriptions": "subscriptions",
    "entertainment": "entertainment", "movies": "entertainment", "health": "health", "medicine": "health",
    "education": "education", "personal care": "personal_care", "salon": "personal_care", "other": "other",
}  # fmt: skip

CATEGORY_LABELS: dict[str, str] = {
    "food_delivery": "Food & delivery", "groceries": "Groceries", "transport": "Transport", "shopping": "Shopping",
    "bills": "Bills", "subscriptions": "Subscriptions", "entertainment": "Entertainment", "health": "Health",
    "education": "Education", "travel": "Travel", "personal_care": "Personal care", "other": "Other",
    "salary": "Salary", "business": "Business income", "freelance": "Freelance", "interest": "Interest",
    "dividends": "Dividends", "gifts": "Gifts", "refunds": "Refunds",
}  # fmt: skip

_STOP = {"paid", "pay", "to", "for", "at", "the", "a", "an", "on", "in", "from", "my", "order", "via", "using", "by", "upi"}


def _text(s: str) -> str:
    return f" {re.sub(r'[^a-z0-9]+', ' ', s.lower())} "


def _has(text: str, words: list[str]) -> bool:
    t = _text(text)
    return any(f" {w} " in t for w in words)


def suggest_expense(description: str) -> str | None:
    """"Swiggy dinner" -> food_delivery; None when nothing matches."""
    return next((c for c, words in EXPENSE_WORDS if _has(description, words)), None)


def suggest_income(source: str) -> str | None:
    return next((c for c, words in INCOME_WORDS if _has(source, words)), None)


def merchant_of(description: str | None) -> str | None:
    """The merchant a description names: its first word that isn't filler.
    "Paid to Zepto" -> "zepto", "Swiggy dinner" -> "swiggy". None for nothing usable."""
    for word in re.sub(r"[^a-z0-9]+", " ", (description or "").lower()).split():
        if word not in _STOP and not word.isdigit() and len(word) >= 2:
            return word[:40]
    return None
