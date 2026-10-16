from backend.app.schemas import SaleCreate


def test_sale_schema_requires_idempotency_key():
    assert SaleCreate.model_fields['idempotency_key'].metadata


def test_sale_item_line_total_is_required_by_migration():
    migration = open('backend/migrations/002_domain_transactions.sql', encoding='utf-8').read()
    assert 'line_total' in migration
    assert 'bar_idempotency_key' in migration
