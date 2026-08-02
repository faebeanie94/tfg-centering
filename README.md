# Card Centering Grader — Tree Frog Grading

A mobile-friendly web app for measuring trading card centering to **TFG (Tree Frog Grading)** standards. Take a photo, align borders with level indicators, and get border measurements in mm plus TFG centering grades.

## Features

- **TFG grading standards** — grade thresholds from the official centering tool spreadsheet
- **Front / Back toggle** — separate thresholds per side (e.g. 50/50 front, 60/40 back for TFG 10)
- **Level indicators** — crosshairs turn green when the device is parallel to the card
- **Border editor** — drag green corners (card edge) and yellow handles (artwork border)
- **Measurements** — border widths in mm, L|R and T|B percentages, qualify ratios
- **OC eligibility** — flags when a card may qualify for the Off-Center alt grade

## Getting Started

```bash
npm install
npm run dev
```

Open on your phone (same Wi‑Fi, use `--host`) or desktop.

## How TFG Centering Works

TFG calculates the ratio between the two worst opposing borders (left/right or top/bottom). The **qualify ratio** is the larger border divided by the smaller. Grade is based on the **worst axis**.

| Grade | Front (worst axis) | Back (worst axis) |
|-------|--------------------|-------------------|
| 10    | 50/50              | 60/40             |
| 9.5   | 53/47              | 60/40             |
| 9     | 55/45              | 70/30             |
| 8     | 60/40              | 80/20             |
| 7     | 65/35              | 90/10             |
| 6     | 70/30              | 90/10             |
| 5     | 75/25              | 95/5              |

Reference files in `/reference` include the TFG Grading Standards PDF and centering tool spreadsheet.

## Build

```bash
npm run build
npm run preview
```
