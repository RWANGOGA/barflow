from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
import csv, io
from datetime import datetime, timezone

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .db import connection

router = APIRouter(prefix='/v1', tags=['operations'])

EXPORT_TABLES = [
    'bar_user', 'bar_session', 'bar_account', 'bar_verification',
    'bar_product', 'bar_sale', 'bar_sale_item', 'bar_stock_movement',
    'bar_tab', 'bar_tab_item', 'bar_team_member', 'bar_audit_log',
    'bar_receipts', 'bar_day', 'bar_stock_delivery', 'bar_stock_transfer',
    'bar_stock_count', 'bar_variance_tolerance', 'bar_variance_history',
    'bar_discount', 'bar_user_pin', 'bar_login_attempts',
]


@router.get('/audit')
async def list_audit(actor: RequestActor = Depends(get_actor), limit: int = Query(default=50, ge=1, le=100)):
    require_permission(Actor(actor.user_id, actor.role), 'audit.read')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id, action, record_label, approval, created_at FROM bar_audit_log WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', actor.user_id, limit)
    return {'items': [dict(row) for row in rows]}


@router.get('/reports/summary')
async def report_summary(actor: RequestActor = Depends(get_actor)):
    require_permission(Actor(actor.user_id, actor.role), 'reports.read')
    async with connection() as conn:
        sales = await conn.fetchrow("SELECT count(*)::int AS orders, coalesce(sum(total),0)::int AS total FROM bar_sale WHERE user_id=$1 AND status='completed'", actor.user_id)
        payments = await conn.fetch("SELECT payment_method, count(*)::int AS orders, coalesce(sum(total),0)::int AS total FROM bar_sale WHERE user_id=$1 AND status='completed' GROUP BY payment_method ORDER BY payment_method", actor.user_id)
    return {'orders': sales['orders'], 'total': sales['total'], 'by_payment': [dict(row) for row in payments]}


@router.get('/reports/stock-value')
async def report_stock_value(actor: RequestActor = Depends(get_actor)):
    require_permission(Actor(actor.user_id, actor.role), 'reports.read')
    async with connection() as conn:
        rows = await conn.fetch("SELECT id,name,stock,cost,price, (stock::int * cost)::int AS value_at_cost, (stock::int * price)::int AS value_at_selling FROM bar_product WHERE user_id=$1 ORDER BY name", actor.user_id)
    return {'items': [dict(row) for row in rows], 'total_value_at_cost': sum(row['value_at_cost'] for row in rows), 'total_value_at_selling': sum(row['value_at_selling'] for row in rows)}


@router.get('/export')
async def export_data(actor: RequestActor = Depends(get_actor), tables: str | None = Query(default=None)):
    require_permission(Actor(actor.user_id, actor.role), 'reports.read')
    requested = [t.strip() for t in tables.split(',')] if tables else EXPORT_TABLES
    tables_to_export = [t for t in requested if t in EXPORT_TABLES]
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    exported_at = datetime.now(timezone.utc).isoformat()
    result_tables = []
    async with connection() as conn:
        for table in tables_to_export:
            try:
                rows = await conn.fetch(f'SELECT * FROM {table} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10000', actor.user_id)
                if rows:
                    columns = list(rows[0].keys())
                    writer.writerow([f'--- TABLE: {table} ---'])
                    writer.writerow(columns)
                    for row in rows:
                        writer.writerow([str(row[col]) if row[col] is not None else '' for col in columns])
                    writer.writerow([])
                    result_tables.append({'table': table, 'rows': len(rows), 'count': len(rows)})
            except Exception:
                continue
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename=barflow-export-{exported_at[:10]}.csv'},
    )
