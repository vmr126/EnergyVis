# US Power Plants Interactive Map

Interactive geospatial visualization of 13,000+ power generation facilities across the United States.

## Features
- Real-time filtering by fuel type, state, and balancing authority
- Interactive map with 13,370 power plants
- Dark mode UI
- Searchable filters with performance optimization

## Tech Stack
- **Frontend**: React, Leaflet, React-Leaflet
- **Data Processing**: Python, pandas
- **Data Source**: EIA Form EIA-860 (2024)
- **Deployment**: Vercel

## Live Demo
[View Live Site](https://your-app.vercel.app)

## Local Development
```bash
npm install
npm start
```

## Data Processing
See `process_us_power_plant_data.py` for data extraction and transformation from EIA-860 Excel files.