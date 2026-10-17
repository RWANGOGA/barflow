from datetime import date, datetime, time, timedelta, timezone
import hashlib
import os
import base64
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import RequestActor, get_actor
from .authorization import Actor, require_permission
from .db import connection
from .schemas import ProductUpsert, Role, StockReceive, TeamMemberCreate


router = APIRouter(prefix='/v1', tags=['web compatibility'])

RangeKey = Literal['today', 'week', 'month', 'two_months', 'mid_year', 'all']
RANGE_LABELS: dict[str, str] = {
    'today': 'This day',
    'week': 'This week',
    'month': 'Month',
    'two_months': 'Two months',
    'mid_year': 'Mid year',
    'all': 'All',
}


def authorized(actor: RequestActor, permission: str) -> None:
    require_permission(Actor(actor.user_id, actor.role), permission)


def range_start(range_key: RangeKey, today: date) -> date | None:
    if range_key == 'today':
        return today
    if range_key == 'week':
        return today - timedelta(days=6)
    if range_key == 'month':
        return today - timedelta(days=29)
    if range_key == 'two_months':
        return today - timedelta(days=59)
    if range_key == 'mid_year':
        return date(today.year, 1, 1)
    return None


def _chart(rows: list[dict], range_key: RangeKey, today: date) -> list[dict]:
    if range_key in ('two_months', 'mid_year', 'all'):
        count = 12 if range_key == 'all' else 6 if range_key == 'mid_year' else 2
        months: dict[tuple[int, int], int] = {}
        for offset in range(count):
            year = today.year
            month = today.month - offset
            while month < 1:
                year -= 1
                month += 12
            months[(year, month)] = 0
        for sale in rows:
            created_at = sale['created_at']
            months[(created_at.year, created_at.month)] = (
                months.get((created_at.year, created_at.month), 0) + sale['total']
            )
        return [
            {
                'label': datetime(year, month, 1).strftime('%b'),
                'total': total,
            }
            for (year, month), total in sorted(months.items())
        ]

    day_count = 1 if range_key == 'today' else 7 if range_key == 'week' else 30
    start = today - timedelta(days=day_count - 1)
    totals: dict[date, int] = {start + timedelta(days=offset): 0 for offset in range(day_count)}
    for sale in rows:
        created_at = sale['created_at']
        sale_date = created_at.date() if isinstance(created_at, datetime) else created_at
        if sale_date in totals:
            totals[sale_date] += sale['total']
    return [
        {
            'label': 'Today' if day_count == 1 else day.strftime('%a'),
            'total': total,
        }
        for day, total in sorted(totals.items())
    ]


