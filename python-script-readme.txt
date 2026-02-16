# EIA-860 Power Plant Data Processor

Python script to process U.S. Energy Information Administration (EIA) Form EIA-860 data and convert it into a clean JSON format for web visualization.

## Overview

This script extracts and transforms power plant data from the EIA-860 Excel files, combining plant location data with generator capacity information to create a comprehensive dataset of U.S. power generation facilities.

## Data Source

**U.S. Energy Information Administration (EIA) Form EIA-860**
- Download from: https://www.eia.gov/electricity/data/eia860/
- Files needed:
  - `2___Plant_Y2024.xlsx` - Plant-level data (location, operator, balancing authority)
  - `3_1_Generator_Y2024.xlsx` - Generator-level data (capacity by fuel type)

## Requirements

```bash
pip install pandas openpyxl
```

- **Python**: 3.7+
- **pandas**: Data processing and Excel file handling
- **openpyxl**: Excel file reading engine

## Usage

### Basic Usage

1. Download the EIA-860 Excel files (see Data Source above)
2. Place them in the same directory as the script
3. Run the script:

```bash
python process_pepco_data.py
```

### Output

The script generates `us-power-plants.json` containing:

```json
[
  {
    "name": "Plant Name",
    "state": "CA",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "primaryFuel": "Natural Gas",
    "totalCapacity": 500.5,
    "operator": "Utility Company Name",
    "balancingAuthorityCode": "CISO",
    "balancingAuthorityName": "California Independent System Operator",
    "transmissionOwner": "Grid Operator Name",
    "nercRegion": "WECC",
    "sector": "Electric Utility",
    "fuelBreakdown": {
      "Natural Gas": 450.0,
      "Solar": 50.5
    }
  }
]
```

## Features

### Data Processing
- ✅ Combines plant and generator data from separate Excel files
- ✅ Aggregates generator capacity by fuel type at the plant level
- ✅ Determines primary fuel source based on highest capacity
- ✅ Handles missing data (NaN values) gracefully
- ✅ Converts "N/A" balancing authority codes to "Unlisted"
- ✅ Filters out plants without valid coordinates

### Data Fields Extracted

**Location & Identity:**
- Plant name and EIA plant code
- State, latitude, longitude
- NERC region

**Operational Details:**
- Utility/operator name
- Balancing authority (code and full name)
- Transmission/distribution system owner
- Sector classification

**Generation Capacity:**
- Total capacity (MW)
- Primary fuel type
- Detailed fuel breakdown by type:
  - Natural Gas
  - Nuclear
  - Coal
  - Solar
  - Wind
  - Hydro
  - Petroleum
  - Other

### Data Quality

The script implements several data cleaning steps:

1. **NaN Handling**: Converts pandas NaN values to "Unknown" or "Unlisted"
2. **Coordinate Validation**: Filters out plants with missing lat/lon
3. **Capacity Validation**: Only includes plants with total capacity > 0 MW
4. **Fuel Type Mapping**: Maps EIA fuel codes to readable names
5. **Data Type Conversion**: Ensures proper JSON-compatible types

## Processing Statistics

After processing, the script displays:
- Total number of plants processed
- Total generation capacity (MW)
- Capacity breakdown by fuel type
- Plants dropped due to missing data

Example output:
```
====================================
SUMMARY
====================================
Total Plants:     13,370
Total Capacity:   1,234,567 MW

Capacity by Fuel Type:
  Natural Gas     456,789 MW (37.0%)
  Nuclear         234,567 MW (19.0%)
  Coal            198,765 MW (16.1%)
  Solar            89,012 MW ( 7.2%)
  Wind             67,890 MW ( 5.5%)
  ...
```

## Customization

### Change Output Filename

Edit the script bottom:
```python
OUTPUT_FILE = "my-custom-name.json"
```

### Filter by Specific States

Modify the processing to filter by state:
```python
# After loading plants_df
states_to_include = ['CA', 'NY', 'TX']
plants_df = plants_df[plants_df['State'].isin(states_to_include)]
```

### Filter by Operator

To filter for specific utilities:
```python
# Filter for specific operator
operator_filter = ['Duke Energy', 'Southern Company']
plants_df = plants_df[plants_df['Utility Name'].isin(operator_filter)]
```

## Troubleshooting

### "File not found" error
- Ensure Excel files are in the same directory as the script
- Check that filenames match exactly (case-sensitive)

### "No module named 'openpyxl'" error
```bash
pip install openpyxl
```

### Excel sheet name errors
- EIA sometimes changes sheet names between years
- Check actual sheet names in Excel files
- Update `sheet_name` parameter in script if needed

### Memory issues with large datasets
- Script processes ~13,000+ plants by default
- For memory-constrained systems, filter by state or region first

## Data Limitations

- Only includes plants ≥1 MW capacity (per EIA-860 reporting threshold)
- Coordinates may be approximate (centroid of facility)
- Some small/rural plants may lack complete data
- Balancing authority assignments can change over time

## Version History

- **v1.0** - Initial release with all U.S. plants
- Data reflects EIA-860 2024 dataset (released September 2025)

## Related Files

- `us-power-plants.json` - Output file for web visualization
- `2___Plant_Y2024.xlsx` - Input plant data (not included in repo)
- `3_1_Generator_Y2024.xlsx` - Input generator data (not included in repo)

## License

Data is sourced from public U.S. government datasets (EIA Form EIA-860), which are in the public domain.

## Contact

For questions about the visualization project, visit the main repository.

For questions about the source data, visit: https://www.eia.gov/electricity/data/eia860/
