"""How the site is organised, and where each topic lives on ubos.org.

UBOS groups its data by the agency that produces it. We group by the question a
reader has ("How is the economy doing?"), so our sections are themes, and each
topic maps back to one or more UBOS category pages (ubos.org/explore-statistics/<id>/).
"""

SECTIONS = [
    {
        "slug": "people",
        "name": "People & Society",
        "blurb": "Who we are, how we learn, work, stay healthy and stay safe.",
        "topics": [
            {"slug": "population", "name": "Population", "ubos_ids": [20]},
            {"slug": "education", "name": "Education", "ubos_ids": [21]},
            {"slug": "health", "name": "Health", "ubos_ids": [25]},
            {"slug": "jobs", "name": "Jobs & Earnings", "ubos_ids": [22]},
            {"slug": "poverty", "name": "Income & Poverty", "ubos_ids": [33]},
            {"slug": "crime", "name": "Crime & Road Safety", "ubos_ids": [26]},
            {"slug": "gender", "name": "Gender", "ubos_ids": [67]},
            {"slug": "households", "name": "Household Life", "ubos_ids": [23, 69]},
            {"slug": "governance", "name": "Governance & Services", "ubos_ids": [34, 36]},
        ],
    },
    {
        "slug": "economy",
        "name": "Economy",
        "blurb": "Prices, growth, trade and public money.",
        "topics": [
            {"slug": "prices", "name": "Prices & Inflation", "ubos_ids": [30]},
            {"slug": "gdp", "name": "Economic Growth (GDP)", "ubos_ids": [9]},
            {"slug": "trade", "name": "Trade", "ubos_ids": [10]},
            {"slug": "government-finance", "name": "Government Spending", "ubos_ids": [11]},
            {"slug": "banking", "name": "Banking & Money", "ubos_ids": [12, 13]},
            {"slug": "key-indicators", "name": "Key Indicators", "ubos_ids": [64]},
        ],
    },
    {
        "slug": "production",
        "name": "Production",
        "blurb": "What we grow, build, mine, move and sell.",
        "topics": [
            {"slug": "agriculture", "name": "Agriculture & Fishing", "ubos_ids": [2]},
            {"slug": "industry", "name": "Business & Industry", "ubos_ids": [32]},
            {"slug": "construction", "name": "Construction", "ubos_ids": [5]},
            {"slug": "energy", "name": "Energy & Fuel", "ubos_ids": [4]},
            {"slug": "mining", "name": "Mining", "ubos_ids": [65]},
            {"slug": "transport", "name": "Transport", "ubos_ids": [29]},
            {"slug": "communication", "name": "Phones & Internet", "ubos_ids": [28, 77]},
            {"slug": "tourism", "name": "Tourism & Migration", "ubos_ids": [7]},
        ],
    },
    {
        "slug": "environment",
        "name": "Environment",
        "blurb": "Land, water and climate.",
        "topics": [
            {"slug": "climate", "name": "Climate", "ubos_ids": [16]},
            {"slug": "land", "name": "Land", "ubos_ids": [14]},
            {"slug": "water", "name": "Water", "ubos_ids": [18]},
            {"slug": "environment", "name": "Natural Environment", "ubos_ids": [78]},
        ],
    },
    {
        "slug": "wellbeing",
        "name": "Wellbeing",
        "blurb": "National standard indicators on income, assets and vulnerability.",
        "topics": [
            {"slug": "nsi-income", "name": "Household Income", "ubos_ids": [70]},
            {"slug": "human-assets", "name": "Human Assets", "ubos_ids": [71]},
            {"slug": "vulnerability", "name": "Economic Vulnerability", "ubos_ids": [72]},
        ],
    },
    {
        "slug": "places",
        "name": "Places",
        "blurb": "Districts, sub-regions and how Uganda is divided up.",
        "topics": [
            {"slug": "admin-units", "name": "Administrative Units", "ubos_ids": [17]},
        ],
    },
]

# Compendium-style categories: indexed in the catalog but not shown as a topic.
REFERENCE_IDS = {74: "Annual Statistical Abstract", 39: "Standards, Methods and Classifications"}


def all_ubos_ids() -> dict[int, str]:
    ids = {uid: t["slug"] for s in SECTIONS for t in s["topics"] for uid in t["ubos_ids"]}
    ids.update({uid: "reference" for uid in REFERENCE_IDS})
    return ids
