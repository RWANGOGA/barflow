from fastapi import APIRouter, Depends, Query

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .db import connection

router = APIRouter(prefix='/v1', tags=['operations'])


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
