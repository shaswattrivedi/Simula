from app.generators.tabular import generate_tabular

schema = {
    "columns": [
        {"name": "user_id", "type": "float", "distribution": "normal"},
        {"name": "purchase_amount", "type": "float", "distribution": "normal"},
        {"name": "time_since_last_order", "type": "float", "distribution": "normal"},
        {"name": "product_name", "type": "category", "distribution": "categorical"}
    ]
}

df = generate_tabular(schema, 5)
print(df.head())