@router.get('/overview')
async def overview(
    range_key: RangeKey = Query(default='week', alias='range'),
    actor: RequestActor = Depends(get_actor),
) -> dict:
    today = datetime.now(timezone.utc).date()
    start = range_start(range_key, today)
    async with connection() as conn:
        if start:
            rows = await conn.fetch(
                """SELECT total, payment_method, created_at
                   FROM bar_sale
                   WHERE user_id=$1 AND status='completed'
                     AND COALESCE(voided, false)=false AND created_at >= $2
                   ORDER BY created_at DESC LIMIT 5000""",
                actor.user_id,
                datetime.combine(start, time.min, tzinfo=timezone.utc),
            )
        else:
            rows = await conn.fetch(
                """SELECT total, payment_method, created_at
                   FROM bar_sale
                   WHERE user_id=$1 AND status='completed'
                     AND COALESCE(voided, false)=false
                   ORDER BY created_at DESC LIMIT 5000""",
                actor.user_id,
            )
        open_tabs = await conn.fetchval(
            "SELECT count(*) FROM bar_tab WHERE user_id=$1 AND status='open'",
            actor.user_id,
        )
        current_day = await conn.fetchrow(
            'SELECT * FROM bar_day WHERE user_id=$1 ORDER BY opened_at DESC LIMIT 1',
            actor.user_id,
        )

    totals_by_payment: dict[str, int] = {}
    today_total = 0
    today_orders = 0
    range_total = 0
    for sale in rows:
        range_total += sale['total']
        method = sale['payment_method']
        totals_by_payment[method] = totals_by_payment.get(method, 0) + sale['total']
        created = sale['created_at']
        sale_date = created.astimezone(timezone.utc).date() if created.tzinfo else created.date()
        if sale_date == today:
            today_total += sale['total']
            today_orders += 1

    expected_cash = (
        current_day.get('expected_cash') or current_day.get('opening_float') or 0
        if current_day else 0
    )
    return {
        'range': range_key,
        'range_label': RANGE_LABELS[range_key],
        'today_sales': range_total,
        'orders': len(rows),
        'today_only_sales': today_total,
        'today_only_orders': today_orders,
        'open_tabs': open_tabs or 0,
        'open_tabs_status': 'Needs attention' if open_tabs else 'All settled',
        'by_payment': totals_by_payment,
        'week': _chart([dict(row) for row in rows], range_key, today),
        'cash_drawer': {
            'expected_cash': expected_cash,
            'counted_cash': current_day.get('counted_cash') if current_day else None,
            'cash_variance': current_day.get('cash_variance') if current_day else None,
            'day_status': current_day.get('status', 'no_day') if current_day else 'no_day',
            'day_locked': current_day.get('status') == 'closed' if current_day else False,
        },
        'checklist': {'completed': 0, 'total': 0},
    }


@router.get('/day')
async def get_current_day(actor: RequestActor = Depends(get_actor)) -> dict | None:
    async with connection() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM bar_day WHERE user_id=$1 AND business_date=CURRENT_DATE ORDER BY opened_at DESC LIMIT 1',
            actor.user_id,
        )
    return dict(row) if row else None


@router.get('/products')
async def list_products(actor: RequestActor = Depends(get_actor)) -> list[dict]:
    async with connection() as conn:
        rows = await conn.fetch(
            'SELECT id,name,category,price,stock,reorder,cost,unit,tone,created_at,updated_at FROM bar_product WHERE user_id=$1 ORDER BY name',
            actor.user_id,
        )
    return [dict(row) for row in rows]


@router.post('/products')
async def save_product(
    payload: ProductUpsert,
    actor: RequestActor = Depends(get_actor),
) -> dict:
    authorized(actor, 'menu.manage')
    async with connection() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                'SELECT price FROM bar_product WHERE id=$1 AND user_id=$2 FOR UPDATE',
                payload.id,
                actor.user_id,
            )
            row = await conn.fetchrow(
                """INSERT INTO bar_product
                   (id,user_id,name,category,price,stock,reorder,cost,unit,tone)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                   ON CONFLICT (id) DO UPDATE SET
                     name=EXCLUDED.name, category=EXCLUDED.category, price=EXCLUDED.price,
                     stock=EXCLUDED.stock, reorder=EXCLUDED.reorder, cost=EXCLUDED.cost,
                     unit=EXCLUDED.unit, tone=EXCLUDED.tone, updated_at=now()
                   WHERE bar_product.user_id=EXCLUDED.user_id
                   RETURNING id,name,category,price,stock,reorder,cost,unit,tone,created_at,updated_at""",
                payload.id, actor.user_id, payload.name.strip(), payload.category.strip(),
                payload.price, payload.stock, payload.reorder, payload.cost,
                payload.unit.strip(), payload.tone,
            )
            if not row:
                raise HTTPException(status_code=409, detail='Product id is already in use.')
            if existing and existing['price'] != payload.price:
                await conn.execute(
                    """INSERT INTO bar_audit_log
                       (id,user_id,actor_role,action,entity_type,entity_id,reason,metadata)
                       VALUES ($1,$2,$3,'price_change','product',$4,NULL,'{}'::jsonb)""",
                    str(uuid4()), actor.user_id, actor.role.value, payload.id,
                )
    return dict(row)


