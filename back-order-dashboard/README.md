# Back Order Dashboard

A production-grade supply chain dashboard built with Next.js 14, Tailwind CSS, and Recharts. Designed for high-density operational tracking of backorders with automated aging analysis and ETA grouping.

## Features

- **Dashboard**: High-level KPIs, aging distribution, and monthly trends.
- **Action Board**: Segmented priority views for items requiring immediate attention (Overdue ETA, Urgent without ETA, etc.).
- **Detail View**: Full dataset exploration with global search, multi-column sorting, and CSV export.
- **CSV Data Processing**: Local CSV parsing and transformation with zero backend dependencies.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Parsing**: Papa Parse
- **Icons**: Lucide React

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Deploy to Vercel
```bash
vercel deploy --prod
```

## Data Format

The dashboard accepts CSV files with the following headers (UTF-8 with BOM):
`DocDate, DocNo, OPropertyName, BranchCode, BranchName, BranchCodeReceipt, ItemCode, ItemName, TypeCar, QuantityRemainClose, EstimatedDescription, EstimatedDate1, RowId, RowId_S2, KhoNo, SR-ĐL2`

Sample data is provided in `data/sample.csv`.
