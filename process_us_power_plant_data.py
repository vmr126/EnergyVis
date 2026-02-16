import pandas as pd
import json

# ========================================
# EIA-860 PEPCO DATA PROCESSOR
# ========================================
# This script processes EIA-860 Excel files to extract power plant data
# specifically for Potomac Electric Power Company (PEPCO)
#
# INPUT: Two Excel files from EIA-860 dataset
#   - 2___Plant_Y2024.xlsx (plant locations and operators)
#   - 3_1_Generator_Y2024.xlsx (generator capacity by fuel type)
#
# OUTPUT: pepco-plants.json (ready for web visualization)
# ========================================
def clean_value(value, default='Unknown'):
    """Convert NaN and None values to valid JSON strings"""
    if pd.isna(value) or value is None:
        return default
    return str(value).strip() if value else default

def process_us_plant_data(plant_file, generator_file, output_file='us-plants.json'):
    """
    Process EIA-860 data to extract U.S. power plants with full details.
    
    Args:
        plant_file: Path to the Plant Excel file (2___Plant_Y2024.xlsx)
        generator_file: Path to the Generator Excel file (3_1_Generator_Y2024.xlsx)
        output_file: Output JSON filename (default: us-plants.json)
    """
    
    print("=" * 60)
    print("EIA-860 U.S. Power Plant DATA PROCESSOR")
    print("=" * 60)
    
    # ========================================
    # STEP 1: Load Plant Data
    # ========================================
    print("\n[1/5] Loading plant data...")
    try:
        # Read the Plant file - it typically has data in the first sheet
        plants_df = pd.read_excel(plant_file, sheet_name='Plant', header=1)
        print(f"   ✓ Loaded {len(plants_df)} total plants")
        print(f"   ✓ Columns: {list(plants_df.columns[:10])}...")  # Show first 10 columns
    except Exception as e:
        print(f"   ✗ Error loading plant file: {e}")
        print("   Tip: Check if the sheet name is correct. Common names: 'Plant', 'Operable', 'Data'")
        return
    
    # ========================================
    # STEP 2: Filter for US Power Plants
    # ========================================
    print("\n[2/5] Filtering for U.S. power plants...")
    
    # Common column names for utility/operator - try multiple variations
    utility_columns = ['Transmission or Distribution System Owner']
    
    utility_col = None
    for col in utility_columns:
        if col in plants_df.columns:
            utility_col = col
            break
    
    if utility_col is None:
        print(f"   ⚠ Could not find utility column. Available columns:")
        print(f"   {list(plants_df.columns)}")
        print("\n   Please check the column name in the Excel file.")
        return
    
    print(f"   ✓ Using column: '{utility_col}'")
    
    us_plants = plants_df.copy()
        
    print(f"   ✓ Found {len(us_plants)} total plants")
    
    if len(us_plants) == 0:
        print("\n   ⚠ No plants found. Let's see what utilities exist:")
        print(f"   Sample utilities: {plants_df[utility_col].unique()[:20]}")
        return
    
    # ========================================
    # STEP 3: Load Generator Data
    # ========================================
    print("\n[3/5] Loading generator data...")
    try:
        generators_df = pd.read_excel(generator_file, sheet_name='Operable', header=1)
        print(f"   ✓ Loaded {len(generators_df)} generators")
    except Exception as e:
        print(f"   ✗ Error loading generator file: {e}")
        print("   Tip: Check if the sheet name is 'Operable'. Other common names: 'Generator', 'Data'")
        return
    
    # ========================================
    # STEP 4: Process and Combine Data
    # ========================================
    print("\n[4/5] Processing and combining data...")

    # Get list of U.S. plant codes
    us_plant_codes = us_plants['Plant Code'].unique()
    print(f"   ✓ U.S. plant codes: {len(us_plant_codes)}")

    # Filter generators for U.S. plants
    us_generators = generators_df[
        generators_df['Plant Code'].isin(us_plant_codes)
    ]

    print(f"   ✓ Found {len(us_generators)} generators at U.S. plants")

    # DEBUG: Let's see why we're losing plants
    print("\n   DEBUG: Checking data quality...")
    plants_with_coords = 0
    plants_without_coords = 0
    plants_with_generators = 0
    plants_without_generators = 0

    for plant_code in us_plant_codes:
        plant_row = us_plants[us_plants['Plant Code'] == plant_code].iloc[0]
        plant_gens = us_generators[us_generators['Plant Code'] == plant_code]
        
        has_lat = not pd.isna(plant_row.get('Latitude', None))
        has_lon = not pd.isna(plant_row.get('Longitude', None))
        has_gens = len(plant_gens) > 0
        
        if has_lat and has_lon:
            plants_with_coords += 1
        else:
            plants_without_coords += 1
            print(f"   ⚠ Missing coordinates: {plant_row.get('Plant Name', 'Unknown')} (Code: {plant_code})")
        
        if has_gens:
            plants_with_generators += 1
        else:
            plants_without_generators += 1
            print(f"   ⚠ No generators found: {plant_row.get('Plant Name', 'Unknown')} (Code: {plant_code})")

    print(f"\n   Plants with coordinates: {plants_with_coords}")
    print(f"   Plants WITHOUT coordinates: {plants_without_coords}")
    print(f"   Plants with generators: {plants_with_generators}")
    print(f"   Plants WITHOUT generators: {plants_without_generators}")

    # Aggregate capacity by plant and fuel type
    fuel_col = 'Energy Source 1' if 'Energy Source 1' in us_generators.columns else 'Technology'
    capacity_col = 'Nameplate Capacity (MW)' if 'Nameplate Capacity (MW)' in us_generators.columns else 'Capacity (MW)'

    # Map fuel codes to readable names
    fuel_mapping = {
        'NG': 'Natural Gas', 'GAS': 'Natural Gas',
        'NUC': 'Nuclear',
        'COL': 'Coal', 'BIT': 'Coal', 'SUB': 'Coal',
        'SUN': 'Solar', 'PV': 'Solar',
        'WND': 'Wind', 'WTR': 'Wind',
        'WAT': 'Hydro', 'HYC': 'Hydro',
        'OIL': 'Petroleum', 'DFO': 'Petroleum', 'RFO': 'Petroleum',
        'WDS': 'Other', 'OTH': 'Other'
    }

    # Build final plant list - THIS WAS MISSING!
    plants_output = []

    for _, plant in us_plants.iterrows():
        plant_code = plant['Plant Code']
        
        # Get all generators for this plant
        plant_gens = us_generators[us_generators['Plant Code'] == plant_code]
        
        if len(plant_gens) == 0:
            continue
        
        # Aggregate capacity by fuel type
        fuel_breakdown = {}
        for fuel_code in plant_gens[fuel_col].unique():
            fuel_gens = plant_gens[plant_gens[fuel_col] == fuel_code]
            total_capacity = fuel_gens[capacity_col].sum()
            
            # Map to readable fuel name
            fuel_name = fuel_mapping.get(fuel_code, 'Other')
            
            if fuel_name in fuel_breakdown:
                fuel_breakdown[fuel_name] += total_capacity
            else:
                fuel_breakdown[fuel_name] = total_capacity
        
        # Determine primary fuel (highest capacity)
        if fuel_breakdown:
            primary_fuel = max(fuel_breakdown.items(), key=lambda x: x[1])[0]
            total_capacity = sum(fuel_breakdown.values())
        else:
            primary_fuel = 'Other'
            total_capacity = 0
        
        # Get location data
        latitude = plant.get('Latitude', None)
        longitude = plant.get('Longitude', None)
        
        # Skip plants without coordinates
        if pd.isna(latitude) or pd.isna(longitude):
            continue
        

        plant_data = {
            'name': clean_value(plant.get('Plant Name'), 'Unknown'),
            'state': clean_value(plant.get('State'), 'Unknown'),
            'latitude': float(latitude),
            'longitude': float(longitude),
            'primaryFuel': primary_fuel,
            'totalCapacity': round(float(total_capacity), 2),
            'operator': clean_value(plant.get('Utility Name'), 'Unknown'),
            'balancingAuthorityCode': clean_value(plant.get('Balancing Authority Code'), 'N/A'),
            'balancingAuthorityName': clean_value(plant.get('Balancing Authority Name'), 'N/A'),
            'transmissionOwner': clean_value(plant.get('Transmission or Distribution System Owner'), 'Unknown'),
            'nercRegion': clean_value(plant.get('NERC Region'), 'N/A'),
            'sector': clean_value(plant.get('Sector Name'), 'Unknown'),
            'fuelBreakdown': {k: round(float(v), 2) for k, v in fuel_breakdown.items()}
        }
        
        plants_output.append(plant_data)

    print(f"   ✓ Final output: {len(plants_output)} plants with complete data")
        
    # ========================================
    # STEP 5: Save to JSON
    # ========================================
    print(f"\n[5/5] Saving to {output_file}...")
    
    with open(output_file, 'w') as f:
        json.dump(plants_output, f, indent=2)
    
    print(f"   ✓ Saved {len(plants_output)} plants")
    
    # ========================================
    # SUMMARY STATISTICS
    # ========================================
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    total_capacity = sum(p['totalCapacity'] for p in plants_output)
    fuel_totals = {}
    for plant in plants_output:
        for fuel, capacity in plant['fuelBreakdown'].items():
            fuel_totals[fuel] = fuel_totals.get(fuel, 0) + capacity
    
    print(f"Total Plants:     {len(plants_output)}")
    print(f"Total Capacity:   {total_capacity:,.1f} MW")
    print(f"\nCapacity by Fuel Type:")
    for fuel, capacity in sorted(fuel_totals.items(), key=lambda x: x[1], reverse=True):
        pct = (capacity / total_capacity * 100) if total_capacity > 0 else 0
        print(f"  {fuel:15} {capacity:8,.1f} MW ({pct:5.1f}%)")
    
    print("\n" + "=" * 60)
    print(f"✓ SUCCESS! Data saved to: {output_file}")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Use this JSON file in your web visualization")
    print("2. The file contains all U.S. power plants with coordinates and capacity data")
    print("3. Ready to load into your interactive map!")


# ========================================
# USAGE EXAMPLE
# ========================================
if __name__ == "__main__":
    # Update these paths to where you saved the Excel files
    PLANT_FILE = "2___Plant_Y2024.xlsx"
    GENERATOR_FILE = "3_1_Generator_Y2024.xlsx"
    OUTPUT_FILE = "us-plants.json"
    
    # Run the processor
    process_us_plant_data(PLANT_FILE, GENERATOR_FILE, OUTPUT_FILE)