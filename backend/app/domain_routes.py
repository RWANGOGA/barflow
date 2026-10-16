import hashlib
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .db import connection
from .schemas import SaleCreate, TabCreate, TabItemCreate

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
            request_hash = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
            existing = await conn.fetchrow('SELECT request_hash, response_json FROM bar_idempotency_key WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE', actor.user_id, payload.idempotency_key)
            if existing:
                if existing['request_hash'] != request_hash:
                    raise HTTPException(status_code=409, detail='Idempotency key was already used with a different request.')
                return existing['response_json']
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
                await conn.execute('INSERT INTO bar_sale_item (id, sale_id, product_id, quantity, unit_price, line_total) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), sale_id, item.product_id, item.quantity, product['price'], product['price'] * item.quantity)
                await conn.execute('UPDATE bar_product SET stock = stock - $1, updated_at = now() WHERE user_id = $2 AND id = $3', item.quantity, actor.user_id, item.product_id)
                await conn.execute('INSERT INTO bar_stock_movement (id,user_id,product_id,quantity,movement_type,reference) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, item.product_id, -item.quantity, 'sale', sale_id)
            response = {'id': sale_id, 'total': total, 'payment_method': payload.payment_method.value, 'status': 'completed'}
            await conn.execute('INSERT INTO bar_idempotency_key (user_id, idempotency_key, request_hash, response_json) VALUES ($1,$2,$3,$4::jsonb)', actor.user_id, payload.idempotency_key, request_hash, json.dumps(response))
            return response


@router.post('/tabs', status_code=201)
async def create_tab(payload: TabCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.manage')
    tab_id = str(uuid4())
    async with connection() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow("SELECT id FROM bar_tab WHERE user_id=$1 AND table_label=$2 AND status='open' FOR UPDATE", actor.user_id, payload.table_label)
            if existing:
                raise HTTPException(status_code=409, detail='An open tab already exists for this table.')
            row = await conn.fetchrow('INSERT INTO bar_tab (id,user_id,table_label,owner_name) VALUES ($1,$2,$3,$4) RETURNING id, table_label, owner_name, total, status, opened_at', tab_id, actor.user_id, payload.table_label, payload.owner_name)
    return dict(row)


@router.post('/tabs/{tab_id}/items', status_code=201)
async def add_tab_item(tab_id: str, payload: TabItemCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.manage')
    async with connection() as conn:
        async with conn.transaction():
            tab = await conn.fetchrow("SELECT id FROM bar_tab WHERE id=$1 AND user_id=$2 AND status='open' FOR UPDATE", tab_id, actor.user_id)
            if not tab:
                raise HTTPException(status_code=404, detail='Open tab was not found.')
            product = await conn.fetchrow('SELECT id, price FROM bar_product WHERE id=$1 AND user_id=$2', payload.product_id, actor.user_id)
            if not product:
                raise HTTPException(status_code=404, detail='Product was not found.')
            row = await conn.fetchrow('INSERT INTO bar_tab_item (id,tab_id,user_id,product_id,quantity,unit_price,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, product_id, quantity, unit_price, line_total', str(uuid4()), tab_id, actor.user_id, payload.product_id, payload.quantity, product['price'], product['price'] * payload.quantity)
            await conn.execute('UPDATE bar_tab SET total = total + $1 WHERE id=$2 AND user_id=$3', product['price'] * payload.quantity, tab_id, actor.user_id)
    return dict(row)


@router.get('/tabs')
async def list_tabs(actor: RequestActor = Depends(get_actor), status: str = Query(default='open', pattern='^(open|settled|voided|all)$'), limit: int = Query(default=50, ge=1, le=100)):
    authorized(actor, 'tabs.manage')
    async with connection() as conn:
        rows = await conn.fetch("SELECT id, table_label, owner_name, total, status, opened_at, settled_at FROM bar_tab WHERE user_id=$1 AND ($2='all' OR status=$2) ORDER BY opened_at DESC LIMIT $3", actor.user_id, status, limit)
    return {'items': [dict(row) for row in rows]}


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
