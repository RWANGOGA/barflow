from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .db import connection
from .schemas import SaleCreate, TabCreate

router = APIRouter(prefix='/v1', tags=['domain'])


def authorized(actor: RequestActor, permission: str) -> Actor:
    identity = Actor(actor.user_id, actor.role)
    require_permission(identity, permission)
    return identity


@router.post('/sales', status_code=201)
async def create_sale(payload: SaleCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'sales.create')
    sale_id = str(uuid4())
    async with connection() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow('SELECT id, total, payment_method, status FROM bar_sale WHERE user_id = $1 AND idempotency_key = $2', actor.user_id, payload.idempotency_key)
            if existing:
                return dict(existing)
            total = 0
            products = []
            for item in payload.items:
                product = await conn.fetchrow('SELECT id, price, stock FROM bar_product WHERE user_id = $1 AND id = $2 FOR UPDATE', actor.user_id, item.product_id)
                if not product:
                    raise HTTPException(status_code=404, detail=f'Product {item.product_id} was not found.')
                if product['stock'] < item.quantity:
                    raise HTTPException(status_code=409, detail=f'Insufficient stock for product {item.product_id}.')
                total += product['price'] * item.quantity
                products.append((item, product))
            await conn.execute('INSERT INTO bar_sale (id, user_id, payment_method, total, table_label, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)', sale_id, actor.user_id, payload.payment_method.value, total, payload.table_label, payload.idempotency_key)
            for item, product in products:
                await conn.execute('INSERT INTO bar_sale_item (id, sale_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)', str(uuid4()), sale_id, item.product_id, item.quantity, product['price'])
                await conn.execute('UPDATE bar_product SET stock = stock - $1, updated_at = now() WHERE user_id = $2 AND id = $3', item.quantity, actor.user_id, item.product_id)
                await conn.execute('INSERT INTO bar_stock_movement (id,user_id,product_id,quantity,movement_type,reference) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, item.product_id, -item.quantity, 'sale', sale_id)
            return {'id': sale_id, 'total': total, 'payment_method': payload.payment_method.value, 'status': 'completed'}


@router.post('/tabs', status_code=201)
async def create_tab(payload: TabCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.manage')
    tab_id = str(uuid4())
    async with connection() as conn:
        row = await conn.fetchrow('INSERT INTO bar_tab (id,user_id,table_label,owner_name) VALUES ($1,$2,$3,$4) RETURNING id, table_label, owner_name, total, status, opened_at', tab_id, actor.user_id, payload.table_label, payload.owner_name)
    return dict(row)


@router.get('/inventory')
async def list_inventory(actor: RequestActor = Depends(get_actor), limit: int = Query(default=50, ge=1, le=100), cursor: str | None = None):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,name,category,price,stock,reorder,cost,unit,tone,updated_at FROM bar_product WHERE user_id = $1 AND ($2::text IS NULL OR id > $2) ORDER BY id LIMIT $3', actor.user_id, cursor, limit + 1)
    return {'items': [dict(row) for row in rows[:limit]], 'next_cursor': rows[limit - 1]['id'] if len(rows) > limit else None}


@router.post('/day-close', status_code=201)
async def close_day(actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'day.close')
    async with connection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("UPDATE bar_day SET status='closed', closed_at=now() WHERE user_id=$1 AND status='open' RETURNING id,business_date,status,closed_at", actor.user_id)
            if not row:
                raise HTTPException(status_code=409, detail='No open business day to close.')
    return dict(row)
