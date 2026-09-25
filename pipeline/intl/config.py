"""Which places and which indicators the "Uganda and the world" section uses.

Every indicator is defined once here: its source and code, a plain label,
unit, topic, and whether higher is better (None when neither is).
"""

from __future__ import annotations

# ---- places -------------------------------------------------------------------
# code: ISO3 for countries; our own codes for aggregates, mapped per source below.
PLACES = {
    "UGA": "Uganda",
    # East Africa
    "KEN": "Kenya", "TZA": "Tanzania", "RWA": "Rwanda", "BDI": "Burundi",
    "SSD": "South Sudan", "COD": "DR Congo", "ETH": "Ethiopia",
    # Africa's biggest economies
    "NGA": "Nigeria", "ZAF": "South Africa", "EGY": "Egypt", "GHA": "Ghana",
    # The world's biggest economies
    "USA": "United States", "CHN": "China", "IND": "India", "JPN": "Japan",
    "DEU": "Germany", "GBR": "United Kingdom", "BRA": "Brazil",
    # Averages
    "SSA": "Sub-Saharan Africa", "LIC": "Low-income countries", "WLD": "World",
}
AGGREGATES = {"SSA", "LIC", "WLD"}

GROUPS = {
    "east-africa": {"label": "East Africa", "places": ["UGA", "KEN", "TZA", "RWA", "BDI", "SSD", "COD", "ETH"]},
    "africa": {"label": "Africa’s biggest", "places": ["UGA", "NGA", "ZAF", "EGY", "ETH", "KEN", "GHA"]},
    "world": {"label": "Biggest economies", "places": ["UGA", "USA", "CHN", "IND", "JPN", "DEU", "GBR", "BRA"]},
}

# Aggregate codes in each source. WHO has no low-income group, and its Africa
# region is not the same as sub-Saharan Africa, so it gets its own label.
AGG_CODES = {
    "wb": {"SSA": "SSF", "LIC": "LIC", "WLD": "WLD"},
    "imf": {"SSA": "SSQ", "LIC": "LIC", "WLD": "WEOWORLD"},
    "who": {"SSA": "AFR", "WLD": "GLOBAL"},
}
AGG_LABEL_OVERRIDE = {"who": {"SSA": "Africa (WHO region)"}}