@router.get('/sales')
async def list_sales(actor: RequestActor = Depends(get_actor)) -> dict:
    authorized(actor, 'sales.create')
    async with connection() as conn:
        rows = await conn.fetch(
            """SELECT id,payment_method,total,table_label,status,created_at,voided,
                      void_reason,voided_by,voided_at
               FROM bar_sale WHERE user_id=$1
               ORDER BY created_at DESC LIMIT 5000""",
            actor.user_id,
        )
    return {'items': [dict(row) for row in rows], 'next_cursor': None}


@router.get('/team')
async def list_team(actor: RequestActor = Depends(get_actor)) -> dict:
    authorized(actor, 'team.manage')
    async with connection() as conn:
        rows = await conn.fetch(
            'SELECT id,name,role,created_at FROM bar_team_member WHERE user_id=$1 ORDER BY created_at DESC',
            actor.user_id,
        )
    return {'items': [dict(row) for row in rows], 'next_cursor': None}


def _hash_pin(pin: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, 120_000)
    return 'pbkdf2_sha256$120000$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()


@router.post('/team', status_code=201)
async def create_team_member(
    payload: TeamMemberCreate,
    actor: RequestActor = Depends(get_actor),
) -> dict:
    authorized(actor, 'team.manage')
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail='Name is required.')
    async with connection() as conn:
        row = await conn.fetchrow(
            """INSERT INTO bar_team_member (id,user_id,name,role,pin,pin_hash)
               VALUES ($1,$2,$3,$4,NULL,$5)
               RETURNING id,name,role,created_at""",
            str(uuid4()), actor.user_id, name, payload.role, _hash_pin(payload.pin),
        )
    return dict(row)


@router.post('/stock/receive')
async def receive_stock(
    payload: StockReceive,
    actor: RequestActor = Depends(get_actor),
) -> dict:
    authorized(actor, 'inventory.manage')
    async with connection() as conn:
        async with conn.transaction():
            product = await conn.fetchrow(
                'UPDATE bar_product SET stock=stock+$1,updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING stock',
                payload.quantity, payload.product_id, actor.user_id,
            )
            if not product:
                raise HTTPException(status_code=404, detail='Product was not found.')
            await conn.execute(
                """INSERT INTO bar_stock_movement
                   (id,user_id,product_id,quantity,movement_type,reference)
                   VALUES ($1,$2,$3,$4,'delivery',$5)""",
                str(uuid4()), actor.user_id, payload.product_id, payload.quantity,
                payload.reference,
            )
    return {'ok': True, 'stock': product['stock']}


@router.get('/reports')
async def reports(
    from_date: date | None = Query(default=None, alias='from'),
    to_date: date | None = Query(default=None, alias='to'),
    actor: RequestActor = Depends(get_actor),
) -> dict:
    authorized(actor, 'reports.read')
    start = from_date or (datetime.now(timezone.utc).date() - timedelta(days=30))
    end = to_date or datetime.now(timezone.utc).date()
    async with connection() as conn:
        rows = await conn.fetch(
            """SELECT id,payment_method,total,table_label,status,created_at
               FROM bar_sale
               WHERE user_id=$1 AND status='completed' AND COALESCE(voided,false)=false
                 AND created_at >= $2 AND created_at < $3
               ORDER BY created_at DESC""",
            actor.user_id,
            datetime.combine(start, time.min, tzinfo=timezone.utc),
            datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc),
        )
    total = sum(row['total'] for row in rows)
    by_payment: dict[str, int] = {}
    for row in rows:
        method = row['payment_method']
        by_payment[method] = by_payment.get(method, 0) + row['total']
    return {
        'orders': len(rows),
        'total': total,
        'by_payment': [
            {'payment_method': payment_method, 'amount': amount}
            for payment_method, amount in by_payment.items()
        ],
        'rows': [dict(row) for row in rows],
    }
