import hashlib
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .db import connection
from .schemas import InventoryCountCreate, SaleCreate, StockAdjustmentCreate, TabCreate, TabItemCreate, TabItemUpdate, TabSettle, TabVoid, TabReopen

router = APIRouter(prefix='/v1', tags=['domain'])


def authorized(actor: RequestActor, permission: str) -> Actor:
    identity = Actor(actor.user_id, actor.role)
    require_permission(identity, permission)
    return identity


async def write_audit(conn, actor: RequestActor, action: str, entity_type: str, entity_id: str, reason: str | None = None, metadata: dict | None = None):
    await conn.execute('INSERT INTO bar_audit_log (id,user_id,actor_role,action,entity_type,entity_id,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', str(uuid4()), actor.user_id, actor.role.value, action, entity_type, entity_id, reason, json.dumps(metadata or {}))


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


@router.patch('/tabs/{tab_id}/items/{item_id}')
async def update_tab_item(tab_id: str, item_id: str, payload: TabItemUpdate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.manage')
    async with connection() as conn:
        async with conn.transaction():
            tab = await conn.fetchrow("SELECT id FROM bar_tab WHERE id=$1 AND user_id=$2 AND status='open' FOR UPDATE", tab_id, actor.user_id)
            if not tab:
                raise HTTPException(status_code=404, detail='Open tab was not found.')
            item = await conn.fetchrow('SELECT id, unit_price, quantity FROM bar_tab_item WHERE id=$1 AND tab_id=$2 AND user_id=$3 FOR UPDATE', item_id, tab_id, actor.user_id)
            if not item:
                raise HTTPException(status_code=404, detail='Tab item was not found.')
            delta = (payload.quantity - item['quantity']) * item['unit_price']
            row = await conn.fetchrow('UPDATE bar_tab_item SET quantity=$1, line_total=$2 WHERE id=$3 RETURNING id, product_id, quantity, unit_price, line_total', payload.quantity, payload.quantity * item['unit_price'], item_id)
            await conn.execute('UPDATE bar_tab SET total = total + $1 WHERE id=$2 AND user_id=$3', delta, tab_id, actor.user_id)
    return dict(row)


@router.delete('/tabs/{tab_id}/items/{item_id}', status_code=204)
async def remove_tab_item(tab_id: str, item_id: str, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.manage')
    async with connection() as conn:
        async with conn.transaction():
            tab = await conn.fetchrow("SELECT id FROM bar_tab WHERE id=$1 AND user_id=$2 AND status='open' FOR UPDATE", tab_id, actor.user_id)
            if not tab:
                raise HTTPException(status_code=404, detail='Open tab was not found.')
            item = await conn.fetchrow('SELECT quantity, unit_price FROM bar_tab_item WHERE id=$1 AND tab_id=$2 AND user_id=$3 FOR UPDATE', item_id, tab_id, actor.user_id)
            if not item:
                raise HTTPException(status_code=404, detail='Tab item was not found.')
            await conn.execute('DELETE FROM bar_tab_item WHERE id=$1 AND tab_id=$2 AND user_id=$3', item_id, tab_id, actor.user_id)
            await conn.execute('UPDATE bar_tab SET total = total - $1 WHERE id=$2 AND user_id=$3', item['quantity'] * item['unit_price'], tab_id, actor.user_id)


@router.post('/tabs/{tab_id}/settle')
async def settle_tab(tab_id: str, payload: TabSettle, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.manage')
    async with connection() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow('SELECT response_json, request_hash FROM bar_idempotency_key WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE', actor.user_id, payload.idempotency_key)
            request_hash = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
            if existing:
                if existing['request_hash'] != request_hash:
                    raise HTTPException(status_code=409, detail='Idempotency key was already used with a different request.')
                return existing['response_json']
            tab = await conn.fetchrow("SELECT id, total, table_label, status FROM bar_tab WHERE id=$1 AND user_id=$2 AND status='open' FOR UPDATE", tab_id, actor.user_id)
            if not tab:
                raise HTTPException(status_code=404, detail='Open tab was not found.')
            items = await conn.fetch('SELECT id, product_id, quantity, unit_price, line_total FROM bar_tab_item WHERE tab_id=$1 AND user_id=$2 ORDER BY id FOR UPDATE', tab_id, actor.user_id)
            if not items:
                raise HTTPException(status_code=409, detail='Cannot settle an empty tab.')
            for item in items:
                product = await conn.fetchrow('SELECT id, stock FROM bar_product WHERE id=$1 AND user_id=$2 FOR UPDATE', item['product_id'], actor.user_id)
                if not product or product['stock'] < item['quantity']:
                    raise HTTPException(status_code=409, detail=f'Insufficient stock for product {item["product_id"]}.')
            sale_id = str(uuid4())
            await conn.execute('INSERT INTO bar_sale (id,user_id,payment_method,total,table_label,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)', sale_id, actor.user_id, payload.payment_method.value, tab['total'], tab['table_label'], payload.idempotency_key)
            for item in items:
                await conn.execute('INSERT INTO bar_sale_item (id,sale_id,product_id,quantity,unit_price,line_total) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), sale_id, item['product_id'], item['quantity'], item['unit_price'], item['line_total'])
                await conn.execute('UPDATE bar_product SET stock=stock-$1, updated_at=now() WHERE id=$2 AND user_id=$3', item['quantity'], item['product_id'], actor.user_id)
                await conn.execute('INSERT INTO bar_stock_movement (id,user_id,product_id,quantity,movement_type,reference) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, item['product_id'], -item['quantity'], 'sale', sale_id)
            response = {'tab_id': tab_id, 'sale_id': sale_id, 'total': tab['total'], 'payment_method': payload.payment_method.value, 'status': 'settled'}
            await conn.execute("UPDATE bar_tab SET status='settled', payment_method=$1, settled_by=$2, sale_id=$3, settled_at=now() WHERE id=$4 AND user_id=$5", payload.payment_method.value, actor.user_id, sale_id, tab_id, actor.user_id)
            await write_audit(conn, actor, 'settle', 'tab', tab_id, metadata={'sale_id': sale_id, 'total': str(tab['total']), 'payment_method': payload.payment_method.value})
            await conn.execute('INSERT INTO bar_idempotency_key (user_id,idempotency_key,request_hash,response_json) VALUES ($1,$2,$3,$4::jsonb)', actor.user_id, payload.idempotency_key, request_hash, json.dumps(response))
    return response


@router.post('/tabs/{tab_id}/void')
async def void_tab(tab_id: str, payload: TabVoid, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.void')
    async with connection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("UPDATE bar_tab SET status='voided', voided_by=$1, void_reason=$2 WHERE id=$3 AND user_id=$4 AND status='open' RETURNING id, status, void_reason, voided_by", actor.user_id, payload.reason, tab_id, actor.user_id)
            if not row:
                raise HTTPException(status_code=404, detail='Open tab was not found.')
            await write_audit(conn, actor, 'void', 'tab', tab_id, payload.reason)
    return dict(row)


@router.post('/tabs/{tab_id}/reopen')
async def reopen_tab(tab_id: str, payload: TabReopen, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'tabs.reopen')
    async with connection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("UPDATE bar_tab SET status='open', reopened_by=$1, reopen_reason=$2, settled_at=NULL, payment_method=NULL, settled_by=NULL, sale_id=NULL WHERE id=$3 AND user_id=$4 AND status='settled' RETURNING id, status, reopen_reason, reopened_by", actor.user_id, payload.reason, tab_id, actor.user_id)
            if not row:
                raise HTTPException(status_code=404, detail='Settled tab was not found.')
            await write_audit(conn, actor, 'reopen', 'tab', tab_id, payload.reason)
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


@router.post('/inventory/counts', status_code=201)
async def create_inventory_count(payload: InventoryCountCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        async with conn.transaction():
            product = await conn.fetchrow('SELECT id, stock FROM bar_product WHERE id=$1 AND user_id=$2 FOR UPDATE', payload.product_id, actor.user_id)
            if not product:
                raise HTTPException(status_code=404, detail='Product was not found.')
            variance = payload.counted_quantity - product['stock']
            row = await conn.fetchrow('INSERT INTO bar_inventory_count (id,user_id,product_id,system_quantity,counted_quantity,variance,counted_by,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,product_id,system_quantity,counted_quantity,variance,counted_by,notes,created_at', str(uuid4()), actor.user_id, payload.product_id, product['stock'], payload.counted_quantity, variance, actor.user_id, payload.notes)
            await write_audit(conn, actor, 'count', 'inventory_count', row['id'], payload.notes, {'product_id': payload.product_id, 'variance': variance})
    return dict(row)


@router.post('/inventory/adjustments', status_code=201)
async def create_stock_adjustment(payload: StockAdjustmentCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'inventory.manage')
    if payload.quantity == 0:
        raise HTTPException(status_code=422, detail='Adjustment quantity cannot be zero.')
    async with connection() as conn:
        async with conn.transaction():
            product = await conn.fetchrow('SELECT id, stock FROM bar_product WHERE id=$1 AND user_id=$2 FOR UPDATE', payload.product_id, actor.user_id)
            if not product:
                raise HTTPException(status_code=404, detail='Product was not found.')
            new_stock = product['stock'] + payload.quantity
            if new_stock < 0:
                raise HTTPException(status_code=409, detail='Adjustment would make stock negative.')
            adjustment_id = str(uuid4())
            row = await conn.fetchrow('INSERT INTO bar_stock_adjustment (id,user_id,product_id,quantity,adjustment_type,reason,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,product_id,quantity,adjustment_type,reason,created_by,created_at', adjustment_id, actor.user_id, payload.product_id, payload.quantity, payload.adjustment_type, payload.reason, actor.user_id)
            await conn.execute('UPDATE bar_product SET stock=$1, updated_at=now() WHERE id=$2 AND user_id=$3', new_stock, payload.product_id, actor.user_id)
            await conn.execute('INSERT INTO bar_stock_movement (id,user_id,product_id,quantity,movement_type,reference) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, payload.product_id, payload.quantity, payload.adjustment_type, adjustment_id)
            await write_audit(conn, actor, payload.adjustment_type, 'stock_adjustment', adjustment_id, payload.reason, {'product_id': payload.product_id, 'quantity': payload.quantity})
    return dict(row)


@router.get('/inventory/adjustments')
async def list_stock_adjustments(actor: RequestActor = Depends(get_actor), limit: int = Query(default=50, ge=1, le=100)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,product_id,quantity,adjustment_type,reason,created_by,created_at FROM bar_stock_adjustment WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', actor.user_id, limit)
    return {'items': [dict(row) for row in rows]}


@router.get('/inventory/counts')
async def list_inventory_counts(actor: RequestActor = Depends(get_actor), limit: int = Query(default=50, ge=1, le=100)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,product_id,system_quantity,counted_quantity,variance,counted_by,notes,created_at FROM bar_inventory_count WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', actor.user_id, limit)
    return {'items': [dict(row) for row in rows]}


@router.get('/audit')
async def list_audit_logs(actor: RequestActor = Depends(get_actor), limit: int = Query(default=100, ge=1, le=200), entity_type: str | None = None):
    authorized(actor, 'audit.read')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,actor_role,action,entity_type,entity_id,reason,metadata,created_at FROM bar_audit_log WHERE user_id=$1 AND ($2::text IS NULL OR entity_type=$2) ORDER BY created_at DESC LIMIT $3', actor.user_id, entity_type, limit)
    return {'items': [dict(row) for row in rows]}


@router.get('/inventory/movements')
async def list_inventory_movements(actor: RequestActor = Depends(get_actor), product_id: str | None = None, limit: int = Query(default=100, ge=1, le=200)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,product_id,quantity,movement_type,reference,created_at FROM bar_stock_movement WHERE user_id=$1 AND ($2::text IS NULL OR product_id=$2) ORDER BY created_at DESC LIMIT $3', actor.user_id, product_id, limit)
    return {'items': [dict(row) for row in rows]}


@router.get('/inventory/variance')
async def inventory_variance_report(actor: RequestActor = Depends(get_actor), limit: int = Query(default=100, ge=1, le=200)):
    authorized(actor, 'reports.read')
    async with connection() as conn:
        rows = await conn.fetch('SELECT c.id,c.product_id,p.name,c.system_quantity,c.counted_quantity,c.variance,c.counted_by,c.notes,c.created_at FROM bar_inventory_count c JOIN bar_product p ON p.id=c.product_id AND p.user_id=c.user_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT $2', actor.user_id, limit)
    return {'items': [dict(row) for row in rows], 'total_variance': sum(row['variance'] for row in rows)}


@router.post('/day-close', status_code=201)
async def close_day(actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'day.close')
    async with connection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("UPDATE bar_day SET status='closed', closed_at=now() WHERE user_id=$1 AND status='open' RETURNING id,business_date,status,closed_at", actor.user_id)
            if not row:
                raise HTTPException(status_code=409, detail='No open business day to close.')
    return dict(row)
