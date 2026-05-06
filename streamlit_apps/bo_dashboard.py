import streamlit as st
import pandas as pd
import altair as alt
from datetime import datetime
import numpy as np

# Set page config
st.set_page_config(
    page_title="Backorder Analytics Dashboard",
    page_icon="📦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for premium look
st.markdown("""
    <style>
    .main {
        background-color: #f8f9fa;
    }
    [data-testid="stMetricValue"] {
        font-size: 24px;
        font-weight: 700;
        color: #1e3a8a;
    }
    .stMetric {
        background-color: white;
        padding: 15px;
        border-radius: 10px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        border: 1px solid #e5e7eb;
    }
    </style>
""", unsafe_allow_html=True)

@st.cache_data
def load_data(file):
    df = pd.read_csv(file)
    
    # Header mapping (fuzzy match)
    header_map = {
        'doc date': 'DocDate', 'ngày ct': 'DocDate', 'docdate': 'DocDate',
        'doc no': 'DocNo', 'số ct': 'DocNo', 'docno': 'DocNo',
        'item code': 'ItemCode', 'mã hàng': 'ItemCode', 'itemcode': 'ItemCode', 'part no': 'ItemCode',
        'item name': 'ItemName', 'tên hàng': 'ItemName', 'itemname': 'ItemName', 'description': 'ItemName',
        'quantity': 'Qty', 'số lượng': 'Qty', 'qty': 'Qty', 'sl': 'Qty',
        'branch name': 'BranchName', 'tên chi nhánh': 'BranchName', 'branchname': 'BranchName',
        'type car': 'TypeCar', 'loại xe': 'TypeCar', 'typecar': 'TypeCar', 'model': 'TypeCar',
        'price': 'Price', 'giá': 'Price', 'don gia': 'Price'
    }
    
    # Rename columns based on mapping
    new_cols = {}
    for col in df.columns:
        clean_col = col.strip().lower()
        for key, val in header_map.items():
            if key in clean_col:
                new_cols[col] = val
                break
    
    df = df.rename(columns=new_cols)
    
    # Ensure mandatory columns exist
    if 'Qty' not in df.columns: df['Qty'] = 0
    if 'Price' not in df.columns: df['Price'] = 0
    
    # Data cleaning
    df['Qty'] = pd.to_numeric(df['Qty'].toString().replace(',', ''), errors='coerce').fillna(0)
    df['Price'] = pd.to_numeric(df['Price'].toString().replace(',', ''), errors='coerce').fillna(0)
    df['TotalAmount'] = df['Qty'] * df['Price']
    
    # Date parsing
    if 'DocDate' in df.columns:
        df['DocDate'] = pd.to_datetime(df['DocDate'], dayfirst=True, errors='coerce')
        today = pd.Timestamp.now()
        df['Aging'] = (today - df['DocDate']).dt.days
    else:
        df['Aging'] = 0
        
    # Aging Buckets
    def get_aging_bucket(days):
        if days <= 30: return "0-30 days"
        if days <= 60: return "31-60 days"
        if days <= 90: return "61-90 days"
        return ">90 days"
    
    df['AgingBucket'] = df['Aging'].apply(get_aging_bucket)
    
    return df

# Header
st.title("📦 Backorder Analytics Dashboard")
st.markdown("---")

# Sidebar for controls
with st.sidebar:
    st.header("⚙️ Controls")
    uploaded_file = st.file_uploader("Upload BO CSV File", type=["csv"])
    
    if uploaded_file:
        st.success("File uploaded successfully!")
    else:
        st.info("Please upload a CSV file to start analysis.")
        st.stop()

# Process data
df = load_data(uploaded_file)

# Sidebar Filters
with st.sidebar:
    st.markdown("### 🔍 Filters")
    all_branches = ["All"] + sorted(df['BranchName'].dropna().unique().tolist())
    selected_branch = st.selectbox("Select Branch", all_branches)
    
    all_models = ["All"] + sorted(df['TypeCar'].dropna().unique().tolist())
    selected_model = st.selectbox("Select Model", all_models)
    
    aging_options = ["All", "0-30 days", "31-60 days", "61-90 days", ">90 days"]
    selected_aging = st.multiselect("Aging Bucket", aging_options, default=["All"])

# Filtering logic
filtered_df = df.copy()
if selected_branch != "All":
    filtered_df = filtered_df[filtered_df['BranchName'] == selected_branch]
if selected_model != "All":
    filtered_df = filtered_df[filtered_df['TypeCar'] == selected_model]
if "All" not in selected_aging:
    filtered_df = filtered_df[filtered_df['AgingBucket'].isin(selected_aging)]

# Top Row: KPI Metrics
kpi1, kpi2, kpi3, kpi4 = st.columns(4)

total_value = filtered_df['TotalAmount'].sum()
total_qty = filtered_df['Qty'].sum()
sku_count = filtered_df['ItemCode'].nunique()
urgent_bo = filtered_df[filtered_df['Aging'] > 30]['TotalAmount'].sum()

with kpi1:
    st.metric("Total BO Value", f"{total_value:,.0f} VNĐ", border=True)
with kpi2:
    st.metric("Total Qty", f"{total_qty:,.0f}", border=True)
with kpi3:
    st.metric("SKU Count", f"{sku_count:,}", border=True)
with kpi4:
    urgent_pct = (urgent_bo / total_value * 100) if total_value > 0 else 0
    st.metric("Value > 30 Days", f"{urgent_bo:,.0f} VNĐ", f"{urgent_pct:.1f}% of total", delta_color="inverse", border=True)

st.markdown("### 📊 Visual Analytics")

col_left, col_right = st.columns(2)

with col_left:
    with st.container(border=True):
        st.subheader("Aging Distribution (Value)")
        aging_summary = filtered_df.groupby('AgingBucket')['TotalAmount'].sum().reset_index()
        # Sort buckets logically
        bucket_order = ["0-30 days", "31-60 days", "61-90 days", ">90 days"]
        aging_summary['AgingBucket'] = pd.Categorical(aging_summary['AgingBucket'], categories=bucket_order, ordered=True)
        aging_summary = aging_summary.sort_values('AgingBucket')
        
        chart_aging = alt.Chart(aging_summary).mark_bar(cornerRadiusTopLeft=5, cornerRadiusTopRight=5).encode(
            x=alt.X('AgingBucket:O', title="Aging Period"),
            y=alt.Y('TotalAmount:Q', title="Total Value (VNĐ)"),
            color=alt.Color('AgingBucket:N', scale=alt.Scale(range=['#3b82f6', '#f59e0b', '#ef4444', '#7f1d1d']), legend=None),
            tooltip=['AgingBucket', 'TotalAmount']
        ).properties(height=350)
        st.altair_chart(chart_aging, use_container_width=True)

with col_right:
    with st.container(border=True):
        st.subheader("Top 10 Branches by BO Value")
        branch_summary = filtered_df.groupby('BranchName')['TotalAmount'].sum().sort_values(ascending=False).head(10).reset_index()
        chart_branch = alt.Chart(branch_summary).mark_bar(color='#1e40af').encode(
            x=alt.X('TotalAmount:Q', title="Total Value (VNĐ)"),
            y=alt.Y('BranchName:N', sort='-x', title="Branch"),
            tooltip=['BranchName', 'TotalAmount']
        ).properties(height=350)
        st.altair_chart(chart_branch, use_container_width=True)

# Bottom Section: SKU Details
st.markdown("### 📋 SKU Details")
with st.container(border=True):
    # Search SKU
    search_query = st.text_input("🔍 Search SKU or Description", "")
    
    table_df = filtered_df.copy()
    if search_query:
        table_df = table_df[
            table_df['ItemCode'].toString().lower().str.contains(search_query.lower()) |
            table_df['ItemName'].toString().lower().str.contains(search_query.lower())
        ]
    
    st.dataframe(
        table_df[['DocNo', 'DocDate', 'BranchName', 'TypeCar', 'ItemCode', 'ItemName', 'Qty', 'Price', 'TotalAmount', 'AgingBucket']],
        column_config={
            "TotalAmount": st.column_config.NumberColumn("Value", format="%d VNĐ"),
            "Qty": st.column_config.NumberColumn("Qty", format="%d"),
            "Price": st.column_config.NumberColumn("Price", format="%d"),
            "DocDate": st.column_config.DateColumn("Date"),
            "AgingBucket": st.column_config.TextColumn("Status")
        },
        hide_index=True,
        use_container_width=True
    )

# Download processed data
csv = table_df.to_csv(index=False).encode('utf-8')
st.download_button(
    label="📥 Download Filtered Data as CSV",
    data=csv,
    file_name='backorder_report.csv',
    mime='text/csv',
)