# ---- indicators ------------------------------------------------------------------
# (id, source, code, label, unit, digits, topic, better, note)
# unit: '%', 'US$', 'intl $', 'years', 'per 1,000', 'per 100,000', ...; used for formatting.
INDICATORS = [
    # Economy
    ("gdp_growth", "imf", "NGDP_RPCH", "Economic growth", "%", 1, "Economy", "higher", "Real GDP growth, % a year. IMF projections are shown dashed."),
    ("gdp_pc_ppp", "imf", "PPPPC", "Income per person (adjusted for prices)", "intl $", 0, "Economy", "higher", "GDP per person in international dollars (purchasing power parity), so a dollar buys the same everywhere."),
    ("gdp_pc_usd", "imf", "NGDPDPC", "Income per person (US dollars)", "US$", 0, "Economy", "higher", "GDP per person at market exchange rates."),
    ("inflation", "imf", "PCPIPCH", "Inflation", "%", 1, "Economy", None, "Average consumer price inflation, % a year."),
    ("debt", "imf", "GGXWDG_NGDP", "Government debt", "% of GDP", 1, "Economy", "lower", "General government gross debt."),
    ("tax", "wb", "GC.TAX.TOTL.GD.ZS", "Tax collected", "% of GDP", 1, "Economy", None, "Central government tax revenue."),
    ("exports", "wb", "NE.EXP.GNFS.ZS", "Exports", "% of GDP", 1, "Economy", None, "Exports of goods and services."),
    ("fdi", "wb", "BX.KLT.DINV.WD.GD.ZS", "Foreign investment coming in", "% of GDP", 1, "Economy", None, "Foreign direct investment, net inflows."),
    ("remittances", "wb", "BX.TRF.PWKR.DT.GD.ZS", "Money sent home from abroad", "% of GDP", 1, "Economy", None, "Personal remittances received."),
    ("poverty_3", "wb", "SI.POV.DDAY", "Living on under $3 a day", "%", 1, "Economy", "lower", "World Bank international poverty line ($3.00 a day, 2021 prices). Not the same as UBOS’s national poverty line."),
    # People
    ("population", "wb", "SP.POP.TOTL", "Population", "people", 0, "People", None, ""),
    ("pop_growth", "wb", "SP.POP.GROW", "Population growth", "%", 1, "People", None, "% a year."),
    ("fertility", "wb", "SP.DYN.TFRT.IN", "Children per woman", "births", 1, "People", None, "Total fertility rate."),
    ("under15", "wb", "SP.POP.0014.TO.ZS", "Children under 15", "% of people", 1, "People", None, ""),
    ("urban", "wb", "SP.URB.TOTL.IN.ZS", "Living in towns and cities", "% of people", 1, "People", None, ""),
    # Health
    ("life_exp", "who", "WHOSIS_000001", "Life expectancy", "years", 1, "Health", "higher", "Life expectancy at birth, both sexes (WHO)."),
    ("under5", "wb", "SH.DYN.MORT", "Children dying before age 5", "per 1,000 births", 1, "Health", "lower", "UN estimates (IGME)."),
    ("maternal", "wb", "SH.STA.MMRT", "Mothers dying in childbirth", "per 100,000 births", 0, "Health", "lower", "Maternal mortality ratio, UN estimates."),
    ("malaria", "who", "MALARIA_EST_INCIDENCE", "Malaria cases", "per 1,000 at risk", 0, "Health", "lower", "Estimated new cases a year per 1,000 people at risk (WHO)."),
    ("uhc", "who", "UHC_INDEX_REPORTED", "Health service coverage", "index 0–100", 0, "Health", "higher", "WHO universal health coverage service index."),
    ("doctors", "who", "HWF_0001", "Doctors", "per 10,000 people", 1, "Health", "higher", "Medical doctors per 10,000 people (WHO)."),
    ("health_spend", "wb", "SH.XPD.CHEX.PC.CD", "Health spending per person", "US$", 0, "Health", None, "Current health expenditure per person, all sources."),
    # Education
    ("primary_completion", "wb", "SE.PRM.CMPT.ZS", "Children finishing primary school", "%", 1, "Education", "higher", "Primary completion rate, % of the relevant age group."),
    ("secondary", "wb", "SE.SEC.ENRR", "Secondary school enrolment", "%", 1, "Education", "higher", "Gross enrolment ratio (can exceed 100% when older pupils attend)."),
    ("literacy", "wb", "SE.ADT.LITR.ZS", "Adults who can read and write", "%", 1, "Education", "higher", "Adult literacy rate, 15 and over."),
    # Jobs
    ("women_work", "wb", "SL.TLF.CACT.FE.ZS", "Women in the labour force", "%", 1, "Jobs", None, "Women 15+ working or looking for work (ILO modelled estimate)."),
    ("agri_jobs", "wb", "SL.AGR.EMPL.ZS", "Jobs in farming", "% of jobs", 1, "Jobs", None, "Employment in agriculture (ILO modelled estimate)."),
    # Energy & connections
    ("electricity", "wb", "EG.ELC.ACCS.ZS", "People with electricity", "%", 1, "Energy & internet", "higher", ""),
    ("clean_cooking", "wb", "EG.CFT.ACCS.ZS", "People cooking with clean fuels", "%", 1, "Energy & internet", "higher", "Mostly gas or electricity rather than charcoal or firewood."),
    ("internet", "wb", "IT.NET.USER.ZS", "Internet users", "% of people", 1, "Energy & internet", "higher", ""),
    ("mobile", "wb", "IT.CEL.SETS.P2", "Mobile phone subscriptions", "per 100 people", 0, "Energy & internet", None, ""),
    ("forest", "wb", "AG.LND.FRST.ZS", "Land covered by forest", "% of land", 1, "Energy & internet", None, ""),
]

TOPICS = ["Economy", "People", "Health", "Education", "Jobs", "Energy & internet"]

SOURCES = {
    "wb": {"title": "World Bank, World Development Indicators", "url": "https://data.worldbank.org/", "license": "CC BY 4.0"},
    "imf": {"title": "IMF, World Economic Outlook", "url": "https://www.imf.org/external/datamapper/", "license": "IMF terms of use"},
    "who": {"title": "WHO, Global Health Observatory", "url": "https://www.who.int/data/gho", "license": "CC BY-NC-SA 3.0 IGO"},
}

FIRST_YEAR = 1990
