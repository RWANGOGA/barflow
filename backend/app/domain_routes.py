import hashlib
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .db import connection
from .schemas import DayCloseCreate, DayCloseOut, DeliveryCreate, DeliveryOut, DiscountCreate, DiscountOut, InventoryCountCreate, MenuStockLinkCreate, MenuStockLinkOut, PinSet, PinVerify, ReceiptCreate, ReceiptOut, ReceiptReprintCreate, Role, SaleCreate, SettingCreate, SettingOut, StockAdjustmentCreate, StockCountCreate, StockCountOut, TabCreate, TabItemCreate, TabItemUpdate, TabSettle, TabVoid, TabReopen, TransferCreate, TransferOut, VarianceHistoryOut, VarianceToleranceCreate, VarianceToleranceOut

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
                product = await conn.fetchrow('SELECT id, name, category, price, stock FROM bar_product WHERE user_id = $1 AND id = $2 FOR UPDATE', actor.user_id, item.product_id)
                if not product:
                    raise HTTPException(status_code=404, detail=f'Product {item.product_id} was not found.')
                if product['stock'] < item.quantity:
                    allow_neg = await conn.fetchval("SELECT value FROM bar_settings WHERE user_id=$1 AND key='allow_negative_stock'", actor.user_id)
                    if allow_neg != 'true':
                        raise HTTPException(status_code=409, detail=f'Insufficient stock for product {item.product_id}.')
                total += product['price'] * item.quantity
                products.append((item, product))
            change_due = 0
            if payload.tendered_amount is not None:
                change_due = max(0, payload.tendered_amount - total)
            if payload.payment_items:
                paid = sum(pi.amount for pi in payload.payment_items)
                if paid != total:
                    raise HTTPException(status_code=409, detail='Payment items do not add up to the sale total.')
            await conn.execute('INSERT INTO bar_sale (id, user_id, payment_method, total, table_label, idempotency_key, tendered_amount, change_due) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', sale_id, actor.user_id, payload.payment_method.value, total, payload.table_label, payload.idempotency_key, payload.tendered_amount, change_due)
            payment_items = payload.payment_items or [{'method': payload.payment_method.value, 'amount': total}]
            for pi in payment_items:
                await conn.execute('INSERT INTO bar_sale_payment (id, user_id, sale_id, method, amount) VALUES ($1,$2,$3,$4,$5)', str(uuid4()), actor.user_id, sale_id, pi.method.value if hasattr(pi, 'method') else pi['method'], pi.amount if hasattr(pi, 'amount') else pi['amount'])
            for item, product in products:
                await conn.execute('INSERT INTO bar_sale_item (id, user_id, sale_id, product_id, product_name, category, quantity, unit_price, line_total, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', str(uuid4()), actor.user_id, sale_id, item.product_id, product['name'] if 'name' in product else 'Unknown', product['category'] if 'category' in product else 'Unknown', item.quantity, product['price'], product['price'] * item.quantity, item.note)
                await conn.execute('UPDATE bar_product SET stock = stock - $1, updated_at = now() WHERE user_id = $2 AND id = $3', item.quantity, actor.user_id, item.product_id)
                await conn.execute('INSERT INTO bar_stock_movement (id,user_id,product_id,quantity,movement_type,reference) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, item.product_id, -item.quantity, 'sale', sale_id)
            receipt_row = await conn.fetchrow('INSERT INTO bar_receipt_counter (user_id, next_number) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET next_number = bar_receipt_counter.next_number + 1 RETURNING next_number', actor.user_id)
            receipt_number = receipt_row['next_number']
            await conn.execute('INSERT INTO bar_receipts (id, user_id, sale_id, receipt_number, is_copy, printed_by) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, sale_id, receipt_number, False, actor.user_id)
            response = {'id': sale_id, 'receipt_number': receipt_number, 'total': total, 'payment_method': payload.payment_method.value, 'change_due': change_due, 'payment_items': [{'method': pi.method.value if hasattr(pi, 'method') else pi['method'], 'amount': pi.amount if hasattr(pi, 'amount') else pi['amount']} for pi in payment_items], 'status': 'completed'}
            await conn.execute('INSERT INTO bar_idempotency_key (user_id, idempotency_key, request_hash, response_json) VALUES ($1,$2,$3,$4::jsonb)', actor.user_id, payload.idempotency_key, request_hash, json.dumps(response))
            return response


@router.post('/sales/{sale_id}/void')
async def void_sale(sale_id: str, payload: TabVoid, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'sales.void')
    async with connection() as conn:
        async with conn.transaction():
            if actor.role != Role.admin:
                if not payload.pin:
                    raise HTTPException(status_code=400, detail='Manager PIN is required to void a sale.')
                pin_row = await conn.fetchrow('SELECT pin_hash FROM bar_user_pin WHERE user_id=$1', actor.user_id)
                if not pin_row or not pin_row['pin_hash']:
                    raise HTTPException(status_code=400, detail='No PIN set for this user.')
                if hashlib.sha256(payload.pin.encode()).hexdigest() != pin_row['pin_hash']:
                    raise HTTPException(status_code=403, detail='Invalid PIN.')
            row = await conn.fetchrow("UPDATE bar_sale SET voided=true, void_reason=$1, voided_by=$2, voided_at=now() WHERE id=$3 AND user_id=$4 AND voided=false RETURNING id, voided, void_reason, voided_by, voided_at", payload.reason, actor.user_id, sale_id, actor.user_id)
            if not row:
                raise HTTPException(status_code=404, detail='Sale was not found or already voided.')
            items = await conn.fetch('SELECT id, product_id, quantity FROM bar_sale_item WHERE sale_id=$1 AND user_id=$2', sale_id, actor.user_id)
            for item in items:
                await conn.execute('UPDATE bar_product SET stock = stock + $1, updated_at = now() WHERE user_id=$2 AND id = $3', item['quantity'], actor.user_id, item['product_id'])
                await conn.execute('INSERT INTO bar_stock_movement (id,user_id,product_id,quantity,movement_type,reference) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, item['product_id'], item['quantity'], 'void_return', sale_id)
            await write_audit(conn, actor, 'void', 'sale', sale_id, payload.reason)
    return dict(row)


@router.post('/auth/verify-pin')
async def verify_pin(payload: PinVerify, actor: RequestActor = Depends(get_actor)):
    async with connection() as conn:
        row = await conn.fetchrow('SELECT pin_hash FROM bar_user_pin WHERE user_id=$1', actor.user_id)
        if not row or not row['pin_hash']:
            raise HTTPException(status_code=400, detail='No PIN set for this user.')
        if hashlib.sha256(payload.pin.encode()).hexdigest() != row['pin_hash']:
            raise HTTPException(status_code=403, detail='Invalid PIN.')
    return {'valid': True}


@router.post('/auth/set-pin', status_code=201)
async def set_pin(payload: PinSet, actor: RequestActor = Depends(get_actor)):
    async with connection() as conn:
        await conn.execute('INSERT INTO bar_user_pin (user_id, pin_hash) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET pin_hash=$2, created_at=now()', actor.user_id, hashlib.sha256(payload.pin.encode()).hexdigest())
    return {'ok': True}


@router.post('/sales/{sale_id}/discount', status_code=201)
async def create_discount(sale_id: str, payload: DiscountCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'sales.void')
    async with connection() as conn:
        async with conn.transaction():
            sale = await conn.fetchrow('SELECT id, user_id, total, voided FROM bar_sale WHERE id=$1 AND user_id=$2', sale_id, actor.user_id)
            if not sale:
                raise HTTPException(status_code=404, detail='Sale was not found.')
            if sale['voided']:
                raise HTTPException(status_code=409, detail='Cannot discount a voided sale.')
            if actor.role != Role.admin:
                if not payload.pin:
                    raise HTTPException(status_code=400, detail='Manager PIN is required to apply a discount.')
                pin_row = await conn.fetchrow('SELECT pin_hash FROM bar_user_pin WHERE user_id=$1', actor.user_id)
                if not pin_row or not pin_row['pin_hash']:
                    raise HTTPException(status_code=400, detail='No PIN set for this user.')
                if hashlib.sha256(payload.pin.encode()).hexdigest() != pin_row['pin_hash']:
                    raise HTTPException(status_code=403, detail='Invalid PIN.')
            discount_id = str(uuid4())
            await conn.execute('INSERT INTO bar_discount (id, user_id, sale_id, amount, reason, approved_by) VALUES ($1,$2,$3,$4,$5,$6)', discount_id, actor.user_id, sale_id, payload.amount, payload.reason, actor.user_id)
            await write_audit(conn, actor, 'discount', 'sale', sale_id, payload.reason, metadata={'amount': payload.amount})
    return {'id': discount_id, 'sale_id': sale_id, 'amount': payload.amount, 'reason': payload.reason, 'approved_by': actor.user_id}


@router.post('/receipts/{sale_id}/reprint')
async def reprint_receipt(sale_id: str, payload: ReceiptReprintCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'receipts.reprint')
    async with connection() as conn:
        async with conn.transaction():
            original = await conn.fetchrow('SELECT id, user_id, receipt_number, is_copy FROM bar_receipts WHERE sale_id=$1 AND user_id=$2 AND is_copy=false ORDER BY printed_at DESC LIMIT 1', sale_id, actor.user_id)
            if not original:
                raise HTTPException(status_code=404, detail='Original receipt was not found.')
            receipt_row = await conn.fetchrow('INSERT INTO bar_receipt_counter (user_id, next_number) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET next_number = bar_receipt_counter.next_number + 1 RETURNING next_number', actor.user_id)
            copy_number = receipt_row['next_number']
            new_receipt = await conn.fetchrow('INSERT INTO bar_receipts (id, user_id, sale_id, receipt_number, is_copy, copy_of, printed_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, receipt_number, is_copy, printed_at', str(uuid4()), actor.user_id, sale_id, copy_number, True, original['id'], actor.user_id)
            await write_audit(conn, actor, 'reprint', 'receipt', str(new_receipt['id']), metadata={'sale_id': sale_id, 'original_receipt_number': original['receipt_number'], 'copy_receipt_number': copy_number})
    return dict(new_receipt)


@router.get('/settings')
async def list_settings(actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'settings.read')
    async with connection() as conn:
        rows = await conn.fetch('SELECT key, value FROM bar_settings WHERE user_id=$1 ORDER BY key', actor.user_id)
    return {'items': [{'key': row['key'], 'value': row['value']} for row in rows]}


@router.post('/settings', status_code=201)
async def upsert_setting(payload: SettingCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'settings.write')
    async with connection() as conn:
        row = await conn.fetchrow('INSERT INTO bar_settings (user_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (user_id, key) DO UPDATE SET value=$3, updated_at=now() RETURNING key, value', actor.user_id, payload.key, payload.value)
    return dict(row)


@router.post('/menu-stock-links', status_code=201)
async def create_menu_stock_link(payload: MenuStockLinkCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'menu.manage')
    async with connection() as conn:
        row = await conn.fetchrow('INSERT INTO bar_menu_stock_link (id,user_id,menu_item_id,stock_item_id,quantity_per_unit) VALUES ($1,$2,$3,$4,$5) RETURNING id,menu_item_id,stock_item_id,quantity_per_unit,created_at', str(uuid4()), actor.user_id, payload.menu_item_id, payload.stock_item_id, payload.quantity_per_unit)
    return dict(row)


@router.get('/menu-stock-links')
async def list_menu_stock_links(actor: RequestActor = Depends(get_actor), menu_item_id: str | None = None):
    authorized(actor, 'menu.manage')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,menu_item_id,stock_item_id,quantity_per_unit,created_at FROM bar_menu_stock_link WHERE user_id=$1 AND ($2::text IS NULL OR menu_item_id=$2) ORDER BY created_at DESC', actor.user_id, menu_item_id)
    return {'items': [dict(row) for row in rows]}


@router.post('/stock/deliveries', status_code=201)
async def create_stock_delivery(payload: DeliveryCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow('INSERT INTO bar_stock_delivery (id,user_id,supplier,product_id,quantity,cost_price,delivery_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,supplier,product_id,quantity,cost_price,delivery_date,created_at', str(uuid4()), actor.user_id, payload.supplier, payload.product_id, payload.quantity, payload.cost_price, payload.delivery_date)
            await conn.execute('UPDATE bar_product SET stock = stock + $1, cost = $2, updated_at = now() WHERE user_id=$3 AND id = $4', payload.quantity, payload.cost_price, actor.user_id, payload.product_id)
            await conn.execute('INSERT INTO bar_stock_movement (id,user_id,product_id,quantity,movement_type,reference) VALUES ($1,$2,$3,$4,$5,$6)', str(uuid4()), actor.user_id, payload.product_id, payload.quantity, 'delivery', row['id'])
            await write_audit(conn, actor, 'delivery', 'stock_delivery', row['id'], metadata={'supplier': payload.supplier, 'quantity': payload.quantity, 'cost_price': payload.cost_price})
    return dict(row)


@router.get('/stock/deliveries')
async def list_stock_deliveries(actor: RequestActor = Depends(get_actor), limit: int = Query(default=50, ge=1, le=100)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,supplier,product_id,quantity,cost_price,delivery_date,created_at FROM bar_stock_delivery WHERE user_id=$1 ORDER BY delivery_date DESC LIMIT $2', actor.user_id, limit)
    return {'items': [dict(row) for row in rows]}


@router.post('/stock/transfers', status_code=201)
async def create_stock_transfer(payload: TransferCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        row = await conn.fetchrow('INSERT INTO bar_stock_transfer (id,user_id,product_id,quantity,from_location,to_location,reason) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,product_id,quantity,from_location,to_location,reason,created_at', str(uuid4()), actor.user_id, payload.product_id, payload.quantity, payload.from_location, payload.to_location, payload.reason)
    return dict(row)


@router.get('/stock/transfers')
async def list_stock_transfers(actor: RequestActor = Depends(get_actor), limit: int = Query(default=50, ge=1, le=100)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        rows = await conn.fetch('SELECT id,product_id,quantity,from_location,to_location,reason,created_at FROM bar_stock_transfer WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', actor.user_id, limit)
    return {'items': [dict(row) for row in rows]}


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
                product = await conn.fetchrow('SELECT id, name, category, stock FROM bar_product WHERE id=$1 AND user_id=$2 FOR UPDATE', item['product_id'], actor.user_id)
                if not product or product['stock'] < item['quantity']:
                    raise HTTPException(status_code=409, detail=f'Insufficient stock for product {item["product_id"]}.')
            sale_id = str(uuid4())
            await conn.execute('INSERT INTO bar_sale (id,user_id,payment_method,total,table_label,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)', sale_id, actor.user_id, payload.payment_method.value, tab['total'], tab['table_label'], payload.idempotency_key)
            for item in items:
                product = await conn.fetchrow('SELECT name, category FROM bar_product WHERE id=$1 AND user_id=$2', item['product_id'], actor.user_id)
                await conn.execute('INSERT INTO bar_sale_item (id,user_id,sale_id,product_id,product_name,category,quantity,unit_price,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', str(uuid4()), actor.user_id, sale_id, item['product_id'], product['name'] if product else 'Unknown', product['category'] if product else 'Unknown', item['quantity'], item['unit_price'], item['line_total'])
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
async def close_day(payload: DayCloseCreate = DayCloseCreate(action='close'), actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'day.close')
    if payload.action not in ('open', 'close'):
        raise HTTPException(status_code=400, detail='Invalid action.')
    async with connection() as conn:
        async with conn.transaction():
            if payload.action == 'open':
                existing = await conn.fetchrow("SELECT id FROM bar_day WHERE user_id=$1 AND status='open' FOR UPDATE", actor.user_id)
                if existing:
                    raise HTTPException(status_code=409, detail='An open business day already exists.')
                prev = await conn.fetchrow("SELECT counted_cash FROM bar_day WHERE user_id=$1 AND status='closed' ORDER BY closed_at DESC LIMIT 1", actor.user_id)
                opening = payload.opening_float if payload.opening_float is not None else (prev['counted_cash'] if prev and prev['counted_cash'] is not None else 0)
                row = await conn.fetchrow("INSERT INTO bar_day (id,user_id,business_date,status,opening_float) VALUES ($1,$2,CURRENT_DATE,'open',$3) RETURNING id,business_date,status,opening_float,opened_at", str(uuid4()), actor.user_id, opening)
                return dict(row)
            # close
            row = await conn.fetchrow("SELECT id,opening_float FROM bar_day WHERE user_id=$1 AND status='open' FOR UPDATE", actor.user_id)
            if not row:
                raise HTTPException(status_code=409, detail='No open business day to close.')
            day_id = row['id']
            open_tabs = await conn.fetchrow("SELECT count(*)::int AS cnt FROM bar_tab WHERE user_id=$1 AND status='open'", actor.user_id)
            if open_tabs['cnt'] > 0:
                raise HTTPException(status_code=409, detail='Open tabs must be settled or carried before closing the day.')
            sales = await conn.fetchrow("SELECT coalesce(sum(total),0)::int AS total, coalesce(sum(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0)::int AS cash_sales FROM bar_sale WHERE user_id=$1 AND status='completed' AND DATE(created_at)=CURRENT_DATE", actor.user_id)
            expected_cash = (row['opening_float'] or 0) + sales['cash_sales']
            counted_cash = payload.counted_cash if payload.counted_cash is not None else 0
            cash_variance = counted_cash - expected_cash
            stock_rows = await conn.fetch("SELECT sc.variance_units, sc.variance_value FROM bar_stock_count sc WHERE sc.day_id=$1", day_id)
            stock_variance_units = sum(r['variance_units'] for r in stock_rows)
            stock_variance_value = sum(r['variance_value'] for r in stock_rows)
            if not row.get('variance_accepted') and (cash_variance != 0 or stock_variance_units != 0):
                raise HTTPException(status_code=409, detail='Variance must be accepted with a reason before closing the day.')
            await conn.execute("UPDATE bar_day SET status='closed', closed_at=now(), expected_cash=$1, cash_variance=$2, stock_variance_units=$3, stock_variance_value=$4, locked=true WHERE id=$5 AND user_id=$6 RETURNING id,business_date,status,opening_float,counted_cash,expected_cash,cash_variance,stock_variance_units,stock_variance_value,closed_at", expected_cash, cash_variance, stock_variance_units, stock_variance_value, day_id, actor.user_id)
            row = await conn.fetchrow("SELECT id,business_date,status,opening_float,counted_cash,expected_cash,cash_variance,stock_variance_units,stock_variance_value,closed_at FROM bar_day WHERE id=$1", day_id)
    return dict(row)


@router.post('/day-reopen', status_code=200)
async def reopen_day(payload: TabVoid, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'day.close')
    async with connection() as conn:
        async with conn.transaction():
            if actor.role != Role.admin:
                if not payload.pin:
                    raise HTTPException(status_code=400, detail='Manager PIN is required to reopen a day.')
                pin_row = await conn.fetchrow('SELECT pin_hash FROM bar_user_pin WHERE user_id=$1', actor.user_id)
                if not pin_row or not pin_row['pin_hash']:
                    raise HTTPException(status_code=400, detail='No PIN set for this user.')
                if hashlib.sha256(payload.pin.encode()).hexdigest() != pin_row['pin_hash']:
                    raise HTTPException(status_code=403, detail='Invalid PIN.')
            row = await conn.fetchrow("UPDATE bar_day SET status='open', closed_at=NULL, locked=false WHERE user_id=$1 AND status='closed' AND locked=true RETURNING id,business_date,status,opened_at", actor.user_id)
            if not row:
                raise HTTPException(status_code=404, detail='No closed locked day to reopen.')
            await write_audit(conn, actor, 'reopen', 'day', row['id'], payload.reason)
    return dict(row)


@router.post('/stock-counts', status_code=201)
async def submit_stock_count(payload: StockCountCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        async with conn.transaction():
            day = await conn.fetchrow("SELECT id FROM bar_day WHERE user_id=$1 AND status='open' ORDER BY opened_at DESC LIMIT 1", actor.user_id)
            if not day:
                raise HTTPException(status_code=409, detail='No open business day.')
            product = await conn.fetchrow('SELECT id, price, stock FROM bar_product WHERE id=$1 AND user_id=$2', payload.product_id, actor.user_id)
            if not product:
                raise HTTPException(status_code=404, detail='Product not found.')
            expected = product['stock']
            variance_units = payload.counted_quantity - expected
            variance_value = variance_units * product['price']
            row = await conn.fetchrow("INSERT INTO bar_stock_count (id,user_id,day_id,product_id,counted_quantity,expected_quantity,variance_units,variance_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,day_id,product_id,counted_quantity,expected_quantity,variance_units,variance_value", str(uuid4()), actor.user_id, day['id'], payload.product_id, payload.counted_quantity, expected, variance_units, variance_value)
            await conn.execute("INSERT INTO bar_variance_history (id,user_id,day_id,product_id,variance_units,variance_value) VALUES ($1,$2,$3,$4,$5,$6)", str(uuid4()), actor.user_id, day['id'], payload.product_id, variance_units, variance_value)
    return dict(row)


@router.post('/variance-tolerance', status_code=201)
async def set_variance_tolerance(payload: VarianceToleranceCreate, actor: RequestActor = Depends(get_actor)):
    authorized(actor, 'day.close')
    async with connection() as conn:
        await conn.execute("INSERT INTO bar_variance_tolerance (user_id,product_id,tolerance_units) VALUES ($1,$2,$3) ON CONFLICT (user_id,product_id) DO UPDATE SET tolerance_units=$3", actor.user_id, payload.product_id, payload.tolerance_units)
    return {'product_id': payload.product_id, 'tolerance_units': payload.tolerance_units}


@router.get('/daily-report')
async def daily_report(actor: RequestActor = Depends(get_actor), business_date: str | None = None):
    authorized(actor, 'reports.read')
    async with connection() as conn:
        day = await conn.fetchrow("SELECT * FROM bar_day WHERE user_id=$1 AND ($2::text IS NULL OR business_date=$2) ORDER BY business_date DESC LIMIT 1", actor.user_id, business_date)
        if not day:
            raise HTTPException(status_code=404, detail='No business day found.')
        sales = await conn.fetchrow("SELECT count(*)::int AS orders, coalesce(sum(total),0)::int AS total_sales FROM bar_sale WHERE user_id=$1 AND status='completed' AND DATE(created_at)=$2", actor.user_id, day['business_date'])
        by_payment = await conn.fetch("SELECT payment_method, count(*)::int AS orders, coalesce(sum(total),0)::int AS total FROM bar_sale WHERE user_id=$1 AND status='completed' AND DATE(created_at)=$2 GROUP BY payment_method ORDER BY payment_method", actor.user_id, day['business_date'])
        voids = await conn.fetchrow("SELECT count(*)::int AS voids FROM bar_sale WHERE user_id=$1 AND voided=true AND DATE(created_at)=$2", actor.user_id, day['business_date'])
        discounts = await conn.fetchrow("SELECT count(*)::int AS discounts, coalesce(sum(amount),0)::int AS discount_total FROM bar_discount WHERE user_id=$1 AND DATE(created_at)=$2", actor.user_id, day['business_date'])
        wastage = await conn.fetchrow("SELECT coalesce(sum(quantity),0)::int AS wastage_qty FROM bar_stock_movement WHERE user_id=$1 AND movement_type='wastage' AND DATE(created_at)=$2", actor.user_id, day['business_date'])
        drink_sales = await conn.fetchrow("SELECT coalesce(sum(total),0)::int AS drink_sales, coalesce(sum(si.unit_price * si.quantity),0)::int AS drink_cost FROM bar_sale s JOIN bar_sale_item si ON si.sale_id=s.id WHERE s.user_id=$1 AND s.status='completed' AND DATE(s.created_at)=$2", actor.user_id, day['business_date'])
        pour_cost = (drink_sales['drink_cost'] / drink_sales['drink_sales'] * 100) if drink_sales['drink_sales'] > 0 else 0.0
    return {
        'business_date': str(day['business_date']),
        'orders': sales['orders'],
        'total_sales': sales['total_sales'],
        'by_payment': [dict(r) for r in by_payment],
        'voids': voids['voids'],
        'discounts': discounts['discounts'],
        'wastage': wastage['wastage_qty'],
        'cash_variance': day['cash_variance'],
        'stock_variance_value': day['stock_variance_value'],
        'pour_cost': round(pour_cost, 2),
    }
