"""Build the cleaned district file and data.js from the raw ACS downloads.

Inputs (in data/raw/), downloaded from data.census.gov for all unified school
districts in Arizona, ACS 2020-2024 5-year estimates:
  DP02.csv, DP03.csv, DP04.csv (data profiles) and B17024.csv
  (age by ratio of income to poverty level).

Outputs:
  data/districts.csv  one row per district, one column per indicator
  data.js             the same data for the web page

Run from the repository root:  python scripts/build_data.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SMALL = 500  # districts with fewer school-age children are flagged

# code, label, what it measures, census source
INDICATORS = [
    ("inc185", "Kids below 185% of poverty", "Percent of children ages 6 to 17 in families below 185 percent of the poverty line. This is the FRPL reduced-price income line.", "B17024, ages 6 to 11 and 12 to 17, ratio bands under 1.85"),
    ("pov517", "Kids below poverty", "Percent of related children ages 5 to 17 below the poverty line.", "DP03, related children of the householder 5 to 17 years below poverty"),
    ("snap", "SNAP households", "Percent of households that received SNAP (food stamps) in the past 12 months.", "DP03, with Food Stamp/SNAP benefits in the past 12 months"),
    ("unins", "Kids uninsured", "Percent of children under 19 with no health insurance.", "DP03, population under 19 years, no health insurance coverage"),
    ("unemp", "Unemployment rate", "Unemployment rate for people 16 and over in the civilian labor force.", "DP03, unemployment rate"),
    ("nobb", "No broadband", "Percent of households without a broadband internet subscription.", "DP02, 100 minus households with a broadband subscription"),
    ("nocomp", "No computer", "Percent of households without a computer.", "DP02, 100 minus households with a computer"),
    ("nohs", "Adults without diploma", "Percent of adults 25 and over without a high school diploma or equivalent.", "DP02, 100 minus high school graduate or higher"),
    ("lep", "Limited English", "Percent of people 5 and over who speak English less than \"very well.\"", "DP02, speak English less than \"very well\""),
    ("noveh", "No vehicle", "Percent of households with no vehicle available.", "DP04, no vehicles available"),
    ("crowd", "Crowded housing", "Percent of households with more than one person per room.", "DP04, 1.01 or more occupants per room"),
    ("plumb", "No complete plumbing", "Percent of households lacking complete plumbing.", "DP04, lacking complete plumbing facilities"),
    ("rentburden", "Rent burden", "Percent of renter households paying 35 percent or more of income on rent.", "DP04, gross rent 35.0 percent or more of household income"),
]


def load(table):
    df = pd.read_csv(RAW / f"{table}.csv", dtype=str)
    df.iloc[:, 0] = df.iloc[:, 0].str.replace("\xa0", " ").str.strip()
    return df


def num(value):
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return np.nan
    text = str(value).strip().replace("%", "").replace(",", "").replace("±", "")
    try:
        return float(text)
    except ValueError:
        return np.nan


def main():
    tables = {t: load(t) for t in ["DP02", "DP03", "DP04", "B17024"]}
    names = [c.split("!!")[0] for c in tables["DP02"].columns if c.endswith("!!Estimate")]
    names = [n for n in names if not n.startswith("Remainder")]

    def get(table, row, name, kind):
        # rows are found by position because DP labels repeat (for example
        # "Speak English less than very well" appears once per language group)
        return num(tables[table].loc[row, f"{name}!!{kind}"])

    rows = []
    for name in names:
        b = lambda r: get("B17024", r, name, "Estimate")
        kids = b(14) + b(27)  # 6 to 11 years, 12 to 17 years
        below185 = sum(b(r) for r in list(range(15, 22)) + list(range(28, 35)))
        rows.append({
            "district": name.replace(", Arizona", ""),
            "kids": int(round(kids)),
            "inc185": 100 * below185 / kids if kids > 0 else np.nan,
            "pov517": get("DP03", 139, name, "Percent"),
            "snap": get("DP03", 79, name, "Percent"),
            "unins": get("DP03", 107, name, "Percent"),
            "unemp": get("DP03", 9, name, "Percent"),
            "nobb": 100 - get("DP02", 171, name, "Percent"),
            "nocomp": 100 - get("DP02", 170, name, "Percent"),
            "nohs": 100 - get("DP02", 74, name, "Percent"),
            "lep": get("DP02", 130, name, "Percent"),
            "noveh": get("DP04", 65, name, "Percent"),
            "crowd": get("DP04", 88, name, "Percent") + get("DP04", 89, name, "Percent"),
            "plumb": get("DP04", 82, name, "Percent"),
            "rentburden": get("DP04", 158, name, "Percent"),
            "pov517_moe": get("DP03", 139, name, "Percent Margin of Error"),
            "medinc": get("DP03", 67, name, "Estimate"),
        })

    df = pd.DataFrame(rows).sort_values("district").reset_index(drop=True)
    codes = [i[0] for i in INDICATORS]
    df[codes + ["pov517_moe"]] = df[codes + ["pov517_moe"]].round(1)
    df["medinc"] = df["medinc"].round(0).astype(int)
    df["small"] = df["kids"] < SMALL
    assert not df[codes].isna().any().any(), "missing indicator values"

    df.to_csv(ROOT / "data" / "districts.csv", index=False)
    payload = {
        "source": "U.S. Census Bureau, American Community Survey 2020-2024 5-year estimates, tables DP02, DP03, DP04 and B17024",
        "smallCutoff": SMALL,
        "indicators": [dict(code=c, label=l, desc=d, source=s) for c, l, d, s in INDICATORS],
        "districts": json.loads(df.to_json(orient="records")),
    }
    (ROOT / "data.js").write_text("window.ACTIVITY_DATA = " + json.dumps(payload, indent=1) + ";\n", encoding="utf-8")
    print(f"{len(df)} districts written")


if __name__ == "__main__":
    main()
