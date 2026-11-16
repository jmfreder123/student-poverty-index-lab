# Student Poverty Index Lab

A classroom activity that walks small groups through building a multidimensional index of student need for Arizona's 97 unified school districts, then comparing it with an income-only ranking based on the free and reduced-price lunch (FRPL) income line.

It runs in any browser. Nothing is installed, and nothing a group enters leaves their browser.

## Use it in class

Send students the GitHub Pages link for this repository. Each group works through six steps (about 20 minutes):

1. **Indicators.** Pick four to six of 13 census indicators. The tool flags pairs that move closely together, since counting both gives that idea extra weight.
2. **Weights.** Split 100 points among the chosen indicators.
3. **Scaling.** Choose ranks, 0 to 100, or z-scores. A small table shows how five districts score under each method.
4. **Line.** Choose the share of districts that counts as high need.
5. **Compare.** See the group's top ten next to the income-only top ten, which districts their index added or dropped, and which high-need districts have small samples.
6. **Reflect.** Answer three questions and download a text summary to share in the debrief.

"Reset everything," at the top right of every step, clears the group name, choices and answers and returns to the start. Use it between class sections on a shared laptop.

The income-only ranking uses the share of children ages 6 to 17 in families below 185 percent of the poverty line, the FRPL reduced-price line. The census table has no band at 130 percent, so the free-meal line cannot be rebuilt exactly.

## Data

U.S. Census Bureau, American Community Survey 2020–2024 5-year estimates, tables DP02, DP03, DP04 and B17024, for all unified school districts in Arizona, downloaded from data.census.gov on November 16, 2026.

- `data/raw/` holds the files as downloaded.
- `scripts/build_data.py` turns them into `data/districts.csv` and `data.js`, which the page loads. Run `python scripts/build_data.py` from the repository root (needs pandas and numpy).
- "Remainder of Arizona" is dropped. Elementary-only and high school-only districts are not included because they overlap unified districts.
- Values are rounded to one decimal place for classroom use. Districts with fewer than 500 school-age children are flagged as small samples, a teaching choice rather than a Census rule.
- These are estimates for everyone living in each district, not counts of enrolled students.

## How the index is computed

For each chosen indicator, every district is scaled one of three ways:

- **Ranks:** the share of the other districts with a lower value, times 100.
- **0 to 100:** (value − minimum) / (maximum − minimum) × 100.
- **z-scores:** (value − mean) / population standard deviation.

The index is the weighted average of the scaled values. Rank 1 is the most need. Exact ties go to the district listed first alphabetically. A matching Excel workbook used in the same activity gives identical rankings.

## Files

- `index.html`, `style.css`, `app.js`: the page
- `data.js`: the cleaned data the page reads
- `data/`: raw and cleaned data
- `scripts/build_data.py`: the cleaning script

Built by John M. Fredericks, Arizona State University.
